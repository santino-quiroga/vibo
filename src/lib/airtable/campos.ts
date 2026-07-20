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
  /**
   * Los horarios disponibles. El doc de requerimientos (8.0 y 8.1) la llama
   * "Slots", pero en las bases reales la tabla se llama "Configuracion" — se
   * verificó contra la Meta API de la base del primer cliente. El nombre de acá
   * es el que manda, porque es el que la API matchea literal.
   *
   * Si algún cliente la tuviera con otro nombre, esto pasa a ser un campo del
   * Agente en vez de una constante. Hoy no hace falta.
   */
  slots: "Configuracion",
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

/**
 * Cómo se lee lo que viene de Airtable.
 *
 * No es el inverso exacto de ESTADO_AIRTABLE porque las bases reales no usan
 * las mismas etiquetas que el relevamiento del punto 8.1. La base del primer
 * cliente tiene el single select en "Pendiente / Confirmada / Señada /
 * Cancelada" — verificado contra la Meta API el 2026-07-18.
 *
 * La traducción la decidió el cliente:
 *   - "Pendiente" -> PENDIENTE_SENIA: el turno está tomado pero no pagado, así
 *     que cuenta como turno reservado y NO como ingreso.
 *   - "Señada" -> CONFIRMADA: ya pagó la seña, así que cuenta también como
 *     ingreso estimado.
 *
 * Se dejan además las etiquetas del doc, para una base que sí las use. Un
 * estado que no esté acá se lee como null, y entonces el turno no suma a
 * ningún KPI — por eso esta tabla tiene que cubrir TODAS las opciones del
 * select, no sólo las esperadas.
 */
const DESDE_AIRTABLE = new Map<string, EstadoReserva>([
  ["Confirmada", "CONFIRMADA"],
  ["Cancelada", "CANCELADA"],
  ["Señada", "CONFIRMADA"],
  ["Pendiente", "PENDIENTE_SENIA"],
  ["Pendiente de seña", "PENDIENTE_SENIA"],
]);

export function parsearEstado(valor: unknown): EstadoReserva | null {
  if (typeof valor !== "string") return null;
  return DESDE_AIRTABLE.get(valor.trim()) ?? null;
}

/**
 * Las etiquetas candidatas para **escribir** un estado, en orden de preferencia.
 *
 * Leer es fácil: `DESDE_AIRTABLE` acepta los dos vocabularios que existen hoy.
 * Escribir no, porque hay que elegir un string y con `typecast: false` una
 * opción que no exista en el select hace fallar el request (a propósito: es lo
 * que evita que se inventen opciones nuevas).
 *
 * Y los dos vocabularios están vivos al mismo tiempo:
 *   - el del doc (§8.1):        Confirmada / Cancelada / "Pendiente de seña"
 *   - el de la base real:       Confirmada / Cancelada / "Pendiente" / "Señada"
 *
 * "Confirmada" y "Cancelada" coinciden en los dos, así que esos no tienen
 * problema. El pendiente NO coincide, y ahí es donde una escritura fallaría
 * contra una base u otra según qué literal se hubiera hardcodeado.
 *
 * Por eso es una lista y no un string: la capa de escritura prueba la primera
 * y, sólo si Airtable la rechaza por opción inválida, prueba la siguiente. No
 * es adivinar — son las dos únicas etiquetas relevadas, y si ninguna existe el
 * error se propaga en vez de taparse.
 */
export const ETIQUETAS_ESCRITURA: Record<EstadoReserva, readonly string[]> = {
  CONFIRMADA: ["Confirmada"],
  CANCELADA: ["Cancelada"],
  PENDIENTE_SENIA: ["Pendiente de seña", "Pendiente"],
} as const;

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
