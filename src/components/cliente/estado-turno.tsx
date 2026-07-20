import type { EstadoReserva } from "@/lib/airtable/campos";
import { cn } from "@/lib/utils";

/**
 * El estado de un turno: los del single select de Airtable (punto 8.1).
 *
 * Píldoras de fondo suave y texto del mismo tono, con la paleta semántica del
 * sistema. El rojo de marca no aparece acá: está reservado para la identidad,
 * y un turno confirmado no es una alerta.
 *
 *  - Confirmada        -> verde. Vendido y cerrado.
 *  - Pendiente de seña -> ámbar. Tomado pero sin pagar: algo falta.
 *  - Cancelada         -> apagado y tachado. Se muestra igual, porque que el
 *                         dueño vea qué se cayó es información — pero no compite
 *                         con lo que sí está en pie.
 *
 * El cuarto caso es el que no está en el punto 8.1: un valor que Airtable
 * devuelve y no conocemos. No se esconde ni se hace pasar por otro; se dice que
 * no se entiende, porque significa que alguien tocó el esquema y los KPIs de
 * Inicio no lo están contando.
 */

const ESTADOS = {
  CONFIRMADA: { texto: "Confirmada", clase: "bg-exito-suave text-exito" },
  PENDIENTE_SENIA: {
    texto: "Pendiente de seña",
    clase: "bg-warning-suave text-warning",
  },
  CANCELADA: {
    texto: "Cancelada",
    clase: "bg-neutral-100 text-neutral-400 line-through",
  },
} as const satisfies Record<EstadoReserva, { texto: string; clase: string }>;

// Un estado fuera del esquema sí es una alerta: va con el color de peligro.
const DESCONOCIDO = {
  texto: "Estado desconocido",
  clase: "bg-destructive/8 text-destructive",
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
