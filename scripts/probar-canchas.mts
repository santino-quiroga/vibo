/**
 * Carga canchas desde el admin real, con un browser real.
 *
 * No escribe en la base directo a propósito: así se verifica el formulario, la
 * server action, la validación y el guardado, que es lo que va a usar el equipo
 * de Vibo. Un insert por Prisma probaría el schema y nada más.
 *
 * Uso: VIBO_AGENTE=<id> npx tsx scripts/probar-canchas.mts
 */
import { chromium } from "playwright";

const BASE = process.env.VIBO_BASE ?? "http://localhost:3000";
const EMAIL = process.env.VIBO_ADMIN_EMAIL ?? "admin@vibo.ar";
const PASSWORD = process.env.VIBO_ADMIN_PASSWORD ?? "vibo-local-dev-2026";
const AGENTE = process.env.VIBO_AGENTE;

const PRECIOS = ["20000", "20000", "26000"];

async function main() {
  if (!AGENTE) throw new Error("Falta VIBO_AGENTE");

  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL(/\/admin/), page.click('button[type="submit"]')]);
  console.log("login admin ok");

  await page.goto(`${BASE}/admin/agentes/${AGENTE}`, { waitUntil: "networkidle" });

  const yaHay = await page.locator('input[name="numero"]').count();
  console.log(`canchas ya cargadas: ${yaHay}`);

  for (let i = yaHay; i < PRECIOS.length; i++) {
    await page.getByRole("button", { name: "Agregar cancha" }).click();
    await page.waitForTimeout(150);
  }

  const precios = page.locator('input[name="precio"]');
  for (let i = 0; i < PRECIOS.length; i++) {
    await precios.nth(i).fill(PRECIOS[i]);
  }

  await page.getByRole("button", { name: "Guardar canchas" }).click();
  await page.waitForTimeout(1500);

  // Se recarga para confirmar que quedó guardado y no sólo pintado en pantalla.
  await page.reload({ waitUntil: "networkidle" });
  const guardadas = await page.locator('input[name="precio"]').count();
  const valores = await page.locator('input[name="precio"]').evaluateAll(
    (inputs) => inputs.map((i) => (i as HTMLInputElement).value),
  );
  console.log(`tras recargar: ${guardadas} cancha(s) — precios ${valores.join(", ")}`);

  const error = await page.locator('[role="alert"]').first().textContent().catch(() => null);
  if (error) console.log(`ALERTA EN PANTALLA: ${error.trim()}`);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
