"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { guardarNotasAction, type EstadoAdmin } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const INICIAL: EstadoAdmin = {};

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "Guardando..." : "Guardar notas"}
    </Button>
  );
}

/** Notas internas del equipo sobre un cliente (SDD v2 §8). El cliente no las ve. */
export function NotasForm({
  clienteId,
  notas,
}: {
  clienteId: string;
  notas: string | null;
}) {
  const [estado, accion] = useActionState(guardarNotasAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="clienteId" value={clienteId} />

      <Textarea
        name="notas"
        rows={4}
        defaultValue={notas ?? ""}
        placeholder="Cómo llegó, con quién hablar, cómo paga, qué pidió…"
        aria-label="Notas internas"
      />

      <BotonGuardar />
    </form>
  );
}
