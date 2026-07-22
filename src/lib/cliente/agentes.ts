import type { EstadoAgente } from "@/generated/prisma/enums";
import "server-only";

import { cache } from "react";

import { TTL_KPIS, leerReservasCacheado } from "@/lib/airtable/lectura";
import { requerirClienteOwner } from "@/lib/dal";
import { turnosReservados } from "@/lib/kpis";
import { resolverPeriodo } from "@/lib/periodos";
import { prisma } from "@/lib/prisma";

/**
 * Sección Agentes del panel cliente (requerimientos §7).
 *
 * Misma frontera de autorización que el resto del panel (SDD §6.3): todo se
 * filtra por el clienteId de la sesión. El id de agente que llega por URL nunca
 * consulta solo — siempre cruza contra el cliente.
 */

export type AgenteCard = {
  id: string;
  nombre: string;
  deporte: string;
  estado: EstadoAgente;
  /** El canal está configurado (tiene instancia de Evolution). No es un chequeo
   *  de conexión en vivo — eso llega cuando se conecte el agente real. */
  canalConfigurado: boolean;
  turnosMes: number | null; // null si no se pudo leer Airtable
  conversacionesMes: number;
};

/** Cards del listado, con las métricas rápidas del mes por sede. */
export async function agentesConMetricas(): Promise<AgenteCard[]> {
  const { clienteId } = await requerirClienteOwner();
  const { actual } = resolverPeriodo("mes");

  const agentes = await prisma.agente.findMany({
    where: { clienteId },
    select: { id: true, nombre: true, deporte: true, estado: true, evolutionInstanceId: true },
    orderBy: { createdAt: "asc" },
  });

  // Turnos del mes por agente (Airtable). allSettled: si una base está caída, la
  // card de esa sede muestra "—" pero las demás salen igual (SDD §4.4).
  const turnos = await Promise.allSettled(
    agentes.map((a) => leerReservasCacheado(a.id, actual.desde, actual.hasta, TTL_KPIS)),
  );

  // Conversaciones del mes por agente (base propia).
  const conteos = await prisma.conversacion.groupBy({
    by: ["agenteId"],
    where: {
      agenteId: { in: agentes.map((a) => a.id) },
      ultimoMensajeAt: {
        gte: new Date(`${actual.desde}T00:00:00-03:00`),
        lt: new Date(`${actual.hasta}T23:59:59.999-03:00`),
      },
    },
    _count: { _all: true },
  });
  const convPorAgente = new Map(conteos.map((c) => [c.agenteId, c._count._all]));

  return agentes.map((agente, i) => {
    const t = turnos[i];
    return {
      id: agente.id,
      nombre: agente.nombre,
      deporte: agente.deporte,
      estado: agente.estado,
      canalConfigurado: agente.evolutionInstanceId.trim() !== "",
      turnosMes: t.status === "fulfilled" ? turnosReservados(t.value.filas) : null,
      conversacionesMes: convPorAgente.get(agente.id) ?? 0,
    };
  });
}

export type AgenteDetalle = {
  id: string;
  nombre: string;
  deporte: string;
  estado: EstadoAgente;
  direccion: string | null;
  telefonoContacto: string | null;
  tono: string | null;
  promptBase: string;
  anticipacionMinHoras: number | null;
  politicaCancelacion: string | null;
  senia: string | null;
  faq: string | null;
  canchas: Array<{
    numero: number;
    precio: string;
    duracionTurnoMin: number;
    horarioApertura: string;
    horarioCierre: string;
    franjas: Array<{ horaDesde: string; horaHasta: string; precio: string }>;
  }>;
};

/**
 * Detalle de un agente, verificando que sea del cliente de la sesión.
 *
 * No devuelve credenciales ni nada de integraciones (§7: "explícitamente no
 * incluye conectar canal ni integraciones"). Null si no existe o es de otro
 * cliente — las dos se ven igual desde afuera.
 */
export const obtenerAgenteDelCliente = cache(
  async (agenteId: string): Promise<AgenteDetalle | null> => {
    const { clienteId } = await requerirClienteOwner();

    const agente = await prisma.agente.findFirst({
      where: { id: agenteId, clienteId },
      select: {
        id: true,
        nombre: true,
        deporte: true,
        estado: true,
        direccion: true,
        telefonoContacto: true,
        tono: true,
        promptBase: true,
        anticipacionMinHoras: true,
        politicaCancelacion: true,
        senia: true,
        faq: true,
        canchas: {
          select: {
            numero: true,
            precio: true,
            duracionTurnoMin: true,
            horarioApertura: true,
            horarioCierre: true,
            franjas: {
              select: { horaDesde: true, horaHasta: true, precio: true },
              orderBy: { horaDesde: "asc" },
            },
          },
          orderBy: { numero: "asc" },
        },
      },
    });

    if (!agente) return null;

    return {
      ...agente,
      canchas: agente.canchas.map((c) => ({
        numero: c.numero,
        precio: c.precio.toString(),
        duracionTurnoMin: c.duracionTurnoMin,
        horarioApertura: c.horarioApertura,
        horarioCierre: c.horarioCierre,
        franjas: c.franjas.map((f) => ({
          horaDesde: f.horaDesde,
          horaHasta: f.horaHasta,
          precio: f.precio.toString(),
        })),
      })),
    };
  },
);
