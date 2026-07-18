import "server-only";

import crypto from "node:crypto";

/**
 * Cifrado de las credenciales de integración de cada agente (SDD sección 7.1).
 *
 * AES-256-GCM y no AES-CBC a propósito: GCM es cifrado autenticado, o sea que
 * detecta si el texto cifrado fue alterado. Sin eso, alguien con acceso de
 * escritura a Postgres podría modificar una fila y hacer que apuntemos la API
 * key a otro lado sin que nos enteremos.
 *
 * Estas funciones son solo del servidor. Un valor descifrado nunca se manda al
 * frontend, ni siquiera al admin interno: para la UI está `enmascarar()`.
 */

const ALGORITMO = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, el tamaño recomendado para GCM
const VERSION = "v1"; // prefijo por si algún día hay que migrar de algoritmo

/**
 * La clave se lee en cada llamada y no se cachea en un módulo: así, si falta,
 * falla la operación puntual con un mensaje claro en vez de tumbar el arranque
 * de toda la app.
 */
function claveMaestra(): Buffer {
  const bruta = process.env.ENCRYPTION_KEY;

  if (!bruta || bruta.trim() === "") {
    throw new Error(
      "Falta ENCRYPTION_KEY: no se pueden cifrar ni descifrar credenciales de integración",
    );
  }

  const clave = Buffer.from(bruta, "base64");

  // AES-256 necesita exactamente 32 bytes. Una clave más corta se aceptaría en
  // silencio y dejaría todo cifrado con menos entropía de la que creemos.
  if (clave.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY inválida: se esperaban 32 bytes en base64 y llegaron ${clave.length}. ` +
        "Generala con: openssl rand -base64 32",
    );
  }

  return clave;
}

/** Cifra un secreto para guardarlo en Postgres. */
export function cifrar(textoPlano: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITMO, claveMaestra(), iv);

  const cifrado = Buffer.concat([
    cipher.update(textoPlano, "utf8"),
    cipher.final(),
  ]);

  // El IV y el tag no son secretos: se guardan al lado del texto cifrado
  // porque hacen falta para descifrar.
  return [
    VERSION,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    cifrado.toString("base64"),
  ].join(":");
}

/**
 * Descifra un secreto. Solo se llama en el momento exacto de usar la credencial
 * (SDD 7.1) — el resultado no se loguea ni se manda al cliente.
 */
export function descifrar(payload: string): string {
  const partes = payload.split(":");

  if (partes.length !== 4 || partes[0] !== VERSION) {
    throw new Error("Credencial cifrada con formato inválido");
  }

  const [, ivB64, tagB64, cifradoB64] = partes;
  const decipher = crypto.createDecipheriv(
    ALGORITMO,
    claveMaestra(),
    Buffer.from(ivB64, "base64"),
  );

  // Si el texto fue alterado, o la clave no es la que lo cifró, decipher.final()
  // tira una excepción en vez de devolver basura.
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(cifradoB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Versión mostrable de un secreto: solo los últimos 4 caracteres.
 *
 * Alcanza para que el equipo confirme cuál credencial es cuál (SDD 7.1) sin que
 * el valor completo llegue nunca al browser.
 */
export function enmascarar(textoPlano: string): string {
  if (textoPlano.length <= 4) return "••••";
  return `••••${textoPlano.slice(-4)}`;
}

/**
 * Token con el que n8n autentica sus llamadas a /api/integracion/* (SDD 6.2).
 *
 * 32 bytes de aleatoriedad criptográfica: no es adivinable por fuerza bruta, y
 * al ser por agente, uno filtrado no sirve para los demás.
 */
export function generarTokenIntegracion(): string {
  return crypto.randomBytes(32).toString("base64url");
}
