"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { activarAgenteAction, type EstadoAdmin } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const INICIAL: EstadoAdmin = {};

/**
 * El checklist que se verifica ANTES de activar (SDD v2 §2).
 *
 * No se comprueba solo: son cosas que viven en Airtable, en n8n y en Evolution,
 * fuera de Vibo. Están escritas acá porque activar significa exactamente "ya
 * verifiqué esto", y las tres salieron de problemas reales al dar de alta el
 * primer agente — no son ceremonia.
 */
const CHECKLIST = [
  {
    id: "canchas",
    texto: "Las canchas en Airtable se llaman «Cancha 1», «Cancha 2»…",
    porque: "Es como Vibo cruza precios con reservas. Otro formato y no matchea.",
  },
  {
    id: "typecast",
    texto: "El nodo de Airtable en n8n tiene el typecast desactivado",
    porque:
      "Con typecast, un valor mal formado crea una opción nueva en vez de fallar, y ensucia la tabla en silencio.",
  },
  {
    id: "evolution",
    texto: "La instancia de Evolution está vinculada a WhatsApp",
    porque: "Si no, el bot procesa el mensaje y la respuesta no sale nunca.",
  },
  {
    id: "contexto",
    texto: "El workflow de n8n apunta a /contexto de este agente y responde",
    porque: "Es lo que le da el prompt, las reglas y los precios al bot.",
  },
];

function BotonActivar({ habilitado }: { habilitado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || !habilitado}>
      {pending ? "Activando..." : "Activar agente"}
    </Button>
  );
}

/**
 * Activa un agente EN_CONFIGURACION.
 *
 * El checklist no se manda al servidor ni se guarda: es un freno para el que
 * activa, no un dato. La acción del servidor igual verifica el estado — tildar
 * las casillas no es lo que autoriza nada.
 */
export function ActivarAgenteForm({ agenteId }: { agenteId: string }) {
  const [estado, accion] = useActionState(activarAgenteAction, INICIAL);
  const [tildados, setTildados] = useState<Set<string>>(new Set());

  const listo = CHECKLIST.every((item) => tildados.has(item.id));

  function alternar(id: string) {
    setTildados((previo) => {
      const siguiente = new Set(previo);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        Este agente todavía no atiende a nadie. Al activarlo empieza a responder
        WhatsApps de clientes reales.
      </p>

      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <ul className="space-y-3">
        {CHECKLIST.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                className="accent-vibo-negro mt-0.5"
                checked={tildados.has(item.id)}
                onChange={() => alternar(item.id)}
              />
              <span>
                <span className="block text-sm">{item.texto}</span>
                <span className="block text-xs text-neutral-500">{item.porque}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <form action={accion}>
        <input type="hidden" name="agenteId" value={agenteId} />
        <BotonActivar habilitado={listo} />
      </form>

      {!listo && (
        <p className="text-xs text-neutral-500">
          Tildá los cuatro puntos para habilitar la activación.
        </p>
      )}
    </div>
  );
}
