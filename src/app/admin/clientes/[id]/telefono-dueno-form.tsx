"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { guardarTelefonoDuenoAction, type EstadoAdmin } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const INICIAL: EstadoAdmin = {};

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "Guardando..." : "Guardar teléfono"}
    </Button>
  );
}

/** WhatsApp del dueño para los avisos de atención humana (SDD v2 §12). */
export function TelefonoDuenoForm({
  clienteId,
  telefono,
}: {
  clienteId: string;
  telefono: string | null;
}) {
  const [estado, accion] = useActionState(guardarTelefonoDuenoAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="clienteId" value={clienteId} />

      <Input
        name="telefonoWhatsapp"
        type="tel"
        defaultValue={telefono ?? ""}
        placeholder="5491144440001"
        aria-label="WhatsApp del dueño"
      />

      <BotonGuardar />
    </form>
  );
}
