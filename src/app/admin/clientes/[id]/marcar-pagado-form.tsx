"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { marcarPagadoAction, type EstadoAdmin } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INICIAL: EstadoAdmin = {};

function BotonConfirmar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Registrando..." : "Registrar el pago"}
    </Button>
  );
}

/**
 * Registra un cobro recibido por fuera de Mercado Pago (SDD v2 §4.4).
 *
 * Va en dos pasos, como cancelar un turno: escribe un pago en el historial del
 * cliente y puede reactivarle los agentes. Es una acción con consecuencias, no
 * un toggle.
 */
export function MarcarPagadoForm({
  clienteId,
  montoSugerido,
  hayAgentesPausados,
}: {
  clienteId: string;
  /** El precio del plan, para no tener que tipearlo. */
  montoSugerido: number;
  hayAgentesPausados: boolean;
}) {
  const [estado, accion] = useActionState(marcarPagadoAction, INICIAL);
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setAbierto(true)}>
        Marcar como pagado
      </Button>
    );
  }

  return (
    <form action={accion} className="space-y-3">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="clienteId" value={clienteId} />

      <div className="space-y-1.5">
        <Label htmlFor="monto" className="text-xs">
          Monto recibido
        </Label>
        <Input
          id="monto"
          name="monto"
          type="number"
          min={1}
          step={100}
          required
          defaultValue={montoSugerido > 0 ? montoSugerido : ""}
          className="w-40"
        />
      </div>

      <p className="text-xs text-neutral-500">
        Se registra como pago manual (transferencia, efectivo o cortesía), el
        cliente queda al día y el próximo cobro se corre un mes.
        {hayAgentesPausados && (
          <>
            {" "}
            <span className="font-medium">
              Además se reactivan las sedes que estaban pausadas por falta de pago.
            </span>
          </>
        )}
      </p>

      <div className="flex items-center gap-2">
        <BotonConfirmar />
        <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
