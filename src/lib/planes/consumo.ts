import "server-only";

import { cicloDeCliente } from "@/lib/ciclo";
import { prisma } from "@/lib/prisma";

/**
 * Conteo de uso y bloqueo por límite de plan (sprint 5).
 *
 * El tope de conversaciones/mes es del PLAN, o sea del cliente: es un pozo
 * compartido entre todas sus sedes (decidido con el usuario). Se cuenta "una vez
 * por conversación nueva en el ciclo" (SDD 4.3) y se evalúa en cada mensaje
 * entrante, no en un job periódico (requerimientos 4.2): si no, el bot podría
 * seguir respondiendo pasado el límite hasta el próximo chequeo.
 *
 * Las filas de UsoMensual se mantienen por agente (para poder atribuir qué sede
 * consume más), pero el límite se mide sumando el ciclo actual de todas las
 * sedes del cliente.
 */

export type ResultadoConsumo = {
  /** Si este mensaje contó como conversación nueva del ciclo. */
  contada: boolean;
  /** Consumo del pozo del cliente en el ciclo, tras contar. */
  usadas: number;
  limite: number;
  /** Si el cliente quedó bloqueado (pozo agotado) a partir de este mensaje. */
  bloqueado: boolean;
};

/**
 * Registra el consumo de un mensaje entrante y evalúa el límite del plan.
 *
 * Se llama solo para mensajes del contacto (CONTACTO), después de registrarlos.
 * Todo va en una transacción:
 *
 *  1. Compare-and-set sobre `contadaEnCiclo`: marca la conversación como contada
 *     para este ciclo, y solo cuenta si el sello cambió. Esto es lo que hace que
 *     dos mensajes del mismo contacto casi simultáneos no cuenten doble.
 *  2. Incrementa el UsoMensual del agente para el ciclo.
 *  3. Suma el pozo del cliente. Si llegó al tope, pausa todas las sedes ACTIVAS
 *     del cliente (no toca las pausadas a mano) y sella el momento del bloqueo.
 */
export async function registrarConsumoYEvaluar(
  agenteId: string,
  conversacionId: string,
): Promise<ResultadoConsumo> {
  return prisma.$transaction(async (tx) => {
    // Se resuelve el cliente ANTES del conteo: el ciclo se ancla a su día de
    // cobro (requerimiento de testing), así que hace falta su `cicloDiaAnclaje`
    // para saber a qué pozo se cuenta. Sin cliente, no se cuenta contra nada.
    const agente = await tx.agente.findUnique({
      where: { id: agenteId },
      select: {
        clienteId: true,
        cliente: {
          select: {
            cicloDiaAnclaje: true,
            plan: { select: { maxConversacionesMes: true } },
          },
        },
      },
    });
    if (!agente) {
      // No debería pasar: el token ya resolvió a un agente. Si pasa, no se
      // cuenta contra ningún pozo.
      return { contada: false, usadas: 0, limite: 0, bloqueado: false };
    }

    const clienteId = agente.clienteId;
    const limite = agente.cliente.plan.maxConversacionesMes;
    const ciclo = cicloDeCliente(agente.cliente.cicloDiaAnclaje);

    // 1. CAS: solo cuenta si esta conversación no fue contada ya en este ciclo.
    const cas = await tx.conversacion.updateMany({
      where: {
        id: conversacionId,
        OR: [{ contadaEnCiclo: null }, { contadaEnCiclo: { not: ciclo.inicio } }],
      },
      data: { contadaEnCiclo: ciclo.inicio },
    });
    const contada = cas.count === 1;

    if (contada) {
      // 2. Incrementa el uso del agente para el ciclo (crea la fila si es la
      //    primera conversación del ciclo para esa sede).
      await tx.usoMensual.upsert({
        where: { agenteId_cicloInicio: { agenteId, cicloInicio: ciclo.inicio } },
        create: {
          agenteId,
          cicloInicio: ciclo.inicio,
          cicloFin: ciclo.fin,
          conversacionesCount: 1,
        },
        update: { conversacionesCount: { increment: 1 } },
      });
    }

    // 3. Pozo del cliente en el ciclo.
    const suma = await tx.usoMensual.aggregate({
      where: { agente: { clienteId }, cicloInicio: ciclo.inicio },
      _sum: { conversacionesCount: true },
    });
    const usadas = suma._sum.conversacionesCount ?? 0;

    let bloqueado = false;
    if (usadas >= limite) {
      // Pausa todas las sedes activas del cliente. Las pausadas a mano no se
      // tocan (el enum es de un solo valor, así que no colisionan).
      const pausadas = await tx.agente.updateMany({
        where: { clienteId, estado: "ACTIVO" },
        data: { estado: "PAUSADO_LIMITE" },
      });
      bloqueado = pausadas.count > 0;

      // Sella el momento del bloqueo en las filas del ciclo que aún no lo tenían.
      await tx.usoMensual.updateMany({
        where: { agente: { clienteId }, cicloInicio: ciclo.inicio, limiteAlcanzadoEn: null },
        data: { limiteAlcanzadoEn: new Date() },
      });
    }

    return { contada, usadas, limite, bloqueado };
  });
}
