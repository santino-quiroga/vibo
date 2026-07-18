"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  alternarControlAction,
  enviarMensajeManualAction,
  type EstadoChat,
} from "@/app/dashboard/conversaciones/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const INICIAL: EstadoChat = {};

function BotonEnviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Enviando..." : "Enviar"}
    </Button>
  );
}

function BotonControl({ tomar }: { tomar: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={tomar ? "default" : "outline"} disabled={pending}>
      {pending
        ? "Guardando..."
        : tomar
          ? "Tomar el control"
          : "Devolver a la IA"}
    </Button>
  );
}

/**
 * La parte interactiva del hilo: tomar/devolver el control y enviar.
 *
 * El envío está deshabilitado a nivel de acción si la conversación no es del
 * cliente (lo verifica el servidor), así que acá no hace falta más que mostrar
 * el estado. El caja de texto queda igual si el envío falla, para no perder lo
 * escrito (SDD 4.4).
 */
export function PanelChat({
  conversacionId,
  pausadaManual,
}: {
  conversacionId: string;
  pausadaManual: boolean;
}) {
  const [estadoControl, accionControl] = useActionState(alternarControlAction, INICIAL);
  const [estadoEnvio, accionEnvio] = useActionState(enviarMensajeManualAction, INICIAL);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-500">
          {pausadaManual
            ? "Tomaste el control: la IA no le responde a este contacto."
            : "La IA está atendiendo este chat."}
        </p>
        <form action={accionControl}>
          <input type="hidden" name="conversacionId" value={conversacionId} />
          <input type="hidden" name="tomar" value={pausadaManual ? "0" : "1"} />
          <BotonControl tomar={!pausadaManual} />
        </form>
      </div>

      {estadoControl.error && (
        <Alert variant="destructive">
          <AlertDescription>{estadoControl.error}</AlertDescription>
        </Alert>
      )}

      <form action={accionEnvio} className="space-y-2">
        <input type="hidden" name="conversacionId" value={conversacionId} />

        {estadoEnvio.error && (
          <Alert variant="destructive">
            <AlertDescription>{estadoEnvio.error}</AlertDescription>
          </Alert>
        )}

        <Textarea
          name="texto"
          rows={2}
          required
          placeholder="Escribí un mensaje…"
          aria-label="Mensaje para el contacto"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-neutral-500">
            Enviar toma el control de este chat automáticamente.
          </p>
          <BotonEnviar />
        </div>
      </form>
    </div>
  );
}
