/**
 * Encuentra QUÉ elemento desborda a lo ancho, no sólo que la página desborda.
 *
 * Existe porque "scrollWidth > clientWidth" dice que hay un problema pero no
 * dónde, y a ojo se termina culpando al elemento equivocado. Esto recorre el
 * DOM y reporta los que se salen del viewport, con su cadena de padres.
 *
 * Uso: VIBO_EMAIL=... VIBO_PASSWORD=... VIBO_RUTA=/dashboard npx tsx scripts/buscar-desborde.mts
 */
import { chromium } from "playwright";

const BASE = process.env.VIBO_BASE ?? "http://localhost:3000";
const RUTA = process.env.VIBO_RUTA ?? "/dashboard";
const ANCHO = Number(process.env.VIBO_ANCHO ?? 390);

const browser = await chromium.launch({ channel: "chrome" });
// isMobile cambia cómo Chrome resuelve el viewport, así que tiene que coincidir
// con revisar-panel.mts: si no, los dos scripts miden páginas distintas.
const page = await browser.newPage({
  viewport: { width: ANCHO, height: 844 },
  isMobile: process.env.VIBO_MOBILE !== "0",
  hasTouch: process.env.VIBO_MOBILE !== "0",
});

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', process.env.VIBO_EMAIL ?? "");
await page.fill('input[name="password"]', process.env.VIBO_PASSWORD ?? "");
await Promise.all([page.waitForURL(/\/dashboard|\/admin/), page.click('button[type="submit"]')]);
await page.goto(`${BASE}${RUTA}`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const culpables = await page.evaluate((limite) => {
  const salida: string[] = [];

  for (const el of Array.from(document.querySelectorAll("*"))) {
    const r = el.getBoundingClientRect();
    if (r.right <= limite + 1) continue;

    // Un elemento ancho adentro de un contenedor que scrollea NO desborda la
    // página: es el caso normal de una tabla scrolleable. Sin este filtro, el
    // diagnóstico acusa justo a los elementos que ya están resueltos y esconde
    // al culpable entre cien falsos positivos.
    let dentroDeScroll = false;
    let p: Element | null = el.parentElement;
    while (p) {
      const o = getComputedStyle(p).overflowX;
      if (o === "auto" || o === "scroll" || o === "hidden") {
        dentroDeScroll = true;
        break;
      }
      p = p.parentElement;
    }
    if (dentroDeScroll) continue;

    // Se reporta el elemento y de quién cuelga, que es lo que hace falta para
    // saber a cuál ponerle el overflow.
    const cadena: string[] = [];
    let actual: Element | null = el;
    for (let i = 0; i < 4 && actual; i++) {
      const clases = (actual.className?.toString() ?? "").slice(0, 60);
      cadena.push(`${actual.tagName.toLowerCase()}${clases ? "." + clases.split(/\s+/).join(".") : ""}`);
      actual = actual.parentElement;
    }
    const estilo = getComputedStyle(el);
    salida.push(
      `right=${Math.round(r.right)} w=${Math.round(r.width)} overflowX=${estilo.overflowX}\n    ${cadena.join("\n      << ")}`,
    );
  }
  return salida;
}, ANCHO);

const pagina = await page.evaluate(() => ({
  scroll: document.documentElement.scrollWidth,
  cliente: document.documentElement.clientWidth,
  bodyScroll: document.body.scrollWidth,
}));
console.log(
  `\npágina: scrollWidth=${pagina.scroll} clientWidth=${pagina.cliente} body=${pagina.bodyScroll}`,
);
console.log(`Elementos que pasan de ${ANCHO}px en ${RUTA}: ${culpables.length}\n`);
for (const c of culpables.slice(0, 6)) console.log(`  ${c}\n`);

await browser.close();
