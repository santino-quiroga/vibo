"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { editarAgenteAction, type EstadoAdmin } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BotonEnlace } from "@/components/ui/boton-enlace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const ESTADO_INICIAL: EstadoAdmin = {};

type Agente = {
  id: string;
  nombre: string;
  deporte: string;
  promptBase: string;
  airtableBaseId: string;
  evolutionInstanceId: string;
  n8nWorkflowId: string | null;
};

function BotonSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando..." : "Guardar cambios"}
    </Button>
  );
}

export function EditarAgenteForm({
  agente,
  clienteId,
}: {
  agente: Agente;
  clienteId: string;
}) {
  const [estado, formAction] = useActionState(editarAgenteAction, ESTADO_INICIAL);

  return (
    <form action={formAction} className="space-y-5">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="agenteId" value={agente.id} />

      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" name="nombre" required defaultValue={agente.nombre} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="deporte">Deporte</Label>
        <Input id="deporte" name="deporte" required defaultValue={agente.deporte} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="promptBase">Prompt base</Label>
        <Textarea
          id="promptBase"
          name="promptBase"
          required
          rows={5}
          defaultValue={agente.promptBase}
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="airtableBaseId">Airtable Base ID</Label>
        <Input
          id="airtableBaseId"
          name="airtableBaseId"
          required
          className="font-mono"
          defaultValue={agente.airtableBaseId}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="airtableApiKey">
          Airtable API key{" "}
          <span className="text-neutral-400">(vacío = sin cambios)</span>
        </Label>
        <Input
          id="airtableApiKey"
          name="airtableApiKey"
          type="password"
          className="font-mono"
          placeholder="••••"
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="evolutionInstanceId">Evolution — instancia</Label>
        <Input
          id="evolutionInstanceId"
          name="evolutionInstanceId"
          required
          className="font-mono"
          defaultValue={agente.evolutionInstanceId}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="evolutionApiUrl">
          Evolution — URL <span className="text-neutral-400">(vacío = sin cambios)</span>
        </Label>
        <Input
          id="evolutionApiUrl"
          name="evolutionApiUrl"
          type="password"
          className="font-mono"
          placeholder="••••"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="evolutionApiKey">
          Evolution — API key{" "}
          <span className="text-neutral-400">(vacío = sin cambios)</span>
        </Label>
        <Input
          id="evolutionApiKey"
          name="evolutionApiKey"
          type="password"
          className="font-mono"
          placeholder="••••"
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="n8nWorkflowId">
          Workflow de n8n <span className="text-neutral-400">(opcional)</span>
        </Label>
        <Input
          id="n8nWorkflowId"
          name="n8nWorkflowId"
          className="font-mono"
          defaultValue={agente.n8nWorkflowId ?? ""}
        />
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
