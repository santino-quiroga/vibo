/**
 * Recorre el panel cliente con un login real y reporta qué se rompió.
 *
 * Hace login de verdad por el formulario en vez de fabricar una cookie: así
 * también se verifica que la sesión y el redirect por rol sigan andando.
 *
 * De cada ruta reporta tres cosas que una captura sola no muestra:
 *   - errores de consola y requests fallidos (el overlay de Next tapa algunos)
 *   - scroll horizontal (el §12 pide responsive de verdad)
 *   - textos clave presentes, para confirmar que la página trae lo que dice
 *
 * Uso: VIBO_EMAIL=... VIBO_PASSWORD=... npx tsx scripts/revisar-panel.mts
 */
import { chromium, devices } from "playwright";

const BASE = process.env.VIBO_BASE ?? "http://localhost:3000";
const SALIDA = process.env.VIBO_SALIDA ?? ".";
const EMAIL = process.env.VIBO_EMAIL;
const PASSWORD = process.env.VIBO_PASSWORD;

const RUTAS = (process.env.VIBO_RUTAS ?? "/dashboard,/dashboard/turnos").split(",");

const VIEWPORTS = [
  { nombre: "mobile", ancho: 390, alto: 844 },
  { nombre: "desktop", ancho: 1440, alto: 900 },
];

async function main() {
  if (!EMAIL || !PASSWORD) {
    throw new Error("Faltan VIBO_EMAIL y VIBO_PASSWORD");
  }

  const browser = await chromium.launch({ channel: "chrome" });
  let problemas = 0;

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.ancho, height: vp.alto },
      deviceScaleFactor: 2,
      locale: "es-AR",
      ...(vp.nombre === "mobile"
        ? { isMobile: true, hasTouch: true, userAgent: devices["iPhone 13"].userAgent }
        : {}),
    });

    const page = await context.newPage();
    const errores: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        errores.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
    page.on("pageerror", (e) => errores.push(`[pageerror] ${e.message}`));
    page.on("requestfailed", (r) => {
      const falla = r.failure()?.errorText ?? "";
      // ERR_ABORTED es normal al navegar: no es una falla real.
      if (!falla.includes("ERR_ABORTED")) {
        errores.push(`[request] ${r.url()} — ${falla}`);
      }
    });

    console.log(`\n=== ${vp.nombre} (${vp.ancho}px) ===`);

    // --- Login real, por el formulario ---
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([
      page.waitForURL(/\/dashboard|\/admin/, { timeout: 15_000 }),
      page.click('button[type="submit"]'),
    ]);
    console.log(`login ok -> ${new URL(page.url()).pathname}`);

    for (const ruta of RUTAS) {
      await page.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);

      const medida = await page.evaluate(() => {
        // Se mide si la página SCROLLEA de verdad, no scrollWidth.
        //
        // documentElement.scrollWidth cuenta el ancho de una tabla aunque esté
        // clipeada adentro de un contenedor con overflow-x:auto, así que da
        // falsos positivos justo en las tablas anchas — que son las que uno
        // resuelve con scroll a propósito. Lo que importa es lo que le pasa al
        // dueño con el dedo: si la página se corre de costado o no.
        const antes = window.scrollX;
        window.scrollTo(9999, window.scrollY);
        const corrio = window.scrollX;
        window.scrollTo(antes, window.scrollY);

        return {
          corrio,
          scroll: document.documentElement.scrollWidth,
          cliente: document.documentElement.clientWidth,
          // El h1 confirma que renderizó la página y no un error.
          titulo: document.querySelector("h1")?.textContent ?? "(sin h1)",
          texto: document.body.innerText,
        };
      });

      const desborde = medida.corrio > 0;
      if (desborde) problemas++;

      const archivo = `${SALIDA}/${ruta.replace(/\W+/g, "-").replace(/^-|-$/g, "")}-${vp.nombre}.png`;
      await page.screenshot({ path: archivo, fullPage: true });

      console.log(
        `  ${ruta.padEnd(20)} h1="${medida.titulo}"  ` +
          `${desborde ? `DESBORDE (scrollX llegó a ${medida.corrio})` : "sin scroll lateral"}  -> ${archivo}`,
      );

      // El overlay de dev de Next cuenta problemas que la consola no siempre
      // muestra (el sprint pasado, un <a> que se anunciaba como <button>).
      // Vive en un shadow DOM, así que hay que entrar a buscarlo.
      const portal = page.locator("nextjs-portal").first();
      const cuenta = await portal
        .evaluate((el) => {
          const root = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot;
          const match = /(\d+)\s+Issue/.exec(root?.textContent ?? "");
          return match ? Number(match[1]) : 0;
        })
        .catch(() => 0);

      // El badge colapsado sólo trae el número: hay que abrirlo para saber QUÉ
      // es. Un issue puede ser un bug de accesibilidad o un console.error
      // nuestro, y son cosas muy distintas.
      let overlay: { cantidad: number; texto: string } | null = null;
      if (cuenta > 0) {
        await portal
          .evaluate((el) => {
            const root = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot;
            const boton = root?.querySelector("button");
            (boton as HTMLButtonElement | null)?.click();
          })
          .catch(() => {});
        await page.waitForTimeout(600);

        const texto = await portal
          .evaluate((el) => {
            const root = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot;
            if (!root) return "";
            // textContent traería también el CSS del shadow DOM. Se recorren
            // sólo los nodos de texto que están realmente pintados.
            const partes: string[] = [];
            const walker = document.createTreeWalker(root as unknown as Node, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const nodo = walker.currentNode;
              const padre = nodo.parentElement;
              if (!padre || padre.tagName === "STYLE" || padre.tagName === "SCRIPT") continue;
              const t = nodo.textContent?.trim();
              if (t) partes.push(t);
            }
            return partes.join(" | ");
          })
          .catch(() => "");
        overlay = { cantidad: cuenta, texto };
      }

      if (overlay && overlay.cantidad > 0) {
        problemas += overlay.cantidad;
        console.log(`      OVERLAY DE NEXT: ${overlay.cantidad} issue(s)`);
        console.log(`      ${overlay.texto.replace(/\s+/g, " ").slice(0, 400)}`);
      }

      // Señales que interesan de esta pantalla, sin depender de la captura.
      for (const marca of [
        "Faltan datos",
        "Todavía no tenés agentes",
        "sin precio",
        "Sin horarios activos",
        "No se pudieron cargar",
        "No se pudo acceder",
        "No se encontró la base",
      ]) {
        if (medida.texto.includes(marca)) console.log(`      · dice: "${marca}"`);
      }
    }

    if (errores.length > 0) {
      problemas += errores.length;
      console.log(`  ERRORES DE CONSOLA (${errores.length}):`);
      // Se deduplican: un mismo warning de hidratación se repite mucho.
      for (const e of [...new Set(errores)].slice(0, 10)) console.log(`      ${e}`);
    } else {
      console.log("  consola limpia");
    }

    await context.close();
  }

  await browser.close();
  console.log(`\n${problemas === 0 ? "Sin problemas detectados." : `${problemas} problema(s) detectado(s).`}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
