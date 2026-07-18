import { ZONA_HORARIA } from "@/lib/airtable/tipos";

/**
 * Formatea la hora de un mensaje para la bandeja y el hilo, en hora argentina.
 *
 * Hoy → solo la hora ("14:30"). Otro día → fecha corta. Es la convención de
 * cualquier chat: el día de hoy no hace falta repetirlo en cada fila.
 */
export function horaRelativa(fecha: Date, ahora: Date = new Date()): string {
  const mismoDia =
    claveDia(fecha) === claveDia(ahora);

  if (mismoDia) {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: ZONA_HORARIA,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(fecha);
  }

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_HORARIA,
    day: "2-digit",
    month: "2-digit",
  }).format(fecha);
}

/** La hora completa, para el detalle de cada mensaje del hilo. */
export function horaCompleta(fecha: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_HORARIA,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fecha);
}

/** Tiempo relativo compacto: "hace 3 min", "hace 2 h", "hace 4 d". */
export function haceCuanto(fecha: Date, ahora: Date = new Date()): string {
  const seg = Math.max(0, (ahora.getTime() - fecha.getTime()) / 1000);
  if (seg < 60) return "recién";
  const min = Math.floor(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const hs = Math.floor(min / 60);
  if (hs < 24) return `hace ${hs} h`;
  return `hace ${Math.floor(hs / 24)} d`;
}

/** "2026-07-17" en hora argentina, para comparar si dos fechas son el mismo día. */
function claveDia(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}
