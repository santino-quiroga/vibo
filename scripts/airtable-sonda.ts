/**
 * Sonda de Airtable: imprime la forma REAL de la base de un agente.
 *
 * Existe porque el punto 8.1 releva los campos pero no cómo los devuelve la
 * API, y ahí hay margen para equivocarse feo y en silencio. El caso testigo es
 * "Hora inicio": según cómo esté configurado el campo, la API puede devolver
 * "20:00", 72000 o "2026-07-17T23:00:00.000Z". Los tres se parsean, pero el
 * tercero depende de la zona horaria — y un turno leído tres horas corrido no
 * rompe nada, sólo deja el heatmap mal para siempre.
 *
 * También prueba el filterByFormula por rango de fechas contra la base real,
 * que es la otra cosa que no se puede verificar razonando.
 *
 *   npx tsx scripts/airtable-sonda.ts            → lista los agentes
 *   npx tsx scripts/airtable-sonda.ts <agenteId> → sondea ese agente
 *
 * No imprime la API key ni los datos personales de los contactos: de los campos
 * de texto muestra el tipo y la forma, no el contenido.
 */

import "dotenv/config";

import { descifrar } from "../src/lib/crypto";
import { prisma } from "../src/lib/prisma";
import { CAMPO_RESERVA, TABLA } from "../src/lib/airtable/campos";
import { listarRegistros } from "../src/lib/airtable/cliente";
import { parsearFecha, parsearHora } from "../src/lib/airtable/tipos";

/** Campos cuyo contenido son datos personales de terceros (SDD 7.4). */
const SENSIBLES = new Set<string>([
  CAMPO_RESERVA.nombre,
  CAMPO_RESERVA.telefono,
  CAMPO_RESERVA.notas,
]);

function describir(campo: string, valor: unknown): string {
  const tipo = Array.isArray(valor) ? "array" : typeof valor;

  if (SENSIBLES.has(campo)) {
    const largo = typeof valor === "string" ? valor.length : 0;
    return `${tipo} (oculto, ${largo} chars)`;
  }

  const muestra = JSON.stringify(valor);
  return `${tipo.padEnd(7)} ${muestra}`;
}

async function main() {
  const agenteId = process.argv[2];

  if (!agenteId) {
    const agentes = await prisma.agente.findMany({
      select: {
        id: true,
        nombre: true,
        airtableBaseId: true,
        cliente: { select: { nombre: true } },
      },
    });
    console.log("\nAgentes cargados:\n");
    for (const a of agentes) {
      console.log(`  ${a.id}  ${a.cliente.nombre} / ${a.nombre}  (base ${a.airtableBaseId})`);
    }
    console.log("\nCorré: npx tsx scripts/airtable-sonda.ts <agenteId>\n");
    return;
  }

  const agente = await prisma.agente.findUnique({
    where: { id: agenteId },
    select: {
      nombre: true,
      airtableBaseId: true,
      airtableApiKeyEnc: true,
      canchas: { select: { numero: true, precio: true } },
    },
  });

  if (!agente) throw new Error(`No existe el agente ${agenteId}`);

  const config = {
    baseId: agente.airtableBaseId,
    apiKey: descifrar(agente.airtableApiKeyEnc),
  };

  console.log(`\n=== ${agente.nombre} — base ${config.baseId} ===`);
  console.log(`Canchas configuradas en Vibo: ${
    agente.canchas.length === 0
      ? "ninguna (sin esto, ingresos estimados da 0)"
      : agente.canchas.map((c) => `Cancha ${c.numero} ($${c.precio})`).join(", ")
  }`);

  for (const tabla of [TABLA.reservas, TABLA.slots]) {
    console.log(`\n--- Tabla "${tabla}" ---`);
    let registros;
    try {
      registros = await listarRegistros(config, tabla, { pageSize: 3 });
    } catch (error) {
      console.log(`  ERROR: ${(error as Error).message}`);
      continue;
    }

    if (registros.length === 0) {
      console.log("  (vacía — no hay con qué verificar el esquema)");
      continue;
    }

    // Los campos vacíos Airtable directamente no los manda, así que la unión de
    // varios registros describe la tabla mejor que el primero solo.
    const campos = new Set<string>();
    for (const r of registros) for (const c of Object.keys(r.fields)) campos.add(c);
    console.log(`  Campos presentes: ${[...campos].map((c) => `"${c}"`).join(", ")}`);

    console.log(`\n  Primer registro (${registros[0].id}):`);
    for (const [campo, valor] of Object.entries(registros[0].fields)) {
      console.log(`    ${campo.padEnd(24)} ${describir(campo, valor)}`);
    }
  }

  // La prueba que de verdad importa: ¿el parser entiende lo que hay?
  console.log(`\n--- ¿Se puede leer? ---`);
  const reservas = await listarRegistros(config, TABLA.reservas, { pageSize: 100 });
  let horasOk = 0;
  let horasAmbiguas = 0;
  let horasRotas = 0;
  let fechasRotas = 0;

  for (const r of reservas) {
    const hora = parsearHora(r.fields[CAMPO_RESERVA.horaInicio]);
    if (!hora) horasRotas++;
    else if (hora.ambigua) horasAmbiguas++;
    else horasOk++;
    if (!parsearFecha(r.fields[CAMPO_RESERVA.fecha])) fechasRotas++;
  }

  console.log(`  Reservas leídas: ${reservas.length}`);
  console.log(`  Horas parseadas sin ambigüedad: ${horasOk}`);
  console.log(`  Horas parseadas desde ISO (zona horaria conjeturada): ${horasAmbiguas}`);
  console.log(`  Horas ilegibles: ${horasRotas}`);
  console.log(`  Fechas ilegibles: ${fechasRotas}`);

  if (horasAmbiguas > 0) {
    console.log(
      `\n  ATENCIÓN: "Hora inicio" viene como fecha-y-hora. Hay que confirmar\n` +
        `  contra la base que la hora local que se muestra es la correcta.`,
    );
  }

  // El filtro por fecha, contra la base real: es la parte del código que no se
  // puede verificar razonando, porque la fórmula la evalúa Airtable.
  console.log(`\n--- filterByFormula por rango ---`);
  const fechas = reservas
    .map((r) => parsearFecha(r.fields[CAMPO_RESERVA.fecha]))
    .filter((f): f is string => f !== null)
    .sort();

  if (fechas.length === 0) {
    console.log("  (sin fechas legibles, no se puede probar)");
  } else {
    const campo = `{${CAMPO_RESERVA.fecha}}`;
    const desde = fechas[0];
    const hasta = fechas[fechas.length - 1];
    const filtrados = await listarRegistros(config, TABLA.reservas, {
      filterByFormula: `AND(NOT(IS_BEFORE(${campo}, '${desde}')), NOT(IS_AFTER(${campo}, '${hasta}')))`,
    });
    console.log(`  Rango completo ${desde} → ${hasta}`);
    console.log(`  Sin filtro: ${reservas.length} | Con filtro: ${filtrados.length}`);
    console.log(
      filtrados.length === reservas.length
        ? "  OK: el filtro inclusivo trae todo. Las puntas entran."
        : "  PROBLEMA: el filtro pierde registros — los extremos no son inclusivos.",
    );

    const soloPrimerDia = await listarRegistros(config, TABLA.reservas, {
      filterByFormula: `AND(NOT(IS_BEFORE(${campo}, '${desde}')), NOT(IS_AFTER(${campo}, '${desde}')))`,
    });
    const esperados = fechas.filter((f) => f === desde).length;
    console.log(`  Sólo ${desde}: esperados ${esperados} | trajo ${soloPrimerDia.length}`);
    console.log(
      soloPrimerDia.length === esperados
        ? "  OK: un solo día filtra exacto (no se corre por zona horaria)."
        : "  PROBLEMA: el filtro de un día no coincide — probable corrimiento de zona horaria.",
    );
  }

  console.log();
}

main()
  .catch((error) => {
    console.error("\nFalló la sonda:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
