/**
 * Pruebas del ciclo de facturación (mes calendario argentino).
 *
 * El riesgo es el mismo de siempre: correrse de mes por zona horaria. El
 * servidor corre en UTC y Argentina es UTC-3, así que las últimas 3 horas de
 * cada mes (en UTC) todavía son el mes anterior en Argentina.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cicloAnterior, cicloDe, etiquetaCiclo } from "@/lib/ciclo";

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
