/**
 * Pruebas del ciclo de facturación (mes calendario argentino).
 *
 * El riesgo es el mismo de siempre: correrse de mes por zona horaria. El
 * servidor corre en UTC y Argentina es UTC-3, así que las últimas 3 horas de
 * cada mes (en UTC) todavía son el mes anterior en Argentina.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cicloAnterior, cicloDe, cicloDeCliente, diaDelMesAR, etiquetaCiclo } from "@/lib/ciclo";

describe("cicloDe", () => {
  it("el ciclo de mitad de mes va del 1° al 1° del mes siguiente, en hora AR", () => {
    const c = cicloDe(new Date("2026-07-17T15:00:00Z"));
    // 1 jul 00:00 -03:00 = 1 jul 03:00 UTC
    assert.equal(c.inicio.toISOString(), "2026-07-01T03:00:00.000Z");
    assert.equal(c.fin.toISOString(), "2026-08-01T03:00:00.000Z");
  });

  it("no se corre de mes en la última noche argentina del mes", () => {
    // 1 ago 01:30 UTC = 31 jul 22:30 en Argentina → todavía es julio.
    const c = cicloDe(new Date("2026-08-01T01:30:00Z"));
    assert.equal(c.inicio.toISOString(), "2026-07-01T03:00:00.000Z", "sigue siendo julio");
  });

  it("ya en agosto argentino, el ciclo es agosto", () => {
    // 1 ago 03:30 UTC = 1 ago 00:30 en Argentina → ya es agosto.
    const c = cicloDe(new Date("2026-08-01T03:30:00Z"));
    assert.equal(c.inicio.toISOString(), "2026-08-01T03:00:00.000Z");
  });

  it("diciembre cruza al enero del año siguiente", () => {
    const c = cicloDe(new Date("2026-12-15T12:00:00Z"));
    assert.equal(c.inicio.toISOString(), "2026-12-01T03:00:00.000Z");
    assert.equal(c.fin.toISOString(), "2027-01-01T03:00:00.000Z");
  });
});

describe("cicloAnterior", () => {
  it("de julio da junio", () => {
    const c = cicloAnterior(new Date("2026-07-17T15:00:00Z"));
    assert.equal(c.inicio.toISOString(), "2026-06-01T03:00:00.000Z");
    assert.equal(c.fin.toISOString(), "2026-07-01T03:00:00.000Z");
  });

  it("de enero da diciembre del año anterior", () => {
    const c = cicloAnterior(new Date("2026-01-10T12:00:00Z"));
    assert.equal(c.inicio.toISOString(), "2025-12-01T03:00:00.000Z");
  });
});

describe("etiquetaCiclo", () => {
  it("nombra el mes y el año", () => {
    const c = cicloDe(new Date("2026-07-17T15:00:00Z"));
    assert.match(etiquetaCiclo(c), /julio.*2026/i);
  });
});

describe("cicloDeCliente", () => {
  it("sin anclaje (null) es idéntico al mes calendario", () => {
    const ahora = new Date("2026-07-17T15:00:00Z");
    const anclado = cicloDeCliente(null, ahora);
    const calendario = cicloDe(ahora);
    assert.equal(anclado.inicio.toISOString(), calendario.inicio.toISOString());
    assert.equal(anclado.fin.toISOString(), calendario.fin.toISOString());
  });

  it("anclado al 15, a mitad de ciclo va del 15 al 15", () => {
    // 20/jul: ya pasó el 15, así que el ciclo arrancó el 15/jul.
    const c = cicloDeCliente(15, new Date("2026-07-20T15:00:00Z"));
    assert.equal(c.inicio.toISOString(), "2026-07-15T03:00:00.000Z");
    assert.equal(c.fin.toISOString(), "2026-08-15T03:00:00.000Z");
  });

  it("anclado al 15, antes del día de anclaje el ciclo arrancó el mes pasado", () => {
    // 10/jul: todavía no llegó al 15, así que el ciclo vigente es 15/jun–15/jul.
    const c = cicloDeCliente(15, new Date("2026-07-10T15:00:00Z"));
    assert.equal(c.inicio.toISOString(), "2026-06-15T03:00:00.000Z");
    assert.equal(c.fin.toISOString(), "2026-07-15T03:00:00.000Z");
  });

  it("cruza el fin de año", () => {
    const c = cicloDeCliente(20, new Date("2026-12-25T12:00:00Z"));
    assert.equal(c.inicio.toISOString(), "2026-12-20T03:00:00.000Z");
    assert.equal(c.fin.toISOString(), "2027-01-20T03:00:00.000Z");
  });

  it("un anclaje al 31 se recorta al 28 para que exista en todo mes", () => {
    const c = cicloDeCliente(31, new Date("2026-07-20T15:00:00Z"));
    assert.equal(c.inicio.toISOString(), "2026-06-28T03:00:00.000Z");
    assert.equal(c.fin.toISOString(), "2026-07-28T03:00:00.000Z");
  });

  it("el día de anclaje justo: hoy == anclaje ya cuenta como ciclo nuevo", () => {
    // 15/jul 03:30 UTC = 00:30 AR del 15 → ya es el día 15 en AR.
    const c = cicloDeCliente(15, new Date("2026-07-15T03:30:00Z"));
    assert.equal(c.inicio.toISOString(), "2026-07-15T03:00:00.000Z");
  });
});

describe("diaDelMesAR", () => {
  it("da el día de calendario argentino", () => {
    assert.equal(diaDelMesAR(new Date("2026-07-15T15:00:00Z")), 15);
  });

  it("las últimas 3 horas UTC del día todavía son el día anterior en AR", () => {
    // 16/jul 01:30 UTC = 15/jul 22:30 AR → día 15.
    assert.equal(diaDelMesAR(new Date("2026-07-16T01:30:00Z")), 15);
  });
});
