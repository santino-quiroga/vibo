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
  Icono: ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  { href: "/dashboard", etiqueta: "Inicio", Icono: LayoutDashboard },
  { href: "/dashboard/agentes", etiqueta: "Agentes", Icono: Bot },
  { href: "/dashboard/turnos", etiqueta: "Turnos", Icono: CalendarDays },
  {
    href: "/dashboard/conversaciones",
    etiqueta: "Conversaciones",
    Icono: MessageSquare,
  },
];

export function NavLateral({ sinLeer = 0 }: { sinLeer?: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Secciones"
      // 240px en desktop: el ancho que permite padding horizontal generoso sin
      // apretar las etiquetas. En mobile es una fila que scrollea.
      className="-mx-4 shrink-0 overflow-x-auto px-4 md:mx-0 md:w-60 md:overflow-visible md:px-0"
    >
      <ul className="flex gap-1 md:flex-col md:gap-1">
        {SECCIONES.map((seccion) => {
          // Activa en la ruta exacta y en sus sub-rutas (el detalle de un
          // agente, la sub-vista de horarios). "/dashboard" se compara exacto
          // porque es prefijo de todas las demás.
          const actual =
            pathname === seccion.href ||
            (seccion.href !== "/dashboard" && pathname.startsWith(`${seccion.href}/`));

          const Icono = seccion.Icono;
          const mostrarSinLeer =
            seccion.href === "/dashboard/conversaciones" && sinLeer > 0;

          return (
            <li key={seccion.href}>
              <Link
                href={seccion.href}
                aria-current={actual ? "page" : undefined}
                className={cn(
                  "group/nav relative flex items-center gap-3 rounded-[10px] py-2.5 pr-4 pl-5 text-sm whitespace-nowrap",
                  "transition-[background-color,color] duration-150 ease-out",
                  "focus-visible:ring-vibo-rojo/40 focus-visible:ring-2 focus-visible:outline-none",
                  actual
                    ? "bg-vibo-rojo-suave text-foreground font-semibold"
                    : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700",
                )}
              >
                {/* La barra roja del activo: 3px, centrada. Va en un span
                    posicionado y no en border-left para que no empuje el
                    contenido al cambiar de ítem, y para poder animar el alto. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "bg-vibo-rojo absolute top-1/2 left-0 w-[3px] -translate-y-1/2 rounded-r-full",
                    "transition-[height] duration-150 ease-out",
                    actual ? "h-5" : "h-0",
                  )}
                />

                <Icono
                  className={cn(
                    "size-[18px] shrink-0 transition-colors duration-150",
                    actual
                      ? "text-vibo-rojo"
                      : "text-neutral-400 group-hover/nav:text-neutral-600",
                  )}
                  strokeWidth={1.75}
                />

                {seccion.etiqueta}

                {mostrarSinLeer && (
                  <span
                    className="bg-vibo-rojo ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white tabular-nums"
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
