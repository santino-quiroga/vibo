/**
 * Los tipos del dominio y los parsers que traducen lo que devuelve Airtable.
 *
 * Punto delicado: **Airtable no tiene un tipo "hora" nativo.** El punto 8.1
 * releva "Hora inicio | Hora", pero según cómo esté configurado el campo la API
 * puede devolver tres cosas distintas:
 *
 *   - "20:00" / "8:30"  → si es un campo de texto
 *   - 72000             → si es un campo Duration (segundos desde medianoche)
 *   - "2026-07-17T23:00:00.000Z" → si es un campo Date con hora (en UTC)
 *
 * Los tres se parsean, pero el tercero es ambiguo por zona horaria y por eso se
 * marca aparte: no se puede saber con certeza qué hora local quiso decir sin
 * conocer la config del campo. Ver `scripts/airtable-sonda.ts`, que imprime la
 * forma real de la base antes de que confiemos en cualquiera de estas ramas.
 *
 * Nada acá inventa datos: si un valor no se entiende, devuelve null y el que
 * llama decide. El SDD (4.4) es explícito en que nunca se falla en silencio.
 */

import type { EstadoReserva } from "./campos";

/** Argentina no tiene horario de verano, pero se nombra igual y no se hardcodea -3. */
export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

/**
 * Una fecha "de calendario", sin hora ni zona: "2026-07-17".
 *
 * Es un string y no un Date a propósito. `new Date("2026-07-17")` se parsea
 * como medianoche UTC, que en Argentina (UTC-3) es el 16 a las 21:00 — el turno
 * se correría de día solo. Mientras sean strings, comparar y agrupar por día es
 * exacto y ordenar alfabéticamente es ordenar cronológicamente.
 */
export type FechaCalendario = string;

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})/;
const RE_HORA = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** Minutos desde medianoche. 20:30 → 1230. */
export type MinutosDelDia = number;

export type Reserva = {
  /** El record id de Airtable ("rec..."), no el autonumber. Es la clave para escribir. */
  recordId: string;
  idReserva: number | null;
  nombre: string | null;
  telefono: string | null;
  fecha: FechaCalendario;
  horaInicioMin: MinutosDelDia | null;
  cancha: string | null;
  estado: EstadoReserva | null;
  montoSenia: number | null;
  notas: string | null;
  creadaPorBot: boolean;
  ultimaActualizacion: string | null;
};

export type Slot = {
  recordId: string;
  nombre: string | null;
  horaInicioMin: MinutosDelDia | null;
  duracionMin: number | null;
  /** Índices 0-6 (0 = Domingo), ya normalizados desde el multi-select. */
  diasActivos: number[];
  activo: boolean;
  /** Multi-select: un slot puede aplicar a varias canchas. */
  canchas: string[];
};

/**
 * Lo que se descartó al leer, para poder decirlo en pantalla.
 *
 * Sin esto, una reserva con la fecha corrupta simplemente no aparecería en los
 * KPIs y nadie se enteraría — que es exactamente el "fallar en silencio" que el
 * SDD prohíbe sobre el dato más importante del negocio del cliente.
 */
export type Descarte = {
  recordId: string;
  motivo: string;
};

export type Lectura<T> = {
  filas: T[];
  descartes: Descarte[];
};

export function parsearFecha(valor: unknown): FechaCalendario | null {
  if (typeof valor !== "string") return null;
  const match = RE_FECHA.exec(valor.trim());
  if (!match) return null;

  const [, anio, mes, dia] = match;
  // Se valida que exista de verdad: "2026-02-31" matchea el regex igual.
  const fecha = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));
  if (
    fecha.getUTCFullYear() !== Number(anio) ||
    fecha.getUTCMonth() !== Number(mes) - 1 ||
    fecha.getUTCDate() !== Number(dia)
  ) {
    return null;
  }
  return `${anio}-${mes}-${dia}`;
}

/**
 * Día de la semana de una fecha de calendario, 0 = Domingo.
 *
 * Usa UTC deliberadamente: la fecha ya es "de calendario" (sin zona), así que
 * construirla en UTC y leerla en UTC no la corre de día. Hacerlo con la hora
 * local del servidor sí lo haría — y Vercel corre en UTC, no en Argentina.
 */
export function diaDeLaSemana(fecha: FechaCalendario): number | null {
  const match = RE_FECHA.exec(fecha);
  if (!match) return null;
  const [, anio, mes, dia] = match;
  return new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia))).getUTCDay();
}

export type HoraParseada = {
  minutos: MinutosDelDia;
  /** true si salió de un ISO con hora, donde la zona horaria es una conjetura. */
  ambigua: boolean;
};

export function parsearHora(valor: unknown): HoraParseada | null {
  // Campo Duration: segundos desde medianoche.
  if (typeof valor === "number" && Number.isFinite(valor)) {
    if (valor < 0 || valor >= 86400) return null;
    return { minutos: Math.floor(valor / 60), ambigua: false };
  }

  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (texto === "") return null;

  // Campo de texto: "20:00", "8:30", "20:00:00".
  const hhmm = RE_HORA.exec(texto);
  if (hhmm) {
    const horas = Number(hhmm[1]);
    const minutos = Number(hhmm[2]);
    if (horas > 23 || minutos > 59) return null;
    return { minutos: horas * 60 + minutos, ambigua: false };
  }

  // Campo Date con hora: viene en UTC y hay que bajarlo a hora de Argentina.
  // Se marca ambigua porque depende de cómo esté configurado el campo en la
  // base; no se asume que esta rama sea correcta sin verla contra la base real.
  if (texto.includes("T")) {
    const fecha = new Date(texto);
    if (Number.isNaN(fecha.getTime())) return null;
    const partes = new Intl.DateTimeFormat("es-AR", {
      timeZone: ZONA_HORARIA,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(fecha);
    const hora = partes.find((p) => p.type === "hour")?.value;
    const minuto = partes.find((p) => p.type === "minute")?.value;
    if (hora === undefined || minuto === undefined) return null;
    return { minutos: Number(hora) * 60 + Number(minuto), ambigua: true };
  }

  return null;
}

/** 1230 → "20:30". */
export function formatearHora(minutos: MinutosDelDia): string {
  const hh = Math.floor(minutos / 60);
  const mm = minutos % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** "2026-07-17" → "jue 17 jul". Para las tablas, donde el año casi siempre sobra. */
export function formatearFechaCorta(fecha: FechaCalendario): string {
  const match = RE_FECHA.exec(fecha);
  if (!match) return fecha;
  const [, anio, mes, dia] = match;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC", // la fecha ya es de calendario; UTC evita que se corra un día
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia))));
}

function texto(valor: unknown): string | null {
  if (typeof valor === "string" && valor.trim() !== "") return valor.trim();
  if (typeof valor === "number") return String(valor);
  return null;
}

function numero(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  return null;
}

function booleano(valor: unknown): boolean {
  return valor === true;
}

/**
 * Airtable omite los campos vacíos en vez de mandarlos en null, así que un
 * multi-select sin valores directamente no viene. Se normaliza a array.
 */
function lista(valor: unknown): string[] {
  if (Array.isArray(valor)) {
    return valor.filter((v): v is string => typeof v === "string");
  }
  if (typeof valor === "string" && valor.trim() !== "") return [valor.trim()];
  return [];
}

export const util = { texto, numero, booleano, lista };
