import "server-only";

import type { CanchaParseada } from "@/lib/canchas-validacion";
import { prisma } from "@/lib/prisma";

/**
 * Escritura de la config de canchas.
 *
 * La validación pura (parseo del form, horarios, franjas de precio) vive en
 * `canchas-validacion.ts`, sin `server-only` ni Prisma, para poder testearla
 * sola. Acá queda solo lo que toca la base. Se re-exporta el parseo para que
 * los llamadores sigan importando todo desde `@/lib/canchas`.
 */

export {
  aMinutos,
  parsearCanchasDeForm,
  precioParaHora,
  type CanchaParseada,
  type TramoParseado,
  type ResultadoCanchas,
} from "@/lib/canchas-validacion";

/**
 * Reemplaza todas las canchas de un agente en una transacción.
 *
 * Es seguro borrar y recrear porque lo único que apunta a Cancha son sus propios
 * tramos, que caen por cascade. Se recrean cancha + tramos juntos. El que llama
 * ya validó que el agente es suyo.
 */
export async function reemplazarCanchas(
  agenteId: string,
  canchas: CanchaParseada[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Borrar la cancha arrastra sus tramos por onDelete: Cascade.
    await tx.cancha.deleteMany({ where: { agenteId } });
    for (const c of canchas) {
      await tx.cancha.create({
        data: {
          agenteId,
          numero: c.numero,
          precio: c.precio,
          duracionTurnoMin: c.duracionTurnoMin,
          horarioApertura: c.horarioApertura,
          horarioCierre: c.horarioCierre,
          descripcion: c.descripcion,
          tramos: {
            create: c.tramos.map((t) => ({
              desde: t.desde,
              hasta: t.hasta,
              precio: t.precio,
            })),
          },
        },
      });
    }
  });
}
