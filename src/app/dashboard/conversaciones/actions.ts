"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ErrorEvolution, enviarTexto } from "@/lib/evolution/cliente";
import { registrarMensaje } from "@/lib/integracion/mensajes";
import { requerirClienteOwner } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

export type EstadoChat = { error?: string; ok?: boolean };

/**
 * Verifica que la conversación sea del cliente de la sesión y devuelve lo
 * necesario para operar. Es el guardián de todas las acciones de acá: ninguna
 * toca una conversación sin pasar por esto (SDD 6.3).
 */
async function conversacionDelCliente(conversacionId: string) {
  const { clienteId } = await requerirClienteOwner();
  return prisma.conversacion.findFirst({
    where: { id: conversacionId, agente: { clienteId } },
    select: { id: true, agenteId: true, contactoTelefono: true, pausadaManual: true },
  });
}

/**
 * El dueño toma o devuelve el control de un chat (requerimientos punto 9).
 *
 * Tomar el control pausa la IA solo en ESA conversación (no en el agente
 * entero): el bot deja de responderle a ese contacto hasta que el dueño la
 * devuelva. n8n respeta esto consultando /puede-responder con el teléfono.
 */
export async function alternarControlAction(
  _previo: EstadoChat,
  formData: FormData,
): Promise<EstadoChat> {
  const conversacionId = String(formData.get("conversacionId") ?? "");
  const tomar = formData.get("tomar") === "1";

  const conversacion = await conversacionDelCliente(conversacionId);
  if (!conversacion) return { error: "Conversación inexistente" };

  await prisma.conversacion.update({
    where: { id: conversacion.id },
    data: {
      pausadaManual: tomar,
      // Al tomar el control, si hay algo pendiente queda marcado para atender;
      // al devolverlo, vuelve a manos de la IA.
      estado: tomar ? "REQUIERE_ATENCION_HUMANA" : "ABIERTA",
      // Devolver el control cierra el episodio de atención humana: se limpia el
      // flag de aviso (SDD v2 §12) para que, si el bot vuelve a derivar más
      // adelante, se le avise de nuevo al dueño. Al tomar el control no se toca:
      // ese camino no dispara aviso (el dueño ya está mirando).
      ...(tomar ? {} : { atencionHumanaNotificadaAt: null }),
    },
  });

  revalidatePath(`/dashboard/conversaciones/${conversacion.id}`);
  revalidatePath("/dashboard/conversaciones");
  return { ok: true };
}

const envioSchema = z.object({
  conversacionId: z.string().min(1),
  texto: z.string().trim().min(1, "Escribí un mensaje").max(4096, "Mensaje demasiado largo"),
});

/**
 * Envía un mensaje manual por WhatsApp (SDD 4.2) y lo registra como HUMANO.
 *
 * El orden importa: primero se envía por Evolution, y solo si salió se guarda el
 * mensaje. Si se guardara antes, un fallo de envío dejaría en el historial un
 * mensaje que el contacto nunca recibió — peor que perder el texto, porque el
 * dueño creería que contestó.
 *
 * Enviar implica tomar el control: no tendría sentido que el dueño mande un
 * mensaje y la IA le conteste por encima al mismo contacto.
 */
export async function enviarMensajeManualAction(
  _previo: EstadoChat,
  formData: FormData,
): Promise<EstadoChat> {
  const parsed = envioSchema.safeParse({
    conversacionId: formData.get("conversacionId"),
    texto: formData.get("texto"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const conversacion = await conversacionDelCliente(parsed.data.conversacionId);
  if (!conversacion) return { error: "Conversación inexistente" };

  let evolutionMsgId: string | null = null;
  try {
    const enviado = await enviarTexto(
      conversacion.agenteId,
      conversacion.contactoTelefono,
      parsed.data.texto,
    );
    evolutionMsgId = enviado.evolutionMsgId;
  } catch (error) {
    if (error instanceof ErrorEvolution) {
      console.error(`[evolution] conversación ${conversacion.id}:`, error.message);
      return { error: error.mensajeUsuario };
    }
    throw error;
  }

  // Recién ahora se registra: el mensaje existe en el historial solo si de
  // verdad salió. Registrar como HUMANO deja pausadaManual como esté; se fuerza
  // a true abajo, porque enviar es tomar el control.
  await registrarMensaje({
    agenteId: conversacion.agenteId,
    telefono: conversacion.contactoTelefono,
    remitente: "HUMANO",
    contenido: parsed.data.texto,
    evolutionMsgId,
  });

  if (!conversacion.pausadaManual) {
    await prisma.conversacion.update({
      where: { id: conversacion.id },
      data: { pausadaManual: true },
    });
  }

  revalidatePath(`/dashboard/conversaciones/${conversacion.id}`);
  revalidatePath("/dashboard/conversaciones");
  return { ok: true };
}
