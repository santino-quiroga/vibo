import { NextResponse } from "next/server";
import { z } from "zod";

import { autenticarAgente, cupoPorIp, ipDeRequest } from "@/lib/integracion/auth";
import { derivarAHumano } from "@/lib/integracion/derivacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/integracion/agentes/:agenteId/derivar
 *
 * La tool `derivar_a_humano` del AI Agent de n8n llama acá cuando el bot no
 * puede resolver (el cliente pide un humano, pedido fuera de alcance, error).
 * Marca la conversación como REQUIERE_ATENCION_HUMANA, la pasa a manual (el bot
 * deja de responderle a ese contacto) y, la primera vez, le avisa por WhatsApp
 * al dueño (SDD v2 §12).
 *
 * `motivo` es opcional y sólo informativo: NO se incluye en el aviso al dueño
 * (que lleva sólo sede + contacto + link), pero deja rastro de por qué derivó.
 */
const cuerpoSchema = z.object({
  telefono: z.string().trim().min(1, "Falta el teléfono del contacto"),
  motivo: z.string().trim().max(500).optional(),
});

export async function POST(
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

  // El token ya identifica al agente. Que coincida con el de la URL es defensa
  // en profundidad: un token válido no puede derivar chats de otro agente.
  if (agenteId !== auth.agente.id) {
    return NextResponse.json(
      { error: "El token no corresponde a este agente" },
      { status: 403 },
    );
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

  const resultado = await derivarAHumano(auth.agente.id, parsed.data.telefono);

  return NextResponse.json({ ok: true, ...resultado });
}
