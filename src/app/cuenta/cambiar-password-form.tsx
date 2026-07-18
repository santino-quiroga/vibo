"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { cambiarPasswordAction, type EstadoCuenta } from "@/app/cuenta/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INICIAL: EstadoCuenta = {};

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando..." : "Cambiar contraseña"}
    </Button>
  );
}

export function CambiarPasswordForm() {
  const [estado, accion] = useActionState(cambiarPasswordAction, INICIAL);

  if (estado.ok) {
    return (
      <Alert>
        <AlertDescription>
          Tu contraseña se cambió. La próxima vez que entres, usá la nueva.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={accion} className="space-y-4">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="actual">Contraseña actual</Label>
        <Input id="actual" name="actual" type="password" autoComplete="current-password" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nueva">Contraseña nueva</Label>
        <Input id="nueva" name="nueva" type="password" autoComplete="new-password" required />
        <p className="text-xs text-neutral-500">Al menos 8 caracteres.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="repetir">Repetir la nueva</Label>
        <Input id="repetir" name="repetir" type="password" autoComplete="new-password" required />
      </div>

      <BotonGuardar />
    </form>
  );
}
