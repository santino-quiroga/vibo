import "server-only";

import { ErrorAirtable } from "@/lib/airtable/cliente";
import { leerSlotsCacheado } from "@/lib/airtable/lectura";
import type { Slot } from "@/lib/airtable/tipos";
import { agentesDelCliente, type AgenteEnAlcance } from "@/lib/cliente/datos";
import { prisma } from "@/lib/prisma";

/**
 * Sub-vista "Horarios disponibles" de Turnos (requerimientos §8.0).
 *
 * Los slots viven en Airtable, por agente, así que esta vista trabaja sobre UNA
 * sede: no tiene sentido mezclar los horarios de canchas distintas de sedes
 * distintas. Misma frontera de autorización que el resto (§6.3): la sede que
 * llega por URL solo se acepta si es del cliente.
 */

export type DatosHorarios = {
  agentes: AgenteEnAlcance[];
  /** La sede sobre la que se muestran los horarios. null = hay que elegir una. */
  seleccionada: AgenteEnAlcance | null;
  slots: Slot[];
  /** Canchas configuradas del agente (números), para el alta de un slot nuevo. */
  canchasConfiguradas: number[];
  descartes: number;
  /** Mensaje de error de Airtable, si la lectura falló (SDD §4.4). */
  fallo: string | null;
};

export async function datosDeHorarios(agenteIdPedido?: string): Promise<DatosHorarios> {
  const agentes = await agentesDelCliente();

  // Se elige la sede: la pedida (si es del cliente) o, si hay una sola, esa.
  const seleccionada =
    (agenteIdPedido && agentes.find((a) => a.id === agenteIdPedido)) ||
    (agentes.length === 1 ? agentes[0] : null) ||
    null;

  if (!seleccionada) {
    return {
      agentes,
      seleccionada: null,
      slots: [],
      canchasConfiguradas: [],
      descartes: 0,
      fallo: null,
    };
  }

  const [lectura, canchas] = await Promise.all([
    leerSlotsCacheado(seleccionada.id).then(
      (r) => ({ ok: true as const, r }),
      (e: unknown) => ({ ok: false as const, e }),
    ),
    prisma.cancha.findMany({
      where: { agenteId: seleccionada.id },
      select: { numero: true },
      orderBy: { numero: "asc" },
    }),
  ]);

  if (!lectura.ok) {
    const fallo =
      lectura.e instanceof ErrorAirtable
        ? lectura.e.mensajeUsuario
        : "No se pudieron cargar los horarios de esta sede.";
    console.error(`[airtable] slots agente ${seleccionada.id}:`, lectura.e);
    return {
      agentes,
      seleccionada,
      slots: [],
      canchasConfiguradas: canchas.map((c) => c.numero),
      descartes: 0,
      fallo,
    };
  }

  // Más temprano primero: es como se lee una grilla de horarios.
  const slots = [...lectura.r.filas].sort(
    (a, b) => (a.horaInicioMin ?? 0) - (b.horaInicioMin ?? 0),
  );

  return {
    agentes,
    seleccionada,
    slots,
    canchasConfiguradas: canchas.map((c) => c.numero),
    descartes: lectura.r.descartes.length,
    fallo: null,
  };
}
