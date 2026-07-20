"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { crearTurnoAction, type EstadoTurnoAccion } from "@/app/dashboard/turnos/actions";
import { SelectNativo } from "@/components/admin/select-nativo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SedeParaAlta } from "@/lib/cliente/datos";

const INICIAL: EstadoTurnoAccion = {};

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Cargando..." : "Cargar turno"}
    </Button>
  );
}

/**
 * Alta manual de un turno: el que entra por teléfono o al mostrador.
 *
 * Queda plegado por defecto. La pantalla de Turnos se usa sobre todo para
 * mirar lo que ya está reservado; un formulario largo desplegado arriba de la
 * tabla empujaría el contenido principal fuera de la vista en el celular.
 *
 * El turno se carga con "Creada por bot" en false (lo hace la capa de
 * escritura), así que no ensucia la tasa de conversión de Inicio, que sólo
 * cuenta lo que agendó el agente.
 */
export function NuevoTurnoForm({
  sedes,
  sedeElegida,
  hoy,
}: {
  sedes: SedeParaAlta[];
  /** La sede del selector del header, si hay una elegida. */
  sedeElegida: string | null;
  /** Fecha de hoy en Argentina, para el valor por defecto. */
  hoy: string;
}) {
  const [estado, accion] = useActionState(crearTurnoAction, INICIAL);
  const [abierto, setAbierto] = useState(false);

  // La sede por defecto: la del selector, o la única que haya.
  const sedeInicial = sedeElegida ?? (sedes.length === 1 ? sedes[0].id : "");
  const [sedeId, setSedeId] = useState(sedeInicial);

  const sede = sedes.find((s) => s.id === sedeId) ?? null;
  const sinCanchas = sede !== null && sede.canchas.length === 0;

  if (!abierto) {
    return (
      <Button type="button" variant="outline" onClick={() => setAbierto(true)}>
        + Cargar turno a mano
      </Button>
    );
  }

  return (
    <div className="bg-card rounded-[12px] border border-neutral-200 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="t-card">Cargar un turno a mano</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Para los que entran por teléfono o al mostrador. Se guarda en tu base
            de turnos igual que los que toma el agente.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)}>
          Cerrar
        </Button>
      </div>

      <form action={accion} className="space-y-4">
        {estado.error && (
          <Alert variant="destructive">
            <AlertDescription>{estado.error}</AlertDescription>
          </Alert>
        )}
        {estado.ok && (
          <Alert>
            <AlertDescription>{estado.ok}</AlertDescription>
          </Alert>
        )}

        {sedes.length > 1 && (
          <div className="space-y-2">
            <Label htmlFor="agenteId">Sede</Label>
            <SelectNativo
              id="agenteId"
              name="agenteId"
              value={sedeId}
              onChange={(e) => setSedeId(e.target.value)}
              required
            >
              <option value="" disabled>
                Elegí una sede
              </option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </SelectNativo>
          </div>
        )}
        {sedes.length === 1 && <input type="hidden" name="agenteId" value={sedes[0].id} />}

        {sinCanchas ? (
          <p className="text-sm text-neutral-500">
            Esta sede no tiene canchas configuradas. Cargalas en Agentes antes de
            poder agendar turnos a mano.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre del contacto</Label>
                <Input id="nombre" name="nombre" required placeholder="Juan Pérez" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono (opcional)</Label>
                <Input id="telefono" name="telefono" placeholder="2323 33-0438" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="fecha">Fecha</Label>
                <Input id="fecha" name="fecha" type="date" required defaultValue={hoy} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hora">Hora de inicio</Label>
                <Input id="hora" name="hora" type="time" required defaultValue="20:00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cancha">Cancha</Label>
                <SelectNativo id="cancha" name="cancha" required defaultValue="">
                  <option value="" disabled>
                    Elegí
                  </option>
                  {(sede?.canchas ?? []).map((numero) => (
                    <option key={numero} value={numero}>
                      Cancha {numero}
                    </option>
                  ))}
                </SelectNativo>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="estado">Estado</Label>
                <SelectNativo id="estado" name="estado" defaultValue="CONFIRMADA">
                  <option value="CONFIRMADA">Confirmada</option>
                  <option value="PENDIENTE_SENIA">Pendiente de seña</option>
                </SelectNativo>
              </div>
              <div className="space-y-2">
                <Label htmlFor="montoSenia">Monto de la seña (opcional)</Label>
                <Input
                  id="montoSenia"
                  name="montoSenia"
                  type="number"
                  min={0}
                  step={500}
                  placeholder="5000"
                />
                <p className="text-xs text-neutral-500">
                  Sólo se guarda si el turno queda pendiente de seña.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notas">Notas (opcional)</Label>
              <Textarea id="notas" name="notas" rows={2} placeholder="Paga en efectivo al llegar" />
            </div>

            <BotonCrear />
          </>
        )}
      </form>
    </div>
  );
}
