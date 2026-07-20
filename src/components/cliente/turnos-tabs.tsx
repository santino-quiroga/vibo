"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Sub-navegación de la sección Turnos (requerimientos §8.0): la vista de
 * Reservas ya existente y la nueva de Horarios disponibles.
 *
 * Conserva el querystring (sede/rango/cancha) al cambiar de pestaña, para no
 * perder el filtro elegido.
 */
const TABS = [
  { href: "/dashboard/turnos", etiqueta: "Reservas" },
  { href: "/dashboard/turnos/calendario", etiqueta: "Calendario" },
  { href: "/dashboard/turnos/horarios", etiqueta: "Horarios disponibles" },
];

export function TurnosTabs({ query = "" }: { query?: string }) {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b border-black/10">
      {TABS.map((tab) => {
        const actual = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={`${tab.href}${query}`}
            aria-current={actual ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2 text-sm transition-colors",
              actual
                ? "border-vibo-negro font-medium"
                : "border-transparent text-neutral-500 hover:text-foreground",
            )}
          >
            {tab.etiqueta}
          </Link>
        );
      })}
    </div>
  );
}
