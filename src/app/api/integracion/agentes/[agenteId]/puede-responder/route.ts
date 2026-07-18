import { NextResponse } from "next/server";

import { autenticarAgente, cupoPorIp, ipDeRequest } from "@/lib/integracion/auth";
import { evaluarPuedeResponder } from "@/lib/integracion/mensajes";

// Estas rutas tocan la base con el driver de Node; no corren en el edge.
export const runtime = "nodejs";
// Nunca se cachea: la respuesta depende del estado del agente en este instante.
export const dynamic = "force-dynamic";

/**
 * GET /api/integracion/agentes/:agenteId/puede-responder
 *
 * Lo llama el workflow de n8n antes de generar una respuesta (SDD 4.3). Si
 * devuelve `puedeResponder: false`, n8n corta y no contesta.
 *
 * Query opcional `?telefono=` para chequear si ESE chat puntual está en manual;
 * sin él, se evalúa solo el estado del agente entero.
 *
 * Contrato de fallo (SDD 4.4): si esto falla, n8n hace fail-open — el bot sigue
 * respondiendo. Es preferible una conversación de más que cortarle la venta al
 * cliente por una falla nuestra. Por eso, si algo se rompe acá, devolvemos 500 y
 * es n8n quien decide seguir; no mentimos con un `puedeResponder: true`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ agenteId: string }> },
) {
  if (!cupoPorIp(ipDeRequest(request))) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const auth = await autenticarAgente(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { agenteId } = await params;

  // El token ya identifica al agente. Que además coincida con el de la URL es
  // defensa en profundidad: un token válido no puede preguntar por otro agente.
  if (agenteId !== auth.agente.id) {
    return NextResponse.json(
      { error: "El token no corresponde a este agente" },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const telefono = url.searchParams.get("telefono");

  const resultado = await evaluarPuedeResponder(auth.agente, telefono);
  return NextResponse.json(resultado);
}
