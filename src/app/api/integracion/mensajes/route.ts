import { NextResponse } from "next/server";
import { z } from "zod";

import { autenticarAgente, cupoPorIp, ipDeRequest } from "@/lib/integracion/auth";
import { registrarMensaje } from "@/lib/integracion/mensajes";
import { registrarConsumoYEvaluar } from "@/lib/planes/consumo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/integracion/mensajes
 *
 * n8n loguea acá cada mensaje: el entrante del contacto (CONTACTO) y la
 * respuesta de la IA una vez enviada (IA), según SDD 4.3.
 *
 * Solo se aceptan CONTACTO e IA. HUMANO no entra por acá: ese lo crea la acción
 * de envío manual del dueño, del lado del panel, no n8n.
 *
 * Un mensaje CONTACTO además consume el pozo del plan (sprint 5): se cuenta una
 * vez por conversación nueva del ciclo y, si se agota el pozo del cliente, pausa
 * sus sedes. La respuesta de la IA no consume.
 */
const cuerpoSchema = z.object({
  agenteId: z.string().min(1),
  telefono: z.string().trim().min(1, "Falta el teléfono del contacto"),
  remitente: z.enum(["CONTACTO", "IA"]),
  contenido: z.string().min(1, "El contenido no puede estar vacío"),
  contactoNombre: z.string().trim().optional(),
  evolutionMsgId: z.string().trim().optional(),
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
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const datos = parsed.data;

  // El token ya identifica al agente; el del cuerpo tiene que coincidir. Sin
  // esto, un token válido podría escribirle mensajes a otro agente.
  if (datos.agenteId !== auth.agente.id) {
    return NextResponse.json(
      { error: "El token no corresponde a este agente" },
      { status: 403 },
    );
  }

  const resultado = await registrarMensaje({
    agenteId: auth.agente.id,
    telefono: datos.telefono,
    remitente: datos.remitente,
    contenido: datos.contenido,
    contactoNombre: datos.contactoNombre ?? null,
    evolutionMsgId: datos.evolutionMsgId ?? null,
  });

  // Solo los mensajes del contacto consumen el pozo del plan (sprint 5). La
  // respuesta de la IA no cuenta: se mide por conversación, no por mensaje.
  let consumo: Awaited<ReturnType<typeof registrarConsumoYEvaluar>> | undefined;
  if (datos.remitente === "CONTACTO") {
    consumo = await registrarConsumoYEvaluar(auth.agente.id, resultado.conversacionId);
  }

  return NextResponse.json(
    {
      ok: true,
      conversacionId: resultado.conversacionId,
      // n8n lo manda de vuelta en /mensajes/decidir para saber si esta ejecución
      // es la que responde por el lote de la ventana de escucha (SDD v2 §11).
      mensajeId: resultado.mensajeId,
      estado: resultado.estado,
      // Se le devuelve a n8n el estado del pozo: útil para loguear, y avisa si a
      // partir de este mensaje el cliente quedó bloqueado.
      ...(consumo ? { uso: { usadas: consumo.usadas, limite: consumo.limite, bloqueado: consumo.bloqueado } } : {}),
    },
    { status: 201 },
  );
}
