/**
 * Prueba funcional de cancelar y reprogramar un turno desde la UI.
 *
 * No alcanza con que la pantalla renderice: hay que confirmar que el PATCH
 * llegó a Airtable y que el dato quedó cambiado. Por eso cada acción se
 * verifica leyendo el registro de vuelta desde el simulador, no mirando la UI.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const AIRTABLE = "http://localhost:8976";
const BASE_ID = "appP5qWjfuoz1lj0g";
const EMAIL = process.env.VIBO_EMAIL!;
const PASSWORD = process.env.VIBO_PASSWORD!;

async function leerReservas() {
  const res = await fetch(`${AIRTABLE}/${BASE_ID}/Reservas?pageSize=100`, {
    headers: { Authorization: "Bearer test" },
  });
  const json = (await res.json()) as {
    records: Array<{ id: string; fields: Record<string, unknown> }>;
  };
  return json.records;
}

function resumen(r: { id: string; fields: Record<string, unknown> }) {
  return `${r.id} ${r.fields["Fecha"]} ${r.fields["Hora inicio"]} ${r.fields["Cancha"]} -> ${r.fields["Estado"]}`;
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="email"]');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL(/\/dashboard/), page.click('button[type="submit"]')]);

  // ---------- REPROGRAMAR ----------
  await page.goto(`${BASE}/dashboard/turnos?rango=semana`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table");

  const antes = await leerReservas();

  // Se abre el panel del primer turno gestionable.
  await page.locator('button:has-text("Gestionar")').first().click();
  await page.waitForSelector('input[name="fecha"]');

  const fechaOriginal = await page.inputValue('input[name="fecha"]');
  const horaOriginal = await page.inputValue('input[name="hora"]');
  const recordIdForm = await page
    .locator('input[name="recordId"]')
    .first()
    .inputValue();
  const canchaForm = await page
    .locator('input[name="cancha"]')
    .first()
    .inputValue()
    .catch(() => "(sin cancha)");
  console.log(
    `turno abierto: record=${recordIdForm} fecha=${fechaOriginal} hora=${horaOriginal} cancha=${canchaForm}`,
  );

  const enAirtable = antes.find((r) => r.id === recordIdForm);
  console.log(
    `  ese record en Airtable: ${
      enAirtable
        ? `fecha=${enAirtable.fields["Fecha"]} hora=${enAirtable.fields["Hora inicio"]} cancha=${enAirtable.fields["Cancha"]}`
        : "NO está en las primeras 100 filas leídas"
    }`,
  );

  // Se mueve a una hora bien distinta para que no choque con otro turno.
  await page.fill('input[name="hora"]', "07:15");
  await page.click('button:has-text("Reprogramar")');
  await page.waitForTimeout(2500);

  const despues = await leerReservas();
  const movidos = despues.filter((r) => {
    const previo = antes.find((a) => a.id === r.id);
    return previo && previo.fields["Hora inicio"] !== r.fields["Hora inicio"];
  });

  console.log(`\nREPROGRAMAR -> ${movidos.length} registro(s) cambiados en Airtable`);
  for (const m of movidos) {
    const previo = antes.find((a) => a.id === m.id)!;
    console.log(`  ${m.id}: "${previo.fields["Hora inicio"]}" -> "${m.fields["Hora inicio"]}"`);
  }

  // ---------- CHOQUE ----------
  // Se busca en Airtable un par de turnos de la MISMA cancha y el MISMO día, y
  // se intenta mover uno encima del horario del otro. Tiene que rechazarlo sin
  // escribir: dos turnos en la misma cancha a la misma hora es una cancha
  // vendida dos veces.
  //
  // El par sale de los datos reales de Airtable y no del turno que movimos
  // antes: apuntar al turno recién movido corría el riesgo de moverlo sobre sí
  // mismo, que no es un choque y daba un falso negativo.
  await page.goto(`${BASE}/dashboard/turnos?rango=semana`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table");

  const vigentes = despues.filter((r) => r.fields["Estado"] !== "Cancelada");
  let par: { ocupante: typeof vigentes[0]; aMover: typeof vigentes[0] } | null = null;

  for (const a of vigentes) {
    const b = vigentes.find(
      (x) =>
        x.id !== a.id &&
        x.fields["Cancha"] === a.fields["Cancha"] &&
        x.fields["Fecha"] === a.fields["Fecha"] &&
        x.fields["Hora inicio"] !== a.fields["Hora inicio"],
    );
    if (b) {
      par = { ocupante: a, aMover: b };
      break;
    }
  }

  if (!par) {
    console.log("\nCHOQUE -> no hay dos turnos de la misma cancha y día para probarlo");
  } else {
    const { ocupante, aMover } = par;
    const nombreAMover = String(aMover.fields["Nombre"] ?? "");
    console.log(
      `\nchoque: mover "${nombreAMover}" (${aMover.id}) sobre ${ocupante.fields["Cancha"]} ` +
        `${ocupante.fields["Fecha"]} ${ocupante.fields["Hora inicio"]} (ocupada por ${ocupante.fields["Nombre"]})`,
    );

    // Match EXACTO del nombre. Con substring, "Contacto 2" matcheaba también
    // "Contacto 20"/"Contacto 21" y el test abría otro turno: no había choque,
    // no salía el mensaje, y parecía que la validación no andaba.
    //
    // Se ancla contra el <span> del nombre y no contra la fila entera, porque
    // `hasText` compara contra textContent, que concatena todas las celdas sin
    // saltos de línea — ahí un `^...$` no puede matchear nunca.
    const exacto = new RegExp(
      `^${nombreAMover.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
    );
    const fila = page
      .locator("tbody tr")
      .filter({ has: page.locator("span").filter({ hasText: exacto }) })
      .first();
    const boton = fila.locator('button:has-text("Gestionar")');

    if ((await boton.count()) === 0) {
      console.log("  no se encontró la fila en la página");
    } else {
      await boton.click();
      await page.waitForSelector('input[name="fecha"]');
      await page.fill('input[name="fecha"]', String(ocupante.fields["Fecha"]));
      await page.fill('input[name="hora"]', String(ocupante.fields["Hora inicio"]));
      await page.click('button:has-text("Reprogramar")');
      await page.waitForTimeout(2500);

      const texto = await page.locator("body").innerText();
      const rechazo = texto.includes("ya tiene un turno a las");

      // La prueba de fuego no es el mensaje sino que NO haya escrito.
      const trasChoque = await leerReservas();
      const registro = trasChoque.find((r) => r.id === aMover.id);
      const seEscribio = registro?.fields["Hora inicio"] !== aMover.fields["Hora inicio"];

      console.log(`CHOQUE -> ${rechazo ? "rechazado con mensaje" : "SIN mensaje de rechazo"}`);
      console.log(
        `  el registro ${seEscribio ? "SE ESCRIBIÓ IGUAL (mal)" : "quedó intacto (bien)"}: ` +
          `hora sigue en "${registro?.fields["Hora inicio"]}"`,
      );
      if (rechazo) {
        const linea = texto.split("\n").find((l) => l.includes("ya tiene un turno"));
        console.log(`  mensaje: ${linea?.trim()}`);
      }
    }
  }

  // ---------- CANCELAR ----------
  await page.goto(`${BASE}/dashboard/turnos?rango=semana`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table");

  const antesCancel = await leerReservas();

  await page.locator('button:has-text("Gestionar")').first().click();
  await page.waitForSelector('button:has-text("Cancelar turno")');
  await page.click('button:has-text("Cancelar turno")');
  await page.waitForSelector('button:has-text("Sí, cancelar")');
  await page.click('button:has-text("Sí, cancelar")');
  await page.waitForTimeout(2500);

  const despuesCancel = await leerReservas();
  const cancelados = despuesCancel.filter((r) => {
    const previo = antesCancel.find((a) => a.id === r.id);
    return (
      previo &&
      previo.fields["Estado"] !== "Cancelada" &&
      r.fields["Estado"] === "Cancelada"
    );
  });

  console.log(`\nCANCELAR -> ${cancelados.length} registro(s) pasados a Cancelada`);
  for (const c of cancelados) console.log(`  ${resumen(c)}`);

  console.log(`\nerrores de página: ${errores.length === 0 ? "ninguno" : errores.join(" | ")}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
