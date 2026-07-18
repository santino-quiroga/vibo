import "server-only";

import { cache } from "react";

import { cicloDe, etiquetaCiclo } from "@/lib/ciclo";
import { prisma } from "@/lib/prisma";

/**
 * Lectura del uso del plan (sprint 5), para los widgets de Inicio y del admin.
 *
 * Mismo criterio que el conteo: el pozo es del cliente, sumando el ciclo actual
 * de todas sus sedes. Ver [[consumo]] para el lado de escritura.
 */

/** Umbral del aviso preventivo (requerimientos 4.2): avisar antes del bloqueo. */
export const UMBRAL_AVISO = 0.8;

export type UsoPlan = {
  usadas: number;
  limite: number;
  /** 0..1 (puede pasar de 1 si se contó de más antes de pausar). */
  porcentaje: number;
  cicloEtiqueta: string;
  /** Alguna sede del cliente está pausada por límite. */
  bloqueado: boolean;
  /** Cuántas sedes están en PAUSADO_LIMITE ahora. */
  sedesPausadasPorLimite: number;
  /** true si conviene mostrar el aviso preventivo (>= umbral y sin bloquear aún). */
  avisoPreventivo: boolean;
};

export const usoDelCliente = cache(async (clienteId: string): Promise<UsoPlan> => {
  const ciclo = cicloDe();

  const [cliente, suma, pausadas] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { plan: { select: { maxConversacionesMes: true } } },
    }),
    prisma.usoMensual.aggregate({
      where: { agente: { clienteId }, cicloInicio: ciclo.inicio },
      _sum: { conversacionesCount: true },
    }),
    prisma.agente.count({ where: { clienteId, estado: "PAUSADO_LIMITE" } }),
  ]);

  const limite = cliente?.plan.maxConversacionesMes ?? 0;
  const usadas = suma._sum.conversacionesCount ?? 0;
  const porcentaje = limite > 0 ? usadas / limite : 0;

  return {
    usadas,
    limite,
    porcentaje,
    cicloEtiqueta: etiquetaCiclo(ciclo),
    bloqueado: pausadas > 0,
    sedesPausadasPorLimite: pausadas,
    avisoPreventivo: pausadas === 0 && porcentaje >= UMBRAL_AVISO,
  };
});

/**
 * Reactiva las sedes de un cliente pausadas por límite (acción del admin).
 *
 * El caso de uso (requerimientos 4.2) es un upgrade de plan a mitad de mes: se
 * sube el tope y se reactiva. Si el pozo sigue agotado (reactivación sin
 * upgrade), la próxima conversación nueva vuelve a pausar — por eso el admin ve
 * el uso actual antes de decidir. Devuelve cuántas sedes reactivó.
 */
export async function reactivarClientePorLimite(clienteId: string): Promise<number> {
  const resultado = await prisma.agente.updateMany({
    where: { clienteId, estado: "PAUSADO_LIMITE" },
    data: { estado: "ACTIVO" },
  });
  return resultado.count;
}
