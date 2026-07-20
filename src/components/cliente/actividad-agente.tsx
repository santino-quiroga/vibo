import { CalendarCheck, Clock, MessageCircle, Moon, Zap } from "lucide-react";
import type { ComponentType } from "react";

import { formatearFechaCorta, formatearHora } from "@/lib/airtable/tipos";
import type { ActividadIA } from "@/lib/cliente/actividad";
import type { UltimoTurnoBot } from "@/lib/cliente/datos";
import { haceCuanto } from "@/lib/cliente/formato";
import { cn } from "@/lib/utils";

/**
 * Actividad del agente: hace tangible el trabajo invisible del bot.
 *
 * Arriba, el estado en vivo (el punto late, como el asterisco de la marca).
 * Abajo, una línea de tiempo: cada hecho con su ícono, su rótulo y su dato.
 * Todo sale de la base propia; con n8n sin reportar todavía, arranca en cero.
 */

function Evento({
  Icono,
  label,
  valor,
  destacado = false,
  ultimo = false,
}: {
  Icono: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  valor: string;
  destacado?: boolean;
  ultimo?: boolean;
}) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {/* El hilo de la línea de tiempo. No baja del último ítem. */}
      {!ultimo && (
        <span
          aria-hidden="true"
          className="absolute top-9 bottom-0 left-4 w-px bg-neutral-200"
        />
      )}

      <span
        className={cn(
          "relative z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-full",
          destacado
            ? "bg-vibo-rojo-suave text-vibo-rojo"
            : "bg-neutral-100 text-neutral-400",
        )}
      >
        <Icono className="size-4" strokeWidth={1.75} />
      </span>

      <div className="min-w-0 pt-0.5">
        <p className="text-xs text-neutral-400">{label}</p>
        <p className="text-foreground truncate text-sm font-medium tabular-nums">
          {valor}
        </p>
      </div>
    </li>
  );
}

export function ActividadAgente({
  actividad,
  ultimoTurno,
}: {
  actividad: ActividadIA;
  ultimoTurno: UltimoTurnoBot;
}) {
  const { operativo } = actividad;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 pb-5">
        <span className="flex items-center gap-2.5">
          {/* Verde y no rojo: acá "operativo" es un estado de salud, no un
              acento de marca. El rojo queda para la identidad. */}
          <span
            className={cn(
              "relative inline-flex size-2.5 rounded-full",
              operativo ? "pulso-vivo text-exito bg-exito" : "bg-neutral-300",
            )}
            aria-hidden="true"
          />
          <span className="text-sm font-medium">
            {operativo ? "Agente operativo" : "Agente en pausa"}
          </span>
        </span>

        <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-500 tabular-nums">
          {actividad.sedesActivas}/{actividad.totalSedes} sedes
        </span>
      </div>

      <ul className="border-t border-neutral-200 pt-5">
        <Evento
          Icono={Zap}
          label="Respuestas automatizadas"
          valor={String(actividad.respuestas)}
          destacado={actividad.respuestas > 0}
        />
        <Evento
          Icono={Moon}
          label="Fuera de horario comercial"
          valor={String(actividad.fueraHorario)}
        />
        <Evento
          Icono={MessageCircle}
          label="Última respuesta"
          valor={actividad.ultimaRespuesta ? haceCuanto(actividad.ultimaRespuesta) : "—"}
        />
        <Evento
          Icono={ultimoTurno ? CalendarCheck : Clock}
          label="Último turno agendado"
          ultimo
          valor={
            ultimoTurno
              ? `${formatearFechaCorta(ultimoTurno.fecha)}${
                  ultimoTurno.horaInicioMin !== null
                    ? ` · ${formatearHora(ultimoTurno.horaInicioMin)}`
                    : ""
                }`
              : "—"
          }
        />
      </ul>

      {actividad.respuestas === 0 && (
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">
          Todavía no hay actividad registrada. Aparece acá cuando el agente
          empiece a responder por WhatsApp.
        </p>
      )}
    </div>
  );
}
