/**
 * Aviso al dueño (SDD v2 §12): contenido mínimo y accionable.
 *
 * Sede + contacto + link al chat. No debe filtrar el texto de la conversación
 * al canal de WhatsApp del dueño: eso se ve al abrir el link, ya protegido por
 * su sesión.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { construirAviso } from "@/lib/integracion/aviso";

describe("construirAviso", () => {
  it("incluye sede, nombre y teléfono del contacto y el link al chat", () => {
    const texto = construirAviso({
      sede: "Club Padel AI",
      contactoNombre: "Martina Gómez",
      contactoTelefono: "5491144440001",
      conversacionId: "cabc123",
      baseUrl: "https://vibo.ar",
    });

    assert.match(texto, /Club Padel AI/);
    assert.match(texto, /Martina Gómez \(5491144440001\)/);
    assert.match(texto, /https:\/\/vibo\.ar\/dashboard\/conversaciones\/cabc123/);
  });

  it("cuando no hay nombre, muestra sólo el teléfono", () => {
    const texto = construirAviso({
      sede: "Club Padel AI",
      contactoNombre: null,
      contactoTelefono: "5491144440001",
      conversacionId: "cabc123",
      baseUrl: "https://vibo.ar",
    });

    assert.match(texto, /Contacto: 5491144440001/);
    assert.doesNotMatch(texto, /\(/);
  });
});
