"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { alternarPausaAction, type EstadoAgente } from "@/app/dashboard/agentes/actions";
import { Button } from "@/components/ui/button";

const INICIAL: EstadoAgente = {};

function Boton({ estado }: { estado: string }) {
  const { pending } = useFormStatus();
  const limite = estado === "PAUSADO_LIMITE";
  const activo = estado === "ACTIVO";
  return (
    <Button
      type="submit"
      size="sm"
      variant={activo ? "outline" : "default"}
      disabled={pending || limite}
      title={limite ? "Pausado por el límite del plan" : undefined}
    >
      {pending
        ? "Guardando..."
        : limite
          ? "Pausado — límite de plan"
          : activo
            ? "Pausar bot"
            : "Reactivar bot"}
    </Button>
  );
}

/**
 * Toggle activo/pausado del bot (requerimientos §7). Deshabilitado si el agente
 * está pausado por límite de plan: eso lo levanta el ciclo o el admin, no el
 * dueño (§4.2). Muestra su propio error inline.
 */
export function TogglePausa({
  agenteId,
  estado,
}: {
  agenteId: string;
  estado: "ACTIVO" | "PAUSADO_MANUAL" | "PAUSADO_LIMITE";
}) {
  const [resultado, accion] = useActionState(alternarPausaAction, INICIAL);

  return (
    <div className="space-y-1">
      <form action={accion}>
        <input type="hidden" name="agenteId" value={agenteId} />
        <Boton estado={estado} />
      </form>
      {resultado.error && (
        <p className="text-vibo-acento max-w-xs text-xs">{resultado.error}</p>
      )}
    </div>
  );
}
