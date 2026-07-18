"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { reactivarLimiteAction, type EstadoAdmin } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const INICIAL: EstadoAdmin = {};

function BotonReactivar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Reactivando..." : "Reactivar sedes"}
    </Button>
  );
}

/**
 * Reactiva las sedes de un cliente pausadas por límite (sprint 5).
 *
 * Se muestra solo cuando hay sedes pausadas por límite. El admin ve el uso
 * arriba, así que sabe si conviene subir el plan antes de reactivar.
 */
export function ReactivarLimiteForm({ clienteId }: { clienteId: string }) {
  const [estado, accion] = useActionState(reactivarLimiteAction, INICIAL);

  return (
    <form action={accion} className="space-y-2">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="clienteId" value={clienteId} />
      <BotonReactivar />
    </form>
  );
}
