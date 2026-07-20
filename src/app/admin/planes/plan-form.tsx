"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { guardarPlanAction, type EstadoAdmin } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INICIAL: EstadoAdmin = {};

export type PlanEditable = {
  id: string;
  nombre: string;
  maxAgentes: number;
  maxConversacionesMes: number;
  precio: number;
  mercadoPagoPlanId: string | null;
  clientes: number;
};

function BotonGuardar({ nuevo }: { nuevo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Guardando..." : nuevo ? "Crear plan" : "Guardar"}
    </Button>
  );
}

/**
 * Alta y edición de un plan (SDD v2 §6).
 *
 * `precio` no es un dato decorativo: es lo que se cobra por Mercado Pago, así
 * que el formulario avisa cuántos clientes tiene el plan — cambiarlo les cambia
 * la factura a todos ellos.
 */
export function PlanForm({ plan }: { plan?: PlanEditable }) {
  const [estado, accion] = useActionState(guardarPlanAction, INICIAL);
  const [abierto, setAbierto] = useState(plan === undefined ? false : false);

  const nuevo = plan === undefined;

  if (!abierto) {
    return (
      <Button
        type="button"
        size="sm"
        variant={nuevo ? "default" : "outline"}
        onClick={() => setAbierto(true)}
      >
        {nuevo ? "+ Nuevo plan" : "Editar"}
      </Button>
    );
  }

  return (
    <form action={accion} className="space-y-4">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      {plan && <input type="hidden" name="planId" value={plan.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`nombre-${plan?.id ?? "nuevo"}`}>Nombre</Label>
          <Input
            id={`nombre-${plan?.id ?? "nuevo"}`}
            name="nombre"
            required
            defaultValue={plan?.nombre ?? ""}
            placeholder="Starter"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`precio-${plan?.id ?? "nuevo"}`}>Precio mensual</Label>
          <Input
            id={`precio-${plan?.id ?? "nuevo"}`}
            name="precio"
            type="number"
            min={0}
            step={1000}
            required
            defaultValue={plan?.precio ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`agentes-${plan?.id ?? "nuevo"}`}>Sedes incluidas</Label>
          <Input
            id={`agentes-${plan?.id ?? "nuevo"}`}
            name="maxAgentes"
            type="number"
            min={1}
            required
            defaultValue={plan?.maxAgentes ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`conv-${plan?.id ?? "nuevo"}`}>Conversaciones/mes</Label>
          <Input
            id={`conv-${plan?.id ?? "nuevo"}`}
            name="maxConversacionesMes"
            type="number"
            min={1}
            required
            defaultValue={plan?.maxConversacionesMes ?? ""}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`mp-${plan?.id ?? "nuevo"}`}>
          ID del plan en Mercado Pago <span className="text-neutral-400">(opcional)</span>
        </Label>
        <Input
          id={`mp-${plan?.id ?? "nuevo"}`}
          name="mercadoPagoPlanId"
          defaultValue={plan?.mercadoPagoPlanId ?? ""}
          placeholder="2c938084..."
        />
      </div>

      {plan && plan.clientes > 0 && (
        <p className="text-xs text-neutral-500">
          Este plan lo usan <span className="font-medium">{plan.clientes}</span>{" "}
          cliente(s). Cambiar el precio les cambia lo que se les cobra.
        </p>
      )}

      <div className="flex items-center gap-2">
        <BotonGuardar nuevo={nuevo} />
        <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
