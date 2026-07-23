/**
 * Núcleo puro de la ventana de escucha (SDD v2 §11).
 *
 * Vive separado de `mensajes.ts` (que importa `server-only` y toca la base) para
 * poder testear la regla —quién responde y cómo se agrupa el texto— sin base de
 * datos. Acá no hay nada de Prisma ni de red: sólo la decisión, dada la lista.
 */

export type DecisionVentana = {
  responder: boolean;
  /** Los CONTACTO del lote unidos por "\n". Vacío si no corresponde responder. */
  textoAgrupado: string;
  motivo: string | null;
};

/**
 * Dado el lote pendiente ya ordenado ascendente por (createdAt, id) y el
 * `mensajeId` de esta ejecución, dice si responde y con qué texto.
 *
 * Responde sólo si `mensajeId` es el último del lote (su máximo bajo el orden
 * total). Cualquier otro mensaje ya ve a un posterior y se para: así exactamente
 * una ejecución contesta, y lo hace por todos los mensajes juntos.
 */
export function resolverDecisionVentana(
  lote: Array<{ id: string; contenido: string }>,
  mensajeId: string,
): DecisionVentana {
  const ultimo = lote.at(-1);

  // No soy el máximo del lote → hay un mensaje posterior al mío; su ejecución
  // responderá por todos. Me paro para no duplicar.
  if (!ultimo || ultimo.id !== mensajeId) {
    return { responder: false, textoAgrupado: "", motivo: "mensaje_superado" };
  }

  return {
    responder: true,
    textoAgrupado: lote.map((m) => m.contenido).join("\n"),
    motivo: null,
  };
}
