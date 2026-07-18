import type { Metadata } from "next";

import { AvisoDegradado } from "@/components/cliente/aviso-degradado";
import { BarraFiltros } from "@/components/cliente/barra-filtros";
import { EstadoTurno } from "@/components/cliente/estado-turno";
import { TurnosTabs } from "@/components/cliente/turnos-tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatearFechaCorta, formatearHora } from "@/lib/airtable/tipos";
import { datosDeTurnos, resolverAlcance } from "@/lib/cliente/datos";
import { requerirClienteOwner } from "@/lib/dal";
import { esClaveRango, type ClaveRango } from "@/lib/periodos";

export const metadata: Metadata = { title: "Turnos | Vibo" };

const moneda = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export default async function TurnosPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string; rango?: string; cancha?: string }>;
}) {
  await requerirClienteOwner();

  const params = await searchParams;
  const rango: ClaveRango = esClaveRango(params.rango) ? params.rango : "semana";

  const [alcance, datos] = await Promise.all([
    resolverAlcance(params.sede),
    datosDeTurnos(rango, params.sede),
  ]);

  // El filtro por cancha se aplica en memoria: los turnos ya están traídos y
  // pedirle a Airtable un filtro más sería otro request contra su rate limit
  // para recortar una lista que ya tenemos.
  const turnos = params.cancha
    ? datos.turnos.filter((t) => t.cancha === params.cancha)
    : datos.turnos;

  const variasSedes = !alcance.seleccionado && alcance.agentes.length > 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight">Turnos</h1>
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
          <BarraFiltros
            agentes={alcance.agentes}
            sedeActual={alcance.seleccionado?.id ?? null}
            rangoActual={rango}
            accion="/dashboard/turnos"
          />

          <AvisoDegradado fallos={datos.fallos} descartes={datos.descartes} />

          {turnos.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-sm text-neutral-500">
                  No hay turnos en este período.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                {/* La tabla scrollea adentro de su caja: nunca empuja el ancho
                    de la página, que es lo que rompe la lectura en el celular. */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cuándo</TableHead>
                        <TableHead>Contacto</TableHead>
                        <TableHead>Cancha</TableHead>
                        {variasSedes && <TableHead>Sede</TableHead>}
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {turnos.map((turno) => (
                        <TableRow key={turno.recordId}>
                          <TableCell className="whitespace-nowrap">
                            <span className="font-medium">
                              {formatearFechaCorta(turno.fecha)}
                            </span>
                            <span className="ml-2 font-mono text-neutral-500">
                              {turno.horaInicioMin !== null
                                ? formatearHora(turno.horaInicioMin)
                                : "—"}
                            </span>
                          </TableCell>

                          <TableCell>
                            <span className="block">{turno.nombre ?? "Sin nombre"}</span>
                            {turno.telefono && (
                              <span className="block font-mono text-xs text-neutral-500">
                                {turno.telefono}
                              </span>
                            )}
                          </TableCell>

                          <TableCell className="whitespace-nowrap">
                            {turno.cancha ?? "—"}
                          </TableCell>

                          {variasSedes && (
                            <TableCell className="whitespace-nowrap text-neutral-500">
                              {turno.agenteNombre}
                            </TableCell>
                          )}

                          <TableCell>
                            <EstadoTurno estado={turno.estado} />
                          </TableCell>

                          <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                            {turno.precio !== null ? (
                              moneda.format(turno.precio)
                            ) : (
                              // No es "$0": es que nadie le puso precio a esa
                              // cancha en Vibo. Mostrar cero sería mentir.
                              <span
                                className="text-neutral-400"
                                title="La cancha de este turno no tiene precio cargado"
                              >
                                sin precio
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-neutral-500">
            Cancelar y reprogramar turnos desde acá llega en el próximo sprint.
            Por ahora es una vista de lectura.
          </p>
        </>
      )}
    </div>
  );
}
