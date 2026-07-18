"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { crearClienteAction, type EstadoAdmin } from "@/app/admin/actions";
import { SecretoUnaVez } from "@/components/admin/secreto-una-vez";
import { SelectNativo } from "@/components/admin/select-nativo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BotonEnlace } from "@/components/ui/boton-enlace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <Button type="submit" disabled={pending}>
      {pending ? "Creando..." : "Crear cliente"}
    </Button>
  );
}

export function NuevoClienteForm({ planes }: { planes: Plan[] }) {
  const [estado, formAction] = useActionState(crearClienteAction, ESTADO_INICIAL);

  // Creado: se muestran las credenciales y se saca el formulario de la vista,
  // para que nadie lo mande dos veces creyendo que no funcionó.
  if (estado.mostrarUnaVez) {
    return (
      <div className="space-y-4">
        <SecretoUnaVez {...estado.mostrarUnaVez} />
        <div className="flex gap-2">
          <BotonEnlace href="/admin">Ir a clientes</BotonEnlace>
          <BotonEnlace variant="outline" href="/admin/clientes/nuevo">
            Crear otro
          </BotonEnlace>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre del complejo</Label>
        <Input id="nombre" name="nombre" required placeholder="Club Chinda" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="planId">Plan</Label>
        <SelectNativo id="planId" name="planId" required defaultValue="">
          <option value="" disabled>
            Elegí un plan
          </option>
          {planes.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.nombre} — {plan.maxAgentes} agente(s),{" "}
              {plan.maxConversacionesMes} conversaciones/mes
            </option>
          ))}
        </SelectNativo>
      </div>

      <div className="space-y-2">
        <Label htmlFor="emailOwner">Email del dueño</Label>
        <Input
          id="emailOwner"
          name="emailOwner"
          type="email"
          required
          placeholder="dueno@complejo.com"
        />
        <p className="text-xs text-neutral-500">
          Con este email entra al panel. La contraseña se genera automáticamente.
        </p>
      </div>

      <div className="flex gap-2 pt-2">
        <BotonSubmit />
        <BotonEnlace variant="outline" href="/admin">
          Cancelar
        </BotonEnlace>
      </div>
    </form>
  );
}
