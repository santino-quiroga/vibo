import "server-only";

import { enviarAvisoPago } from "@/lib/email";
import { prisma } from "@/lib/prisma";

/**
 * Cobranza diaria (SDD v2 §4.4), sumada al cron que ya existía para los ciclos.
 *
 * Hace dos cosas, en este orden:
 *  1. A los clientes en gracia les manda el recordatorio del medio, una sola vez.
 *  2. A los que se les venció la gracia, los pasa a VENCIDO y **pausa todos sus
 *     agentes** (PAUSADO_POR_PAGO), avisando por email.
 *
 * Es idempotente: correrlo dos veces el mismo día no vuelve a pausar ni a
 * mandar el mismo aviso, gracias a `ultimoAvisoPagoEn` y a que los estados ya
 * quedan movidos.
 */

/** Días de gracia. Configurable por entorno, como pide el §4.4 (no hardcodeado). */
export function diasDeGracia(): number {
  const crudo = Number(process.env.GRACE_PERIOD_DIAS);
  return Number.isFinite(crudo) && crudo > 0 ? Math.floor(crudo) : 7;
}

const DIA_MS = 24 * 60 * 60 * 1000;

export type ResultadoCobranza = {
  recordatoriosEnviados: number;
  clientesVencidos: number;
  agentesPausados: number;
};

/** Días enteros transcurridos desde una fecha. */
function diasDesde(fecha: Date, ahora: number): number {
  return Math.floor((ahora - fecha.getTime()) / DIA_MS);
}

export async function procesarCobranza(ahora = Date.now()): Promise<ResultadoCobranza> {
  const gracia = diasDeGracia();
  const resultado: ResultadoCobranza = {
    recordatoriosEnviados: 0,
    clientesVencidos: 0,
    agentesPausados: 0,
  };

  const enGracia = await prisma.cliente.findMany({
    where: { estadoPago: "EN_GRACIA", graciaDesde: { not: null } },
    select: {
      id: true,
      graciaDesde: true,
      ultimoAvisoPagoEn: true,
      // Se avisa al dueño del complejo, que es el CLIENTE_OWNER de esa cuenta.
      usuarios: {
        where: { rol: "CLIENTE_OWNER" },
        select: { email: true },
        take: 1,
      },
    },
  });

  for (const cliente of enGracia) {
    if (!cliente.graciaDesde) continue;

    const transcurridos = diasDesde(cliente.graciaDesde, ahora);
    const email = cliente.usuarios[0]?.email;

    // --- Venció la gracia: se corta el servicio ---
    if (transcurridos >= gracia) {
      const pausados = await prisma.$transaction(async (tx) => {
        await tx.cliente.update({
          where: { id: cliente.id },
          data: { estadoPago: "VENCIDO", ultimoAvisoPagoEn: new Date(ahora) },
        });

        // Se pausa TODO lo que estaba atendiendo. No se tocan las sedes que ya
        // estaban pausadas por otro motivo: cuando se pague, se reactiva lo que
        // esta pausa apagó y no lo que el cliente había apagado a propósito.
        const r = await tx.agente.updateMany({
          where: {
            clienteId: cliente.id,
            estado: { in: ["ACTIVO", "PAUSADO_LIMITE"] },
          },
          data: { estado: "PAUSADO_POR_PAGO" },
        });
        return r.count;
      });

      resultado.clientesVencidos++;
      resultado.agentesPausados += pausados;

      if (email) await enviarAvisoPago(email, "servicio_pausado", 0);
      continue;
    }

    // --- A mitad de la gracia: recordatorio, una sola vez ---
    const mitad = Math.floor(gracia / 2);
    const yaAvisado =
      cliente.ultimoAvisoPagoEn !== null &&
      cliente.ultimoAvisoPagoEn.getTime() > cliente.graciaDesde.getTime();

    if (transcurridos >= mitad && !yaAvisado && email) {
      const enviado = await enviarAvisoPago(
        email,
        "gracia_recordatorio",
        gracia - transcurridos,
      );
      if (enviado) {
        await prisma.cliente.update({
          where: { id: cliente.id },
          data: { ultimoAvisoPagoEn: new Date(ahora) },
        });
        resultado.recordatoriosEnviados++;
      }
    }
  }

  return resultado;
}
