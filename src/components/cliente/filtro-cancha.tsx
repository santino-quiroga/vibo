import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Filtro por cancha (requerimientos §8: "filtrable por sede/agente y por
 * cancha"). Lo usan tanto la vista Reservas como el calendario operativo.
 *
 * Si no hay al menos dos canchas el filtro no se dibuja: con una sola no hay
 * nada que elegir.
 *
 * De qué canchas se ofrecen decide el que llama, porque las dos vistas tienen
 * criterios distintos: en Reservas salen de los turnos del período (filtrar por
 * una cancha sin turnos sólo daría una lista vacía), y en el calendario salen
 * de los horarios de la sede, para que la opción no desaparezca al pasar a una
 * semana donde esa cancha todavía no vendió nada.
 */
export function FiltroCancha({
  canchas,
  canchaActual,
  accion,
  sedeActual,
  extras,
}: {
  canchas: string[];
  canchaActual: string | null;
  /** La ruta a la que apuntan los chips (la página actual). */
  accion: string;
  sedeActual?: string | null;
  /** Otros filtros de la página que hay que conservar (rango, vista, fecha). */
  extras?: Record<string, string | null | undefined>;
}) {
  if (canchas.length < 2) return null;

  function href(cancha: string | null): string {
    const params = new URLSearchParams();
    if (sedeActual) params.set("sede", sedeActual);
    for (const [clave, valor] of Object.entries(extras ?? {})) {
      if (valor) params.set(clave, valor);
    }
    if (cancha) params.set("cancha", cancha);
    return `${accion}?${params.toString()}`;
  }

  const opciones: Array<{ valor: string | null; etiqueta: string }> = [
    { valor: null, etiqueta: "Todas las canchas" },
    ...canchas.map((c) => ({ valor: c, etiqueta: c })),
  ];

  return (
    <div
      role="group"
      aria-label="Cancha"
      className="bg-card inline-flex flex-wrap items-center gap-1 rounded-[12px] border border-neutral-200 p-1"
    >
      {opciones.map((opcion) => {
        const activo = opcion.valor === canchaActual;
        return (
          <Link
            key={opcion.valor ?? "todas"}
            href={href(opcion.valor)}
            aria-current={activo ? "true" : undefined}
            className={cn(
              "rounded-[9px] px-3.5 py-1.5 text-[13px] font-medium",
              "transition-[background-color,color] duration-150 ease-out",
              "focus-visible:ring-vibo-rojo/40 focus-visible:ring-2 focus-visible:outline-none",
              activo
                ? "bg-neutral-100 text-foreground"
                : "hover:text-foreground text-neutral-500",
            )}
          >
            {opcion.etiqueta}
          </Link>
        );
      })}
    </div>
  );
}
