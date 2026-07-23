import { NextResponse } from "next/server";
import { z } from "zod";

import { autenticarAgente, cupoPorIp, ipDeRequest } from "@/lib/integracion/auth";
import { decidirRespuestaVentana } from "@/lib/integracion/mensajes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/integracion/mensajes/decidir
 *
 * Ventana de escucha (SDD v2 §11). n8n llama acá DESPUÉS del nodo Wait (~9s),
 * pasando el `mensajeId` que devolvió el log del CONTACTO. Vibo responde si esta
 * ejecución es la del último mensaje del lote y, en ese caso, el texto de todos
 * los mensajes del contacto agrupados para pasárselos juntos al LLM.
 *
 * Si `responder` es false, n8n corta: otra ejecución (la del mensaje posterior)
 * responderá por todo el lote, o la conversación quedó en manual.
 *
 * **Importante para n8n:** este nodo va SIN retry. Un reintento podría devolver
 * `responder: true` una segunda vez y duplicar la respuesta — el diseño no lleva
 * un claim persistente para no meter esquema donde no hace falta (§11).
 */
const cuerpoSchema = z.object({
  agenteId: z.string().min(1),
  telefono: z.string().trim().min(1, "Falta el teléfono del contacto"),
  mensajeId: z.string().trim().min(1, "Falta el mensajeId"),
});

export async function POST(request: Request) {
  if (!cupoPorIp(ipDeRequest(request))) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const auth = await autenticarAgente(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo tiene que ser JSON" }, { status: 400 });
  }

  const parsed = cuerpoSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const datos = parsed.data;

  // El token ya identifica al agente; el del cuerpo tiene que coincidir. Misma
  // defensa que en /mensajes: un token válido no decide por otro agente.
  if (datos.agenteId !== auth.agente.id) {
    return NextResponse.json(
      { error: "El token no corresponde a este agente" },
      { status: 403 },
    );
  }

  const decision = await decidirRespuestaVentana(
    auth.agente.id,
    datos.telefono,
    datos.mensajeId,
  );

  return NextResponse.json(decision);
}
