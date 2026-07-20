import "server-only";

import { unstable_cache } from "next/cache";

import { limpiarErrorIntegracion, registrarErrorIntegracion } from "@/lib/admin/salud";
import { descifrar } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

import {
  CAMPO_RESERVA,
  CAMPO_SLOT,
  DIAS_SEMANA,
  ETIQUETAS_ESCRITURA,
  TABLA,
  indiceDeDia,
  nombreCancha,
  parsearEstado,
  type EstadoReserva,
} from "./campos";
import {
  ErrorAirtable,
  actualizarRegistro,
  crearRegistro,
  listarRegistros,
  type ConfigBase,
} from "./cliente";
import {
  formatearHora,
  parsearFecha,
  parsearHora,
  util,
  type FechaCalendario,
  type Lectura,
  type Reserva,
  type Slot,
} from "./tipos";

/**
 * Capa de acceso a Airtable: lectura de Reservas y Slots, y las escrituras que
 * el §8/§8.0 habilitan sobre ambas (cancelar/reprogramar un turno, alta y
 * edición de horarios).
 *
 * **Esta capa no autoriza.** Recibe un `agenteId` ya autorizado por el DAL y
 * confía en él. Es a propósito: `unstable_cache` no puede leer cookies, así que
 * el inquilino tiene que entrar como argumento explícito — y eso es justo lo que
 * hace que la clave de caché quede separada por agente y no se pueda mezclar
 * entre clientes. Quien llame desde una página tiene que pasar por
 * `src/lib/cliente/datos.ts`, nunca por acá directo.
 */

/**
 * Trae y descifra las credenciales del agente.
 *
 * Vive dentro del scope cacheado, no fuera: así la API key en claro nunca es un
 * argumento de `unstable_cache` — los argumentos se serializan en la clave del
 * caché, y una clave de caché se escribe a disco. Lo único que se cachea es el
 * resultado.
 */
async function credencialesDe(agenteId: string): Promise<ConfigBase> {
  const agente = await prisma.agente.findUnique({
    where: { id: agenteId },
    select: { airtableBaseId: true, airtableApiKeyEnc: true },
  });

  if (!agente) {
    throw new ErrorAirtable("no_encontrado", `No existe el agente ${agenteId}`);
  }

  try {
    return {
      baseId: agente.airtableBaseId,
      apiKey: descifrar(agente.airtableApiKeyEnc),
    };
  } catch {
    // La fila está, pero no se puede descifrar: ENCRYPTION_KEY cambiada o dato
    // corrupto. Es un problema de config, no de Airtable, pero desde la UI se
    // ve igual: no hay forma de leer los turnos.
    throw new ErrorAirtable(
      "auth",
      `No se pudo descifrar la credencial de Airtable del agente ${agenteId}`,
    );
  }
}

function mapearReserva(registro: {
  id: string;
  fields: Record<string, unknown>;
}): { fila: Reserva } | { motivo: string } {
  const f = registro.fields;

  const fecha = parsearFecha(f[CAMPO_RESERVA.fecha]);
  // Sin fecha no entra en ningún período: no se puede contar ni mostrar en una
  // agenda. Es el único campo cuya ausencia descarta la fila entera.
  if (!fecha) return { motivo: `"${CAMPO_RESERVA.fecha}" vacío o ilegible` };

  const hora = parsearHora(f[CAMPO_RESERVA.horaInicio]);

  return {
    fila: {
      recordId: registro.id,
      idReserva: util.numero(f[CAMPO_RESERVA.idReserva]),
      nombre: util.texto(f[CAMPO_RESERVA.nombre]),
      telefono: util.texto(f[CAMPO_RESERVA.telefono]),
      fecha,
      horaInicioMin: hora?.minutos ?? null,
      cancha: util.texto(f[CAMPO_RESERVA.cancha]),
      estado: parsearEstado(f[CAMPO_RESERVA.estado]),
      montoSenia: util.numero(f[CAMPO_RESERVA.montoSenia]),
      notas: util.texto(f[CAMPO_RESERVA.notas]),
      creadaPorBot: util.booleano(f[CAMPO_RESERVA.creadaPorBot]),
      ultimaActualizacion: util.texto(f[CAMPO_RESERVA.ultimaActualizacion]),
    },
  };
}

function mapearSlot(registro: {
  id: string;
  fields: Record<string, unknown>;
}): { fila: Slot } | { motivo: string } {
  const f = registro.fields;
  const hora = parsearHora(f[CAMPO_SLOT.horaInicio]);

  // Un slot sin hora no define ninguna franja, así que no sirve para el
  // denominador de la ocupación.
  if (!hora) return { motivo: `"${CAMPO_SLOT.horaInicio}" vacío o ilegible` };

  const dias = util
    .lista(f[CAMPO_SLOT.diasActivos])
    .map(indiceDeDia)
    .filter((d): d is number => d !== null);

  return {
    fila: {
      recordId: registro.id,
      nombre: util.texto(f[CAMPO_SLOT.nombre]),
      horaInicioMin: hora.minutos,
      duracionMin: util.numero(f[CAMPO_SLOT.duracion]),
      diasActivos: dias,
      activo: util.booleano(f[CAMPO_SLOT.activo]),
      canchas: util.lista(f[CAMPO_SLOT.cancha]),
    },
  };
}

function recolectar<T>(
  registros: Array<{ id: string; fields: Record<string, unknown> }>,
  mapear: (r: { id: string; fields: Record<string, unknown> }) => { fila: T } | { motivo: string },
): Lectura<T> {
  const filas: T[] = [];
  const descartes: Array<{ recordId: string; motivo: string }> = [];

  for (const registro of registros) {
    const resultado = mapear(registro);
    if ("fila" in resultado) filas.push(resultado.fila);
    else descartes.push({ recordId: registro.id, motivo: resultado.motivo });
  }

  return { filas, descartes };
}

/**
 * Filtro de rango de fechas, inclusivo en ambas puntas.
 *
 * Se usa IS_AFTER/IS_BEFORE con DATEADD y no `{Fecha} >= '...'` porque comparar
 * un campo de fecha contra un string en Airtable hace una conversión implícita
 * que no está documentada y falla distinto según cómo esté configurado el campo.
 * Negar los extremos ("no es anterior a X y no es posterior a Y") es lo que lo
 * hace inclusivo sin tener que sumar y restar días.
 */
function filtroPorRango(desde: FechaCalendario, hasta: FechaCalendario): string {
  const campo = `{${CAMPO_RESERVA.fecha}}`;
  return `AND(NOT(IS_BEFORE(${campo}, '${desde}')), NOT(IS_AFTER(${campo}, '${hasta}')))`;
}

/**
 * Corre una lectura sellando el resultado en la salud del agente (SDD v2 §5).
 *
 * El sello es lo que le permite al admin ver qué cliente tiene la integración
 * rota sin esperar el reclamo. Va acá y no en el cliente HTTP porque es acá
 * donde se sabe de qué agente se trata.
 *
 * El error se re-lanza igual: esto observa, no cambia el comportamiento — la UI
 * sigue mostrando su estado degradado como siempre.
 */
async function conSalud<T>(agenteId: string, leer: () => Promise<T>): Promise<T> {
  try {
    const resultado = await leer();
    limpiarErrorIntegracion(agenteId);
    return resultado;
  } catch (error) {
    const mensaje =
      error instanceof ErrorAirtable
        ? `${error.motivo}: ${error.message}`
        : String(error);
    registrarErrorIntegracion(agenteId, "airtable", mensaje);
    throw error;
  }
}

async function traerReservas(
  agenteId: string,
  desde: FechaCalendario,
  hasta: FechaCalendario,
): Promise<Lectura<Reserva>> {
  return conSalud(agenteId, async () => {
    const config = await credencialesDe(agenteId);
    const registros = await listarRegistros(config, TABLA.reservas, {
      filterByFormula: filtroPorRango(desde, hasta),
    });
    return recolectar(registros, mapearReserva);
  });
}

async function traerSlots(agenteId: string): Promise<Lectura<Slot>> {
  return conSalud(agenteId, async () => {
    const config = await credencialesDe(agenteId);
    const registros = await listarRegistros(config, TABLA.slots);
    return recolectar(registros, mapearSlot);
  });
}

/**
 * Segundos de caché.
 *
 * El SDD (4.1) pide ~1-2 minutos para los KPIs de Inicio, que agregan varios
 * agentes y quemarían rate limit en cada carga, y datos más al momento para la
 * vista Turnos, donde el dueño espera ver la reserva que acaba de entrar.
 */
export const TTL_KPIS = 90;
export const TTL_TURNOS = 15;

/**
 * Los slots cambian muy de vez en cuando (es la grilla horaria del complejo),
 * así que aguantan mucho más caché que las reservas.
 */
const TTL_SLOTS = 300;

export function leerReservasCacheado(
  agenteId: string,
  desde: FechaCalendario,
  hasta: FechaCalendario,
  ttl: number,
): Promise<Lectura<Reserva>> {
  // El caché se arma por agente y rango: son los argumentos, y unstable_cache
  // los incluye en la clave. Un agente no puede leer el caché de otro.
  return unstable_cache(
    () => traerReservas(agenteId, desde, hasta),
    ["airtable-reservas", agenteId, desde, hasta, String(ttl)],
    { revalidate: ttl, tags: [`airtable-reservas-${agenteId}`] },
  )();
}

export function leerSlotsCacheado(agenteId: string): Promise<Lectura<Slot>> {
  return unstable_cache(
    () => traerSlots(agenteId),
    ["airtable-slots", agenteId],
    { revalidate: TTL_SLOTS, tags: [`airtable-slots-${agenteId}`] },
  )();
}

/**
 * El tag de caché de los slots de un agente. Lo usa la Server Action que escribe
 * para invalidar con `updateTag` (read-your-own-writes) después de crear o tocar
 * un slot — `updateTag` solo corre en Server Actions, por eso no se invalida acá.
 */
export function tagSlots(agenteId: string): string {
  return `airtable-slots-${agenteId}`;
}

/**
 * El tag de caché de las reservas de un agente, para el mismo uso que `tagSlots`:
 * después de cancelar o reprogramar un turno, la lista tiene que mostrar el
 * cambio ya mismo y no esperar los 15s del TTL.
 *
 * Invalida TODOS los rangos del agente a la vez, no sólo el que se estaba
 * mirando: reprogramar puede mover un turno de un período a otro, así que dejar
 * vivo el caché de los demás rangos mostraría el turno en los dos lados.
 */
export function tagReservas(agenteId: string): string {
  return `airtable-reservas-${agenteId}`;
}

export type NuevoSlot = {
  nombre: string;
  horaInicioMin: number;
  duracionMin: number;
  /** Índices 0-6, 0 = Domingo. */
  diasActivos: number[];
  /** Números de cancha (1, 2, …); se traducen a "Cancha N". */
  canchas: number[];
};

/**
 * Crea un slot en Airtable (requerimientos §8.0).
 *
 * NOTA sobre formatos, a confirmar por base real antes de producción (usar
 * scripts/airtable-sonda.ts):
 *  - "Hora inicio" se escribe como texto "HH:MM". Si en la base es un campo
 *    Duration, hay que escribir segundos en su lugar.
 *  - "Dias Activos" y "Cancha" se escriben con los nombres exactos ("Lunes",
 *    "Cancha 1"). Con typecast desactivado (ver cliente), si una opción no
 *    coincide exacto, la creación falla en vez de inventar una opción nueva —
 *    es seguro, pero hay que asegurar que las opciones de la base coincidan.
 */
export async function crearSlot(agenteId: string, slot: NuevoSlot): Promise<void> {
  const config = await credencialesDe(agenteId);

  await crearRegistro(config, TABLA.slots, {
    [CAMPO_SLOT.nombre]: slot.nombre,
    [CAMPO_SLOT.horaInicio]: formatearHora(slot.horaInicioMin),
    [CAMPO_SLOT.duracion]: slot.duracionMin,
    [CAMPO_SLOT.diasActivos]: slot.diasActivos.map((d) => DIAS_SEMANA[d]),
    [CAMPO_SLOT.activo]: true,
    [CAMPO_SLOT.cancha]: slot.canchas.map((n) => nombreCancha(n)),
  });
}

/** Activa o desactiva un slot existente (el checkbox "Activo" de Airtable). */
export async function cambiarActivoSlot(
  agenteId: string,
  recordId: string,
  activo: boolean,
): Promise<void> {
  const config = await credencialesDe(agenteId);
  await actualizarRegistro(config, TABLA.slots, recordId, {
    [CAMPO_SLOT.activo]: activo,
  });
}

/**
 * Edita un slot existente (requerimientos §8.0: "crear, editar y desactivar").
 *
 * No toca `Activo`: eso lo maneja `cambiarActivoSlot`, que es una acción de un
 * click aparte. Editar un horario y desactivarlo son dos decisiones distintas y
 * mezclarlas haría que guardar el formulario reactive sin querer un slot que el
 * dueño había dado de baja.
 */
export async function editarSlot(
  agenteId: string,
  recordId: string,
  slot: NuevoSlot,
): Promise<void> {
  const config = await credencialesDe(agenteId);

  await actualizarRegistro(config, TABLA.slots, recordId, {
    [CAMPO_SLOT.nombre]: slot.nombre,
    [CAMPO_SLOT.horaInicio]: formatearHora(slot.horaInicioMin),
    [CAMPO_SLOT.duracion]: slot.duracionMin,
    [CAMPO_SLOT.diasActivos]: slot.diasActivos.map((d) => DIAS_SEMANA[d]),
    [CAMPO_SLOT.cancha]: slot.canchas.map((n) => nombreCancha(n)),
  });
}

export type NuevaReserva = {
  nombre: string;
  telefono: string | null;
  fecha: FechaCalendario;
  horaInicioMin: number;
  /** Número de cancha; se traduce a "Cancha N". */
  cancha: number;
  estado: EstadoReserva;
  montoSenia: number | null;
  notas: string | null;
};

/**
 * Escribe probando las etiquetas de estado candidatas, en orden.
 *
 * Sólo reintenta ante `datos_invalidos` (el 422 de "esa opción no existe en el
 * select"), y sólo mientras queden candidatas. Cualquier otro error —auth, red,
 * rate— corta al primer intento: insistir con otra etiqueta no lo arreglaría y
 * sólo gastaría rate limit.
 *
 * Ver `ETIQUETAS_ESCRITURA`: existen dos vocabularios de estado en las bases
 * reales y el pendiente no coincide entre ellos.
 */
async function escribirConEstado(
  escribir: (etiqueta: string) => Promise<unknown>,
  estado: EstadoReserva,
): Promise<void> {
  const candidatas = ETIQUETAS_ESCRITURA[estado];

  for (let i = 0; i < candidatas.length; i++) {
    try {
      await escribir(candidatas[i]);
      return;
    } catch (error) {
      const ultima = i === candidatas.length - 1;
      const esOpcionInvalida =
        error instanceof ErrorAirtable && error.motivo === "datos_invalidos";
      if (ultima || !esOpcionInvalida) throw error;
    }
  }
}

/**
 * Crea una reserva cargada a mano por el dueño.
 *
 * `Creada por bot` va en false, que es exactamente para lo que existe ese campo
 * (§8.1): distingue lo que agendó el agente de lo que se cargó al mostrador. No
 * es cosmético — la tasa de conversión de Inicio cuenta sólo los turnos del
 * bot, así que marcar esto mal inflaría el KPI con ventas que no salieron de
 * ninguna conversación.
 */
export async function crearReserva(
  agenteId: string,
  reserva: NuevaReserva,
): Promise<void> {
  const config = await credencialesDe(agenteId);

  await escribirConEstado(
    (etiquetaEstado) =>
      crearRegistro(config, TABLA.reservas, {
        [CAMPO_RESERVA.nombre]: reserva.nombre,
        ...(reserva.telefono ? { [CAMPO_RESERVA.telefono]: reserva.telefono } : {}),
        [CAMPO_RESERVA.fecha]: reserva.fecha,
        [CAMPO_RESERVA.horaInicio]: formatearHora(reserva.horaInicioMin),
        [CAMPO_RESERVA.cancha]: nombreCancha(reserva.cancha),
        [CAMPO_RESERVA.estado]: etiquetaEstado,
        ...(reserva.montoSenia !== null
          ? { [CAMPO_RESERVA.montoSenia]: reserva.montoSenia }
          : {}),
        ...(reserva.notas ? { [CAMPO_RESERVA.notas]: reserva.notas } : {}),
        [CAMPO_RESERVA.creadaPorBot]: false,
      }),
    reserva.estado,
  );
}

/**
 * Cancela un turno (requerimientos §8, SDD §4.1 "Escritura").
 *
 * Escribe `Estado → Cancelada` en la reserva; no borra el registro. Es a
 * propósito: la reserva cancelada sigue siendo información del negocio (el
 * contacto reservó y se dio de baja) y además los KPIs la excluyen por estado,
 * no por ausencia. Borrarla haría desaparecer el hecho.
 *
 * Con `typecast: false` (ver cliente), si la base de un cliente no tuviera la
 * opción "Cancelada" en su single select, esto falla con un error visible en vez
 * de inventar una opción nueva.
 */
export async function cancelarReserva(agenteId: string, recordId: string): Promise<void> {
  const config = await credencialesDe(agenteId);
  // "Cancelada" existe en los dos vocabularios relevados, pero se pasa por el
  // mismo camino que el alta para no tener dos formas distintas de escribir un
  // estado si mañana aparece una base con otra etiqueta.
  await escribirConEstado(
    (etiquetaEstado) =>
      actualizarRegistro(config, TABLA.reservas, recordId, {
        [CAMPO_RESERVA.estado]: etiquetaEstado,
      }),
    "CANCELADA",
  );
}

/**
 * Reprograma un turno: nueva fecha y/o nueva hora de inicio.
 *
 * No toca el estado. Reprogramar no confirma un turno que estaba pendiente de
 * seña ni revive uno cancelado — sólo lo mueve de horario, que es lo que pide el
 * §8. Cambiar el estado de paso sería una decisión de negocio que nadie tomó.
 *
 * La hora se escribe como texto "HH:MM", igual que en el alta de slots: en las
 * bases relevadas "Hora inicio" es un campo de texto, no un Duration ni un Date
 * con hora (ver la nota de formatos en `crearSlot`).
 */
export async function reprogramarReserva(
  agenteId: string,
  recordId: string,
  destino: { fecha: FechaCalendario; horaInicioMin: number },
): Promise<void> {
  const config = await credencialesDe(agenteId);
  await actualizarRegistro(config, TABLA.reservas, recordId, {
    [CAMPO_RESERVA.fecha]: destino.fecha,
    [CAMPO_RESERVA.horaInicio]: formatearHora(destino.horaInicioMin),
  });
}
