import type { Metadata } from "next";

import { AvisoDegradado } from "@/components/cliente/aviso-degradado";
import { SlotToggle } from "@/components/cliente/slot-toggle";
import { TurnosTabs } from "@/components/cliente/turnos-tabs";
import { SelectNativo } from "@/components/admin/select-nativo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DIAS_SEMANA } from "@/lib/airtable/campos";
import { formatearHora } from "@/lib/airtable/tipos";
import { datosDeHorarios } from "@/lib/cliente/horarios";
import { requerirClienteOwner } from "@/lib/dal";
import { cn } from "@/lib/utils";

import { NuevoSlotForm } from "./nuevo-slot-form";

export const metadata: Metadata = { title: "Horarios | Vibo" };

/** Abreviatura de los días activos de un slot, en orden de semana. */
function diasCortos(indices: number[]): string {
  const orden = [1, 2, 3, 4, 5, 6, 0];
  return orden
    .filter((d) => indices.includes(d))
    .map((d) => DIAS_SEMANA[d].slice(0, 3))
    .join(" · ");
}

export default async function HorariosPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string }>;
}) {
  await requerirClienteOwner();
  const params = await searchParams;

  const datos = await datosDeHorarios(params.sede);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight">Turnos</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Los horarios disponibles de cada cancha. Crear, activar o desactivar un
          horario escribe directo en tu base de turnos.
        </p>
      </div>

      <TurnosTabs query={datos.seleccionada ? `?sede=${datos.seleccionada.id}` : ""} />

      {datos.agentes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-neutral-500">
              Todavía no tenés agentes. Cuando tengas uno, vas a poder gestionar
              sus horarios acá.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Con varias sedes hay que elegir una: los horarios son por sede. */}
          {datos.agentes.length > 1 && (
            <form method="GET" action="/dashboard/turnos/horarios" className="bg-card flex flex-wrap items-end gap-3 border border-neutral-300 p-3">
              <div className="min-w-0 flex-1 space-y-1 sm:max-w-64">
                <label htmlFor="sede" className="etiqueta text-xs">
                  Sede
                </label>
                <SelectNativo id="sede" name="sede" defaultValue={datos.seleccionada?.id ?? ""}>
                  <option value="" disabled>
                    Elegí una sede
                  </option>
                  {datos.agentes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </SelectNativo>
              </div>
              <Button type="submit" variant="outline">
                Ver horarios
              </Button>
            </form>
          )}

          {!datos.seleccionada ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-sm text-neutral-500">
                  Elegí una sede para ver y gestionar sus horarios.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <AvisoDegradado
                fallos={datos.fallo ? [{ agente: datos.seleccionada.nombre, mensaje: datos.fallo }] : []}
                descartes={datos.descartes}
                unidad={{ singular: "horario", plural: "horarios" }}
              />

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Horarios de {datos.seleccionada.nombre}</CardTitle>
                </CardHeader>
                <CardContent>
                  {datos.slots.length === 0 ? (
                    <p className="text-sm text-neutral-500">
                      {datos.fallo
                        ? "No se pudieron cargar los horarios."
                        : "Esta sede no tiene horarios cargados todavía."}
                    </p>
                  ) : (
                    <ul className="divide-y divide-neutral-200">
                      {datos.slots.map((slot) => (
                        <li
                          key={slot.recordId}
                          className="flex flex-wrap items-center justify-between gap-3 py-3"
                        >
                          <div className="min-w-0">
                            <p className={cn("font-medium", !slot.activo && "text-neutral-400")}>
                              <span className="font-mono">
                                {slot.horaInicioMin !== null ? formatearHora(slot.horaInicioMin) : "—"}
                              </span>{" "}
                              {slot.nombre ?? ""}
                              {!slot.activo && (
                                <span className="etiqueta ml-2 text-[10px] text-neutral-400">inactivo</span>
                              )}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {slot.duracionMin ? `${slot.duracionMin} min · ` : ""}
                              {slot.canchas.join(", ") || "sin canchas"}
                              {slot.diasActivos.length > 0 && ` · ${diasCortos(slot.diasActivos)}`}
                            </p>
                          </div>
                          <SlotToggle
                            agenteId={datos.seleccionada!.id}
                            recordId={slot.recordId}
                            activo={slot.activo}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Nuevo horario</CardTitle>
                </CardHeader>
                <CardContent>
                  <NuevoSlotForm
                    agenteId={datos.seleccionada.id}
                    canchas={datos.canchasConfiguradas}
                  />
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
