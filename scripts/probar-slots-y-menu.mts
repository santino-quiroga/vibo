/**
 * Verifica la edición de horarios (§8.0) y el menú de usuario (§5).
 *
 * Igual que con los turnos: la edición se confirma leyendo el slot de vuelta
 * desde Airtable, no mirando la pantalla.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const AIRTABLE = "http://localhost:8976";
const BASE_ID = "appP5qWjfuoz1lj0g";

async function leerSlots() {
  const res = await fetch(`${AIRTABLE}/${BASE_ID}/Configuracion?pageSize=100`, {
    headers: { Authorization: "Bearer test" },
  });
  const json = (await res.json()) as {
    records: Array<{ id: string; fields: Record<string, unknown> }>;
  };
  return json.records;
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', process.env.VIBO_EMAIL!);
  await page.fill('input[name="password"]', process.env.VIBO_PASSWORD!);
  await Promise.all([page.waitForURL(/\/dashboard/), page.click('button[type="submit"]')]);

  // ---------- EDITAR HORARIO ----------
  await page.goto(`${BASE}/dashboard/turnos/horarios`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button:has-text("Editar")');

  const antes = await leerSlots();

  await page.locator('button:has-text("Editar")').first().click();
  await page.waitForSelector('input[name="duracionMin"]');

  const duracionPrevia = await page.inputValue('input[name="duracionMin"]');
  const nombrePrevio = await page.inputValue('input[name="nombre"]');
  const recordId = await page.locator('input[name="recordId"]').first().inputValue();
  console.log(`slot abierto: ${recordId} nombre="${nombrePrevio}" duracion=${duracionPrevia}`);

  const enAirtable = antes.find((s) => s.id === recordId);
  console.log(
    `  en Airtable: nombre="${enAirtable?.fields["Nombre Slot"]}" duracion=${enAirtable?.fields["Duracion"]} dias=${JSON.stringify(enAirtable?.fields["Dias Activos"])}`,
  );

  const nuevaDuracion = duracionPrevia === "75" ? "105" : "75";
  await page.fill('input[name="duracionMin"]', nuevaDuracion);
  await page.click('button:has-text("Guardar cambios")');
  await page.waitForTimeout(2500);

  const despues = await leerSlots();
  const actualizado = despues.find((s) => s.id === recordId);
  const ok = String(actualizado?.fields["Duracion"]) === nuevaDuracion;

  console.log(
    `\nEDITAR HORARIO -> duracion en Airtable: "${enAirtable?.fields["Duracion"]}" -> "${actualizado?.fields["Duracion"]}" (esperado ${nuevaDuracion}) ${ok ? "OK" : "FALLÓ"}`,
  );
  console.log(
    `  dias quedaron: ${JSON.stringify(actualizado?.fields["Dias Activos"])}  canchas: ${JSON.stringify(actualizado?.fields["Cancha"])}  activo: ${actualizado?.fields["Activo"]}`,
  );

  // ---------- MENÚ DE USUARIO ----------
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1");
  await page.click('button:has-text("Abrir menú de usuario")').catch(async () => {
    await page.locator("header button").last().click();
  });
  await page.waitForTimeout(800);

  const textoMenu = await page.locator("body").innerText();
  const items = ["Plan", "Cuenta", "Cambiar contraseña", "Cerrar sesión"];
  console.log("\nMENÚ DE USUARIO:");
  for (const item of items) {
    console.log(`  ${textoMenu.includes(item) ? "✓" : "✗"} ${item}`);
  }

  await page.screenshot({ path: `${process.env.VIBO_SALIDA}/menu-usuario.png` });

  console.log(`\nerrores de página: ${errores.length === 0 ? "ninguno" : errores.join(" | ")}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
