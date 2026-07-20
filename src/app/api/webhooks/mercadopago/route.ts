import { NextResponse } from "next/server";

import { validarFirmaMercadoPago } from "@/lib/pagos/firma";
import { aplicarPago, traerPago } from "@/lib/pagos/mercadopago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/mercadopago — resultado de un cobro (SDD v2 §4.3).
 *
 * Es un endpoint **público**: lo llama Mercado Pago, no un usuario logueado ni
 * n8n, así que no puede pedir sesión ni token propio. Lo único que separa una
 * notificación real de una inventada es la firma (§9) — por eso se valida
 * ANTES de mirar el cuerpo, y si no valida no se procesa nada.
 *
 * Sobre los códigos de respuesta: Mercado Pago reintenta ante cualquier cosa
 * que no sea 2xx. Entonces
 *   - firma inválida → 401, y que no reintente: no va a mejorar.
 *   - no se pudo consultar el pago → 500, para que SÍ reintente: puede ser un
 *     corte momentáneo de su API y perder el aviso sería perder un cobro.
 *   - procesado (incluso duplicado o no aplicable) → 200, así deja de insistir.
 */
export async function POST(request: Request) {
  const secreto = process.env.MERCADOPAGO_WEBHOOK_SECRET;

  if (!secreto) {
    // Sin secreto no hay forma de distinguir una notificación real de una
    // falsa. Se rechaza en vez de procesar a ciegas: aceptar sin validar
    // significaría que cualquiera se pone al día posteando a esta URL.
    console.error("[mp] falta MERCADOPAGO_WEBHOOK_SECRET: se rechaza la notificación");
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 503 });
  }

  let cuerpo: {
    type?: string;
    action?: string;
    data?: { id?: string | number };
  };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const url = new URL(request.url);
  // El id puede venir en el cuerpo o como query param, según el tipo de aviso.
  const dataId = String(cuerpo.data?.id ?? url.searchParams.get("data.id") ?? "") || null;

  const firma = validarFirmaMercadoPago({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId,
    secreto,
  });

  if (!firma.valido) {
    // El motivo va al log, no a la respuesta: a quien prueba firmas no se le
    // dice en qué se equivocó.
    console.warn(`[mp] firma rechazada: ${firma.motivo}`);
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  // Sólo interesan las notificaciones de pago. El resto se acepta y se ignora,
  // para que Mercado Pago no reintente algo que nunca vamos a procesar.
  const tipo = cuerpo.type ?? "";
  if (tipo !== "payment") {
    return NextResponse.json({ ok: true, ignorado: tipo || "sin tipo" });
  }

  if (!dataId) {
    return NextResponse.json({ ok: true, ignorado: "sin data.id" });
  }

  // La notificación sólo trae el id: el detalle se consulta a la API de MP. Es
  // también la segunda barrera — el pago tiene que existir de verdad allá.
  const pago = await traerPago(dataId);
  if (!pago) {
    // Puede ser un corte momentáneo de su API: 500 para que reintente.
    return NextResponse.json({ error: "No se pudo consultar el pago" }, { status: 500 });
  }

  const resultado = await aplicarPago(pago);

  if (!resultado.aplicado) {
    // No se pudo atribuir a ningún cliente. Se responde 200 igual —reintentar
    // no lo va a arreglar— pero queda logueado para revisarlo a mano.
    console.error(`[mp] pago ${pago.id} sin aplicar: ${resultado.motivo}`);
    return NextResponse.json({ ok: true, aplicado: false, motivo: resultado.motivo });
  }

  return NextResponse.json({
    ok: true,
    aplicado: true,
    estado: resultado.estado,
    duplicado: resultado.duplicado,
  });
}
