import { NextResponse } from "next/server";

import { construirContexto } from "@/lib/integracion/contexto";
import { autenticarAgente, cupoPorIp, ipDeRequest } from "@/lib/integracion/auth";

// Toca la base con el driver de Node; no corre en el edge.
export const runtime = "nodejs";
// Nunca se cachea del lado de Vibo: la respuesta depende del estado del agente
// en este instante. El cacheo lo hace n8n, y a propósito (ver abajo).
export const dynamic = "force-dynamic";

/**
 * GET /api/integracion/agentes/:agenteId/contexto
 *
 * El endpoint único del SDD v2 §1. n8n lo llama **antes de generar cada
 * respuesta** y arma el system prompt con lo que devuelve, en vez de tener el
 * prompt, los precios y las reglas pegados adentro del workflow.
 *
 * Query opcional `?telefono=` para que además evalúe si ESE chat puntual está
 * en manual, igual que el endpoint de v1.
 *
 * **Fail-open con cache (v2 §1, extendiendo el SDD v1 §4.4):** si esto falla o
 * tarda, n8n NO debe cortar el servicio — tiene que seguir con la última
 * respuesta válida que cacheó. Por eso acá se devuelve un error honesto (500) y
 * nunca un `puedeResponder: true` inventado: la decisión de seguir es de n8n,
 * que sabe qué tenía cacheado; mentirle desde acá le sacaría esa decisión.
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

  // Defensa en profundidad: el token ya identifica al agente, pero además tiene
  // que coincidir con el de la URL. Un token válido no puede pedir el contexto
  // —prompt, precios, reglas— de otro agente (v2 §9).
  if (agenteId !== auth.agente.id) {
    return NextResponse.json(
      { error: "El token no corresponde a este agente" },
      { status: 403 },
    );
  }

  const telefono = new URL(request.url).searchParams.get("telefono");

  const contexto = await construirContexto(auth.agente, telefono);
  if (!contexto) {
    // El token resolvió a un agente que ya no está: no es un 500, es un 404.
    return NextResponse.json({ error: "Agente inexistente" }, { status: 404 });
  }

  return NextResponse.json(contexto);
}
