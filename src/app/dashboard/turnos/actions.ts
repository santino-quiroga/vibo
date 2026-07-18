"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import { ErrorAirtable } from "@/lib/airtable/cliente";
import { cambiarActivoSlot, crearSlot, tagSlots } from "@/lib/airtable/lectura";
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
