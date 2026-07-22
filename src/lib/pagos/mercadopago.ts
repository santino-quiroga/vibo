import "server-only";

import type { EstadoPagoRegistro } from "@/generated/prisma/enums";
import { diaDelMesAR } from "@/lib/ciclo";
import { enviarAvisoPago } from "@/lib/email";
import { diasDeGracia } from "@/lib/pagos/cobranza-cron";
import { prisma } from "@/lib/prisma";

/**
 * Procesamiento de notificaciones de Mercado Pago (SDD v2 §4.3).
 *
 * Vibo **no** arma el checkout ni ve datos de tarjeta: la suscripción la genera
 * Vibo a mano en Mercado Pago y le pasa el link al cliente por fuera de la
 * plataforma. Acá sólo se refleja el resultado.
 *
 * La notificación de MP no trae el detalle del pago, sólo un id: hay que ir a
 * buscarlo a su API. Eso además es una segunda barrera — aunque alguien lograra
 * falsificar la firma, el pago tiene que existir del lado de Mercado Pago.
 */

const API_MP = process.env.MERCADOPAGO_API_URL ?? "https://api.mercadopago.com";

export type PagoMercadoPago = {
  id: string;
  estado: EstadoPagoRegistro;
  monto: number;
  fecha: Date;
  /** El id de la suscripción, para saber a qué cliente corresponde. */
  suscripcionId: string | null;
  /** El email del pagador, como último recurso para identificar al cliente. */
  emailPagador: string | null;
};

/** Traduce el status de MP al enum propio. */
function traducirEstado(status: string): EstadoPagoRegistro {
  if (status === "approved") return "APROBADO";
  if (status === "pending" || status === "in_process" || status === "authorized") {
    return "PENDIENTE";
  }
  // rejected, cancelled, refunded, charged_back: para el efecto que nos importa
  // (¿está al día?), todos son "no entró la plata".
  return "RECHAZADO";
}

/**
 * Trae el pago desde la API de Mercado Pago.
 *
 * Devuelve null si no se pudo consultar: el que llama tiene que decidir, y en
 * este caso decide NO cambiar nada. Marcar a alguien como moroso —o al día— por
 * una consulta fallida sería peor que no hacer nada.
 */
export async function traerPago(pagoId: string): Promise<PagoMercadoPago | null> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    console.error("[mp] falta MERCADOPAGO_ACCESS_TOKEN");
    return null;
  }

  try {
    const respuesta = await fetch(`${API_MP}/v1/payments/${encodeURIComponent(pagoId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    if (!respuesta.ok) {
      console.error(`[mp] consultar pago ${pagoId}: ${respuesta.status}`);
      return null;
    }

    const d = (await respuesta.json()) as {
      id?: number | string;
      status?: string;
      transaction_amount?: number;
      date_approved?: string;
      date_created?: string;
      metadata?: { preapproval_id?: string };
      payer?: { email?: string };
      point_of_interaction?: { transaction_data?: { subscription_id?: string } };
    };

    return {
      id: String(d.id ?? pagoId),
      estado: traducirEstado(d.status ?? ""),
      monto: typeof d.transaction_amount === "number" ? d.transaction_amount : 0,
      fecha: new Date(d.date_approved ?? d.date_created ?? Date.now()),
      suscripcionId:
        d.metadata?.preapproval_id ??
        d.point_of_interaction?.transaction_data?.subscription_id ??
        null,
      emailPagador: d.payer?.email ?? null,
    };
  } catch (error) {
    console.error(`[mp] fallo consultando el pago ${pagoId}:`, error);
    return null;
  }
}

/**
 * Encuentra al cliente dueño de un pago.
 *
 * Primero por el id de suscripción, que es el vínculo explícito. Si no está, se
 * intenta por el email del pagador — pero **sólo** si ese email identifica a un
 * único cliente: con dos coincidencias es preferible no adivinar y dejar el pago
 * sin aplicar para revisarlo a mano.
 */
export async function clienteDelPago(
  pago: PagoMercadoPago,
): Promise<{ id: string } | null> {
  if (pago.suscripcionId) {
    const porSuscripcion = await prisma.cliente.findFirst({
      where: { mercadoPagoSubscriptionId: pago.suscripcionId },
      select: { id: true },
    });
    if (porSuscripcion) return porSuscripcion;
  }

  if (pago.emailPagador) {
    const porEmail = await prisma.cliente.findMany({
      where: { usuarios: { some: { email: pago.emailPagador } } },
      select: { id: true },
      take: 2,
    });
    if (porEmail.length === 1) return porEmail[0];
  }

  return null;
}

export type ResultadoProceso =
  | { aplicado: true; clienteId: string; estado: EstadoPagoRegistro; duplicado: boolean }
  | { aplicado: false; motivo: string };

/**
 * Aplica un pago al cliente: registra el `Pago` y mueve su `estadoPago`.
 *
 * Idempotente por `mpPaymentId` único: Mercado Pago reintenta la misma
 * notificación varias veces, y sin eso cada reintento crearía otro pago y
 * ensuciaría el historial que ve el cliente.
 */
export async function aplicarPago(pago: PagoMercadoPago): Promise<ResultadoProceso> {
  const cliente = await clienteDelPago(pago);
  if (!cliente) {
    return { aplicado: false, motivo: "no se pudo identificar al cliente" };
  }

  const yaEstaba = await prisma.pago.findUnique({
    where: { mpPaymentId: pago.id },
    select: { id: true },
  });

  if (yaEstaba) {
    // Reintento de MP sobre algo ya procesado: no se vuelve a aplicar.
    return { aplicado: true, clienteId: cliente.id, estado: pago.estado, duplicado: true };
  }

  // Se marca si esta llamada es la que ARRANCA la gracia, para mandar el aviso
  // una sola vez. El envío va después de la transacción: un email lento o caído
  // no puede dejar el registro del pago a medio escribir.
  let arrancoGracia = false;

  await prisma.$transaction(async (tx) => {
    await tx.pago.create({
      data: {
        clienteId: cliente.id,
        monto: pago.monto,
        fecha: pago.fecha,
        estado: pago.estado,
        origen: "MERCADOPAGO",
        mpPaymentId: pago.id,
      },
    });

    if (pago.estado === "APROBADO") {
      // Al día, y se corre el próximo cobro un mes. Se limpian los sellos de
      // gracia: si venía en gracia, este pago la cierra.
      const proximo = new Date(pago.fecha);
      proximo.setMonth(proximo.getMonth() + 1);

      await tx.cliente.update({
        where: { id: cliente.id },
        data: {
          estadoPago: "AL_DIA",
          fechaProximoCobro: proximo,
          // El pozo de conversaciones renueva el día del cobro, no el 1°
          // calendario (requerimiento de testing): se ancla al día del pago.
          cicloDiaAnclaje: diaDelMesAR(pago.fecha),
          graciaDesde: null,
          ultimoAvisoPagoEn: null,
        },
      });

      // Un pago que llega después del corte reactiva las sedes que se habían
      // pausado por deuda. No toca las pausadas por límite ni a mano: esas son
      // otra cosa y el cliente no pidió levantarlas.
      await tx.agente.updateMany({
        where: { clienteId: cliente.id, estado: "PAUSADO_POR_PAGO" },
        data: { estado: "ACTIVO" },
      });
    } else if (pago.estado === "RECHAZADO") {
      // Arranca la gracia sólo si no estaba ya corriendo: si no, cada rechazo
      // reiniciaría el reloj y la deuda no vencería nunca.
      const actual = await tx.cliente.findUnique({
        where: { id: cliente.id },
        select: { estadoPago: true, graciaDesde: true },
      });

      if (actual?.estadoPago !== "VENCIDO") {
        arrancoGracia = actual?.estadoPago !== "EN_GRACIA";
        await tx.cliente.update({
          where: { id: cliente.id },
          data: {
            estadoPago: "EN_GRACIA",
            graciaDesde: actual?.graciaDesde ?? pago.fecha,
          },
        });
      }
    }
    // PENDIENTE no mueve el estado: todavía no se sabe si entró la plata.
  });

  if (arrancoGracia) {
    // Primero de los 3 emails del §4.5. Sin esto, el cliente se entera de que
    // le falló el pago recién cuando el bot dejó de responder.
    const owner = await prisma.usuario.findFirst({
      where: { clienteId: cliente.id, rol: "CLIENTE_OWNER" },
      select: { email: true },
    });
    if (owner) await enviarAvisoPago(owner.email, "gracia_inicio", diasDeGracia());
  }

  return { aplicado: true, clienteId: cliente.id, estado: pago.estado, duplicado: false };
}
