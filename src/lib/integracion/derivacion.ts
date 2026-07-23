import "server-only";

import { construirAviso } from "@/lib/integracion/aviso";
import { enviarTexto } from "@/lib/evolution/cliente";
import { prisma } from "@/lib/prisma";
import { urlBaseVibo } from "@/lib/url";

/**
 * Derivación a atención humana + aviso al dueño (SDD v2 §12).
 *
 * Hasta ahora `REQUIERE_ATENCION_HUMANA` sólo lo producía el propio dueño (tomar
 * control o responder a mano), así que no había nada que notificar: se enteraba
 * porque lo hacía él. Esto agrega el camino automático — el bot deriva cuando no
 * puede resolver — y avisa por WhatsApp al dueño la **primera vez** que una
 * conversación entra al estado por esa vía.
 *
 * La primera-vez se garantiza con un claim atómico sobre
 * `atencionHumanaNotificadaAt`: si dos derivaciones caen casi juntas, sólo una
 * gana el update y manda el WhatsApp. El flag se limpia cuando el dueño devuelve
 * el control a la IA (ver `alternarControlAction`), y ahí una derivación futura
 * vuelve a avisar.
 */

export type ResultadoDerivacion = {
  /** La conversación quedó en REQUIERE_ATENCION_HUMANA. Siempre true si no falló. */
  derivado: boolean;
  /** Si se mandó el WhatsApp al dueño (false si ya se había avisado o no hay número). */
  notificado: boolean;
};

export async function derivarAHumano(
  agenteId: string,
  telefono: string,
): Promise<ResultadoDerivacion> {
  // 1. La conversación pasa a manual + REQUIERE_ATENCION_HUMANA. Poner
  //    `pausadaManual` es lo que hace que el bot deje de responderle a ese
  //    contacto (via /contexto → conversacion_en_manual) y que los CONTACTO
  //    siguientes mantengan el estado sin volver a la IA. Upsert por si el chat
  //    aún no existiera (no debería: el CONTACTO se logueó antes).
  const conversacion = await prisma.conversacion.upsert({
    where: { agenteId_contactoTelefono: { agenteId, contactoTelefono: telefono } },
    create: {
      agenteId,
      contactoTelefono: telefono,
      estado: "REQUIERE_ATENCION_HUMANA",
      pausadaManual: true,
      ultimoMensajeAt: new Date(),
    },
    update: {
      estado: "REQUIERE_ATENCION_HUMANA",
      pausadaManual: true,
    },
    select: { id: true },
  });

  // 2. Claim atómico del aviso: sólo gana quien encuentra el flag en null. Es lo
  //    que hace que dos derivaciones casi simultáneas no manden dos WhatsApp.
  const claim = await prisma.conversacion.updateMany({
    where: { id: conversacion.id, atencionHumanaNotificadaAt: null },
    data: { atencionHumanaNotificadaAt: new Date() },
  });

  // Ya se había avisado en este episodio: derivado sí, notificado no.
  if (claim.count === 0) {
    return { derivado: true, notificado: false };
  }

  const info = await prisma.conversacion.findUnique({
    where: { id: conversacion.id },
    select: {
      contactoTelefono: true,
      contactoNombre: true,
      agente: {
        select: {
          nombre: true,
          cliente: { select: { telefonoWhatsapp: true } },
        },
      },
    },
  });

  const telefonoDueno = info?.agente.cliente.telefonoWhatsapp;
  if (!info || !telefonoDueno) {
    // No hay a quién avisar. Se derivó igual: el dueño lo verá en Conversaciones.
    return { derivado: true, notificado: false };
  }

  const aviso = construirAviso({
    sede: info.agente.nombre,
    contactoNombre: info.contactoNombre,
    contactoTelefono: info.contactoTelefono,
    conversacionId: conversacion.id,
    baseUrl: urlBaseVibo(),
  });

  // 3. Se manda por la instancia de Evolution de la sede que escaló, reusando el
  //    mismo cliente que el envío manual. Best-effort: si falla, se loguea y no
  //    se tumba la derivación — el flag ya quedó sellado, así que no se reintenta
  //    (documentado en §12: se prefiere no arriesgar un doble aviso).
  try {
    await enviarTexto(agenteId, telefonoDueno, aviso);
    return { derivado: true, notificado: true };
  } catch (error) {
    console.error(
      `[derivar] no se pudo avisar al dueño (agente ${agenteId}):`,
      error instanceof Error ? error.message : error,
    );
    return { derivado: true, notificado: false };
  }
}
