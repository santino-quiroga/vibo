/**
 * Pruebas de la normalización del teléfono para Evolution: JID de WhatsApp,
 * separadores y prefijo internacional.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizarNumero } from "@/lib/evolution/numero";

describe("normalizarNumero", () => {
  it("saca el sufijo del JID de WhatsApp", () => {
    assert.equal(normalizarNumero("5493511234567@s.whatsapp.net"), "5493511234567");
    assert.equal(normalizarNumero("5493511234567@c.us"), "5493511234567");
  });

  it("saca +, espacios, guiones y paréntesis", () => {
    assert.equal(normalizarNumero("+54 9 351 123-4567"), "5493511234567");
    assert.equal(normalizarNumero("(351) 123 4567"), "3511234567");
  });

  it("un número ya limpio no cambia", () => {
    assert.equal(normalizarNumero("5493511234567"), "5493511234567");
  });

  it("un valor sin dígitos queda vacío (lo rechaza quien llama)", () => {
    assert.equal(normalizarNumero("sin-numero"), "");
  });
});
