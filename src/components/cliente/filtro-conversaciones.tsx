import { Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FiltroEstado } from "@/lib/cliente/conversaciones";
import { cn } from "@/lib/utils";

/**
 * Filtros de la bandeja (requerimientos punto 9): estado y búsqueda.
 *
 * El estado son chips-link, igual que el período de Inicio: un click, un
 * cambio, y el filtro queda en la URL para compartir o volver con el botón
 * atrás. La búsqueda sigue siendo un form GET porque escribir necesita un
 * submit — y así funciona sin JS, que el punto 12 pide para el uso desde el
 * celular.
 *
 * La sede se elige en el header y vale para todo el panel, así que acá no está.
 */

const ESTADOS: Array<{ valor: FiltroEstado; etiqueta: string }> = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "no_leidas", etiqueta: "No leídas" },
  { valor: "ia_respondiendo", etiqueta: "IA respondiendo" },
  { valor: "requiere_humano", etiqueta: "Requieren atención" },
];

export function FiltroConversaciones({
  sedeActual,
  estadoActual,
  busquedaActual,
}: {
  sedeActual: string | null;
  estadoActual: FiltroEstado;
  busquedaActual: string;
}) {
  function href(estado: FiltroEstado): string {
    const params = new URLSearchParams();
    if (sedeActual) params.set("sede", sedeActual);
    if (busquedaActual) params.set("q", busquedaActual);
    if (estado !== "todas") params.set("estado", estado);
    const query = params.toString();
    return query
      ? `/dashboard/conversaciones?${query}`
      : "/dashboard/conversaciones";
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div
        role="group"
        aria-label="Estado"
        className="bg-card inline-flex flex-wrap items-center gap-1 rounded-[12px] border border-neutral-200 p-1"
      >
        {ESTADOS.map((e) => {
          const activo = e.valor === estadoActual;

          return (
            <Link
              key={e.valor}
              href={href(e.valor)}
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
              {e.etiqueta}
            </Link>
          );
        })}
      </div>

      <form
        method="GET"
        action="/dashboard/conversaciones"
        className="flex items-center gap-2"
      >
        {/* El estado y la sede viajan escondidos: buscar no tiene que resetear
            el filtro que el dueño ya venía usando. */}
        {sedeActual && <input type="hidden" name="sede" value={sedeActual} />}
        {estadoActual !== "todas" && (
          <input type="hidden" name="estado" value={estadoActual} />
        )}

        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-neutral-400"
            strokeWidth={1.75}
          />
          <Input
            name="q"
            type="search"
            aria-label="Buscar contacto"
            defaultValue={busquedaActual}
            placeholder="Buscar por nombre o teléfono"
            className="w-full pl-10 sm:w-72"
          />
        </div>

        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
    </div>
  );
}
