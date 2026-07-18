"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { editarConfigAgenteAction, type EstadoAgente } from "@/app/dashboard/agentes/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const INICIAL: EstadoAgente = {};

export type ConfigAgente = {
  id: string;
  nombre: string;
  deporte: string;
  direccion: string | null;
  telefonoContacto: string | null;
  tono: string | null;
  promptBase: string;
  anticipacionMinHoras: number | null;
  politicaCancelacion: string | null;
  senia: string | null;
  faq: string | null;
};

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando..." : "Guardar cambios"}
    </Button>
  );
}

export function ConfigAgenteForm({ agente }: { agente: ConfigAgente }) {
  const [estado, accion] = useActionState(editarConfigAgenteAction, INICIAL);
  // Los defaultValue se congelan al montar: tras guardar, el server component
  // vuelve a renderizar con los datos nuevos, y si el defaultValue cambiara, Base
  // UI avisa que un campo no controlado cambió su default. Como la página es por
  // agente (se remonta al cambiar de id), congelar el inicial es seguro.
  const [inicial] = useState(agente);

  return (
    <form action={accion} className="space-y-5">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert>
          <AlertDescription>Cambios guardados.</AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="agenteId" value={agente.id} />

      <div className="space-y-4">
        <h3 className="etiqueta text-xs text-neutral-500">Negocio</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre de la sede</Label>
            <Input id="nombre" name="nombre" required defaultValue={inicial.nombre} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="deporte">Deporte</Label>
            <Input id="deporte" name="deporte" required defaultValue={inicial.deporte} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="direccion">Dirección</Label>
            <Input
              id="direccion"
              name="direccion"
              defaultValue={inicial.direccion ?? ""}
              placeholder="Av. Siempre Viva 123"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefonoContacto">Teléfono de contacto</Label>
            <Input
              id="telefonoContacto"
              name="telefonoContacto"
              defaultValue={inicial.telefonoContacto ?? ""}
              placeholder="11 5555-5555"
            />
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div>
          <h3 className="etiqueta text-xs text-neutral-500">Personalidad del agente</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Cómo habla y qué sabe el asistente. Los cambios se guardan en Vibo;
            se aplican al agente cuando el equipo sincroniza la configuración.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tono">Tono</Label>
          <Input
            id="tono"
            name="tono"
            defaultValue={inicial.tono ?? ""}
            placeholder="Cercano y breve"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="promptBase">Prompt base</Label>
          <Textarea
            id="promptBase"
            name="promptBase"
            required
            rows={5}
            defaultValue={inicial.promptBase}
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="etiqueta text-xs text-neutral-500">Reglas de reserva</h3>
        <div className="space-y-2">
          <Label htmlFor="anticipacionMinHoras">
            Anticipación mínima <span className="text-neutral-400">(horas)</span>
          </Label>
          <Input
            id="anticipacionMinHoras"
            name="anticipacionMinHoras"
            type="number"
            min={0}
            max={999}
            defaultValue={inicial.anticipacionMinHoras ?? ""}
            placeholder="2"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="politicaCancelacion">Política de cancelación</Label>
          <Textarea
            id="politicaCancelacion"
            name="politicaCancelacion"
            rows={2}
            defaultValue={inicial.politicaCancelacion ?? ""}
            placeholder="Se puede cancelar hasta 2 horas antes sin cargo."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="senia">Seña / adelanto</Label>
          <Textarea
            id="senia"
            name="senia"
            rows={2}
            defaultValue={inicial.senia ?? ""}
            placeholder="Se pide una seña del 50% para confirmar."
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="faq">Preguntas frecuentes</Label>
        <Textarea
          id="faq"
          name="faq"
          rows={4}
          defaultValue={inicial.faq ?? ""}
          placeholder="Estacionamiento, alquiler de paletas, formas de pago…"
        />
      </div>

      <BotonGuardar />
    </form>
  );
}
