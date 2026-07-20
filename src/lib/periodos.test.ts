/**
 * Pruebas de los cortes de tiempo del dashboard.
 *
 * El riesgo acá es doble: correrse un día por zona horaria (Vercel en UTC vs.
 * Argentina en UTC-3), y comparar contra un período anterior de distinto largo,
 * que daría una variación falsa todos los meses.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  esFechaCalendario,
  hoyEnArgentina,
  inicioDeSemana,
  rangoCompleto,
  resolverPeriodo,
} from "@/lib/periodos";

describe("hoyEnArgentina", () => {
  it("a las 23hs argentinas todavía es el mismo día, no el siguiente", () => {
    // 2026-07-18 01:30 UTC = 2026-07-17 22:30 en Argentina. El servidor (UTC)
    // ya está en el 18; el dueño, en el 17. Tiene que ganar el 17.
    const ahora = new Date("2026-07-18T01:30:00Z");
    assert.equal(hoyEnArgentina(ahora), "2026-07-17");
  });

  it("al mediodía coincide con la fecha UTC", () => {
    assert.equal(hoyEnArgentina(new Date("2026-07-17T15:00:00Z")), "2026-07-17");
  });
});

describe("resolverPeriodo", () => {
  it("hoy compara contra ayer, un día cada uno", () => {
    const { actual, anterior } = resolverPeriodo("hoy", "2026-07-17");
    assert.deepEqual(actual, { desde: "2026-07-17", hasta: "2026-07-17" });
    assert.deepEqual(anterior, { desde: "2026-07-16", hasta: "2026-07-16" });
  });

  it("semana son 7 días contando hoy, contra los 7 previos", () => {
    const { actual, anterior } = resolverPeriodo("semana", "2026-07-17");
    assert.deepEqual(actual, { desde: "2026-07-11", hasta: "2026-07-17" });
    assert.deepEqual(anterior, { desde: "2026-07-04", hasta: "2026-07-10" });
  });

  it("mes va del 1 a hoy, contra el mismo tramo del mes anterior", () => {
    // Lo importante: el mes anterior se recorta al MISMO largo, no al mes
    // entero. Comparar 17 días de julio contra los 30 de junio daría una caída
    // falsa cada principio de mes.
    const { actual, anterior } = resolverPeriodo("mes", "2026-07-17");
    assert.deepEqual(actual, { desde: "2026-07-01", hasta: "2026-07-17" });
    assert.deepEqual(anterior, { desde: "2026-06-01", hasta: "2026-06-17" });
  });

  it("el día 31 se compara contra un febrero corto sin pasarse", () => {
    // 31 de marzo: el mes anterior (febrero) no tiene 31 días. El tramo se
    // recorta al último día real de febrero en vez de derramar a marzo.
    const { anterior } = resolverPeriodo("mes", "2026-03-31");
    assert.equal(anterior.desde, "2026-02-01");
    assert.equal(anterior.hasta, "2026-02-28");
  });

  it("en enero, el mes anterior es diciembre del año pasado", () => {
    const { actual, anterior } = resolverPeriodo("mes", "2026-01-10");
    assert.deepEqual(actual, { desde: "2026-01-01", hasta: "2026-01-10" });
    assert.deepEqual(anterior, { desde: "2025-12-01", hasta: "2025-12-10" });
  });

  it("la semana cruza el cambio de mes sin romperse", () => {
    const { actual, anterior } = resolverPeriodo("semana", "2026-03-03");
    assert.deepEqual(actual, { desde: "2026-02-25", hasta: "2026-03-03" });
    assert.deepEqual(anterior, { desde: "2026-02-18", hasta: "2026-02-24" });
  });
});

describe("inicioDeSemana", () => {
  // La semana del calendario operativo va de lunes a domingo. El caso que más
  // se rompe es el domingo: con una semana que arranca el lunes, el domingo
  // pertenece a la semana que YA pasó, no a la que empieza al día siguiente.
  it("un domingo pertenece a la semana que arrancó el lunes anterior", () => {
    // 2026-07-19 es domingo.
    assert.equal(inicioDeSemana("2026-07-19"), "2026-07-13");
  });

  it("un lunes es su propio inicio de semana", () => {
    assert.equal(inicioDeSemana("2026-07-13"), "2026-07-13");
  });

  it("un miércoles retrocede al lunes de esa semana", () => {
    assert.equal(inicioDeSemana("2026-07-15"), "2026-07-13");
  });

  it("cruza el cambio de mes y de año sin correrse", () => {
    // 2026-01-01 es jueves: su lunes cae en diciembre del año anterior.
    assert.equal(inicioDeSemana("2026-01-01"), "2025-12-29");
    // 2026-03-01 es domingo: su lunes cae en febrero.
    assert.equal(inicioDeSemana("2026-03-01"), "2026-02-23");
  });
});

describe("esFechaCalendario", () => {
  it("acepta una fecha bien formada y rechaza basura de la URL", () => {
    assert.equal(esFechaCalendario("2026-07-19"), true);
    assert.equal(esFechaCalendario("19-07-2026"), false);
    assert.equal(esFechaCalendario("2026-7-9"), false);
    assert.equal(esFechaCalendario(""), false);
    assert.equal(esFechaCalendario(undefined), false);
  });
});

describe("rangoCompleto", () => {
  it("cubre actual y anterior en un solo pedido", () => {
    // Se pide una vez lo que abarca los dos períodos, para no golpear el rate
    // limit de Airtable dos veces por sede.
    const { actual, anterior } = resolverPeriodo("mes", "2026-07-17");
    const rango = rangoCompleto(actual, anterior);
    assert.equal(rango.desde, "2026-06-01", "arranca en lo más viejo");
    assert.equal(rango.hasta, "2026-07-17", "termina en lo más nuevo");
  });
});
