"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { editarSlotAction, type EstadoHorarios } from "@/app/dashboard/turnos/actions";
import { SlotToggle } from "@/components/cliente/slot-toggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DIAS_SEMANA, numeroDeCancha } from "@/lib/airtable/campos";
import { formatearHora } from "@/lib/airtable/tipos";
import type { Slot } from "@/lib/airtable/tipos";
import { cn } from "@/lib/utils";

const INICIAL: EstadoHorarios = {};

// Se muestran de lunes a domingo aunque los índices sean 0-6 con 0 = Domingo:
// es como se lee una semana.
const DIAS: Array<{ indice: number; etiqueta: string }> = [
  { indice: 1, etiqueta: "Lun" },
  { indice: 2, etiqueta: "Mar" },
  { indice: 3, etiqueta: "Mié" },
  { indice: 4, etiqueta: "Jue" },
  { indice: 5, etiqueta: "Vie" },
  { indice: 6, etiqueta: "Sáb" },
  { indice: 0, etiqueta: "Dom" },
];

/** Abreviatura de los días activos de un slot, en orden de semana. */
function diasCortos(indices: number[]): string {
  return DIAS.filter((d) => indices.includes(d.indice))
    .map((d) => DIAS_SEMANA[d.indice].slice(0, 3))
    .join(" · ");
}

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Guardando..." : "Guardar cambios"}
    </Button>
  );
}

const claseChip =
  "flex cursor-pointer items-center gap-1.5 rounded-sm border border-neutral-300 px-2.5 py-1.5 text-sm has-checked:border-vibo-negro has-checked:bg-neutral-100";

/**
 * Edición de un horario existente (requerimientos §8.0: "crear, editar y
 * desactivar").
 *
 * Mismos campos que el alta, precargados con lo que el slot tiene hoy. Sin
 * esto, corregir un horario mal cargado obligaba a desactivarlo y crear otro
 * —dejando basura en la base— o a entrar a Airtable a mano, que es justo lo que
 * la plataforma viene a evitar (§1).
 */
function FormEditar({
  agenteId,
  slot,
  canchasConfiguradas,
  onListo,
}: {
  agenteId: string;
  slot: Slot;
  canchasConfiguradas: number[];
  onListo: () => void;
}) {
  const [estado, accion] = useActionState(editarSlotAction, INICIAL);

  // Las canchas del slot vienen como texto de Airtable ("Cancha 1"); el
  // formulario trabaja con números. Una que no siga la convención no se puede
  // premarcar, y se avisa abajo en vez de perderla en silencio.
  const numerosDelSlot = slot.canchas
    .map(numeroDeCancha)
    .filter((n): n is number => n !== null);
  const fueraDeConvencion = slot.canchas.filter((c) => numeroDeCancha(c) === null);

  return (
    <form action={accion} className="mt-3 space-y-4 border-t border-neutral-200 pt-4">
      <input type="hidden" name="agenteId" value={agenteId} />
      <input type="hidden" name="recordId" value={slot.recordId} />

      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert>
          <AlertDescription>Horario actualizado.</AlertDescription>
        </Alert>
      )}

      {fueraDeConvencion.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            Este horario apunta a {fueraDeConvencion.join(", ")}, que no sigue el
            formato «Cancha N». Si guardás, esa cancha se pierde: revisala con el
            equipo de Vibo antes.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={`nombre-${slot.recordId}`}>Nombre</Label>
          <Input
            id={`nombre-${slot.recordId}`}
            name="nombre"
            required
            defaultValue={slot.nombre ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`hora-${slot.recordId}`}>Hora de inicio</Label>
          <Input
            id={`hora-${slot.recordId}`}
            name="horaInicio"
            type="time"
            required
            defaultValue={
              slot.horaInicioMin !== null ? formatearHora(slot.horaInicioMin) : ""
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`duracion-${slot.recordId}`}>Duración (min)</Label>
          <Input
            id={`duracion-${slot.recordId}`}
            name="duracionMin"
            type="number"
            min={15}
            step={5}
            required
            defaultValue={slot.duracionMin ?? 90}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="etiqueta text-xs text-neutral-500">Días</legend>
        <div className="flex flex-wrap gap-2">
          {DIAS.map((dia) => (
            <label key={dia.indice} className={claseChip}>
              <input
                type="checkbox"
                name="dias"
                value={dia.indice}
                defaultChecked={slot.diasActivos.includes(dia.indice)}
                className="accent-vibo-negro"
              />
              {dia.etiqueta}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="etiqueta text-xs text-neutral-500">Canchas</legend>
        {canchasConfiguradas.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Esta sede no tiene canchas configuradas. Cargalas en Agentes.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {canchasConfiguradas.map((numero) => (
              <label key={numero} className={claseChip}>
                <input
                  type="checkbox"
                  name="canchas"
                  value={numero}
                  defaultChecked={numerosDelSlot.includes(numero)}
                  className="accent-vibo-negro"
                />
                Cancha {numero}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="flex items-center gap-2">
        <BotonGuardar />
        <Button type="button" size="sm" variant="ghost" onClick={onListo}>
          Cerrar
        </Button>
      </div>

      <p className="text-xs text-neutral-500">
        Editar no reactiva un horario desactivado: eso se hace con el botón de
        activar.
      </p>
    </form>
  );
}

export function FilaSlot({
  agenteId,
  slot,
  canchasConfiguradas,
}: {
  agenteId: string;
  slot: Slot;
  canchasConfiguradas: number[];
}) {
  const [editando, setEditando] = useState(false);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
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

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={editando}
            onClick={() => setEditando((v) => !v)}
          >
            {editando ? "Cerrar" : "Editar"}
          </Button>
          <SlotToggle agenteId={agenteId} recordId={slot.recordId} activo={slot.activo} />
        </div>
      </div>

      {editando && (
        <FormEditar
          agenteId={agenteId}
          slot={slot}
          canchasConfiguradas={canchasConfiguradas}
          onListo={() => setEditando(false)}
        />
      )}
    </li>
  );
}
