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
 * El rojo de marca marca lo que reclama al humano — es uno de los pocos usos
 * permitidos como indicador importante. La IA trabajando es informativo, así
 * que va en azul: es un estado normal del sistema, no algo que atender.
 */

const ESTADOS: Partial<Record<EstadoConversacion, { texto: string; clase: string }>> = {
  REQUIERE_ATENCION_HUMANA: {
    texto: "Requiere atención",
    clase: "bg-vibo-rojo-suave text-vibo-rojo",
  },
  IA_RESPONDIENDO: {
    texto: "IA respondiendo",
    clase: "bg-info-suave text-info",
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
