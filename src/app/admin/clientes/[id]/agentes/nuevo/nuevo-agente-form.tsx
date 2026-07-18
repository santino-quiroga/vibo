"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { crearAgenteAction, type EstadoAdmin } from "@/app/admin/actions";
import { SecretoUnaVez } from "@/components/admin/secreto-una-vez";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BotonEnlace } from "@/components/ui/boton-enlace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const ESTADO_INICIAL: EstadoAdmin = {};

function BotonSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creando..." : "Crear agente"}
    </Button>
  );
}

export function NuevoAgenteForm({ clienteId }: { clienteId: string }) {
  const [estado, formAction] = useActionState(crearAgenteAction, ESTADO_INICIAL);

  if (estado.mostrarUnaVez) {
    return (
      <div className="space-y-4">
        <SecretoUnaVez {...estado.mostrarUnaVez} />
        <BotonEnlace href={`/admin/clientes/${clienteId}`}>
          Volver al cliente
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

      <input type="hidden" name="clienteId" value={clienteId} />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nombre">Nombre del agente / sede</Label>
          <Input id="nombre" name="nombre" required placeholder="Club Chinda Fútbol 5" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="deporte">Deporte</Label>
          <Input id="deporte" name="deporte" required placeholder="Fútbol 5" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="promptBase">Prompt base</Label>
          <Textarea
            id="promptBase"
            name="promptBase"
            required
            rows={5}
            placeholder="Sos el asistente de reservas de..."
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">Airtable</h3>
          <p className="text-xs text-neutral-500">
            La base de este cliente. Las canchas tienen que llamarse
            exactamente &quot;Cancha 1&quot;, &quot;Cancha 2&quot;, etc.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="airtableBaseId">Base ID</Label>
          <Input
            id="airtableBaseId"
            name="airtableBaseId"
            required
            placeholder="appXXXXXXXXXXXXXX"
            className="font-mono"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="airtableApiKey">API key</Label>
          <Input
            id="airtableApiKey"
            name="airtableApiKey"
            type="password"
            required
            placeholder="patXXXXXXXXXXXXXX..."
            className="font-mono"
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">Evolution API</h3>
          <p className="text-xs text-neutral-500">
            La instancia de WhatsApp de este cliente.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="evolutionInstanceId">Instancia</Label>
          <Input
            id="evolutionInstanceId"
            name="evolutionInstanceId"
            required
            className="font-mono"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="evolutionApiUrl">URL</Label>
          <Input
            id="evolutionApiUrl"
            name="evolutionApiUrl"
            type="password"
            required
            placeholder="https://evolution.tudominio.com"
            className="font-mono"
          />
          <p className="text-xs text-neutral-500">
            Usá https si podés: por acá viajan la API key y los mensajes. Con http
            van sin cifrar (se puede guardar igual, pero queda advertido).
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="evolutionApiKey">API key</Label>
          <Input
            id="evolutionApiKey"
            name="evolutionApiKey"
            type="password"
            required
            className="font-mono"
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="n8nWorkflowId">
          Workflow de n8n <span className="text-neutral-400">(opcional)</span>
        </Label>
        <Input id="n8nWorkflowId" name="n8nWorkflowId" className="font-mono" />
        <p className="text-xs text-neutral-500">
          Solo referencia: n8n se administra fuera de Vibo.
        </p>
      </div>

      <div className="flex gap-2 pt-2">
        <BotonSubmit />
        <BotonEnlace variant="outline" href={`/admin/clientes/${clienteId}`}>
          Cancelar
        </BotonEnlace>
      </div>
    </form>
  );
}
