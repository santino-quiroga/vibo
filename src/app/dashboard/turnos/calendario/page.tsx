import type { Metadata } from "next";
import Link from "next/link";

import { AvisoDegradado } from "@/components/cliente/aviso-degradado";
import { FiltroCancha } from "@/components/cliente/filtro-cancha";
import { GrillaCalendario } from "@/components/cliente/grilla-calendario";
import { TurnosTabs } from "@/components/cliente/turnos-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { formatearFechaCorta } from "@/lib/airtable/tipos";
import {
  datosDeCalendario,
  esVistaCalendario,
  resolverAlcance,
  type VistaCalendario,
} from "@/lib/cliente/datos";
import { requerirClienteOwner } from "@/lib/dal";
import { esFechaCalendario, hoyEnArgentina } from "@/lib/periodos";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendario | Vibo" };

/** Arma una URL de esta vista conservando lo que el usuario ya eligió. */
function href(params: {
  sede?: string;
  vista: VistaCalendario;
  fecha: string;
  cancha?: string | null;
}): string {
  const query = new URLSearchParams();
  if (params.sede) query.set("sede", params.sede);
  query.set("vista", params.vista);
  query.set("fecha", params.fecha);
  // La cancha viaja en todos los links de navegación: cambiar de semana o de
  // vista no tiene por qué resetear un filtro que el usuario no tocó.
  if (params.cancha) query.set("cancha", params.cancha);
  return `/dashboard/turnos/calendario?${query.toString()}`;
}

const claseNav =
  "inline-flex h-9 items-center rounded-[10px] border border-neutral-200 bg-card px-3 text-[13px] font-medium transition-colors duration-150 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-vibo-rojo/40 focus-visible:outline-none";

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{
    sede?: string;
    vista?: string;
    fecha?: string;
    cancha?: string;
  }>;
}) {
  await requerirClienteOwner();

  const params = await searchParams;
  const vista: VistaCalendario = esVistaCalendario(params.vista) ? params.vista : "semana";
  // Una fecha inválida en la URL cae en hoy, que es lo que el usuario quiere
  // ver el 99% de las veces, en vez de romper la pantalla.
  const ancla = esFechaCalendario(params.fecha) ? params.fecha : hoyEnArgentina();

  const [alcance, datos] = await Promise.all([
    resolverAlcance(params.sede),
    datosDeCalendario(vista, ancla, params.sede, params.cancha),
  ]);

  const sede = alcance.seleccionado?.id;
  const hoy = hoyEnArgentina();

  const rotulo =
    datos.vista === "dia"
      ? formatearFechaCorta(datos.dias[0])
      : `${formatearFechaCorta(datos.dias[0])} — ${formatearFechaCorta(datos.dias[6])}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-pagina">Turnos</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Quién juega, en qué cancha y a qué hora. La agenda del día para tener a
          mano en el mostrador.
        </p>
      </div>

      <TurnosTabs query={sede ? `?sede=${sede}` : ""} />

      {alcance.agentes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">Todavía no tenés agentes.</p>
            <p className="mt-2 text-sm text-neutral-500">
              Cuando tengas uno andando, sus turnos aparecen acá.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Día / Semana. Son links y no un toggle con JS: cada vista es una
                URL, así que se puede compartir y el botón atrás funciona. */}
            <div
              role="group"
              aria-label="Vista"
              className="bg-card inline-flex items-center gap-1 rounded-[12px] border border-neutral-200 p-1"
            >
              {(["dia", "semana"] as const).map((v) => (
                <Link
                  key={v}
                  href={href({ sede, vista: v, fecha: ancla, cancha: datos.canchaActual })}
                  aria-current={v === datos.vista ? "true" : undefined}
                  className={cn(
                    "rounded-[9px] px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150",
                    v === datos.vista
                      ? "bg-neutral-100 text-foreground"
                      : "hover:text-foreground text-neutral-500",
                  )}
                >
                  {v === "dia" ? "Día" : "Semana"}
                </Link>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={href({
                  sede,
                  vista: datos.vista,
                  fecha: datos.anterior,
                  cancha: datos.canchaActual,
                })}
                aria-label={datos.vista === "dia" ? "Día anterior" : "Semana anterior"}
                className={claseNav}
              >
                ←
              </Link>
              <span className="min-w-0 px-1 text-sm font-medium">{rotulo}</span>
              <Link
                href={href({
                  sede,
                  vista: datos.vista,
                  fecha: datos.siguiente,
                  cancha: datos.canchaActual,
                })}
                aria-label={datos.vista === "dia" ? "Día siguiente" : "Semana siguiente"}
                className={claseNav}
              >
                →
              </Link>
              <Link
                href={href({
                  sede,
                  vista: datos.vista,
                  fecha: hoy,
                  cancha: datos.canchaActual,
                })}
                className={claseNav}
              >
                Hoy
              </Link>
            </div>
          </div>

          <FiltroCancha
            canchas={datos.canchasDisponibles}
            canchaActual={datos.canchaActual}
            accion="/dashboard/turnos/calendario"
            sedeActual={sede}
            extras={{ vista: datos.vista, fecha: datos.ancla }}
          />

          <AvisoDegradado fallos={datos.fallos} descartes={datos.descartes} />

          <Card>
            <CardContent className="pt-6">
              <GrillaCalendario datos={datos} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
