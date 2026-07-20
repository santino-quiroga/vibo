import "server-only";

import { Resend } from "resend";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "Vibo <onboarding@resend.dev>";

/**
 * Manda el link de recuperación.
 *
 * En desarrollo, si no hay RESEND_API_KEY configurada, el link se escribe en la
 * consola del servidor en vez de fallar. Así el flujo se puede probar entero sin
 * tener el proveedor de email dado de alta todavía.
 */
export async function enviarEmailRecuperacion(
  email: string,
  urlReset: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Falta RESEND_API_KEY: no se puede enviar el email de recuperación");
    }
    console.info(`[dev] Link de recuperación para ${email}: ${urlReset}`);
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: email,
    subject: "Restablecer tu contraseña de Vibo",
    text: [
      "Recibimos un pedido para restablecer tu contraseña de Vibo.",
      "",
      `Entrá a este link para elegir una nueva: ${urlReset}`,
      "",
      "El link vence en 1 hora y se puede usar una sola vez.",
      "Si no pediste esto, podés ignorar este mail: tu contraseña no cambia.",
    ].join("\n"),
  });

  if (error) {
    throw new Error(`No se pudo enviar el email de recuperación: ${error.message}`);
  }
}

/**
 * Los 3 emails de facturación del SDD v2 §4.5.
 *
 * Las notificaciones proactivas quedaron fuera de alcance como sistema general
 * (requerimientos §12), y esto NO lo reabre: son tres avisos puntuales, y sólo
 * porque hay plata de por medio. Sin ellos, el cliente se entera de que le
 * falló el pago cuando el bot ya dejó de responder, que es justo lo que se
 * quiere evitar.
 */
export type AvisoPago = "gracia_inicio" | "gracia_recordatorio" | "servicio_pausado";

const AVISOS: Record<AvisoPago, { asunto: string; cuerpo: (dias: number) => string[] }> = {
  gracia_inicio: {
    asunto: "No pudimos procesar tu pago de Vibo",
    cuerpo: (dias) => [
      "Intentamos cobrar tu suscripción de Vibo y el pago no se pudo procesar.",
      "",
      `Tenés ${dias} días para regularizarlo. Durante ese tiempo tu agente sigue funcionando normalmente.`,
      "",
      "Si ya lo resolviste o pagaste por otro medio, escribinos y lo damos por saldado.",
    ],
  },
  gracia_recordatorio: {
    asunto: "Te quedan pocos días para regularizar tu pago de Vibo",
    cuerpo: (dias) => [
      "Tu pago de Vibo sigue pendiente.",
      "",
      `Te quedan ${dias} días. Pasado ese plazo, tu agente deja de responder los WhatsApps de tus clientes.`,
      "",
      "Si ya pagaste o querés arreglarlo por otro medio, escribinos.",
    ],
  },
  servicio_pausado: {
    asunto: "Tu agente de Vibo quedó pausado",
    cuerpo: () => [
      "Se venció el plazo para regularizar el pago, así que tu agente quedó pausado:",
      "por ahora no responde los WhatsApps de tus clientes.",
      "",
      "No se perdió nada: tus turnos, conversaciones y configuración quedan como están,",
      "y el agente vuelve a andar apenas se registre el pago.",
      "",
      "Escribinos y lo resolvemos.",
    ],
  },
};

/**
 * Manda uno de los avisos de facturación.
 *
 * No lanza si falla: un email caído no puede romper el cron que pausa agentes.
 * Devuelve si se envió, para que el que llama lo registre.
 */
export async function enviarAvisoPago(
  email: string,
  aviso: AvisoPago,
  diasRestantes: number,
): Promise<boolean> {
  const { asunto, cuerpo } = AVISOS[aviso];
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      console.error(`[pagos] falta RESEND_API_KEY: no se envió "${aviso}" a ${email}`);
      return false;
    }
    console.info(`[dev] Aviso de pago "${aviso}" para ${email}: ${asunto}`);
    return true;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: asunto,
      text: cuerpo(diasRestantes).join("\n"),
    });
    if (error) {
      console.error(`[pagos] no se pudo enviar "${aviso}" a ${email}: ${error.message}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[pagos] fallo enviando "${aviso}" a ${email}:`, error);
    return false;
  }
}
