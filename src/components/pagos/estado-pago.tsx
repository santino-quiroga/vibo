import type { EstadoPago } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

/**
 * El estado de facturación de un cliente (SDD v2 §4).
 *
 * Los cuatro dicen literalmente qué significan, porque son estados que derivan
 * en cortar o no cortar el servicio, y confundirlos cuesta plata de los dos
 * lados. "Sin suscripción" no es una alarma —es un cliente al que todavía no se
 * le generó el cobro— y por eso va neutro, no en rojo.
 */
const ESTADOS = {
  SIN_SUSCRIPCION: {
    texto: "Sin suscripción",
    clase: "border border-neutral-400 bg-transparent text-neutral-600",
  },
  AL_DIA: { texto: "Al día", clase: "bg-vibo-negro text-vibo-blanco" },
  EN_GRACIA: { texto: "Pago pendiente", clase: "bg-warning text-vibo-blanco" },
  VENCIDO: { texto: "Vencido", clase: "bg-vibo-acento text-vibo-blanco" },
} as const satisfies Record<EstadoPago, { texto: string; clase: string }>;

export function EstadoPagoBadge({
  estado,
  className,
}: {
  estado: EstadoPago;
  className?: string;
}) {
  const { texto, clase } = ESTADOS[estado];
  return <span className={cn("ticket shrink-0", clase, className)}>{texto}</span>;
}
