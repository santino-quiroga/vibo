"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { vincularSuscripcionAction, type EstadoAdmin } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const INICIAL: EstadoAdmin = {};

function BotonGuardar({ vinculada }: { vinculada: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "Guardando..." : vinculada ? "Actualizar" : "Vincular"}
    </Button>
  );
}

/**
 * Carga el `preapproval_id` de la suscripción de Mercado Pago de un cliente
 * (SDD v2 §4). Es el paso manual del flujo: se genera la suscripción en MP y el
 * id que devuelve se pega acá, para que el webhook sepa a qué cliente aplicarle
 * los pagos. Vaciar el campo desvincula.
 */
export function VincularSuscripcionForm({
  clienteId,
  suscripcionId,
}: {
  clienteId: string;
  suscripcionId: string | null;
}) {
  const [estado, accion] = useActionState(vincularSuscripcionAction, INICIAL);

  return (
    <form action={accion} className="mt-2 space-y-2">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="clienteId" value={clienteId} />

      <div className="flex items-center gap-2">
        <Input
          name="suscripcionId"
          defaultValue={suscripcionId ?? ""}
          placeholder="preapproval_id de Mercado Pago"
          aria-label="Id de suscripción de Mercado Pago"
          className="font-mono text-xs"
        />
        <BotonGuardar vinculada={Boolean(suscripcionId)} />
      </div>
    </form>
  );
}
