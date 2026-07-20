"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { reactivarAgenteAction, type EstadoAdmin } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const INICIAL: EstadoAdmin = {};

function Boton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Reactivando..." : "Reactivar ahora"}
    </Button>
  );
}

/**
 * Reactiva un agente pausado por el sistema, sin esperar al cron (SDD v2 §6).
 *
 * El texto explica qué NO hace: reactivar no arregla la causa. Si el pozo del
 * plan sigue agotado o la deuda sigue impaga, la próxima conversación —o el
 * próximo cron— lo vuelve a pausar.
 */
export function ReactivarAgenteForm({
  agenteId,
  motivo,
}: {
  agenteId: string;
  motivo: "PAUSADO_LIMITE" | "PAUSADO_POR_PAGO";
}) {
  const [estado, accion] = useActionState(reactivarAgenteAction, INICIAL);

  return (
    <div className="space-y-2">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <p className="text-sm">
        {motivo === "PAUSADO_LIMITE"
          ? "Está pausado porque el cliente agotó el pozo de conversaciones del plan. Si no subís el plan, la próxima conversación lo vuelve a pausar."
          : "Está pausado por falta de pago. Si no se registra el cobro, el cron lo vuelve a pausar."}
      </p>

      <form action={accion}>
        <input type="hidden" name="agenteId" value={agenteId} />
        <Boton />
      </form>
    </div>
  );
}
