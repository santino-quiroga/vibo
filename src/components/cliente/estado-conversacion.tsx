import type { EstadoConversacion } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

/**
 * Estado de una conversación (requerimientos punto 9, filtro por estado).
 *
 * Solo se muestran los dos estados que le dicen algo al dueño sobre qué hacer:
 * "requiere atención" (tomó el control y hay algo sin responder) y "la IA está
 * respondiendo". ABIERTA y CERRADA no llevan etiqueta: son el reposo, y marcarlo
 * sería ruido en una bandeja que puede tener muchas filas.
 *
 * Sin verde ni ámbar, igual que el resto: el rojo de peligro (#7A1024) marca lo
 * que necesita al humano; el rojo de marca, lo que está andando solo.
 */

const ESTADOS: Partial<Record<EstadoConversacion, { texto: string; clase: string }>> = {
  // Rojo solo para lo que reclama al humano; la IA trabajando es un ticket neutro.
  REQUIERE_ATENCION_HUMANA: {
    texto: "Requiere atención",
    clase: "bg-vibo-rojo text-vibo-blanco",
  },
  IA_RESPONDIENDO: {
    texto: "IA respondiendo",
    clase: "bg-vibo-negro text-vibo-blanco",
  },
};

export function EstadoConversacionBadge({
  estado,
  className,
}: {
  estado: EstadoConversacion;
  className?: string;
}) {
  const config = ESTADOS[estado];
  if (!config) return null;

  return <span className={cn("ticket shrink-0", config.clase, className)}>{config.texto}</span>;
}
