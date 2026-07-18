"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  pedirRecuperacionAction,
  type EstadoFormulario,
} from "@/app/(auth)/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BotonEnlace } from "@/components/ui/boton-enlace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ESTADO_INICIAL: EstadoFormulario = {};

function BotonSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
      {pending ? "Enviando..." : "Enviarme el link"}
    </Button>
  );
}

export function RecuperarForm() {
  const [estado, formAction] = useActionState(
    pedirRecuperacionAction,
    ESTADO_INICIAL,
  );

  // El mensaje de éxito es el mismo exista o no la cuenta, así que una vez
  // enviado no tiene sentido dejar el formulario a la vista.
  if (estado.ok) {
    return (
      <div className="space-y-5">
        <div className="callout bg-neutral-50 px-4 py-3">
          <p className="text-sm">{estado.ok}</p>
        </div>
        <BotonEnlace
          href="/login"
          variant="outline"
          size="lg"
          className="w-full"
        >
          Volver a iniciar sesión
        </BotonEnlace>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

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

      <BotonSubmit />

      <p className="text-center text-sm">
        <Link
          href="/login"
          className="text-neutral-500 hover:text-vibo-rojo underline-offset-4 transition-colors hover:underline"
        >
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}
