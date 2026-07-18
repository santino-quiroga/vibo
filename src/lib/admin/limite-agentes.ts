import "server-only";

import type { Prisma } from "@/generated/prisma/client";

/**
 * La regla del límite de agentes, en un solo lugar.
 *
 * Requerimientos 4.2: el límite es duro y también aplica al admin ("ni vos desde
 * el admin, salvo upgrade de plan"). Se evalúa en tres momentos —al pintar el
 * badge del listado, al abrir el alta, y dentro de la transacción que crea— y
 * los tres tienen que coincidir. Si la regla cambia (por ejemplo, contar solo
 * agentes activos), se cambia acá y no en tres archivos.
 */
export function limiteAlcanzado(agentes: number, maxAgentes: number): boolean {
  return agentes >= maxAgentes;
}

/** Si `agentes` cabe en un plan de `maxAgentes`. Usado al bajar de plan. */
export function planAdmite(agentes: number, maxAgentes: number): boolean {
  return agentes <= maxAgentes;
}

/**
 * Cuenta los agentes de un cliente y su tope, leyendo dentro de la transacción
 * que se le pase. Recibir el `tx` es el punto: el conteo y la escritura que
 * decide en base a él tienen que ver la misma foto de la base.
 */
export async function leerCupoAgentes(
  tx: Prisma.TransactionClient,
  clienteId: string,
) {
  const cliente = await tx.cliente.findUnique({
    where: { id: clienteId },
    select: {
      plan: { select: { maxAgentes: true, nombre: true } },
      _count: { select: { agentes: true } },
    },
  });

  if (!cliente) return null;

  return {
    usados: cliente._count.agentes,
    maximo: cliente.plan.maxAgentes,
    plan: cliente.plan.nombre,
    alcanzado: limiteAlcanzado(cliente._count.agentes, cliente.plan.maxAgentes),
  };
}
