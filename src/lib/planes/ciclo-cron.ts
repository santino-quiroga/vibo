import "server-only";

import { cicloDe } from "@/lib/ciclo";
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
 * No toca las sedes en PAUSADO_MANUAL: el enum es de un solo valor, así que una
 * pausada a mano no está en PAUSADO_LIMITE y no entra en esta consulta.
 *
 * Es idempotente: correrlo dos veces el mismo día no cambia nada la segunda vez.
 */

export type ResultadoReconciliacion = {
  clientesRevisados: number;
  sedesReactivadas: number;
};

export async function reconciliarLimites(): Promise<ResultadoReconciliacion> {
  const ciclo = cicloDe();

  // Clientes con al menos una sede pausada por límite: son los únicos candidatos.
  const clientesConPausa = await prisma.agente.findMany({
    where: { estado: "PAUSADO_LIMITE" },
    select: { clienteId: true },
    distinct: ["clienteId"],
  });

  let sedesReactivadas = 0;

  for (const { clienteId } of clientesConPausa) {
    const [cliente, suma] = await Promise.all([
      prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { plan: { select: { maxConversacionesMes: true } } },
      }),
      prisma.usoMensual.aggregate({
        where: { agente: { clienteId }, cicloInicio: ciclo.inicio },
        _sum: { conversacionesCount: true },
      }),
    ]);

    if (!cliente) continue;

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
