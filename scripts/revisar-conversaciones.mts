/**
 * Recorre la sección Conversaciones con un login real y prueba el envío manual.
 *
 * Usa domcontentloaded en vez de networkidle: en dev el websocket de HMR
 * mantiene una conexión abierta, así que networkidle no dispara nunca y el
 * script se cuelga. Se espera por selectores concretos.
 */
import { chromium, devices } from "playwright";

const BASE = process.env.VIBO_BASE ?? "http://localhost:3000";
const SALIDA = process.env.VIBO_SALIDA ?? ".";
const EMAIL = process.env.VIBO_EMAIL!;
const PASSWORD = process.env.VIBO_PASSWORD!;

async function medirDesborde(page: import("playwright").Page): Promise<number> {
  return page.evaluate(() => {
    const antes = window.scrollX;
    window.scrollTo(9999, window.scrollY);
    const corrio = window.scrollX;
    window.scrollTo(antes, window.scrollY);
    return corrio;
  });
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  let problemas = 0;

  for (const vp of [
    { nombre: "mobile", ancho: 390, alto: 844, movil: true },
    { nombre: "desktop", ancho: 1440, alto: 900, movil: false },
  ]) {
    const context = await browser.newContext({
      viewport: { width: vp.ancho, height: vp.alto },
      deviceScaleFactor: 2,
      locale: "es-AR",
      ...(vp.movil ? { isMobile: true, hasTouch: true, userAgent: devices["iPhone 13"].userAgent } : {}),
    });
    const page = await context.newPage();
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(`[pageerror] ${e.message}`));

    console.log(`\n=== ${vp.nombre} (${vp.ancho}px) ===`);

    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    // --- Bandeja ---
    await page.goto(`${BASE}/dashboard/conversaciones`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1", { timeout: 20_000 });
    await page.waitForTimeout(700);

    const filas = await page.locator('a[href^="/dashboard/conversaciones/"]').count();
    const desborde1 = await medirDesborde(page);
    if (desborde1 > 0) problemas++;
    console.log(`  bandeja: ${filas} conversación(es), ${desborde1 > 0 ? "DESBORDE" : "sin scroll lateral"}`);
    await page.screenshot({ path: `${SALIDA}/conv-bandeja-${vp.nombre}.png`, fullPage: true });

    // --- Hilo (primera conversación) ---
    const primer = page.locator('a[href^="/dashboard/conversaciones/"]').first();
    const href = await primer.getAttribute("href");
    await primer.click();
    await page.waitForSelector("textarea", { timeout: 20_000 });
    await page.waitForTimeout(500);

    const burbujas = await page.locator(".rounded-lg.px-3.py-2").count();
    const desborde2 = await medirDesborde(page);
    if (desborde2 > 0) problemas++;
    console.log(`  hilo ${href}: ${burbujas} burbuja(s), ${desborde2 > 0 ? "DESBORDE" : "sin scroll lateral"}`);
    await page.screenshot({ path: `${SALIDA}/conv-hilo-${vp.nombre}.png`, fullPage: true });

    // --- Envío manual (solo una vez, en desktop) ---
    if (!vp.movil) {
      const antes = burbujas;
      await page.fill("textarea", "Hola, te confirmo la cancha para el sábado 20hs. ¡Saludos!");
      await page.getByRole("button", { name: "Enviar" }).click();
      await page.waitForTimeout(2500);
      const despues = await page.locator(".rounded-lg.px-3.py-2").count();
      const enviado = despues > antes;
      if (!enviado) problemas++;
      console.log(`  envío manual: burbujas ${antes} → ${despues}  ${enviado ? "OK" : "NO APARECIÓ"}`);

      const alerta = await page.locator('[role="alert"]').first().textContent().catch(() => null);
      if (alerta) console.log(`  ALERTA: ${alerta.trim()}`);
      await page.screenshot({ path: `${SALIDA}/conv-enviado-${vp.nombre}.png`, fullPage: true });
    }

    if (errores.length) {
      problemas += errores.length;
      console.log(`  ERRORES: ${[...new Set(errores)].slice(0, 5).join(" | ")}`);
    } else {
      console.log("  sin errores de página");
    }

    await context.close();
  }

  await browser.close();
  console.log(`\n${problemas === 0 ? "Sin problemas." : `${problemas} problema(s).`}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
