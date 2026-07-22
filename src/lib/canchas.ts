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

// Decimal en la base (no float): plata en float acumula error de redondeo, y
// esto multiplica por cantidad de turnos.
const precioSchema = z.coerce
  .number()
  .min(0, "El precio no puede ser negativo")
  .max(99_999_999, "Precio demasiado alto");

const franjaSchema = z.object({
  horaDesde: z.string().trim().regex(RE_HORARIO, "La franja va como HH:MM (ej. 08:00)"),
  horaHasta: z.string().trim().regex(RE_HORARIO, "La franja va como HH:MM (ej. 18:00)"),
  precio: precioSchema,
});

export type FranjaParseada = z.infer<typeof franjaSchema>;

const canchaSchema = z.object({
  numero: z.coerce
    .number()
    .int("El número de cancha tiene que ser entero")
    .min(1, "El número de cancha arranca en 1")
    .max(99, "Número de cancha demasiado alto"),
  precio: precioSchema,
  duracionTurnoMin: z.coerce
    .number()
    .int()
    .min(15, "La duración mínima es 15 minutos")
    .max(300, "La duración máxima es 300 minutos"),
  horarioApertura: z.string().trim().regex(RE_HORARIO, "El horario va como HH:MM (ej. 08:00)"),
  horarioCierre: z.string().trim().regex(RE_HORARIO, "El horario va como HH:MM (ej. 23:00)"),
});

export type CanchaParseada = z.infer<typeof canchaSchema> & {
  franjas: FranjaParseada[];
};

export type ResultadoCanchas =
  | { error: string }
  | { canchas: CanchaParseada[] };

/**
 * Valida las franjas de UNA cancha: dentro del horario, sin solaparse.
 *
 * El solapamiento se prohíbe a propósito: si dos franjas cubren la misma hora,
 * el precio del turno sería ambiguo y `precioEnFranja` tomaría "la primera",
 * que es un orden que el dueño no ve. Mejor rechazar y que lo aclare.
 */
function validarFranjas(
  cancha: z.infer<typeof canchaSchema>,
  crudas: unknown,
): { error: string } | { franjas: FranjaParseada[] } {
  const arr = Array.isArray(crudas) ? crudas : [];
  const franjas: FranjaParseada[] = [];

  for (const cruda of arr) {
    const parsed = franjaSchema.safeParse(cruda);
    if (!parsed.success) {
      return { error: `Cancha ${cancha.numero}: ${parsed.error.issues[0].message}` };
    }
    const f = parsed.data;
    if (f.horaDesde >= f.horaHasta) {
      return {
        error: `Cancha ${cancha.numero}: la franja ${f.horaDesde}–${f.horaHasta} termina antes de empezar`,
      };
    }
    if (f.horaDesde < cancha.horarioApertura || f.horaHasta > cancha.horarioCierre) {
      return {
        error: `Cancha ${cancha.numero}: la franja ${f.horaDesde}–${f.horaHasta} se sale del horario de la cancha`,
      };
    }
    franjas.push(f);
  }

  // Ordenadas por inicio, cada una tiene que empezar donde terminó la anterior
  // o después: si arranca antes, se pisan.
  const ordenadas = [...franjas].sort((a, b) => a.horaDesde.localeCompare(b.horaDesde));
  for (let i = 1; i < ordenadas.length; i++) {
    if (ordenadas[i].horaDesde < ordenadas[i - 1].horaHasta) {
      return {
        error: `Cancha ${cancha.numero}: las franjas ${ordenadas[i - 1].horaDesde}–${ordenadas[i - 1].horaHasta} y ${ordenadas[i].horaDesde}–${ordenadas[i].horaHasta} se superponen`,
      };
    }
  }

  return { franjas: ordenadas };
}

/** Parsea el JSON de franjas de una fila del form; array vacío si viene vacío o roto. */
function franjasCrudas(valor: FormDataEntryValue | undefined): unknown {
  if (typeof valor !== "string" || valor.trim() === "") return [];
  try {
    return JSON.parse(valor);
  } catch {
    return [];
  }
}

/** Lee las filas paralelas del form, valida cada una y chequea consistencia. */
export function parsearCanchasDeForm(formData: FormData): ResultadoCanchas {
  const numeros = formData.getAll("numero");
  const precios = formData.getAll("precio");
  const duraciones = formData.getAll("duracionTurnoMin");
  const aperturas = formData.getAll("horarioApertura");
  const cierres = formData.getAll("horarioCierre");
  const franjasPorFila = formData.getAll("franjas");

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

    const franjas = validarFranjas(parsed.data, franjasCrudas(franjasPorFila[i]));
    if ("error" in franjas) return { error: franjas.error };

    canchas.push({ ...parsed.data, franjas: franjas.franjas });
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
 * Borrar la cancha arrastra sus franjas (FK con onDelete: Cascade), así que no
 * quedan tarifas huérfanas. Se crea una por una —y no con createMany— porque las
 * franjas son una relación anidada que createMany no sabe escribir; un complejo
 * tiene un puñado de canchas, así que el costo es despreciable. El que llama ya
 * validó que el agente es suyo.
 */
export async function reemplazarCanchas(
  agenteId: string,
  canchas: CanchaParseada[],
): Promise<void> {
  await prisma.$transaction([
    prisma.cancha.deleteMany({ where: { agenteId } }),
    ...canchas.map(({ franjas, ...cancha }) =>
      prisma.cancha.create({
        data: {
          ...cancha,
          agenteId,
          franjas: {
            create: franjas.map((f) => ({
              horaDesde: f.horaDesde,
              horaHasta: f.horaHasta,
              precio: f.precio,
            })),
          },
        },
      }),
    ),
  ]);
}
