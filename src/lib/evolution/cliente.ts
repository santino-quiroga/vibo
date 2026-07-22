import "server-only";

import { descifrar } from "@/lib/crypto";
import { normalizarNumero } from "@/lib/evolution/numero";
import { prisma } from "@/lib/prisma";

/**
 * Cliente de Evolution API — el único lugar que manda mensajes de WhatsApp.
 *
 * Se usa solo cuando el dueño toma el control manual de una conversación (SDD
 * 4.2): la IA manda los suyos directo desde n8n, sin pasar por Vibo. Acá se
 * arma la llamada al endpoint de envío con las credenciales cifradas del agente,
 * descifradas en el momento y nunca logueadas.
 *
 * La URL y la API key son por agente (cada cliente tiene su instancia), así que
 * no hay un host global para overridear como en Airtable: para probar contra un
 * simulador se apunta la URL del agente al simulador.
 */

const TIMEOUT_MS = 10_000;

export type MotivoErrorEvolution = "auth" | "instancia" | "red" | "desconocido";

export class ErrorEvolution extends Error {
  readonly motivo: MotivoErrorEvolution;

  constructor(motivo: MotivoErrorEvolution, mensaje: string) {
    super(mensaje);
    this.name = "ErrorEvolution";
    this.motivo = motivo;
  }

  /** Lo que se le muestra al dueño en el chat, sin tecnicismos. */
  get mensajeUsuario(): string {
    switch (this.motivo) {
      case "auth":
        return "No se pudo enviar: el equipo de Vibo tiene que revisar la conexión de WhatsApp de este agente.";
      case "instancia":
        return "No se pudo enviar: la instancia de WhatsApp de este agente no está conectada.";
      case "red":
      case "desconocido":
        return "No se pudo enviar. Probá de nuevo en un momento.";
    }
  }
}

type CredsEvolution = {
  baseUrl: string;
  apiKey: string;
  instancia: string;
};

async function credencialesDe(agenteId: string): Promise<CredsEvolution> {
  const agente = await prisma.agente.findUnique({
    where: { id: agenteId },
    select: {
      evolutionInstanceId: true,
      evolutionApiUrlEnc: true,
      evolutionApiKeyEnc: true,
    },
  });

  if (!agente) throw new ErrorEvolution("desconocido", `No existe el agente ${agenteId}`);

  try {
    return {
      baseUrl: descifrar(agente.evolutionApiUrlEnc).replace(/\/$/, ""),
      apiKey: descifrar(agente.evolutionApiKeyEnc),
      instancia: agente.evolutionInstanceId,
    };
  } catch {
    throw new ErrorEvolution(
      "auth",
      `No se pudieron descifrar las credenciales de Evolution del agente ${agenteId}`,
    );
  }
}

export type MensajeEnviado = { evolutionMsgId: string | null };

/**
 * Envía un texto por WhatsApp a través de Evolution API.
 *
 * Usa el endpoint `POST /message/sendText/{instancia}` de Evolution API v2, con
 * la API key en el header `apikey`. Devuelve el id del mensaje para trazabilidad
 * (se guarda en Mensaje.evolutionMsgId), o null si la respuesta no lo trae.
 */
export async function enviarTexto(
  agenteId: string,
  telefono: string,
  texto: string,
): Promise<MensajeEnviado> {
  const creds = await credencialesDe(agenteId);
  const url = `${creds.baseUrl}/message/sendText/${encodeURIComponent(creds.instancia)}`;

  const numero = normalizarNumero(telefono);
  if (!numero) {
    throw new ErrorEvolution(
      "desconocido",
      `Teléfono del contacto sin dígitos utilizables: ${JSON.stringify(telefono)}`,
    );
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: creds.apiKey,
      },
      body: JSON.stringify({ number: numero, text: texto }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const esTimeout = error instanceof Error && error.name === "TimeoutError";
    throw new ErrorEvolution(
      "red",
      esTimeout ? `Evolution no respondió en ${TIMEOUT_MS}ms` : "Falló la conexión con Evolution",
    );
  }

  if (!respuesta.ok) {
    const detalle = (await respuesta.text().catch(() => "")).slice(0, 200);
    const motivo: MotivoErrorEvolution =
      respuesta.status === 401 || respuesta.status === 403
        ? "auth"
        : respuesta.status === 404
          ? "instancia"
          : "desconocido";
    throw new ErrorEvolution(motivo, `Evolution respondió ${respuesta.status}: ${detalle}`);
  }

  const json = (await respuesta.json().catch(() => null)) as {
    key?: { id?: string };
  } | null;

  return { evolutionMsgId: json?.key?.id ?? null };
}
