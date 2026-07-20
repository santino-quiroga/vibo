import Link from "next/link";

import { RANGOS, type ClaveRango } from "@/lib/periodos";
import { cn } from "@/lib/utils";

/**
 * El corte de período del punto 6, como chips.
 *
 * Son links y no un form con select: cada rango es una URL, así que el filtro
 * funciona sin JS, se puede compartir y el botón atrás hace lo que se espera.
 * Además saca el paso de "elegir y después Aplicar" — un click, un cambio.
 *
 * La sede ya no vive acá: pasó al header, que es donde el punto 5 la ubica y
 * donde vale para todas las secciones a la vez.
 */
export function BarraFiltros({
  rangoActual,
  accion,
  sedeActual,
  extras,
}: {
  rangoActual: ClaveRango;
  /** La ruta a la que apuntan los chips (la página actual). */
  accion: string;
  /** Se conserva en la URL para no perder la sede al cambiar de período. */
  sedeActual?: string | null;
  /**
   * Otros filtros de la página que también hay que conservar (ej. la cancha en
   * Turnos). Sin esto, cambiar de período resetea en silencio un filtro que el
   * usuario no tocó, y la lista cambia por dos motivos a la vez.
   */
  extras?: Record<string, string | null | undefined>;
}) {
  function href(rango: ClaveRango): string {
    const params = new URLSearchParams();
    if (sedeActual) params.set("sede", sedeActual);
    params.set("rango", rango);
    for (const [clave, valor] of Object.entries(extras ?? {})) {
      if (valor) params.set(clave, valor);
    }
    return `${accion}?${params.toString()}`;
  }

  return (
    <div
      role="group"
      aria-label="Período"
      className="bg-card inline-flex items-center gap-1 rounded-[12px] border border-neutral-200 p-1"
    >
      {RANGOS.map((rango) => {
        const activo = rango.clave === rangoActual;

        return (
          <Link
            key={rango.clave}
            href={href(rango.clave)}
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
            {rango.etiqueta}
          </Link>
        );
      })}
    </div>
  );
}
