import "server-only";

import type { EstadoConversacion, RemitenteMensaje } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/**
 * Registro de mensajes: el corazón de las Conversaciones.
 *
 * Lo usan dos caminos:
 *   - el endpoint /api/integracion/mensajes, cuando n8n loguea un mensaje del
 *     contacto (CONTACTO) o la respuesta de la IA (IA)
 *   - la acción de envío manual, cuando el dueño toma el control (HUMANO)
 *
 * IMPORTANTE (límite de sprint): acá NO se cuenta el uso mensual ni se pausa por
 * límite de plan. Ese conteo y el bloqueo son del sprint 5 (SDD 11), junto con
 * el cron de ciclo y la contradicción pendiente de si el límite es por agente o
 * por cliente. Este servicio solo arma el hilo y mueve el estado.
 */

export type RegistrarMensaje = {
  agenteId: string;
  telefono: string;
  remitente: RemitenteMensaje;
  contenido: string;
  contactoNombre?: string | null;
  evolutionMsgId?: string | null;
};

/**
 * El estado en el que queda la conversación según quién habló.
 *
 *  - CONTACTO con la IA activa   → IA_RESPONDIENDO (el bot va a contestar)
 *  - CONTACTO con el chat en manual → REQUIERE_ATENCION_HUMANA (el bot no
 *    contesta acá; alguien tiene que hacerlo)
 *  - IA o HUMANO                  → ABIERTA (quedó contestado, a la espera)
 *
 * El "requiere atención humana" es lo que distingue un chat que el dueño tomó y
 * dejó sin responder: es la bandeja de lo urgente.
 */
function estadoTras(
  remitente: RemitenteMensaje,
  pausadaManual: boolean,
): EstadoConversacion {
  if (remitente === "CONTACTO") {
    return pausadaManual ? "REQUIERE_ATENCION_HUMANA" : "IA_RESPONDIENDO";
  }
  return "ABIERTA";
}

export type MensajeRegistrado = {
  conversacionId: string;
  mensajeId: string;
  estado: EstadoConversacion;
};

/**
 * Registra un mensaje y actualiza la conversación, todo en una transacción.
 *
 * El upsert de la conversación es atómico gracias al único [agenteId,
 * contactoTelefono]: dos mensajes del mismo contacto que llegan casi juntos no
 * crean dos hilos. El nombre del contacto solo se completa si viene y todavía no
 * estaba, para no pisar uno bueno con un null.
 */
export async function registrarMensaje(
  datos: RegistrarMensaje,
): Promise<MensajeRegistrado> {
  const ahora = new Date();

  return prisma.$transaction(async (tx) => {
    // Se necesita saber si el chat está en manual ANTES de decidir el estado,
    // así que primero se resuelve la conversación.
    const previa = await tx.conversacion.findUnique({
      where: {
        agenteId_contactoTelefono: {
          agenteId: datos.agenteId,
          contactoTelefono: datos.telefono,
        },
      },
      select: { id: true, pausadaManual: true },
    });

    const pausadaManual = previa?.pausadaManual ?? false;
    const estado = estadoTras(datos.remitente, pausadaManual);

    const conversacion = await tx.conversacion.upsert({
      where: {
        agenteId_contactoTelefono: {
          agenteId: datos.agenteId,
          contactoTelefono: datos.telefono,
        },
      },
      create: {
        agenteId: datos.agenteId,
        contactoTelefono: datos.telefono,
        contactoNombre: datos.contactoNombre ?? null,
        estado,
        ultimoMensajeAt: ahora,
      },
      update: {
        estado,
        ultimoMensajeAt: ahora,
        // Solo se completa el nombre si vino uno y no había: no se pisa.
        ...(datos.contactoNombre && !previa
          ? { contactoNombre: datos.contactoNombre }
          : {}),
      },
      select: { id: true },
    });

    const mensaje = await tx.mensaje.create({
      data: {
        conversacionId: conversacion.id,
        remitente: datos.remitente,
        contenido: datos.contenido,
        evolutionMsgId: datos.evolutionMsgId ?? null,
      },
      select: { id: true },
    });

    return { conversacionId: conversacion.id, mensajeId: mensaje.id, estado };
  });
}

/**
 * Si el agente puede responder automáticamente (SDD 4.3).
 *
 * Corta en dos niveles: el agente entero (pausado manual o por límite de plan) y
 * la conversación puntual (el dueño tomó el control de ESE chat). El motivo se
 * devuelve para que n8n pueda loguearlo, no para mostrárselo a nadie.
 */
export type PuedeResponder = { puedeResponder: boolean; motivo?: string };

export async function evaluarPuedeResponder(
  agente: { id: string; estado: string },
  telefono: string | null,
): Promise<PuedeResponder> {
  if (agente.estado === "PAUSADO_MANUAL") {
    return { puedeResponder: false, motivo: "agente_pausado_manual" };
  }
  if (agente.estado === "PAUSADO_LIMITE") {
    return { puedeResponder: false, motivo: "agente_pausado_limite" };
  }

  // Sin teléfono no hay conversación puntual que chequear: el agente está activo.
  if (!telefono) return { puedeResponder: true };

  const conversacion = await prisma.conversacion.findUnique({
    where: { agenteId_contactoTelefono: { agenteId: agente.id, contactoTelefono: telefono } },
    select: { pausadaManual: true },
  });

  if (conversacion?.pausadaManual) {
    return { puedeResponder: false, motivo: "conversacion_en_manual" };
  }

  return { puedeResponder: true };
}
