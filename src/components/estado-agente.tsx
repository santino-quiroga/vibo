import type { EstadoAgente } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

/**
 * El estado de un agente: los tres casos del requerimiento 4.2, más
 * EN_CONFIGURACION del SDD v2 §2.
 *
 * Ese punto es explícito en que "Pausado — límite de plan" tiene que verse
 * distinto de "Pausado por vos": son situaciones opuestas. Una la eligió el
 * dueño; la otra significa que el bot dejó de vender y hay que hacer algo.
 *
 * La paleta de marca no tiene verde ni ámbar, así que la distinción no se apoya
 * en el semáforo habitual:
 *  - Activo          -> punto rojo de marca. El rojo es lo vivo de Vibo.
 *  - Pausado por vos -> neutral, apagado. Es un estado deliberado, no una alarma.
 *  - Límite de plan  -> acento #7A1024, el color de peligro del sistema.
 *
 * Además del color, cada estado dice literalmente lo que pasa: si alguien no
 * distingue los tonos, el texto no deja lugar a dudas.
 */

const ESTADOS = {
  // "En configuración" no es una alarma ni un estado andando: es un agente que
  // todavía no atiende a nadie. Va con borde y sin relleno para que se lea como
  // provisorio, distinto del negro sólido de uno que ya está trabajando.
  EN_CONFIGURACION: {
    texto: "En configuración",
    clase: "border border-neutral-400 bg-transparent text-neutral-600",
  },
  // El rojo queda reservado para las alertas: activo es un ticket negro (presente,
  // andando), pausado a mano es neutro, y solo el pausado por límite —que exige
  // acción— usa rojo.
  ACTIVO: { texto: "Activo", clase: "bg-vibo-negro text-vibo-blanco" },
  PAUSADO_MANUAL: {
    texto: "Pausado por el cliente",
    clase: "bg-neutral-200 text-neutral-600",
  },
  PAUSADO_LIMITE: {
    texto: "Pausado — límite de plan",
    clase: "bg-vibo-rojo text-vibo-blanco",
  },
  // Como el de límite, exige acción y va en rojo. Pero se nombra distinto a
  // propósito: "límite de plan" se arregla esperando al ciclo o subiendo de
  // plan, y esto se arregla pagando. Confundirlos manda al cliente a hacer lo
  // que no es.
  PAUSADO_POR_PAGO: {
    texto: "Pausado — falta de pago",
    clase: "bg-vibo-acento text-vibo-blanco",
  },
} as const satisfies Record<EstadoAgente, { texto: string; clase: string }>;

export function EstadoAgenteBadge({
  estado,
  className,
}: {
  estado: EstadoAgente;
  className?: string;
}) {
  const { texto, clase } = ESTADOS[estado];
  return <span className={cn("ticket shrink-0", clase, className)}>{texto}</span>;
}
