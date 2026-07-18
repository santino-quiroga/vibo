"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { cambiarPlanAction, type EstadoAdmin } from "@/app/admin/actions";
import { SelectNativo } from "@/components/admin/select-nativo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const ESTADO_INICIAL: EstadoAdmin = {};

type Plan = {
  id: string;
  nombre: string;
  maxAgentes: number;
  maxConversacionesMes: number;
};

function BotonSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "Guardando..." : "Cambiar plan"}
    </Button>
  );
}

export function CambiarPlanForm({
  clienteId,
  planActualId,
  planes,
}: {
  clienteId: string;
  planActualId: string;
  planes: Plan[];
}) {
  const [estado, formAction] = useActionState(cambiarPlanAction, ESTADO_INICIAL);

  return (
    <form action={formAction} className="space-y-3">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="clienteId" value={clienteId} />

      <div className="flex flex-wrap items-center gap-2">
        <SelectNativo
          name="planId"
          defaultValue={planActualId}
          className="max-w-xs"
          aria-label="Plan"
        >
          {planes.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.nombre} — {plan.maxAgentes} agente(s),{" "}
              {plan.maxConversacionesMes} conv/mes
            </option>
          ))}
        </SelectNativo>
        <BotonSubmit />
      </div>
    </form>
  );
}
