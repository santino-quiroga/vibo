import { z } from "zod";

/**
 * Parseo y validación pura de la config de canchas (sin acceso a la base).
 *
 * Vive separado de `canchas.ts` a propósito: `canchas.ts` es `server-only` y
 * toca Prisma, así que no se puede importar desde un test unitario. Todo lo que
 * es validación de forma —horarios, franjas de precio, solapes— vive acá y se
 * testea directo. La escritura (`reemplazarCanchas`) queda del otro lado.
 */

// HH:MM de un horario válido del día (00:00–23:59).
const RE_HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;
// Igual, pero el fin de una franja admite "24:00" = medianoche (fin exclusivo).
const RE_HORARIO_FIN = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

/** "18:30" → 1110. "24:00" → 1440. Asume formato ya validado. */
export function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

const tramoSchema = z.object({
  desde: z.string().trim().regex(RE_HORARIO, "La franja arranca en HH:MM (ej. 18:00)"),
  hasta: z
    .string()
    .trim()
    .regex(RE_HORARIO_FIN, "La franja termina en HH:MM (ej. 22:00, o 24:00 para medianoche)"),
  precio: z.coerce
    .number()
    .min(0, "El precio de la franja no puede ser negativo")
    .max(99_999_999, "Precio de franja demasiado alto"),
});

export type TramoParseado = z.infer<typeof tramoSchema>;

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
  // Opcional: sin descripción no pasa nada. Se recorta y se guarda null si quedó
  // vacía, para no ensuciar la base con espacios.
  descripcion: z.string().trim().max(2000, "La descripción es demasiado larga").optional(),
});

export type CanchaParseada = Omit<z.infer<typeof canchaSchema>, "descripcion"> & {
  descripcion: string | null;
  tramos: TramoParseado[];
};

export type ResultadoCanchas = { error: string } | { canchas: CanchaParseada[] };

/**
 * Valida los tramos de UNA cancha: cada uno bien formado, con desde < hasta, y
 * sin solaparse entre sí. Devuelve los tramos parseados o un mensaje de error.
 *
 * Que no se solapen es lo que hace que el precio de un horario sea determinista:
 * como mucho un tramo contiene a cada instante, así que no hay ambigüedad sobre
 * cuánto cotizar. Las franjas NO cruzan la medianoche (una franja de madrugada
 * va como 00:00–02:00); mantenerlas dentro del día evita el enredo de rangos
 * que dan la vuelta.
 */
function parsearTramosDeCancha(
  crudos: unknown,
  etiqueta: string,
): { error: string } | { tramos: TramoParseado[] } {
  if (!Array.isArray(crudos)) return { tramos: [] };

  const tramos: TramoParseado[] = [];
  for (const crudo of crudos) {
    const parsed = tramoSchema.safeParse(crudo);
    if (!parsed.success) {
      return { error: `${etiqueta}: ${parsed.error.issues[0].message}` };
    }
    if (aMinutos(parsed.data.desde) >= aMinutos(parsed.data.hasta)) {
      return { error: `${etiqueta}: el fin de la franja tiene que ser posterior al inicio` };
    }
    tramos.push(parsed.data);
  }

  // Solape: ordeno por inicio y verifico que cada uno arranque después de que
  // terminó el anterior.
  const ordenados = [...tramos].sort((a, b) => aMinutos(a.desde) - aMinutos(b.desde));
  for (let i = 1; i < ordenados.length; i++) {
    if (aMinutos(ordenados[i].desde) < aMinutos(ordenados[i - 1].hasta)) {
      return { error: `${etiqueta}: hay franjas horarias que se pisan` };
    }
  }

  return { tramos };
}

/** Lee las filas paralelas del form, valida cada una y chequea consistencia. */
export function parsearCanchasDeForm(formData: FormData): ResultadoCanchas {
  const numeros = formData.getAll("numero");
  const precios = formData.getAll("precio");
  const duraciones = formData.getAll("duracionTurnoMin");
  const aperturas = formData.getAll("horarioApertura");
  const cierres = formData.getAll("horarioCierre");
  const descripciones = formData.getAll("descripcion");
  // Los tramos de cada cancha viajan como un JSON por fila (paralelo a las demás
  // columnas), porque son una cantidad variable y no entran en el patrón de
  // arrays planos de FormData.
  const tramosJson = formData.getAll("tramos");

  const canchas: CanchaParseada[] = [];

  for (let i = 0; i < numeros.length; i++) {
    const parsed = canchaSchema.safeParse({
      numero: numeros[i],
      precio: precios[i],
      duracionTurnoMin: duraciones[i],
      horarioApertura: aperturas[i],
      horarioCierre: cierres[i],
      descripcion: descripciones[i],
    });

    if (!parsed.success) {
      return { error: `Cancha ${i + 1}: ${parsed.error.issues[0].message}` };
    }

    // El horario de cierre puede ser MENOR al de apertura: significa que la
    // cancha cierra pasada la medianoche (ej. abre 18:00, cierra 02:00). Lo
    // único inadmisible es que sean iguales, que dejaría un día de largo cero.
    if (parsed.data.horarioApertura === parsed.data.horarioCierre) {
      return {
        error: `Cancha ${parsed.data.numero}: el horario de cierre no puede ser igual al de apertura`,
      };
    }

    let tramosCrudos: unknown = [];
    const bruto = tramosJson[i];
    if (typeof bruto === "string" && bruto.trim() !== "") {
      try {
        tramosCrudos = JSON.parse(bruto);
      } catch {
        return { error: `Cancha ${parsed.data.numero}: no se pudieron leer las franjas de precio` };
      }
    }

    const tramos = parsearTramosDeCancha(tramosCrudos, `Cancha ${parsed.data.numero}`);
    if ("error" in tramos) return tramos;

    canchas.push({
      ...parsed.data,
      descripcion: parsed.data.descripcion?.trim() ? parsed.data.descripcion.trim() : null,
      tramos: tramos.tramos,
    });
  }

  const numerosVistos = new Set(canchas.map((c) => c.numero));
  if (numerosVistos.size !== canchas.length) {
    return { error: "Hay dos canchas con el mismo número" };
  }

  return { canchas };
}

/**
 * El precio que corresponde a un turno que arranca a `horaInicioMin` minutos
 * desde la medianoche, dada la cancha (precio base) y sus tramos.
 *
 * Si el inicio cae dentro de algún tramo (desde ≤ inicio < hasta), se cobra el
 * precio del tramo; si no, el precio base. Los tramos no se solapan, así que la
 * respuesta es única. `horaInicioMin` null (turno sin hora legible) → precio base.
 */
export function precioParaHora(
  base: number,
  tramos: Array<{ desde: string; hasta: string; precio: number }>,
  horaInicioMin: number | null,
): number {
  if (horaInicioMin === null) return base;
  for (const t of tramos) {
    if (horaInicioMin >= aMinutos(t.desde) && horaInicioMin < aMinutos(t.hasta)) {
      return t.precio;
    }
  }
  return base;
}
