/**
 * Pruebas de la firma del webhook de Mercado Pago.
 *
 * Esto es lo único que separa "Mercado Pago avisó que pagaron" de "cualquiera
 * posteó a una URL pública y se puso al día solo" (SDD v2 §9). Por eso se prueba
 * sobre todo lo que tiene que RECHAZAR, no el camino feliz.
 */

import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validarFirmaMercadoPago } from "@/lib/pagos/firma";

const SECRETO = "secreto-de-prueba";
const DATA_ID = "1234567890";
const REQUEST_ID = "e7b4c2a1-0000-4000-8000-abcdefabcdef";

/** Arma una firma válida como la haría Mercado Pago. */
function firmar(opciones?: {
  ts?: number;
  dataId?: string;
  requestId?: string;
  secreto?: string;
}) {
  const ts = opciones?.ts ?? Date.now();
  const dataId = opciones?.dataId ?? DATA_ID;
  const requestId = opciones?.requestId ?? REQUEST_ID;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", opciones?.secreto ?? SECRETO)
    .update(manifest)
    .digest("hex");
  return { xSignature: `ts=${ts},v1=${v1}`, ts };
}

describe("validarFirmaMercadoPago", () => {
  it("acepta una firma legítima", () => {
    const { xSignature } = firmar();
    const r = validarFirmaMercadoPago({
      xSignature,
      xRequestId: REQUEST_ID,
      dataId: DATA_ID,
      secreto: SECRETO,
    });
    assert.equal(r.valido, true);
  });

  it("rechaza si no viene el header", () => {
    const r = validarFirmaMercadoPago({
      xSignature: null,
      xRequestId: REQUEST_ID,
      dataId: DATA_ID,
      secreto: SECRETO,
    });
    assert.equal(r.valido, false);
  });

  it("rechaza una firma hecha con otro secreto", () => {
    // El caso realista de ataque: alguien conoce el formato pero no la clave.
    const { xSignature } = firmar({ secreto: "otro-secreto" });
    const r = validarFirmaMercadoPago({
      xSignature,
      xRequestId: REQUEST_ID,
      dataId: DATA_ID,
      secreto: SECRETO,
    });
    assert.equal(r.valido, false);
  });

  it("rechaza si cambian el id del pago dejando la firma vieja", () => {
    // Sin esto, se podría tomar una notificación válida y apuntarla a otro pago.
    const { xSignature } = firmar({ dataId: "1111" });
    const r = validarFirmaMercadoPago({
      xSignature,
      xRequestId: REQUEST_ID,
      dataId: "9999",
      secreto: SECRETO,
    });
    assert.equal(r.valido, false);
  });

  it("rechaza si cambian el request-id", () => {
    const { xSignature } = firmar({ requestId: "aaaa" });
    const r = validarFirmaMercadoPago({
      xSignature,
      xRequestId: "bbbb",
      dataId: DATA_ID,
      secreto: SECRETO,
    });
    assert.equal(r.valido, false);
  });

  it("rechaza una firma vieja (replay)", () => {
    // Válida en su momento, reenviada un día después.
    const hace25Horas = Date.now() - 25 * 60 * 60 * 1000;
    const { xSignature } = firmar({ ts: hace25Horas });
    const r = validarFirmaMercadoPago({
      xSignature,
      xRequestId: REQUEST_ID,
      dataId: DATA_ID,
      secreto: SECRETO,
    });
    assert.equal(r.valido, false);
    assert.match(r.valido === false ? r.motivo : "", /vencida/);
  });

  it("rechaza un header mal formado", () => {
    for (const malo of ["", "ts=123", "v1=abc", "cualquier cosa", "ts=,v1="]) {
      const r = validarFirmaMercadoPago({
        xSignature: malo,
        xRequestId: REQUEST_ID,
        dataId: DATA_ID,
        secreto: SECRETO,
      });
      assert.equal(r.valido, false, `debería rechazar "${malo}"`);
    }
  });

  it("acepta el timestamp en segundos además de milisegundos", () => {
    // Defensa por si Mercado Pago cambia la unidad: hoy manda ms.
    const enSegundos = Math.floor(Date.now() / 1000);
    const manifest = `id:${DATA_ID};request-id:${REQUEST_ID};ts:${enSegundos};`;
    const v1 = createHmac("sha256", SECRETO).update(manifest).digest("hex");
    const r = validarFirmaMercadoPago({
      xSignature: `ts=${enSegundos},v1=${v1}`,
      xRequestId: REQUEST_ID,
      dataId: DATA_ID,
      secreto: SECRETO,
    });
    assert.equal(r.valido, true);
  });
});
