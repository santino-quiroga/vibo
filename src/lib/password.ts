import bcrypt from "bcryptjs";

const ROUNDS = 12;

// Hash contra el que se compara cuando el email no existe. Sin esto, un login
// con email inexistente respondería mucho más rápido que uno con email válido, y
// esa diferencia de tiempo alcanza para enumerar qué cuentas existen.
//
// Es una constante ya calculada (bcrypt de un valor descartable, cost 12) y no
// un hashSync en el import: este módulo entra en el bundle de todas las requests
// vía auth.ts, y calcularlo al importar bloquearía ~300ms cada cold start,
// incluso en requests que no tienen nada que ver con el login.
const HASH_DUMMY =
  "$2b$12$sCqWVQxMgZEHsCywZj3tzeDWdCFn6SuyxPzfLrPPGOtYMiyXz2Npi";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export function verificarPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Quema el mismo tiempo que una verificación real, para no filtrar si el email existe. */
export async function verificarPasswordDummy(password: string): Promise<void> {
  await bcrypt.compare(password, HASH_DUMMY);
}
