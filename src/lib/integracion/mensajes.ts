import "server-only";

import type { EstadoConversacion, RemitenteMensaje } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { resolverDecisionVentana, type DecisionVentana } from "@/lib/integracion/ventana";

export { resolverDecisionVentana, type DecisionVentana };

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
 * Ventana de escucha: decide si ESTA ejecución de n8n es la que responde, y con
 * qué texto (SDD v2 §11).
 *
 * El problema: si un contacto manda varios mensajes seguidos, el workflow madre
 * dispara una ejecución por mensaje y el bot contesta cada uno por separado. La
 * solución reparte la lógica: n8n espera una ventana fija (~9s, nodo Wait) tras
 * cada mensaje y después pregunta acá; Vibo decide quién responde, porque es lo
 * único con estado consistente entre ejecuciones.
 *
 * Regla: **responde sólo la ejecución del último mensaje del lote**, y responde
 * por todos juntos. El "lote pendiente" son los CONTACTO posteriores al último
 * mensaje IA/HUMANO (ese es el cursor; no hace falta guardar nada extra). Bajo
 * un orden total determinista (createdAt, id) hay un único máximo: esa ejecución
 * responde, las demás se paran. Así exactamente una contesta y ninguna cuenta de
 * más (el uso ya se contó al loguear, dedup por conversación/ciclo).
 *
 * No confía en `mensajeId` como "el último por haber llegado": lo compara contra
 * el máximo real del lote en la base, que es lo que ven todas las ejecuciones.
 */
export async function decidirRespuestaVentana(
  agenteId: string,
  telefono: string,
  mensajeId: string,
): Promise<DecisionVentana> {
  const conversacion = await prisma.conversacion.findUnique({
    where: { agenteId_contactoTelefono: { agenteId, contactoTelefono: telefono } },
    select: { id: true, pausadaManual: true },
  });

  // El mensaje se loguea ANTES de la ventana, así que la conversación existe. Si
  // no está, algo se salió del flujo esperado: no responder es lo seguro.
  if (!conversacion) {
    return { responder: false, textoAgrupado: "", motivo: "conversacion_inexistente" };
  }

  // Si el dueño tomó el control (o el bot derivó) durante la ventana, la IA no
  // responde en este chat. /contexto igual lo cortaría, pero cortar acá evita
  // llamar al LLM al pedo.
  if (conversacion.pausadaManual) {
    return { responder: false, textoAgrupado: "", motivo: "conversacion_en_manual" };
  }

  // El cursor del lote: el último mensaje que NO es del contacto (una respuesta
  // de la IA o del dueño cierra el lote anterior).
  const cursor = await prisma.mensaje.findFirst({
    where: { conversacionId: conversacion.id, remitente: { in: ["IA", "HUMANO"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { createdAt: true },
  });

  const lote = await prisma.mensaje.findMany({
    where: {
      conversacionId: conversacion.id,
      remitente: "CONTACTO",
      ...(cursor ? { createdAt: { gt: cursor.createdAt } } : {}),
    },
    // Orden ascendente: el último elemento es el máximo bajo el orden total
    // (createdAt, id) — el que tiene que responder.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, contenido: true },
  });

  return resolverDecisionVentana(lote, mensajeId);
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
  agente: { id: string; estado: string; clienteArchivado?: boolean },
  telefono: string | null,
): Promise<PuedeResponder> {
  // Cliente archivado: dejó de ser cliente. Va primero porque manda sobre
  // cualquier estado del agente — no tiene sentido seguir atendiendo a alguien
  // que se dio de baja, aunque su agente figure ACTIVO.
  if (agente.clienteArchivado) {
    return { puedeResponder: false, motivo: "cliente_archivado" };
  }
  // Un agente EN_CONFIGURACION no atiende a nadie todavía (SDD v2 §2): está
  // cargado y se puede probar en el chat de prueba, pero no se verificó que sus
  // credenciales reales anden. Si llegara un mensaje de WhatsApp —por un webhook
  // que quedó apuntando, por ejemplo— responder sería peor que no hacerlo: le
  // estaría contestando a un cliente real con una configuración sin verificar.
  if (agente.estado === "EN_CONFIGURACION") {
    return { puedeResponder: false, motivo: "agente_en_configuracion" };
  }
  // Falta de pago (SDD v2 §4.4). Se corta el servicio, igual que con el límite
  // de plan: si el bot siguiera respondiendo, no habría diferencia entre pagar
  // y no pagar.
  if (agente.estado === "PAUSADO_POR_PAGO") {
    return { puedeResponder: false, motivo: "agente_pausado_por_pago" };
  }
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
