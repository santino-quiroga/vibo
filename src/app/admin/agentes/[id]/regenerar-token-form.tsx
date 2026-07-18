"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { regenerarTokenAction, type EstadoAdmin } from "@/app/admin/actions";
import { SecretoUnaVez } from "@/components/admin/secreto-una-vez";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const ESTADO_INICIAL: EstadoAdmin = {};

function BotonSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "Generando..." : "Regenerar token"}
    </Button>
  );
}

export function RegenerarTokenForm({ agenteId }: { agenteId: string }) {
  const [estado, formAction] = useActionState(regenerarTokenAction, ESTADO_INICIAL);

  if (estado.mostrarUnaVez) {
    return <SecretoUnaVez {...estado.mostrarUnaVez} />;
  }

  return (
    <form action={formAction} className="space-y-2">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="agenteId" value={agenteId} />
      <BotonSubmit />
      <p className="text-xs text-neutral-500">
        El token anterior deja de servir al instante: el workflow de n8n se corta
        hasta que lo actualices.
      </p>
    </form>
  );
}
