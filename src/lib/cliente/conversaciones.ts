import "server-only";

import { cache } from "react";

import type { EstadoConversacion, RemitenteMensaje } from "@/generated/prisma/enums";
import { agentesDelCliente } from "@/lib/cliente/datos";
import { requerirClienteOwner } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

/**
 * Sección Conversaciones (requerimientos punto 9), lado panel cliente.
 *
 * Frontera de autorización (SDD 6.3): toda consulta se limita a los agentes del
 * cliente de la sesión. El id de conversación llega por URL, así que nunca se
 * usa solo para consultar — siempre se cruza contra los agentes del cliente. Un
 * id de otro cliente no aparece y no se puede abrir.
 */

export type FiltroEstado = "todas" | "no_leidas" | "ia_respondiendo" | "requiere_humano";

export function esFiltroEstado(v: unknown): v is FiltroEstado {
  return v === "todas" || v === "no_leidas" || v === "ia_respondiendo" || v === "requiere_humano";
}

export type ConversacionListada = {
  id: string;
  agenteId: string;
  agenteNombre: string;
  contactoTelefono: string;
  contactoNombre: string | null;
  estado: EstadoConversacion;
  pausadaManual: boolean;
  ultimoMensajeAt: Date;
  sinLeer: boolean;
  ultimoTexto: string | null;
};

/** Una conversación está sin leer si nunca se abrió o cambió desde la última vez. */
function calcularSinLeer(leidaAt: Date | null, ultimoMensajeAt: Date): boolean {
  return leidaAt === null || leidaAt < ultimoMensajeAt;
}

/**
 * La bandeja: conversaciones de los agentes del cliente, más recientes primero.
 *
 * El filtro por estado y la búsqueda por contacto van al SQL; el filtro "no
 * leídas" se resuelve en memoria porque compara dos columnas (leidaAt vs.
 * ultimoMensajeAt), algo que Prisma no expresa en un where. El volumen por
 * cliente en v1 es acotado, así que traer y filtrar es razonable.
 */
export async function listarConversaciones(opciones: {
  agenteId?: string;
  estado?: FiltroEstado;
  busqueda?: string;
}): Promise<{ conversaciones: ConversacionListada[]; agentes: { id: string; nombre: string }[] }> {
  // agentesDelCliente ya exige el rol y filtra por el clienteId de la sesión.
  const agentes = await agentesDelCliente();
  const agentesPermitidos = new Set(agentes.map((a) => a.id));

  // El agenteId del selector viene de la URL: solo se acepta si es del cliente.
  const scope =
    opciones.agenteId && agentesPermitidos.has(opciones.agenteId)
      ? [opciones.agenteId]
      : [...agentesPermitidos];

  if (scope.length === 0) return { conversaciones: [], agentes };

  const busqueda = opciones.busqueda?.trim();

  const filas = await prisma.conversacion.findMany({
    where: {
      // El filtro por agenteId de agentes del cliente es lo que garantiza el
      // multi-tenancy: nunca se consulta sin este scope (SDD 6.3).
      agenteId: { in: scope },
      ...(opciones.estado === "ia_respondiendo" ? { estado: "IA_RESPONDIENDO" } : {}),
      ...(opciones.estado === "requiere_humano" ? { estado: "REQUIERE_ATENCION_HUMANA" } : {}),
      ...(busqueda
        ? {
            OR: [
              { contactoNombre: { contains: busqueda, mode: "insensitive" } },
              { contactoTelefono: { contains: busqueda } },
            ],
          }
        : {}),
    },
    orderBy: { ultimoMensajeAt: "desc" },
    take: 200,
    select: {
      id: true,
      agenteId: true,
      contactoTelefono: true,
      contactoNombre: true,
      estado: true,
      pausadaManual: true,
      ultimoMensajeAt: true,
      leidaAt: true,
      agente: { select: { nombre: true } },
      mensajes: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { contenido: true },
      },
    },
  });

  let conversaciones: ConversacionListada[] = filas.map((f) => ({
    id: f.id,
    agenteId: f.agenteId,
    agenteNombre: f.agente.nombre,
    contactoTelefono: f.contactoTelefono,
    contactoNombre: f.contactoNombre,
    estado: f.estado,
    pausadaManual: f.pausadaManual,
    ultimoMensajeAt: f.ultimoMensajeAt,
    sinLeer: calcularSinLeer(f.leidaAt, f.ultimoMensajeAt),
    ultimoTexto: f.mensajes[0]?.contenido ?? null,
  }));

  if (opciones.estado === "no_leidas") {
    conversaciones = conversaciones.filter((c) => c.sinLeer);
  }

  return { conversaciones, agentes };
}

export type MensajeHilo = {
  id: string;
  remitente: RemitenteMensaje;
  contenido: string;
  createdAt: Date;
};

export type Hilo = {
  id: string;
  agenteId: string;
  agenteNombre: string;
  contactoTelefono: string;
  contactoNombre: string | null;
  estado: EstadoConversacion;
  pausadaManual: boolean;
  mensajes: MensajeHilo[];
};

/**
 * Un hilo completo, verificando que sea del cliente de la sesión.
 *
 * Devuelve null (no un error) si la conversación no existe o es de otro cliente:
 * las dos situaciones se ven igual desde afuera, así que un id ajeno no confirma
 * siquiera que exista.
 */
export const obtenerHilo = cache(async (conversacionId: string): Promise<Hilo | null> => {
  const { clienteId } = await requerirClienteOwner();

  const conversacion = await prisma.conversacion.findFirst({
    where: {
      id: conversacionId,
      // El cruce contra el clienteId de la sesión es lo que evita el IDOR.
      agente: { clienteId },
    },
    select: {
      id: true,
      agenteId: true,
      contactoTelefono: true,
      contactoNombre: true,
      estado: true,
      pausadaManual: true,
      agente: { select: { nombre: true } },
      mensajes: {
        orderBy: { createdAt: "asc" },
        select: { id: true, remitente: true, contenido: true, createdAt: true },
      },
    },
  });

  if (!conversacion) return null;

  return {
    id: conversacion.id,
    agenteId: conversacion.agenteId,
    agenteNombre: conversacion.agente.nombre,
    contactoTelefono: conversacion.contactoTelefono,
    contactoNombre: conversacion.contactoNombre,
    estado: conversacion.estado,
    pausadaManual: conversacion.pausadaManual,
    mensajes: conversacion.mensajes,
  };
});

/**
 * Marca una conversación como leída, si es del cliente.
 *
 * Se llama al abrir el hilo. Devuelve true si marcó algo. El where incluye el
 * clienteId para que no se pueda marcar como leída una conversación ajena.
 */
export async function marcarLeida(conversacionId: string): Promise<void> {
  const { clienteId } = await requerirClienteOwner();
  await prisma.conversacion.updateMany({
    where: { id: conversacionId, agente: { clienteId } },
    data: { leidaAt: new Date() },
  });
}

/** Cuántas conversaciones sin leer hay, para el aviso de la navegación. */
export const contarSinLeer = cache(async (): Promise<number> => {
  const agentes = await agentesDelCliente();
  if (agentes.length === 0) return 0;

  const filas = await prisma.conversacion.findMany({
    where: { agenteId: { in: agentes.map((a) => a.id) } },
    select: { leidaAt: true, ultimoMensajeAt: true },
  });

  return filas.filter((f) => calcularSinLeer(f.leidaAt, f.ultimoMensajeAt)).length;
});
