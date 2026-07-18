"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  cambiarActivoSlotAction,
  type EstadoHorarios,
} from "@/app/dashboard/turnos/actions";
import { Button } from "@/components/ui/button";

const INICIAL: EstadoHorarios = {};

function Boton({ activo }: { activo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={activo ? "outline" : "default"} disabled={pending}>
      {pending ? "..." : activo ? "Desactivar" : "Activar"}
    </Button>
  );
}

/** Activa/desactiva un slot (requerimientos §8.0). Escribe el campo Activo en Airtable. */
export function SlotToggle({
  agenteId,
  recordId,
  activo,
}: {
  agenteId: string;
  recordId: string;
  activo: boolean;
}) {
  const [estado, accion] = useActionState(cambiarActivoSlotAction, INICIAL);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={accion}>
        <input type="hidden" name="agenteId" value={agenteId} />
        <input type="hidden" name="recordId" value={recordId} />
        {/* Se manda el valor OPUESTO al actual: la acción setea ese. */}
        <input type="hidden" name="activo" value={activo ? "false" : "true"} />
        <Boton activo={activo} />
      </form>
      {estado.error && <p className="text-vibo-acento max-w-[10rem] text-xs">{estado.error}</p>}
    </div>
  );
}
