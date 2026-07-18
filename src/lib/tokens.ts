import "server-only";

import crypto from "node:crypto";

/** Cuánto vive un link de recuperación antes de vencer. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

/**
 * Genera el token que viaja en el link y el hash que se guarda en la base.
 *
 * A la base va únicamente el hash: si alguien lee la tabla, no puede reconstruir
 * el link. Es el mismo criterio con el que se guardan las contraseñas.
 */
export function generarResetToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

/**
 * SHA-256 y no bcrypt a propósito: el token ya tiene 256 bits de entropía real,
 * así que no hace falta un hash lento para resistir fuerza bruta, y necesitamos
 * poder buscarlo por índice.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
