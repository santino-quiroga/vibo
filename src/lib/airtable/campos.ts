/**
 * Mapeo de campos de Airtable — la única fuente de verdad de los nombres.
 *
 * El SDD (sección 4.1) pide que esto viva en un solo lugar: todas las bases de
 * los clientes comparten el mismo esquema (requerimientos, punto 8.1), así que
 * los nombres se escriben una vez acá y no por cliente. Si un cliente renombra
 * un campo en su base, se arregla acá y no en cada consulta.
 *
 * Los nombres van tal cual están en Airtable, con acentos y mayúsculas
 * incluidos: la API los matchea literal. "Ultima_Actualizacion" sin acento y
 * con guión bajo no es un typo, es como está relevado en el punto 8.1.
 */

export const TABLA = {
  reservas: "Reservas",
  slots: "Slots",
} as const;

export const CAMPO_RESERVA = {
  idReserva: "ID Reserva",
  nombre: "Nombre",
  telefono: "Teléfono",
  fecha: "Fecha",
  horaInicio: "Hora inicio",
  cancha: "Cancha",
  estado: "Estado",
  montoSenia: "Monto seña",
  notas: "Notas",
  creadaPorBot: "Creada por bot",
  ultimaActualizacion: "Ultima_Actualizacion",
} as const;

export const CAMPO_SLOT = {
  nombre: "Nombre Slot",
  horaInicio: "Hora inicio",
  duracion: "Duracion",
  diasActivos: "Dias Activos",
  activo: "Activo",
  cancha: "Cancha",
} as const;

/**
 * Los tres estados del single select de Airtable (punto 8.1: enum cerrado).
 *
 * El valor de la izquierda es el que usa el código; el de la derecha es el
 * string exacto de Airtable. Se separan porque "Pendiente de seña" con ñ es
 * incómodo de arrastrar por todo el código, y porque si algún día cambia la
 * etiqueta en Airtable, cambia una línea acá.
 */
export const ESTADO_AIRTABLE = {
  CONFIRMADA: "Confirmada",
  CANCELADA: "Cancelada",
  PENDIENTE_SENIA: "Pendiente de seña",
} as const;

export type EstadoReserva = keyof typeof ESTADO_AIRTABLE;

/** Invertido, para leer lo que viene de Airtable. */
const DESDE_AIRTABLE = new Map<string, EstadoReserva>(
  Object.entries(ESTADO_AIRTABLE).map(([clave, etiqueta]) => [
    etiqueta,
    clave as EstadoReserva,
  ]),
);

export function parsearEstado(valor: unknown): EstadoReserva | null {
  if (typeof valor !== "string") return null;
  return DESDE_AIRTABLE.get(valor.trim()) ?? null;
}

/**
 * Los días del multi-select "Dias Activos", indexados como getUTCDay():
 * 0 = Domingo. El orden importa, no reordenar.
 */
export const DIAS_SEMANA = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

export type DiaSemana = (typeof DIAS_SEMANA)[number];

/**
 * Normaliza un día para comparar contra "Dias Activos".
 *
 * Airtable no garantiza el acento: el relevamiento del punto 8.1 escribe
 * "Miercoles"/"Sabado" sin tilde en algunos lados. Comparar sin acentos y en
 * minúscula evita que un slot de miércoles quede invisible por una tilde.
 *
 * El rango ̀-ͯ son los diacríticos combinantes que suelta NFD.
 */
export function normalizarDia(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const DIA_POR_NOMBRE = new Map<string, number>(
  DIAS_SEMANA.map((dia, indice) => [normalizarDia(dia), indice]),
);

export function indiceDeDia(valor: string): number | null {
  return DIA_POR_NOMBRE.get(normalizarDia(valor)) ?? null;
}

/**
 * El nombre de cancha con el que Airtable la identifica.
 *
 * En Vibo la cancha es un número (Cancha.numero) y en Airtable es el texto de
 * un single select. Este es el único punto donde se cruzan las dos fuentes, así
 * que la convención vive acá y no repartida por los cálculos.
 */
export function nombreCancha(numero: number): string {
  return `Cancha ${numero}`;
}

/** El inverso: "Cancha 3" → 3. Devuelve null si no sigue la convención. */
export function numeroDeCancha(nombre: string): number | null {
  const match = /^\s*cancha\s+(\d+)\s*$/i.exec(nombre);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}
