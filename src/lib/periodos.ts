/**
 * Los cortes de tiempo del dashboard (requerimientos, punto 6).
 *
 * Todo acá se calcula en hora de Argentina, no del servidor: Vercel corre en
 * UTC, así que entre las 21:00 y la medianoche argentinas el servidor ya está en
 * el día siguiente. Sin esto, un turno de las 22:00 aparecería como "mañana" y
 * el KPI de hoy quedaría vacío justo en el horario pico de una cancha de pádel.
 */

import { ZONA_HORARIA, type FechaCalendario } from "@/lib/airtable/tipos";
import type { Periodo } from "@/lib/kpis";

/** La fecha de calendario de hoy, en Argentina. */
export function hoyEnArgentina(ahora: Date = new Date()): FechaCalendario {
  // en-CA da el formato ISO (YYYY-MM-DD) directo, que es justo el que usamos.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

export type ClaveRango = "hoy" | "semana" | "mes";

export const RANGOS: Array<{ clave: ClaveRango; etiqueta: string }> = [
  { clave: "hoy", etiqueta: "Hoy" },
  { clave: "semana", etiqueta: "Últimos 7 días" },
  { clave: "mes", etiqueta: "Este mes" },
];

export function esClaveRango(valor: unknown): valor is ClaveRango {
  return valor === "hoy" || valor === "semana" || valor === "mes";
}

function sumarDias(fecha: FechaCalendario, dias: number): FechaCalendario {
  // Se opera en UTC porque la fecha ya es "de calendario", sin zona: en UTC no
  // hay saltos de horario de verano, así que un día siempre son 24 horas.
  const base = Date.parse(`${fecha}T00:00:00Z`);
  return new Date(base + dias * 86_400_000).toISOString().slice(0, 10);
}

function primerDiaDelMes(fecha: FechaCalendario): FechaCalendario {
  return `${fecha.slice(0, 7)}-01`;
}

/**
 * El período actual y el anterior, para poder mostrar la variación que pide el
 * punto 6 ("variación vs. período anterior").
 *
 * El anterior siempre tiene el mismo largo que el actual, así que la comparación
 * es contra algo del mismo tamaño: comparar 5 días de este mes contra los 31 del
 * anterior daría una caída falsa todos los meses.
 */
export function resolverPeriodo(
  clave: ClaveRango,
  hoy: FechaCalendario = hoyEnArgentina(),
): { actual: Periodo; anterior: Periodo; etiqueta: string } {
  switch (clave) {
    case "hoy":
      return {
        actual: { desde: hoy, hasta: hoy },
        anterior: { desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1) },
        etiqueta: "Hoy",
      };

    case "semana": {
      const desde = sumarDias(hoy, -6); // 7 días contando hoy
      return {
        actual: { desde, hasta: hoy },
        anterior: { desde: sumarDias(desde, -7), hasta: sumarDias(desde, -1) },
        etiqueta: "Últimos 7 días",
      };
    }

    case "mes": {
      const desde = primerDiaDelMes(hoy);
      const finAnterior = sumarDias(desde, -1);
      // El mes anterior se recorta al mismo largo que va del mes actual: si hoy
      // es 5, se compara contra los primeros 5 días del mes pasado.
      const diasTranscurridos = Number(hoy.slice(8, 10));
      const inicioAnterior = primerDiaDelMes(finAnterior);
      return {
        actual: { desde, hasta: hoy },
        anterior: {
          desde: inicioAnterior,
          hasta: minimo(sumarDias(inicioAnterior, diasTranscurridos - 1), finAnterior),
        },
        etiqueta: "Este mes",
      };
    }
  }
}

function minimo(a: FechaCalendario, b: FechaCalendario): FechaCalendario {
  // Las fechas de calendario se comparan como strings: el formato es fijo, así
  // que el orden alfabético es el cronológico.
  return a <= b ? a : b;
}

/**
 * El rango que hay que pedirle a Airtable para cubrir actual + anterior de una.
 *
 * Es una sola consulta en vez de dos: la API de Airtable limita a ~5 req/seg por
 * base (SDD 4.1) y con "Todas las sedes" esto se multiplica por agente.
 */
export function rangoCompleto(actual: Periodo, anterior: Periodo): Periodo {
  return {
    desde: minimo(actual.desde, anterior.desde),
    hasta: actual.hasta >= anterior.hasta ? actual.hasta : anterior.hasta,
  };
}

/** Si una fecha cae dentro del período (ambos extremos incluidos). */
export function dentroDe(fecha: FechaCalendario, periodo: Periodo): boolean {
  return fecha >= periodo.desde && fecha <= periodo.hasta;
}
