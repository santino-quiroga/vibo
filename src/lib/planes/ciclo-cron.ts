import "server-only";

import { cicloDeCliente } from "@/lib/ciclo";
import { prisma } from "@/lib/prisma";

/**
 * Reconciliación de límites, para el cron diario (SDD 9.5).
 *
 * Reactiva las sedes en PAUSADO_LIMITE cuyo pozo del ciclo ACTUAL volvió a estar
 * por debajo del tope. Esto cubre de una sola vez los dos casos del 9.5:
 *
 *  - Arranca un mes nuevo → ciclo nuevo → el pozo del ciclo actual está en 0 →
 *    por debajo del tope → se reactiva. (El "cerrar/abrir ciclo" es implícito:
 *    el conteo es por cicloInicio, así que el mes nuevo estrena filas solo.)
 *  - Se subió el plan a mitad de mes → el tope creció → si el pozo quedó por
 *    debajo, se reactiva sin esperar al mes siguiente.
 *
 * No toca las sedes en PAUSADO_MANUAL ni en PAUSADO_POR_PAGO: el enum es de un
 * solo valor, así que una pausada por esos motivos no está en PAUSADO_LIMITE y
 * no entra en esta consulta.
 *
 * Lo de PAUSADO_POR_PAGO es importante y no un detalle: si el cambio de ciclo
 * reactivara a un cliente que no pagó, el corte por falta de pago se levantaría
 * solo el día 1 de cada mes. Eso se resuelve cobrando, no esperando.
 *
 * Es idempotente: correrlo dos veces el mismo día no cambia nada la segunda vez.
 */

export type ResultadoReconciliacion = {
  clientesRevisados: number;
  sedesReactivadas: number;
};

export async function reconciliarLimites(): Promise<ResultadoReconciliacion> {
  // Clientes con al menos una sede pausada por límite: son los únicos candidatos.
  const clientesConPausa = await prisma.agente.findMany({
    where: { estado: "PAUSADO_LIMITE" },
    select: { clienteId: true },
    distinct: ["clienteId"],
  });

  let sedesReactivadas = 0;

  for (const { clienteId } of clientesConPausa) {
    // El ciclo es por cliente (anclado a su día de cobro), así que se resuelve su
    // anclaje antes de sumar el pozo. Un mes nuevo del cliente estrena filas en 0
    // → por debajo del tope → se reactiva.
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { cicloDiaAnclaje: true, plan: { select: { maxConversacionesMes: true } } },
    });
    if (!cliente) continue;

    const ciclo = cicloDeCliente(cliente.cicloDiaAnclaje);
    const suma = await prisma.usoMensual.aggregate({
      where: { agente: { clienteId }, cicloInicio: ciclo.inicio },
      _sum: { conversacionesCount: true },
    });

    const usadas = suma._sum.conversacionesCount ?? 0;
    if (usadas < cliente.plan.maxConversacionesMes) {
      const reactivadas = await prisma.agente.updateMany({
        where: { clienteId, estado: "PAUSADO_LIMITE" },
        data: { estado: "ACTIVO" },
      });
      sedesReactivadas += reactivadas.count;
    }
  }

  return { clientesRevisados: clientesConPausa.length, sedesReactivadas };
}
