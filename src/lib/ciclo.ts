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

/** Las 00:00 de Argentina de un 1° de mes, como instante UTC. */
function inicioDeMesUTC(anio: number, mes1a12: number): Date {
  // 00:00 -03:00 == 03:00 UTC del mismo día.
  return new Date(Date.UTC(anio, mes1a12 - 1, 1, 3, 0, 0));
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
