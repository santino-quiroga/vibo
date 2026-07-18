"use client";

import { Bot, CalendarDays, LayoutDashboard, MessageSquare } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

/** Las 4 secciones del punto 5, cada una con su ícono de trazo fino. */
const SECCIONES: Array<{
  href: string;
  etiqueta: string;
  activa: boolean;
  Icono: ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  { href: "/dashboard", etiqueta: "Inicio", activa: true, Icono: LayoutDashboard },
  { href: "/dashboard/agentes", etiqueta: "Agentes", activa: true, Icono: Bot },
  { href: "/dashboard/turnos", etiqueta: "Turnos", activa: true, Icono: CalendarDays },
  {
    href: "/dashboard/conversaciones",
    etiqueta: "Conversaciones",
    activa: true,
    Icono: MessageSquare,
  },
];

export function NavLateral({ sinLeer = 0 }: { sinLeer?: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Secciones"
      // Riel limpio sobre el fondo de la app. En mobile es una fila que
      // scrollea; en desktop, la columna izquierda del punto 5.
      className="-mx-4 shrink-0 overflow-x-auto px-4 md:mx-0 md:w-48 md:overflow-visible md:px-0"
    >
      <ul className="flex gap-1 md:flex-col md:gap-0.5">
        {SECCIONES.map((seccion) => {
          // Activa en la ruta exacta y en sus sub-rutas (ej. el detalle de un
          // agente o la sub-vista de horarios). "/dashboard" se compara exacto
          // porque es prefijo de todas las demás.
          const actual =
            pathname === seccion.href ||
            (seccion.href !== "/dashboard" && pathname.startsWith(`${seccion.href}/`));

          const Icono = seccion.Icono;

          if (!seccion.activa) {
            return (
              <li key={seccion.href}>
                <span className="flex items-center gap-2.5 border-l-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-neutral-400">
                  <Icono className="size-4 shrink-0 text-neutral-300" strokeWidth={2} />
                  {seccion.etiqueta}
                  <span className="etiqueta text-[10px] text-neutral-400">pronto</span>
                </span>
              </li>
            );
          }

          const mostrarSinLeer =
            seccion.href === "/dashboard/conversaciones" && sinLeer > 0;

          return (
            <li key={seccion.href}>
              <Link
                href={seccion.href}
                aria-current={actual ? "page" : undefined}
                className={cn(
                  // El indicador activo es una fina línea roja a la izquierda y
                  // el ícono en rojo — los únicos usos del rojo acá. El resto,
                  // texto neutro que se oscurece al pasar por encima.
                  "group/nav flex items-center gap-2.5 border-l-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  actual
                    ? "border-vibo-rojo text-vibo-negro font-semibold"
                    : "border-transparent text-neutral-500 hover:text-vibo-negro",
                )}
              >
                <Icono
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    actual ? "text-vibo-rojo" : "text-neutral-400 group-hover/nav:text-vibo-negro",
                  )}
                  strokeWidth={2}
                />
                {seccion.etiqueta}
                {mostrarSinLeer && (
                  <span
                    className="bg-vibo-rojo text-vibo-blanco inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums"
                    aria-label={`${sinLeer} sin leer`}
                  >
                    {sinLeer > 99 ? "99+" : sinLeer}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
