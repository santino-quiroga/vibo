"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loginAction, type EstadoFormulario } from "@/app/(auth)/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ESTADO_INICIAL: EstadoFormulario = {};

function BotonSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
      {pending ? "Ingresando..." : "Iniciar sesión"}
    </Button>
  );
}

export function LoginForm({
  callbackUrl,
  passwordActualizada,
}: {
  callbackUrl?: string;
  passwordActualizada: boolean;
}) {
  const [estado, formAction] = useActionState(loginAction, ESTADO_INICIAL);

  return (
    <form action={formAction} className="space-y-5">
      {passwordActualizada && !estado.error && (
        // Sin verde en la paleta, el aviso usa la barra roja del sistema, que
        // en el manual marca atención y no peligro.
        <div className="callout bg-neutral-50 px-4 py-3">
          <p className="text-sm">Tu contraseña se actualizó. Ya podés entrar.</p>
        </div>
      )}

      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}

      <div className="space-y-2">
        <Label htmlFor="email" className="etiqueta">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="tu@complejo.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="etiqueta">
          Contraseña
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <BotonSubmit />

      <p className="text-center text-sm">
        <Link
          href="/recuperar-password"
          className="text-neutral-500 hover:text-vibo-rojo underline-offset-4 transition-colors hover:underline"
        >
          Olvidé mi contraseña
        </Link>
      </p>
    </form>
  );
}
