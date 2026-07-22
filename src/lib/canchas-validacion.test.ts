/**
 * Pruebas de la validación de canchas: horarios de madrugada, franjas de precio
 * y resolución del precio por horario.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aMinutos, parsearCanchasDeForm, precioParaHora } from "@/lib/canchas-validacion";

/** Arma un FormData de una sola cancha, con overrides opcionales. */
function formDeUnaCancha(campos: Record<string, string>): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    numero: "1",
    precio: "20000",
    duracionTurnoMin: "90",
    horarioApertura: "08:00",
    horarioCierre: "23:00",
    descripcion: "",
    tramos: "[]",
    ...campos,
  };
  for (const [k, v] of Object.entries(base)) fd.append(k, v);
  return fd;
}

describe("parsearCanchasDeForm — horarios", () => {
  it("acepta un cierre de madrugada (cierre < apertura)", () => {
    const r = parsearCanchasDeForm(formDeUnaCancha({ horarioApertura: "18:00", horarioCierre: "01:00" }));
    assert.ok("canchas" in r, "debería aceptar el cierre pasada medianoche");
    assert.equal(r.canchas[0].horarioCierre, "01:00");
  });

  it("rechaza apertura igual a cierre", () => {
    const r = parsearCanchasDeForm(formDeUnaCancha({ horarioApertura: "08:00", horarioCierre: "08:00" }));
    assert.ok("error" in r);
    assert.match(r.error, /no puede ser igual/i);
  });
});

describe("parsearCanchasDeForm — franjas de precio", () => {
  it("guarda las franjas válidas", () => {
    const tramos = JSON.stringify([
      { desde: "08:00", hasta: "18:00", precio: "18000" },
      { desde: "18:00", hasta: "24:00", precio: "25000" },
    ]);
    const r = parsearCanchasDeForm(formDeUnaCancha({ tramos }));
    assert.ok("canchas" in r);
    assert.equal(r.canchas[0].tramos.length, 2);
    assert.equal(r.canchas[0].tramos[1].hasta, "24:00");
  });

  it("rechaza franjas que se solapan", () => {
    const tramos = JSON.stringify([
      { desde: "08:00", hasta: "19:00", precio: "18000" },
      { desde: "18:00", hasta: "24:00", precio: "25000" },
    ]);
    const r = parsearCanchasDeForm(formDeUnaCancha({ tramos }));
    assert.ok("error" in r);
    assert.match(r.error, /se pisan/i);
  });

  it("rechaza una franja con fin anterior o igual al inicio", () => {
    const tramos = JSON.stringify([{ desde: "20:00", hasta: "18:00", precio: "25000" }]);
    const r = parsearCanchasDeForm(formDeUnaCancha({ tramos }));
    assert.ok("error" in r);
    assert.match(r.error, /posterior al inicio/i);
  });

  it("franjas contiguas (una termina donde arranca la otra) no se consideran solape", () => {
    const tramos = JSON.stringify([
      { desde: "08:00", hasta: "18:00", precio: "18000" },
      { desde: "18:00", hasta: "22:00", precio: "25000" },
    ]);
    const r = parsearCanchasDeForm(formDeUnaCancha({ tramos }));
    assert.ok("canchas" in r);
  });
});

describe("parsearCanchasDeForm — descripción", () => {
  it("una descripción vacía o de espacios queda en null", () => {
    const r = parsearCanchasDeForm(formDeUnaCancha({ descripcion: "   " }));
    assert.ok("canchas" in r);
    assert.equal(r.canchas[0].descripcion, null);
  });

  it("recorta la descripción cargada", () => {
    const r = parsearCanchasDeForm(formDeUnaCancha({ descripcion: "  Techada  " }));
    assert.ok("canchas" in r);
    assert.equal(r.canchas[0].descripcion, "Techada");
  });
});

describe("precioParaHora", () => {
  const tramos = [
    { desde: "08:00", hasta: "18:00", precio: 18000 },
    { desde: "18:00", hasta: "24:00", precio: 25000 },
  ];

  it("usa el precio del tramo que contiene el inicio", () => {
    assert.equal(precioParaHora(20000, tramos, aMinutos("20:00")), 25000);
    assert.equal(precioParaHora(20000, tramos, aMinutos("10:00")), 18000);
  });

  it("el fin del tramo es exclusivo: 18:00 cae en el tramo de la tarde", () => {
    assert.equal(precioParaHora(20000, tramos, aMinutos("18:00")), 25000);
  });

  it("fuera de todo tramo, o sin hora, usa el precio base", () => {
    assert.equal(precioParaHora(20000, [{ desde: "18:00", hasta: "24:00", precio: 25000 }], aMinutos("09:00")), 20000);
    assert.equal(precioParaHora(20000, tramos, null), 20000);
  });
});
