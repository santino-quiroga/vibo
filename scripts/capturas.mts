/**
 * Capturas de pantalla para revisar diseño.
 *
 * Usa el Chrome que ya está instalado (channel: "chrome") en vez de descargar
 * un navegador propio. Además de la imagen, reporta si la página tiene scroll
 * horizontal: el requerimiento §12 pide responsive de verdad, y un desborde
 * lateral es la falla que más se escapa mirando solo una captura.
 *
 * Uso: npx tsx scripts/capturas.mts <ruta> [nombre]
 *   Con VIBO_COOKIE=<valor> usa esa cookie de sesión para las rutas privadas.
 */
import { chromium, devices } from "playwright";

const BASE = process.env.VIBO_BASE ?? "http://localhost:3000";
const SALIDA = process.env.VIBO_SALIDA ?? ".";

const VIEWPORTS = [
  { nombre: "mobile", ancho: 390, alto: 844 },
  { nombre: "desktop", ancho: 1440, alto: 900 },
];

async function main() {
  const ruta = process.argv[2] ?? "/login";
  const nombre = process.argv[3] ?? ruta.replace(/\W+/g, "-").replace(/^-|-$/g, "");

  const browser = await chromium.launch({ channel: "chrome" });

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.ancho, height: vp.alto },
      deviceScaleFactor: 2,
      locale: "es-AR",
      ...(vp.nombre === "mobile" ? { isMobile: true, hasTouch: true } : {}),
      userAgent:
        vp.nombre === "mobile" ? devices["iPhone 13"].userAgent : undefined,
    });

    const cookie = process.env.VIBO_COOKIE;
    if (cookie) {
      await context.addCookies([
        {
          name: "authjs.session-token",
          value: cookie,
          domain: "localhost",
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    }

    const page = await context.newPage();
    await page.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);

    // El desborde lateral no se ve en una captura recortada: se mide.
    const desborde = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      cliente: document.documentElement.clientWidth,
    }));

    const archivo = `${SALIDA}/${nombre}-${vp.nombre}.png`;
    await page.screenshot({ path: archivo, fullPage: true });

    const hayDesborde = desborde.scroll > desborde.cliente + 1;
    console.log(
      `${vp.nombre.padEnd(8)} ${String(vp.ancho).padStart(4)}px  ` +
        `scroll=${desborde.scroll} cliente=${desborde.cliente}  ` +
        `${hayDesborde ? "DESBORDE HORIZONTAL" : "ok"}  -> ${archivo}`,
    );

    await context.close();
  }

  await browser.close();
}

main();
