/**
 * Ventana de escucha (SDD v2 §11): la regla de "quién responde".
 *
 * El lote llega ya ordenado ascendente por (createdAt, id): el último es el
 * máximo. Sólo la ejecución de ese último mensaje responde, y responde por
 * todos juntos. Estas pruebas fijan que exactamente una responda y que el texto
 * se agrupe en orden.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolverDecisionVentana } from "@/lib/integracion/ventana";

const lote = [
  { id: "m1", contenido: "Hola" },
  { id: "m2", contenido: "¿Tenés turno para hoy a la noche?" },
  { id: "m3", contenido: "Para dos personas" },
];

describe("resolverDecisionVentana", () => {
  it("responde sólo la ejecución del último mensaje del lote", () => {
    const d = resolverDecisionVentana(lote, "m3");
    assert.equal(d.responder, true);
    assert.equal(d.motivo, null);
  });

  it("agrupa todos los mensajes del lote en orden, unidos por salto de línea", () => {
    const d = resolverDecisionVentana(lote, "m3");
    assert.equal(d.textoAgrupado, "Hola\n¿Tenés turno para hoy a la noche?\nPara dos personas");
  });

  it("un mensaje que no es el último se para (otra ejecución responde por todos)", () => {
    for (const id of ["m1", "m2"]) {
      const d = resolverDecisionVentana(lote, id);
      assert.equal(d.responder, false, `${id} no debería responder`);
      assert.equal(d.motivo, "mensaje_superado");
      assert.equal(d.textoAgrupado, "");
    }
  });

  it("exactamente una ejecución del lote responde", () => {
    const cuantasResponden = lote.filter(
      (m) => resolverDecisionVentana(lote, m.id).responder,
    ).length;
    assert.equal(cuantasResponden, 1);
  });

  it("un mensaje ya superado (no está en el lote) no responde", () => {
    // Su respuesta ya se mandó: el cursor lo dejó fuera del lote pendiente.
    const d = resolverDecisionVentana(lote, "viejo");
    assert.equal(d.responder, false);
    assert.equal(d.motivo, "mensaje_superado");
  });

  it("un lote de un solo mensaje se comporta igual que sin agrupación", () => {
    const d = resolverDecisionVentana([{ id: "u1", contenido: "Hola" }], "u1");
    assert.equal(d.responder, true);
    assert.equal(d.textoAgrupado, "Hola");
  });

  it("un lote vacío no responde (nada que contestar)", () => {
    const d = resolverDecisionVentana([], "m1");
    assert.equal(d.responder, false);
  });
});
