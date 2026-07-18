import "server-only";

import crypto from "node:crypto";

// Sin caracteres ambiguos (0/O, 1/l/I): esta contraseña se dicta o se copia a
// mano cuando se le entrega el acceso al cliente (requerimientos 4.1).
const ALFABETO = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LARGO = 20;

/**
 * Contraseña inicial para el dueño de un complejo.
 *
 * Usa randomInt y no Math.random: Math.random no es criptográficamente seguro y
 * acá estamos generando la credencial de acceso a la cuenta de un cliente.
 * randomInt además evita el sesgo del módulo, que le daría más probabilidad a
 * las primeras letras del alfabeto.
 */
export function generarPasswordInicial(): string {
  let password = "";
  for (let i = 0; i < LARGO; i++) {
    password += ALFABETO[crypto.randomInt(ALFABETO.length)];
  }
  return password;
}
