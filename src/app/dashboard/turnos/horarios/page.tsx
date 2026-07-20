import type { Metadata } from "next";

import { AvisoDegradado } from "@/components/cliente/aviso-degradado";
import { TurnosTabs } from "@/components/cliente/turnos-tabs";
import { SelectNativo } from "@/components/admin/select-nativo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { datosDeHorarios } from "@/lib/cliente/horarios";
import { requerirClienteOwner } from "@/lib/dal";

import { FilaSlot } from "./fila-slot";
import { NuevoSlotForm } from "./nuevo-slot-form";

export const metadata: Metadata = { title: "Horarios | Vibo" };

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
        <h1 className="t-pagina">Turnos</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Los horarios disponibles de cada cancha. Crear, editar, activar o
          desactivar un horario escribe directo en tu base de turnos.
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
                        <FilaSlot
                          key={slot.recordId}
                          agenteId={datos.seleccionada!.id}
                          slot={slot}
                          canchasConfiguradas={datos.canchasConfiguradas}
                        />
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
