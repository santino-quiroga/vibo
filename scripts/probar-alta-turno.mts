/**
 * Verifica el alta manual de un turno (§8, cargado al mostrador).
 *
 * Los tres puntos que importan y que la pantalla sola no prueba:
 *   - que el registro llegue a Airtable con los campos correctos
 *   - que "Creada por bot" quede en false (si no, infla la tasa de conversión)
 *   - que el choque de cancha/fecha/hora se rechace SIN escribir
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const AIRTABLE = "http://localhost:8976";
const BASE_ID = "appP5qWjfuoz1lj0g";

async function leerReservas() {
  const todas: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let offset: string | undefined;
  do {
    const url = new URL(`${AIRTABLE}/${BASE_ID}/Reservas`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const r = await fetch(url, { headers: { Authorization: "Bearer test" } });
    const j = (await r.json()) as { records: typeof todas; offset?: string };
    todas.push(...j.records);
    offset = j.offset;
  } while (offset);
  return todas;
}

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errores: string[] = [];
page.on("pageerror", (e) => errores.push(e.message));

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="email"]', process.env.VIBO_EMAIL!);
await page.fill('input[name="password"]', process.env.VIBO_PASSWORD!);
await Promise.all([page.waitForURL(/\/dashboard/), page.click('button[type="submit"]')]);

await page.goto(`${BASE}/dashboard/turnos?rango=semana`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("table");

const antes = await leerReservas();

// --- ALTA ---
await page.click('button:has-text("Cargar turno a mano")');
await page.waitForSelector('input[name="nombre"]');

// El horario tiene que ser único por corrida: el script deja los turnos que
// crea, así que reusar siempre 06:45 hacía que la segunda corrida chocara
// contra la primera y pareciera un bug del alta. Los minutos salen del reloj.
const minutos = String(Math.floor(Date.now() / 1000) % 60).padStart(2, "0");
const HORA_LIBRE = `06:${minutos}`;
const marca = `Walk-in ${Date.now().toString().slice(-5)}`;
const manana = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
await page.fill('input[name="nombre"]', marca);
await page.fill('input[name="telefono"]', "2323 55-1234");
await page.fill('input[name="fecha"]', manana);
await page.fill(String.raw`input[name="hora"]`, HORA_LIBRE);
await page.selectOption('select[name="cancha"]', { index: 1 });
await page.fill('textarea[name="notas"]', "Paga en efectivo");
await page.click('button:has-text("Cargar turno")');
await page.waitForTimeout(2500);

const despues = await leerReservas();
const nuevo = despues.find((r) => r.fields["Nombre"] === marca);

const textoAlta = await page.locator("body").innerText();
const errorAlta = textoAlta
  .split("\n")
  .find((l) => /no coincide|ya tiene un turno|no es válid|inexistente|configurada|Poné|Elegí/.test(l));
console.log(`ALTA -> ${despues.length - antes.length} registro(s) nuevos`);
if (errorAlta) console.log(`  error en pantalla: ${errorAlta.trim()}`);
if (nuevo) {
  console.log(`  ${nuevo.id}`);
  console.log(`  fecha=${nuevo.fields["Fecha"]} hora=${nuevo.fields["Hora inicio"]} cancha=${nuevo.fields["Cancha"]}`);
  console.log(`  estado=${nuevo.fields["Estado"]} telefono=${nuevo.fields["Teléfono"]} notas=${nuevo.fields["Notas"]}`);
  console.log(`  Creada por bot = ${nuevo.fields["Creada por bot"]} ${nuevo.fields["Creada por bot"] === false ? "(bien)" : "(MAL: debe ser false)"}`);
} else {
  console.log("  NO se creó el registro");
}

// --- ALTA PENDIENTE DE SEÑA (prueba el fallback de etiquetas de estado) ---
await page.goto(`${BASE}/dashboard/turnos?rango=semana`, { waitUntil: "domcontentloaded" });
await page.click('button:has-text("Cargar turno a mano")');
await page.waitForSelector('input[name="nombre"]');
const marca2 = `Senia ${Date.now().toString().slice(-5)}`;
await page.fill('input[name="nombre"]', marca2);
await page.fill('input[name="fecha"]', manana);
await page.fill(String.raw`input[name="hora"]`, `07:${minutos}`);
await page.selectOption('select[name="cancha"]', { index: 1 });
await page.selectOption('select[name="estado"]', "PENDIENTE_SENIA");
await page.fill('input[name="montoSenia"]', "5000");
await page.click('button:has-text("Cargar turno")');
await page.waitForTimeout(2500);

const conSenia = (await leerReservas()).find((r) => r.fields["Nombre"] === marca2);
console.log(`\nALTA PENDIENTE -> estado="${conSenia?.fields["Estado"]}" seña=${conSenia?.fields["Monto seña"]}`);

// --- CHOQUE ---
await page.goto(`${BASE}/dashboard/turnos?rango=semana`, { waitUntil: "domcontentloaded" });
await page.click('button:has-text("Cargar turno a mano")');
await page.waitForSelector('input[name="nombre"]');
const marca3 = `Choque ${minutos}-${Date.now().toString().slice(-4)}`;
await page.fill('input[name="nombre"]', marca3);
await page.fill('input[name="fecha"]', manana);
await page.fill(String.raw`input[name="hora"]`, HORA_LIBRE);
await page.selectOption('select[name="cancha"]', { index: 1 });
await page.click('button:has-text("Cargar turno")');
await page.waitForTimeout(2500);

const texto = await page.locator("body").innerText();
const rechazo = texto.includes("ya tiene un turno a las");
const seCreo = (await leerReservas()).some((r) => r.fields["Nombre"] === marca3);
console.log(`\nCHOQUE -> ${rechazo ? "rechazado con mensaje" : "SIN mensaje"}; registro ${seCreo ? "SE CREÓ (mal)" : "no se creó (bien)"}`);
if (rechazo) console.log(`  ${texto.split("\n").find((l) => l.includes("ya tiene un turno"))?.trim()}`);

await page.screenshot({ path: `${process.env.VIBO_SALIDA}/alta-turno.png`, fullPage: true });
console.log(`\nerrores de página: ${errores.length === 0 ? "ninguno" : errores.join(" | ")}`);
await browser.close();
process.exit(0);
