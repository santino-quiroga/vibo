"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { crearSlotAction, type EstadoHorarios } from "@/app/dashboard/turnos/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INICIAL: EstadoHorarios = {};

// Índices 0-6 como los usa Airtable/Vibo (0 = Domingo), pero se muestran de lunes
// a domingo, que es como se lee una semana.
const DIAS: Array<{ indice: number; etiqueta: string }> = [
  { indice: 1, etiqueta: "Lun" },
  { indice: 2, etiqueta: "Mar" },
  { indice: 3, etiqueta: "Mié" },
  { indice: 4, etiqueta: "Jue" },
  { indice: 5, etiqueta: "Vie" },
  { indice: 6, etiqueta: "Sáb" },
  { indice: 0, etiqueta: "Dom" },
];

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creando..." : "Crear horario"}
    </Button>
  );
}

/**
 * Alta de un horario disponible (slot) en Airtable (requerimientos §8.0).
 *
 * Las canchas del checklist son las configuradas en Vibo para esta sede; sus
 * números tienen que coincidir con las opciones "Cancha N" de la base.
 */
export function NuevoSlotForm({
  agenteId,
  canchas,
}: {
  agenteId: string;
  canchas: number[];
}) {
  const [estado, accion] = useActionState(crearSlotAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert>
          <AlertDescription>Horario creado.</AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="agenteId" value={agenteId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="nombre">Nombre</Label>
          <Input id="nombre" name="nombre" required placeholder="Turno 20:00" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="horaInicio">Hora de inicio</Label>
          <Input id="horaInicio" name="horaInicio" type="time" required defaultValue="20:00" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duracionMin">Duración (min)</Label>
          <Input
            id="duracionMin"
            name="duracionMin"
            type="number"
            min={15}
            step={5}
            required
            defaultValue={90}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="etiqueta text-xs text-neutral-500">Días</legend>
        <div className="flex flex-wrap gap-2">
          {DIAS.map((dia) => (
            <label
              key={dia.indice}
              className="flex cursor-pointer items-center gap-1.5 rounded-sm border border-neutral-300 px-2.5 py-1.5 text-sm has-checked:border-vibo-negro has-checked:bg-neutral-100"
            >
              <input type="checkbox" name="dias" value={dia.indice} className="accent-vibo-negro" />
              {dia.etiqueta}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="etiqueta text-xs text-neutral-500">Canchas</legend>
        {canchas.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Esta sede no tiene canchas configuradas. Cargalas en Agentes antes de
            crear horarios.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {canchas.map((numero) => (
              <label
                key={numero}
                className="flex cursor-pointer items-center gap-1.5 rounded-sm border border-neutral-300 px-2.5 py-1.5 text-sm has-checked:border-vibo-negro has-checked:bg-neutral-100"
              >
                <input
                  type="checkbox"
                  name="canchas"
                  value={numero}
                  className="accent-vibo-negro"
                />
                Cancha {numero}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <BotonCrear />
    </form>
  );
}
