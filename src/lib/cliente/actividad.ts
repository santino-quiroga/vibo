import "server-only";

import { ZONA_HORARIA } from "@/lib/airtable/tipos";
import { cicloDe } from "@/lib/ciclo";
import { agentesDelCliente } from "@/lib/cliente/datos";
import { requerirClienteOwner } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

/**
 * Actividad de la IA — el trabajo invisible del bot, hecho tangible.
 *
 * Todo sale de la base propia de Vibo (mensajes logueados por n8n), filtrado por
 * el clienteId de la sesión (SDD §6.3). Con el workflow de n8n todavía sin
 * cablear, estos números arrancan en cero y crecen cuando n8n empiece a loguear.
 */

export type ActividadIA = {
  operativo: boolean;
  sedesActivas: number;
  totalSedes: number;
  /** Respuestas automáticas de la IA en el ciclo. */
  respuestas: number;
  /** De esas, cuántas fuera del horario comercial (antes de 8 o desde las 22). */
  fueraHorario: number;
  ultimaRespuesta: Date | null;
};

/** Horario comercial: 08:00–22:00 de Argentina. Fuera de eso, el bot cubre solo. */
function esFueraHorarioComercial(fecha: Date): boolean {
  const hora = Number(
    new Intl.DateTimeFormat("es-AR", {
      timeZone: ZONA_HORARIA,
      hour: "2-digit",
      hour12: false,
    }).format(fecha),
  );
  return hora < 8 || hora >= 22;
}

export async function actividadDelAgente(): Promise<ActividadIA> {
  const { clienteId } = await requerirClienteOwner();
  const agentes = await agentesDelCliente();
  const sedesActivas = agentes.filter((a) => a.estado === "ACTIVO").length;
  const ciclo = cicloDe();

  // Se traen los timestamps de las respuestas de la IA del ciclo. El tope evita
  // arrastrar volúmenes enormes: alcanza para el conteo y el "fuera de horario".
  const mensajes = await prisma.mensaje.findMany({
    where: {
      remitente: "IA",
      conversacion: { agente: { clienteId } },
      createdAt: { gte: ciclo.inicio, lt: ciclo.fin },
    },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10_000,
  });

  return {
    operativo: sedesActivas > 0,
    sedesActivas,
    totalSedes: agentes.length,
    respuestas: mensajes.length,
    fueraHorario: mensajes.filter((m) => esFueraHorarioComercial(m.createdAt)).length,
    ultimaRespuesta: mensajes[0]?.createdAt ?? null,
  };
}
