"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { alternarPausaAction, type EstadoAgente } from "@/app/dashboard/agentes/actions";
import { Button } from "@/components/ui/button";
// El estado del agente en la base. Se alias-a porque en este archivo
// `EstadoAgente` ya nombra al resultado de la Server Action, que es otra cosa.
import type { EstadoAgente as EstadoAgenteValor } from "@/generated/prisma/enums";

const INICIAL: EstadoAgente = {};

function Boton({ estado }: { estado: EstadoAgenteValor }) {
  const { pending } = useFormStatus();
  const activo = estado === "ACTIVO";

  // Tres estados que el cliente no puede cambiar desde acá, cada uno por un
  // motivo distinto — y el texto dice cuál, porque lo que tiene que hacer para
  // salir de cada uno es diferente.
  const bloqueado: Partial<Record<EstadoAgenteValor, { etiqueta: string; ayuda: string }>> = {
    PAUSADO_LIMITE: {
      etiqueta: "Pausado — límite de plan",
      ayuda: "Se reactiva al empezar el próximo ciclo, o subiendo de plan",
    },
    PAUSADO_POR_PAGO: {
      etiqueta: "Pausado — falta de pago",
      ayuda: "Se reactiva al regularizar la suscripción",
    },
    EN_CONFIGURACION: {
      etiqueta: "Todavía no conectado",
      ayuda: "Vibo lo activa cuando termina de conectarlo",
    },
  };

  const freno = bloqueado[estado];

  return (
    <Button
      type="submit"
      size="sm"
      variant={activo ? "outline" : "default"}
      disabled={pending || freno !== undefined}
      title={freno?.ayuda}
    >
      {pending
        ? "Guardando..."
        : (freno?.etiqueta ?? (activo ? "Pausar bot" : "Reactivar bot"))}
    </Button>
  );
}

/**
 * Toggle activo/pausado del bot (requerimientos §7).
 *
 * Deshabilitado en tres estados que el cliente no puede cambiar solo:
 *  - PAUSADO_LIMITE: lo levanta el ciclo o el admin (§4.2). Reactivar acá no
 *    tendría efecto real si el pozo sigue agotado.
 *  - PAUSADO_POR_PAGO: se levanta cobrando (SDD v2 §4.4). Si el cliente pudiera
 *    reactivarlo, el corte por falta de pago no cortaría nada.
 *  - EN_CONFIGURACION: el paso a ACTIVO es una acción del admin de Vibo, después
 *    de cargar y verificar las credenciales reales (SDD v2 §2). Dejar que el
 *    cliente lo active sería prometerle un bot que no tiene WhatsApp conectado.
 */
export function TogglePausa({
  agenteId,
  estado,
}: {
  agenteId: string;
  estado: EstadoAgenteValor;
}) {
  const [resultado, accion] = useActionState(alternarPausaAction, INICIAL);

  return (
    <div className="space-y-1">
      <form action={accion}>
        <input type="hidden" name="agenteId" value={agenteId} />
        <Boton estado={estado} />
      </form>
      {resultado.error && (
        <p className="text-vibo-acento max-w-xs text-xs">{resultado.error}</p>
      )}
    </div>
  );
}
