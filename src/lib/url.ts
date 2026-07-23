import "server-only";

/**
 * Origen público de Vibo, para armar links que se mandan hacia afuera (emails,
 * WhatsApp de aviso al dueño).
 *
 * **Nunca** sale del header Host: ese header lo controla quien hace la request,
 * y usarlo dejaría que un tercero fabrique links a un dominio ajeno dentro de un
 * mensaje legítimo nuestro. El origen sale sólo de configuración del servidor.
 *
 * Misma lógica que el `urlBase()` de recuperación de contraseña; se centraliza
 * acá para que la notificación de atención humana (SDD v2 §12) la comparta.
 */
export function urlBaseVibo(): string {
  const configurada = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (configurada) return configurada.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Falta AUTH_URL: sin un origen configurado no se pueden armar links seguros",
    );
  }

  return "http://localhost:3000";
}
