import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/prisma";

/**
 * Parseo, validación y escritura de la config de canchas.
 *
 * Vive acá, compartido, porque lo usan dos acciones distintas: el admin
 * (`guardarCanchasAction`) y el panel cliente (`guardarCanchasClienteAction`).
 * Tener la validación en un solo lugar evita que las dos superficies acepten
 * cosas distintas.
 */

const RE_HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

const canchaSchema = z.object({
  numero: z.coerce
    .number()
    .int("El número de cancha tiene que ser entero")
    .min(1, "El número de cancha arranca en 1")
    .max(99, "Número de cancha demasiado alto"),
  // Decimal en la base (no float): plata en float acumula error de redondeo, y
  // esto multiplica por cantidad de turnos.
  precio: z.coerce
    .number()
    .min(0, "El precio no puede ser negativo")
    .max(99_999_999, "Precio demasiado alto"),
  duracionTurnoMin: z.coerce
    .number()
    .int()
    .min(15, "La duración mínima es 15 minutos")
    .max(300, "La duración máxima es 300 minutos"),
  horarioApertura: z.string().trim().regex(RE_HORARIO, "El horario va como HH:MM (ej. 08:00)"),
  horarioCierre: z.string().trim().regex(RE_HORARIO, "El horario va como HH:MM (ej. 23:00)"),
});

export type CanchaParseada = z.infer<typeof canchaSchema>;

export type ResultadoCanchas =
  | { error: string }
  | { canchas: CanchaParseada[] };

/** Lee las filas paralelas del form, valida cada una y chequea consistencia. */
export function parsearCanchasDeForm(formData: FormData): ResultadoCanchas {
  const numeros = formData.getAll("numero");
  const precios = formData.getAll("precio");
  const duraciones = formData.getAll("duracionTurnoMin");
  const aperturas = formData.getAll("horarioApertura");
  const cierres = formData.getAll("horarioCierre");

  const canchas: CanchaParseada[] = [];

  for (let i = 0; i < numeros.length; i++) {
    const parsed = canchaSchema.safeParse({
      numero: numeros[i],
      precio: precios[i],
      duracionTurnoMin: duraciones[i],
      horarioApertura: aperturas[i],
      horarioCierre: cierres[i],
    });

    if (!parsed.success) {
      return { error: `Cancha ${i + 1}: ${parsed.error.issues[0].message}` };
    }

    if (parsed.data.horarioApertura >= parsed.data.horarioCierre) {
      // Comparar "08:00" < "23:00" como strings funciona por el formato fijo con
      // ceros a la izquierda. No contempla cierres pasada la medianoche; si
      // aparece un complejo así, hay que replantear el campo.
      return {
        error: `Cancha ${parsed.data.numero}: el horario de cierre tiene que ser posterior al de apertura`,
      };
    }

    canchas.push(parsed.data);
  }

  const numerosVistos = new Set(canchas.map((c) => c.numero));
  if (numerosVistos.size !== canchas.length) {
    return { error: "Hay dos canchas con el mismo número" };
  }

  return { canchas };
}

/**
 * Reemplaza todas las canchas de un agente en una transacción.
 *
 * Es seguro borrar y recrear porque ninguna otra tabla apunta a Cancha: no hay
 * nada que quede huérfano. Si algún día algo la referencia, esto tiene que pasar
 * a upsert + delete selectivo. El que llama ya validó que el agente es suyo.
 */
export async function reemplazarCanchas(
  agenteId: string,
  canchas: CanchaParseada[],
): Promise<void> {
  await prisma.$transaction([
    prisma.cancha.deleteMany({ where: { agenteId } }),
    prisma.cancha.createMany({ data: canchas.map((c) => ({ ...c, agenteId })) }),
  ]);
}
