import type { Metadata } from "next";

import { AvisoDegradado } from "@/components/cliente/aviso-degradado";
import { BarraFiltros } from "@/components/cliente/barra-filtros";
import { FiltroCancha } from "@/components/cliente/filtro-cancha";
import { TablaTurnos } from "@/components/cliente/tabla-turnos";
import { TurnosTabs } from "@/components/cliente/turnos-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { datosDeTurnos, resolverAlcance, sedesParaAlta } from "@/lib/cliente/datos";
import { requerirClienteOwner } from "@/lib/dal";
import { esClaveRango, hoyEnArgentina, type ClaveRango } from "@/lib/periodos";

import { NuevoTurnoForm } from "./nuevo-turno-form";

export const metadata: Metadata = { title: "Turnos | Vibo" };

export default async function TurnosPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string; rango?: string; cancha?: string }>;
}) {
  await requerirClienteOwner();

  const params = await searchParams;
  const rango: ClaveRango = esClaveRango(params.rango) ? params.rango : "semana";

  const [alcance, datos, sedes] = await Promise.all([
    resolverAlcance(params.sede),
    datosDeTurnos(rango, params.sede),
    sedesParaAlta(),
  ]);

  // El filtro por cancha se aplica en memoria: los turnos ya están traídos y
  // pedirle a Airtable un filtro más sería otro request contra su rate limit
  // para recortar una lista que ya tenemos.
  //
  // Sólo se acepta una cancha que exista en los datos: si llega cualquier cosa
  // por la URL, se muestra todo en vez de una lista vacía inexplicable.
  const canchaActual =
    params.cancha && datos.canchasDisponibles.includes(params.cancha)
      ? params.cancha
      : null;

  const turnos = canchaActual
    ? datos.turnos.filter((t) => t.cancha === canchaActual)
    : datos.turnos;

  const variasSedes = !alcance.seleccionado && alcance.agentes.length > 1;
  const sede = alcance.seleccionado?.id ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-pagina">Turnos</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Las reservas que tomó tu agente, sin que tengas que salir de Vibo.
        </p>
      </div>

      <TurnosTabs query={params.sede ? `?sede=${params.sede}` : ""} />

      {alcance.agentes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">Todavía no tenés agentes.</p>
            <p className="mt-2 text-sm text-neutral-500">
              Cuando tengas uno andando, sus reservas aparecen acá.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <BarraFiltros
              rangoActual={rango}
              accion="/dashboard/turnos"
              sedeActual={sede}
              extras={{ cancha: canchaActual }}
            />
            <FiltroCancha
              canchas={datos.canchasDisponibles}
              canchaActual={canchaActual}
              accion="/dashboard/turnos"
              sedeActual={sede}
              extras={{ rango }}
            />
          </div>

          <NuevoTurnoForm
            sedes={sedes}
            sedeElegida={sede}
            hoy={hoyEnArgentina()}
          />

          <AvisoDegradado fallos={datos.fallos} descartes={datos.descartes} />

          {turnos.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-sm text-neutral-500">
                  {canchaActual
                    ? `No hay turnos de ${canchaActual} en este período.`
                    : "No hay turnos en este período."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                {/* La tabla scrollea adentro de su caja: nunca empuja el ancho
                    de la página, que es lo que rompe la lectura en el celular. */}
                <TablaTurnos turnos={turnos} variasSedes={variasSedes} />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
