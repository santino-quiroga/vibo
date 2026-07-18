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
