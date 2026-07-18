import type { Metadata } from "next";

import { ActividadAgente } from "@/components/cliente/actividad-agente";
import { AvisoDegradado } from "@/components/cliente/aviso-degradado";
import { BarraFiltros } from "@/components/cliente/barra-filtros";
import { GraficoTendencia } from "@/components/cliente/grafico-tendencia";
import { HeatmapOcupacion } from "@/components/cliente/heatmap-ocupacion";
import { Kpi } from "@/components/cliente/kpi";
import { BarraUso } from "@/components/plan/barra-uso";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { actividadDelAgente } from "@/lib/cliente/actividad";
import { datosDeInicio, resolverAlcance } from "@/lib/cliente/datos";
import { usoDelCliente } from "@/lib/planes/uso";
import { requerirClienteOwner } from "@/lib/dal";
import { esClaveRango, type ClaveRango } from "@/lib/periodos";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inicio | Vibo" };

const moneda = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export default async function InicioPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string; rango?: string }>;
}) {
  const usuario = await requerirClienteOwner();

  const params = await searchParams;
  // El rango viene de la URL: si es cualquier cosa, se cae al default en vez de
  // romper. No hace falta más validación porque no toca la base.
  const rango: ClaveRango = esClaveRango(params.rango) ? params.rango : "mes";

  // El alcance se resuelve contra los agentes del cliente de la sesión: un
  // agenteId de otro cliente no matchea y cae en "Todas las sedes".
  const [alcance, datos, uso, actividad] = await Promise.all([
    resolverAlcance(params.sede),
    datosDeInicio(rango, params.sede),
    // El uso del plan es del cliente entero (pozo compartido), así que no
    // depende de la sede elegida en el selector.
    usoDelCliente(usuario.clienteId),
    // Actividad de la IA: del cliente entero, base propia (no Airtable).
    actividadDelAgente(),
  ]);

  const sinAgentes = alcance.agentes.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight">Inicio</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {alcance.seleccionado ? alcance.seleccionado.nombre : "Todas las sedes"}
          {" · "}
          {datos.etiqueta.toLowerCase()}
        </p>
      </div>

      {sinAgentes ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">Todavía no tenés agentes.</p>
            <p className="mt-2 text-sm text-neutral-500">
              El equipo de Vibo los configura. Cuando tengas uno andando, acá vas
              a ver tus turnos y cómo se llenan tus canchas.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <BarraFiltros
            agentes={alcance.agentes}
            sedeActual={alcance.seleccionado?.id ?? null}
            rangoActual={rango}
            accion="/dashboard"
          />

          <AvisoDegradado fallos={datos.fallos} descartes={datos.descartes} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              titulo="Turnos reservados"
              valor={datos.sinDatos ? "—" : String(datos.turnos.actual)}
              // Sin datos no hay variación que mostrar: comparar contra un
              // período que tampoco se pudo leer no significa nada.
              variacion={datos.sinDatos ? null : datos.turnos.variacion}
              nota={
                datos.sinDatos
                  ? "No se pudieron leer los turnos. El número no es cero: no se sabe."
                  : "Confirmados y pendientes de seña. No incluye cancelados."
              }
            />

            <Kpi
              titulo="Tasa de conversión"
              valor={
                !datos.conversion.hayDatos
                  ? "—"
                  : datos.conversion.excede
                    ? // Más turnos que conversaciones: se muestra acotado en vez
                      // de un porcentaje absurdo. El detalle va en la nota.
                      ">100%"
                    : `${Math.round(datos.conversion.tasa * 100)}%`
              }
              nota={
                !datos.conversion.hayDatos
                  ? "Se calcula sobre las conversaciones de WhatsApp, que todavía no se están registrando."
                  : datos.conversion.excede
                    ? `${datos.conversion.turnos} turnos del agente sobre ${datos.conversion.conversaciones} conversaciones: hay más reservas que chats registrados (varias por chat, o falta registrar conversaciones).`
                    : `${datos.conversion.turnos} turnos confirmados por el agente sobre ${datos.conversion.conversaciones} conversaciones.`
              }
            />

            <Kpi
              titulo="Ocupación"
              valor={
                datos.ocupacion.global !== null
                  ? `${Math.round(datos.ocupacion.global * 100)}%`
                  : "—"
              }
              nota={
                datos.sinDatos
                  ? "No se pudieron leer los turnos ni los horarios de la sede."
                  : datos.ocupacion.global !== null
                    ? "Lugares vendidos sobre los disponibles en el período."
                    : "Faltan los horarios de la sede para saber sobre cuántos lugares calcular."
              }
            />

            <Kpi
              titulo="Ingresos estimados"
              valor={datos.sinDatos ? "—" : moneda.format(datos.ingresos.total)}
              nota={
                datos.sinDatos
                  ? "No se pudieron leer los turnos, así que no hay nada que valuar."
                  : datos.sinCanchas
                    ? "Faltan cargar los precios de las canchas. Pedíselo al equipo de Vibo."
                    : datos.ingresos.sinPrecio > 0
                      ? `Estimado sobre turnos confirmados. ${datos.ingresos.sinPrecio} turno(s) quedaron afuera: su cancha no tiene precio cargado.`
                      : "Turnos confirmados × precio de cada cancha. Es una estimación, no tu facturación."
              }
            />
          </div>

          {/* Tendencia de reservas + actividad de la IA. El gráfico depende de
              Airtable, así que sale de la fila si la lectura falló; el widget de
              actividad usa la base propia y se muestra igual. */}
          <div className={cn("grid gap-4", !datos.sinDatos && "lg:grid-cols-3")}>
            {!datos.sinDatos && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Tendencia de reservas</CardTitle>
                </CardHeader>
                <CardContent>
                  <GraficoTendencia datos={datos.tendencia} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Actividad del agente</CardTitle>
              </CardHeader>
              <CardContent>
                <ActividadAgente actividad={actividad} ultimoTurno={datos.ultimoTurnoBot} />
              </CardContent>
            </Card>
          </div>

          {/* Estado del plan (requerimientos §6): fuera del bloque que depende
              de Airtable, para que el uso y el aviso de límite se vean aunque la
              lectura de turnos esté caída. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estado del plan</CardTitle>
            </CardHeader>
            <CardContent>
              <BarraUso uso={uso} />
            </CardContent>
          </Card>

          {/* Con la lectura caída, el heatmap sólo podría decir "no hay
              horarios cargados", que no es lo que pasó. El aviso de arriba ya
              explica el motivo real; una tarjeta vacía abajo sólo confunde. */}
          {!datos.sinDatos && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ocupación y horarios pico</CardTitle>
              </CardHeader>
              <CardContent>
                <HeatmapOcupacion ocupacion={datos.ocupacion} />
              </CardContent>
            </Card>
          )}

          {datos.ingresos.porCancha.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  De dónde salen los ingresos estimados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-neutral-200 text-sm">
                  {datos.ingresos.porCancha.map((cancha) => (
                    <li
                      key={cancha.numero}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <span>
                        Cancha {cancha.numero}
                        <span className="text-neutral-500">
                          {" "}
                          · {cancha.turnos} × {moneda.format(cancha.precio)}
                        </span>
                      </span>
                      <span className="font-mono tabular-nums">
                        {moneda.format(cancha.subtotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
