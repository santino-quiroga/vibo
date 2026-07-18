"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  restablecerPasswordAction,
  type EstadoFormulario,
} from "@/app/(auth)/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ESTADO_INICIAL: EstadoFormulario = {};

function BotonSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
      {pending ? "Guardando..." : "Guardar contraseña"}
    </Button>
  );
}

export function RestablecerForm({ token }: { token: string }) {
  const [estado, formAction] = useActionState(
    restablecerPasswordAction,
    ESTADO_INICIAL,
  );

  return (
    <form action={formAction} className="space-y-5">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="token" value={token} />

      <div className="space-y-2">
        <Label htmlFor="password" className="etiqueta">
          Contraseña nueva
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmacion" className="etiqueta">
          Repetir contraseña
        </Label>
        <Input
          id="confirmacion"
          name="confirmacion"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
        />
      </div>

      <BotonSubmit />
    </form>
  );
}
