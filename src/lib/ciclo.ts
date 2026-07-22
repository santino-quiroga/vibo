import { ZONA_HORARIA } from "@/lib/airtable/tipos";

/**
 * El ciclo de facturación de conversaciones (sprint 5).
 *
 * Es el mes calendario en hora de Argentina. Se elige el mes calendario, y no
 * un ciclo que arranque el día de alta de cada cliente, por dos razones: los
 * documentos no definen una fecha de facturación, y así los ciclos de todas las
 * sedes de un cliente arrancan el mismo día, que es lo que permite sumar el pozo
 * compartido sin coordinar nada.
 *
 * Argentina no tiene horario de verano, así que la medianoche local es siempre
 * las 03:00 UTC. Se calcula sin librerías de zona horaria, salvo para leer en
 * qué mes argentino estamos.
 */

export type Ciclo = {
  /** Instante UTC del 1° del mes a las 00:00 de Argentina. */
  inicio: Date;
  /** Instante UTC del 1° del mes siguiente a las 00:00 de Argentina (exclusivo). */
  fin: Date;
};

/** Las 00:00 de Argentina de un día concreto, como instante UTC. */
function inicioDeDiaUTC(anio: number, mes1a12: number, dia: number): Date {
  // 00:00 -03:00 == 03:00 UTC del mismo día.
  return new Date(Date.UTC(anio, mes1a12 - 1, dia, 3, 0, 0));
}

/** Las 00:00 de Argentina de un 1° de mes, como instante UTC. */
function inicioDeMesUTC(anio: number, mes1a12: number): Date {
  return inicioDeDiaUTC(anio, mes1a12, 1);
}

/** El año/mes/día de calendario en Argentina de un instante dado. */
function partesAR(ahora: Date): { anio: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  return {
    anio: Number(partes.find((p) => p.type === "year")!.value),
    mes: Number(partes.find((p) => p.type === "month")!.value),
    dia: Number(partes.find((p) => p.type === "day")!.value),
  };
}

/** El día del mes (en Argentina) de una fecha: lo que se usa como anclaje. */
export function diaDelMesAR(fecha: Date): number {
  return partesAR(fecha).dia;
}

/**
 * Día de anclaje efectivo del ciclo, recortado a 1–28.
 *
 * Se recorta a 28 para que el día exista en todos los meses: un cliente que
 * paga un 31 no puede anclar su ciclo al 31 de febrero. Recortar es preferible
 * a "correr al último día del mes", que haría que el largo del ciclo variara mes
 * a mes. `null`/0 → 1: el mes calendario, que es el comportamiento histórico.
 */
function anclajeValido(dia: number | null | undefined): number {
  if (!dia || dia < 1) return 1;
  return Math.min(dia, 28);
}

/**
 * El ciclo de conversaciones de un cliente, anclado a su día de cobro
 * (requerimiento de testing: la renovación es un mes post-pago, no el 1°).
 *
 * `diaAnclaje` es el día del mes en que renueva (se sella con el día del cobro).
 * Null/undefined → día 1, o sea el mes calendario: así los clientes sin
 * suscripción todavía mantienen el comportamiento de antes sin datos que migrar.
 *
 * El ciclo va del anclaje de un mes al del siguiente. Ej. anclaje 15: 15/jul
 * 00:00 AR → 15/ago 00:00 AR. Si hoy todavía no llegó al día de anclaje, el
 * ciclo vigente arrancó el mes pasado.
 */
export function cicloDeCliente(
  diaAnclaje: number | null | undefined,
  ahora: Date = new Date(),
): Ciclo {
  const dia = anclajeValido(diaAnclaje);
  const hoy = partesAR(ahora);

  // Si hoy (AR) ya alcanzó el día de anclaje, el ciclo arrancó este mes; si no,
  // el mes pasado.
  let anioInicio = hoy.anio;
  let mesInicio = hoy.mes;
  if (hoy.dia < dia) {
    mesInicio -= 1;
    if (mesInicio === 0) {
      mesInicio = 12;
      anioInicio -= 1;
    }
  }

  let mesFin = mesInicio + 1;
  let anioFin = anioInicio;
  if (mesFin === 13) {
    mesFin = 1;
    anioFin += 1;
  }

  return {
    inicio: inicioDeDiaUTC(anioInicio, mesInicio, dia),
    fin: inicioDeDiaUTC(anioFin, mesFin, dia),
  };
}

/** El ciclo (mes argentino) que contiene el instante dado. */
export function cicloDe(ahora: Date = new Date()): Ciclo {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(ahora);

  const anio = Number(partes.find((p) => p.type === "year")!.value);
  const mes = Number(partes.find((p) => p.type === "month")!.value);

  const inicio = inicioDeMesUTC(anio, mes);
  // Diciembre → enero del año siguiente.
  const fin = mes === 12 ? inicioDeMesUTC(anio + 1, 1) : inicioDeMesUTC(anio, mes + 1);

  return { inicio, fin };
}

/** El ciclo anterior al que contiene el instante dado. */
export function cicloAnterior(ahora: Date = new Date()): Ciclo {
  const actual = cicloDe(ahora);
  // Un instante seguro dentro del mes anterior: un día antes del inicio actual.
  const dentroDelAnterior = new Date(actual.inicio.getTime() - 24 * 60 * 60 * 1000);
  return cicloDe(dentroDelAnterior);
}

/** Etiqueta del ciclo para la UI, ej. "julio 2026". */
export function etiquetaCiclo(ciclo: Ciclo): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_HORARIA,
    month: "long",
    year: "numeric",
  }).format(ciclo.inicio);
}
