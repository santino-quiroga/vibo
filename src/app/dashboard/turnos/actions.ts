"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import { ErrorAirtable } from "@/lib/airtable/cliente";
import { nombreCancha } from "@/lib/airtable/campos";
import {
  TTL_TURNOS,
  cambiarActivoSlot,
  cancelarReserva,
  crearReserva,
  crearSlot,
  editarSlot,
  leerReservasCacheado,
  reprogramarReserva,
  tagReservas,
  tagSlots,
} from "@/lib/airtable/lectura";
import { formatearHora } from "@/lib/airtable/tipos";
import { requerirClienteOwner } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

export type EstadoHorarios = { error?: string; ok?: boolean };

/** Verifica que la sede sea del cliente de la sesión (SDD §6.3). */
async function agenteDelCliente(agenteId: string): Promise<boolean> {
  const { clienteId } = await requerirClienteOwner();
  const agente = await prisma.agente.findFirst({
    where: { id: agenteId, clienteId },
    select: { id: true },
  });
  return agente !== null;
}

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const nuevoSlotSchema = z.object({
  agenteId: z.string().min(1),
  nombre: z.string().trim().min(1, "Poné un nombre al horario"),
  horaInicio: z.string().trim().regex(RE_HORA, "La hora va como HH:MM (ej. 20:00)"),
  duracionMin: z.coerce
    .number()
    .int()
    .min(15, "La duración mínima es 15 minutos")
    .max(300, "La duración máxima es 300 minutos"),
});

/**
 * Crea un horario disponible (slot) en Airtable (requerimientos §8.0).
 *
 * Los días activos y las canchas llegan como checkboxes múltiples. Se exige al
 * menos un día y una cancha: un slot sin días o sin cancha no define ninguna
 * franja vendible.
 */
export async function crearSlotAction(
  _previo: EstadoHorarios,
  formData: FormData,
): Promise<EstadoHorarios> {
  const parsed = nuevoSlotSchema.safeParse({
    agenteId: formData.get("agenteId"),
    nombre: formData.get("nombre"),
    horaInicio: formData.get("horaInicio"),
    duracionMin: formData.get("duracionMin"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (!(await agenteDelCliente(parsed.data.agenteId))) {
    return { error: "Sede inexistente" };
  }

  // getAll("dias") → índices 0-6; getAll("canchas") → números de cancha.
  const dias = formData.getAll("dias").map((d) => Number(d)).filter((d) => d >= 0 && d <= 6);
  const canchas = formData.getAll("canchas").map((c) => Number(c)).filter((c) => c >= 1);

  if (dias.length === 0) return { error: "Elegí al menos un día" };
  if (canchas.length === 0) return { error: "Elegí al menos una cancha" };

  const [horas, minutos] = parsed.data.horaInicio.split(":").map(Number);

  try {
    await crearSlot(parsed.data.agenteId, {
      nombre: parsed.data.nombre,
      horaInicioMin: horas * 60 + minutos,
      duracionMin: parsed.data.duracionMin,
      diasActivos: dias,
      canchas,
    });
  } catch (error) {
    if (error instanceof ErrorAirtable) return { error: error.mensajeUsuario };
    throw error;
  }

  // read-your-own-writes: que la lista muestre el slot recién creado ya mismo.
  updateTag(tagSlots(parsed.data.agenteId));
  revalidatePath("/dashboard/turnos/horarios");
  return { ok: true };
}

const editarSlotSchema = nuevoSlotSchema.extend({
  recordId: z.string().min(1),
});

/** Edita un horario existente (requerimientos §8.0). Mismo formulario que el alta. */
export async function editarSlotAction(
  _previo: EstadoHorarios,
  formData: FormData,
): Promise<EstadoHorarios> {
  const parsed = editarSlotSchema.safeParse({
    agenteId: formData.get("agenteId"),
    recordId: formData.get("recordId"),
    nombre: formData.get("nombre"),
    horaInicio: formData.get("horaInicio"),
    duracionMin: formData.get("duracionMin"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (!(await agenteDelCliente(parsed.data.agenteId))) {
    return { error: "Sede inexistente" };
  }

  const dias = formData.getAll("dias").map((d) => Number(d)).filter((d) => d >= 0 && d <= 6);
  const canchas = formData.getAll("canchas").map((c) => Number(c)).filter((c) => c >= 1);

  if (dias.length === 0) return { error: "Elegí al menos un día" };
  if (canchas.length === 0) return { error: "Elegí al menos una cancha" };

  const [horas, minutos] = parsed.data.horaInicio.split(":").map(Number);

  try {
    await editarSlot(parsed.data.agenteId, parsed.data.recordId, {
      nombre: parsed.data.nombre,
      horaInicioMin: horas * 60 + minutos,
      duracionMin: parsed.data.duracionMin,
      diasActivos: dias,
      canchas,
    });
  } catch (error) {
    if (error instanceof ErrorAirtable) return { error: error.mensajeUsuario };
    throw error;
  }

  updateTag(tagSlots(parsed.data.agenteId));
  revalidatePath("/dashboard/turnos/horarios");
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Turnos: cancelar y reprogramar (requerimientos §8, SDD §4.1 "Escritura").
 *
 * Las dos acciones escriben de vuelta en Airtable con el mismo patrón que ya
 * usan los horarios: validar, verificar que la sede sea del cliente de la
 * sesión (§6.3), escribir, e invalidar el caché de esa sede para que la lista
 * muestre el cambio en el acto.
 * ──────────────────────────────────────────────────────────────────────────── */

export type EstadoTurnoAccion = { error?: string; ok?: string };

/**
 * Busca un turno que ya ocupe esa cancha, fecha y hora.
 *
 * Lo usan el alta y la reprogramación: en las dos, dejar pasar un choque
 * significa vender la misma cancha dos veces y que se crucen dos grupos en la
 * puerta. Los cancelados no cuentan — liberan la franja.
 *
 * `excluir` es el propio turno cuando se está reprogramando: moverlo a su mismo
 * horario no es un choque consigo mismo.
 */
async function turnoQueChoca(
  agenteId: string,
  fecha: string,
  horaInicioMin: number,
  cancha: string,
  excluir?: string,
) {
  const { filas } = await leerReservasCacheado(agenteId, fecha, fecha, TTL_TURNOS);
  return filas.find(
    (r) =>
      r.recordId !== excluir &&
      r.cancha === cancha &&
      r.horaInicioMin === horaInicioMin &&
      r.estado !== "CANCELADA",
  );
}

function mensajeDeChoque(
  cancha: string,
  horaInicioMin: number,
  nombre: string | null,
): string {
  return `${cancha} ya tiene un turno a las ${formatearHora(horaInicioMin)} ese día${
    nombre ? ` (${nombre})` : ""
  }. Elegí otro horario o cancelá el otro turno primero.`;
}

const nuevoTurnoSchema = z.object({
  agenteId: z.string().min(1, "Elegí la sede"),
  nombre: z.string().trim().min(1, "Poné el nombre de quien reserva"),
  telefono: z.string().trim().max(40).optional(),
  fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha válida"),
  hora: z.string().trim().regex(RE_HORA, "La hora va como HH:MM (ej. 20:00)"),
  cancha: z.coerce.number().int().min(1, "Elegí una cancha"),
  estado: z.enum(["CONFIRMADA", "PENDIENTE_SENIA"]),
  montoSenia: z.string().trim().optional(),
  notas: z.string().trim().max(2000).optional(),
});

/**
 * Alta manual de un turno (el que entra por teléfono o al mostrador).
 *
 * No estaba en la letra del §8 —que sólo pedía cancelar y reprogramar— pero sí
 * en su intención: sin esto, una reserva que no vino por WhatsApp obliga al
 * dueño a abrir Airtable, que es exactamente lo que la plataforma viene a
 * evitar (§1). Es el mismo argumento con el que se agregó el §8.0 (horarios).
 */
export async function crearTurnoAction(
  _previo: EstadoTurnoAccion,
  formData: FormData,
): Promise<EstadoTurnoAccion> {
  const parsed = nuevoTurnoSchema.safeParse({
    agenteId: formData.get("agenteId"),
    nombre: formData.get("nombre"),
    telefono: formData.get("telefono") ?? undefined,
    fecha: formData.get("fecha"),
    hora: formData.get("hora"),
    cancha: formData.get("cancha"),
    estado: formData.get("estado"),
    montoSenia: formData.get("montoSenia") ?? undefined,
    notas: formData.get("notas") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const datos = parsed.data;

  if (!(await agenteDelCliente(datos.agenteId))) {
    return { error: "Sede inexistente" };
  }

  // La cancha tiene que ser una de las configuradas para esa sede: es lo que
  // garantiza que el "Cancha N" que se escribe exista como opción en Airtable.
  const cancha = await prisma.cancha.findFirst({
    where: { agenteId: datos.agenteId, numero: datos.cancha },
    select: { numero: true },
  });
  if (!cancha) return { error: "Esa cancha no está configurada en esta sede" };

  const [horas, minutos] = datos.hora.split(":").map(Number);
  const horaInicioMin = horas * 60 + minutos;

  // La seña sólo tiene sentido si el turno queda pendiente de seña.
  const montoSenia =
    datos.estado === "PENDIENTE_SENIA" && datos.montoSenia
      ? Number(datos.montoSenia)
      : null;
  if (montoSenia !== null && (!Number.isFinite(montoSenia) || montoSenia < 0)) {
    return { error: "El monto de la seña no es válido" };
  }

  try {
    const choque = await turnoQueChoca(
      datos.agenteId,
      datos.fecha,
      horaInicioMin,
      nombreCancha(datos.cancha),
    );
    if (choque) {
      return { error: mensajeDeChoque(nombreCancha(datos.cancha), horaInicioMin, choque.nombre) };
    }

    await crearReserva(datos.agenteId, {
      nombre: datos.nombre,
      telefono: datos.telefono || null,
      fecha: datos.fecha,
      horaInicioMin,
      cancha: datos.cancha,
      estado: datos.estado,
      montoSenia,
      notas: datos.notas || null,
    });
  } catch (error) {
    if (error instanceof ErrorAirtable) return { error: error.mensajeUsuario };
    throw error;
  }

  updateTag(tagReservas(datos.agenteId));
  revalidatePath("/dashboard/turnos");
  return { ok: "Turno cargado." };
}

const cancelarSchema = z.object({
  agenteId: z.string().min(1),
  recordId: z.string().min(1),
});

/** Cancela un turno: escribe `Estado → Cancelada` en la reserva de Airtable. */
export async function cancelarTurnoAction(
  _previo: EstadoTurnoAccion,
  formData: FormData,
): Promise<EstadoTurnoAccion> {
  const parsed = cancelarSchema.safeParse({
    agenteId: formData.get("agenteId"),
    recordId: formData.get("recordId"),
  });
  if (!parsed.success) return { error: "No se pudo identificar el turno" };

  if (!(await agenteDelCliente(parsed.data.agenteId))) {
    return { error: "Sede inexistente" };
  }

  try {
    await cancelarReserva(parsed.data.agenteId, parsed.data.recordId);
  } catch (error) {
    if (error instanceof ErrorAirtable) return { error: error.mensajeUsuario };
    throw error;
  }

  updateTag(tagReservas(parsed.data.agenteId));
  revalidatePath("/dashboard/turnos");
  return { ok: "Turno cancelado." };
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const reprogramarSchema = z.object({
  agenteId: z.string().min(1),
  recordId: z.string().min(1),
  fecha: z.string().trim().regex(RE_FECHA, "Elegí una fecha válida"),
  hora: z.string().trim().regex(RE_HORA, "La hora va como HH:MM (ej. 20:00)"),
  /** La cancha del turno, para poder avisar si esa franja ya está tomada. */
  cancha: z.string().trim().optional(),
});

/**
 * Reprograma un turno a otra fecha/hora.
 *
 * Antes de escribir chequea que la cancha no esté ya ocupada en el destino: en
 * un complejo, dos turnos en la misma cancha a la misma hora no es un dato raro
 * sino una cancha vendida dos veces, con dos grupos de gente que se cruzan en la
 * puerta. Se bloquea y se explica cuál es el turno que choca, en vez de dejar
 * pasar la escritura y que el problema aparezca recién en la cancha.
 */
export async function reprogramarTurnoAction(
  _previo: EstadoTurnoAccion,
  formData: FormData,
): Promise<EstadoTurnoAccion> {
  const parsed = reprogramarSchema.safeParse({
    agenteId: formData.get("agenteId"),
    recordId: formData.get("recordId"),
    fecha: formData.get("fecha"),
    hora: formData.get("hora"),
    cancha: formData.get("cancha") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { agenteId, recordId, fecha, hora, cancha } = parsed.data;

  if (!(await agenteDelCliente(agenteId))) {
    return { error: "Sede inexistente" };
  }

  const [horas, minutos] = hora.split(":").map(Number);
  const horaInicioMin = horas * 60 + minutos;

  try {
    if (cancha) {
      const choque = await turnoQueChoca(agenteId, fecha, horaInicioMin, cancha, recordId);
      if (choque) return { error: mensajeDeChoque(cancha, horaInicioMin, choque.nombre) };
    }

    await reprogramarReserva(agenteId, recordId, { fecha, horaInicioMin });
  } catch (error) {
    if (error instanceof ErrorAirtable) return { error: error.mensajeUsuario };
    throw error;
  }

  updateTag(tagReservas(agenteId));
  revalidatePath("/dashboard/turnos");
  return { ok: "Turno reprogramado." };
}

const toggleSchema = z.object({
  agenteId: z.string().min(1),
  recordId: z.string().min(1),
  activo: z.enum(["true", "false"]),
});

/** Activa o desactiva un slot existente (el campo "Activo" de Airtable). */
export async function cambiarActivoSlotAction(
  _previo: EstadoHorarios,
  formData: FormData,
): Promise<EstadoHorarios> {
  const parsed = toggleSchema.safeParse({
    agenteId: formData.get("agenteId"),
    recordId: formData.get("recordId"),
    activo: formData.get("activo"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (!(await agenteDelCliente(parsed.data.agenteId))) {
    return { error: "Sede inexistente" };
  }

  try {
    await cambiarActivoSlot(parsed.data.agenteId, parsed.data.recordId, parsed.data.activo === "true");
  } catch (error) {
    if (error instanceof ErrorAirtable) return { error: error.mensajeUsuario };
    throw error;
  }

  updateTag(tagSlots(parsed.data.agenteId));
  revalidatePath("/dashboard/turnos/horarios");
  return { ok: true };
}
