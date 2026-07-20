/**
 * Pruebas de los parsers de Airtable.
 *
 * Acá el riesgo no es que explote: es que devuelva un número creíble y
 * equivocado. Un turno de las 20:00 leído como 17:00 no rompe nada, sólo pinta
 * mal el heatmap para siempre.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { indiceDeDia, numeroDeCancha, parsearEstado } from "@/lib/airtable/campos";
import {
  diaDeLaSemana,
  formatearHora,
  parsearFecha,
  parsearHora,
} from "@/lib/airtable/tipos";

describe("parsearHora", () => {
  it("lee un campo de texto", () => {
    assert.deepEqual(parsearHora("20:00"), { minutos: 1200, ambigua: false });
    assert.deepEqual(parsearHora("8:30"), { minutos: 510, ambigua: false });
    assert.deepEqual(parsearHora("20:00:00"), { minutos: 1200, ambigua: false });
  });

  it("lee un campo Duration (segundos desde medianoche)", () => {
    assert.deepEqual(parsearHora(72000), { minutos: 1200, ambigua: false });
    assert.deepEqual(parsearHora(0), { minutos: 0, ambigua: false });
  });

  it("lee un ISO bajándolo a hora de Argentina, y lo marca ambiguo", () => {
    // 23:00 UTC = 20:00 en Argentina (UTC-3).
    const r = parsearHora("2026-07-17T23:00:00.000Z");
    assert.equal(r?.minutos, 1200);
    assert.equal(r?.ambigua, true, "depende de cómo esté configurado el campo");
  });

  it("rechaza lo que no entiende en vez de adivinar", () => {
    assert.equal(parsearHora(""), null);
    assert.equal(parsearHora("a la tarde"), null);
    assert.equal(parsearHora(null), null);
    assert.equal(parsearHora(undefined), null);
    assert.equal(parsearHora("25:00"), null);
    assert.equal(parsearHora("20:99"), null);
    assert.equal(parsearHora(-1), null);
    assert.equal(parsearHora(86400), null, "un día entero no es una hora del día");
  });
});

describe("parsearFecha", () => {
  it("acepta una fecha de calendario", () => {
    assert.equal(parsearFecha("2026-07-17"), "2026-07-17");
  });

  it("se queda con la parte de fecha de un ISO", () => {
    assert.equal(parsearFecha("2026-07-17T10:00:00.000Z"), "2026-07-17");
  });

  it("rechaza una fecha que no existe", () => {
    // El regex sola dejaría pasar "2026-02-31".
    assert.equal(parsearFecha("2026-02-31"), null);
    assert.equal(parsearFecha("2026-13-01"), null);
  });

  it("rechaza basura", () => {
    assert.equal(parsearFecha("17/07/2026"), null);
    assert.equal(parsearFecha(""), null);
    assert.equal(parsearFecha(42), null);
  });
});

describe("diaDeLaSemana", () => {
  it("no se corre de día por zona horaria", () => {
    // Con new Date("2026-07-06").getDay() en un server en UTC-3 esto daría 0.
    assert.equal(diaDeLaSemana("2026-07-06"), 1, "lunes");
    assert.equal(diaDeLaSemana("2026-07-12"), 0, "domingo");
  });
});

describe("formatearHora", () => {
  it("rellena con ceros", () => {
    assert.equal(formatearHora(1200), "20:00");
    assert.equal(formatearHora(510), "08:30");
    assert.equal(formatearHora(0), "00:00");
  });
});

describe("parsearEstado", () => {
  it("mapea los tres estados del punto 8.1", () => {
    assert.equal(parsearEstado("Confirmada"), "CONFIRMADA");
    assert.equal(parsearEstado("Cancelada"), "CANCELADA");
    assert.equal(parsearEstado("Pendiente de seña"), "PENDIENTE_SENIA");
  });

  it("mapea los estados que usan las bases reales", () => {
    // La base del primer cliente usa estas cuatro etiquetas, no las del doc.
    // Un estado que caiga en null deja el turno fuera de TODOS los KPIs sin
    // avisar, así que las cuatro tienen que resolver.
    assert.equal(parsearEstado("Pendiente"), "PENDIENTE_SENIA");
    assert.equal(parsearEstado("Señada"), "CONFIRMADA", "ya pagó la seña: cuenta como ingreso");
  });

  it("no adivina un estado desconocido", () => {
    assert.equal(parsearEstado("confirmado"), null);
    assert.equal(parsearEstado("Pendiente de sena"), null, "sin la ñ no es el mismo valor");
    assert.equal(parsearEstado(undefined), null);
  });
});

describe("indiceDeDia", () => {
  it("tolera acentos y mayúsculas", () => {
    assert.equal(indiceDeDia("Miércoles"), 3);
    assert.equal(indiceDeDia("Miercoles"), 3);
    assert.equal(indiceDeDia("miércoles"), 3);
    assert.equal(indiceDeDia("SÁBADO"), 6);
    assert.equal(indiceDeDia("Sabado"), 6);
  });

  it("no inventa un día", () => {
    assert.equal(indiceDeDia("Feriado"), null);
  });
});

describe("numeroDeCancha", () => {
  it("lee la convención Cancha N", () => {
    assert.equal(numeroDeCancha("Cancha 1"), 1);
    assert.equal(numeroDeCancha("cancha 12"), 12);
    assert.equal(numeroDeCancha(" Cancha 3 "), 3);
  });

  it("devuelve null si no la sigue", () => {
    // Importante: esto es lo que hace que el turno caiga en "sinPrecio" en vez
    // de valuarse mal.
    assert.equal(numeroDeCancha("Cancha Techada"), null);
    assert.equal(numeroDeCancha("Principal"), null);
    assert.equal(numeroDeCancha(""), null);
  });
});
