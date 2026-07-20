import "server-only";

import type { EstadoAgente } from "@/generated/prisma/enums";
import { hashToken } from "@/lib/tokens";
import { prisma } from "@/lib/prisma";

/**
 * Autenticación de las llamadas de n8n (SDD 6.2).
 *
 * Estas rutas NO usan sesión de usuario: las llama n8n, no una persona. Cada
 * agente tiene su token propio; n8n lo manda en `Authorization: Bearer <token>`
 * y el token resuelve a qué agente pertenece. Un token filtrado de un cliente no
 * sirve para otro, porque cada uno resuelve solo a su agente.
 *
 * El proxy ya deja estas rutas fuera del chequeo de sesión (ver src/proxy.ts);
 * la validación de verdad es esta.
 */

export type AgenteAutenticado = {
  id: string;
  clienteId: string;
  estado: EstadoAgente;
  /** Si el cliente dueño está archivado: dejó de ser cliente, el bot no atiende. */
  clienteArchivado: boolean;
  evolutionInstanceId: string;
  evolutionApiUrlEnc: string;
  evolutionApiKeyEnc: string;
};

export type ResultadoAuth =
  | { ok: true; agente: AgenteAutenticado }
  | { ok: false; status: 401 | 403 | 429; error: string };

const BEARER = /^Bearer\s+(.+)$/i;

/**
 * Resuelve el token del header al agente dueño.
 *
 * El token se busca por su hash SHA-256, que está indexado (único). No se
 * descifra nada ni se compara string por string en el código: Postgres hace el
 * lookup por índice, así que no hay una comparación en tiempo variable que
 * filtre el token por timing. Y el token tiene 256 bits de entropía real, así
 * que adivinarlo por fuerza bruta no es viable.
 */
export async function autenticarAgente(request: Request): Promise<ResultadoAuth> {
  const header = request.headers.get("authorization") ?? "";
  const match = BEARER.exec(header);

  if (!match) {
    return { ok: false, status: 401, error: "Falta el header Authorization: Bearer <token>" };
  }

  const token = match[1].trim();
  if (token === "") {
    return { ok: false, status: 401, error: "Token vacío" };
  }

  // Rate limit por token antes de tocar la base: si un token se filtra y lo
  // usan para golpear, no queremos que cada intento genere una query.
  const limite = consumirCupo(`tok:${hashToken(token)}`);
  if (!limite) {
    return { ok: false, status: 429, error: "Demasiadas solicitudes" };
  }

  const agente = await prisma.agente.findUnique({
    where: { tokenIntegracionHash: hashToken(token) },
    select: {
      id: true,
      clienteId: true,
      estado: true,
      evolutionInstanceId: true,
      evolutionApiUrlEnc: true,
      evolutionApiKeyEnc: true,
      // Va en el mismo select y no en una consulta aparte: esto corre en el
      // camino caliente de cada mensaje entrante.
      cliente: { select: { archivadoAt: true } },
    },
  });

  if (!agente) {
    // Mismo mensaje para "token inexistente" que para "mal formado": no se le
    // confirma a quien prueba tokens si acertó el formato.
    return { ok: false, status: 401, error: "Token inválido" };
  }

  const { cliente, ...resto } = agente;
  return { ok: true, agente: { ...resto, clienteArchivado: cliente.archivadoAt !== null } };
}

/**
 * Rate limiting propio (SDD 7.3), por token y por IP.
 *
 * Ventana fija en memoria. Es best-effort: en Vercel cada instancia tiene su
 * propio contador, así que el tope efectivo se multiplica por instancias
 * activas. No es un control fuerte —y el SDD dice que no hace falta que lo sea,
 * porque solo n8n llama— sino una red contra un token filtrado que se use para
 * inundar. Un límite duro de verdad necesitaría un store compartido (Redis).
 */
const VENTANA_MS = 60_000;
const MAX_POR_VENTANA = 120; // ~2/seg por token; n8n hace 3 llamados por mensaje

type Cubeta = { cuenta: number; reinicioEn: number };
const cubetas = new Map<string, Cubeta>();

function consumirCupo(clave: string): boolean {
  const ahora = Date.now();
  const cubeta = cubetas.get(clave);

  if (!cubeta || ahora >= cubeta.reinicioEn) {
    cubetas.set(clave, { cuenta: 1, reinicioEn: ahora + VENTANA_MS });
    limpiarVencidas(ahora);
    return true;
  }

  if (cubeta.cuenta >= MAX_POR_VENTANA) return false;

  cubeta.cuenta++;
  return true;
}

/** Chequeo por IP, para llamar aparte desde la ruta con el x-forwarded-for. */
export function cupoPorIp(ip: string): boolean {
  return consumirCupo(`ip:${ip}`);
}

/**
 * La IP de origen detrás del proxy de Vercel. x-forwarded-for puede traer una
 * cadena "cliente, proxy1, proxy2": el primero es el de más afuera.
 */
export function ipDeRequest(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "desconocida";
}

/** Evita que el Map crezca sin techo con cubetas ya vencidas. */
function limpiarVencidas(ahora: number): void {
  if (cubetas.size < 5000) return;
  for (const [clave, cubeta] of cubetas) {
    if (ahora >= cubeta.reinicioEn) cubetas.delete(clave);
  }
}
