import type { EstadoReserva } from "@/lib/airtable/campos";
import { cn } from "@/lib/utils";

/**
 * El estado de un turno: los tres del single select de Airtable (punto 8.1).
 *
 * Sigue la misma lógica que EstadoAgenteBadge: la paleta de marca no tiene
 * verde ni ámbar, así que ningún estado se apoya en el semáforo. El texto dice
 * literalmente qué pasa, y el color acompaña.
 *
 *  - Confirmada        -> punto rojo de marca. Es lo vendido, lo vivo.
 *  - Pendiente de seña -> neutral con borde marcado. No está cerrado todavía.
 *  - Cancelada         -> apagado y tachado. Se muestra igual: que el dueño vea
 *                         qué se cayó es información, no ruido — pero no compite
 *                         con lo que sí está en pie.
 *
 * El cuarto caso es el que no está en el punto 8.1: un valor que Airtable
 * devuelve y no conocemos. No se esconde ni se hace pasar por otro; se dice que
 * no se entiende, porque significa que alguien tocó el esquema y los KPIs de
 * Inicio no lo están contando.
 */

const ESTADOS = {
  CONFIRMADA: { texto: "Confirmada", clase: "bg-vibo-negro text-vibo-blanco" },
  PENDIENTE_SENIA: {
    texto: "Pendiente de seña",
    clase: "bg-neutral-200 text-neutral-700",
  },
  // Cancelada recede: apagado y tachado, no compite con lo que sí está en pie.
  CANCELADA: {
    texto: "Cancelada",
    clase: "bg-neutral-100 text-neutral-400 line-through",
  },
} as const satisfies Record<EstadoReserva, { texto: string; clase: string }>;

// Un estado que no está en el esquema es una alerta: va en rojo.
const DESCONOCIDO = {
  texto: "Estado desconocido",
  clase: "bg-vibo-rojo text-vibo-blanco",
};

export function EstadoTurno({
  estado,
  className,
}: {
  estado: EstadoReserva | null;
  className?: string;
}) {
  const { texto, clase } = estado ? ESTADOS[estado] : DESCONOCIDO;

  return (
    <span
      className={cn("ticket shrink-0", clase, className)}
      title={
        estado === null
          ? "Airtable devolvió un estado que Vibo no reconoce. Este turno no se está contando en los totales."
          : undefined
      }
    >
      {texto}
    </span>
  );
}
