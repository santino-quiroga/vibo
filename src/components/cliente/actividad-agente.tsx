import { formatearFechaCorta, formatearHora } from "@/lib/airtable/tipos";
import type { ActividadIA } from "@/lib/cliente/actividad";
import type { UltimoTurnoBot } from "@/lib/cliente/datos";
import { haceCuanto } from "@/lib/cliente/formato";
import { cn } from "@/lib/utils";

/**
 * Widget de actividad de la IA: hace tangible el trabajo invisible del bot.
 *
 * Un status en vivo arriba (el punto rojo late, como el asterisco de la marca)
 * y, debajo, métricas de esfuerzo en texto técnico chico. Todo dato real de la
 * base; con n8n sin cablear todavía, arranca en cero.
 */

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-black/5 pt-2 first:border-0 first:pt-0">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-medium text-foreground tabular-nums">{valor}</span>
    </div>
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
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "relative inline-flex size-2.5 rounded-full",
            operativo ? "pulso-vivo bg-vibo-rojo" : "bg-neutral-400",
          )}
          aria-hidden="true"
        />
        <span className="text-sm font-semibold">
          {operativo ? "Agente operativo" : "Agente en pausa"}
        </span>
        <span className="etiqueta ml-auto text-neutral-400">
          {actividad.sedesActivas}/{actividad.totalSedes} sedes
        </span>
      </div>

      <dl className="mt-4 space-y-2 font-mono text-xs">
        <Fila label="Respuestas automatizadas" valor={String(actividad.respuestas)} />
        <Fila label="Fuera de horario comercial" valor={String(actividad.fueraHorario)} />
        <Fila
          label="Última respuesta"
          valor={actividad.ultimaRespuesta ? haceCuanto(actividad.ultimaRespuesta) : "—"}
        />
        <Fila
          label="Último turno agendado"
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
      </dl>

      {actividad.respuestas === 0 && (
        <p className="mt-3 text-xs leading-snug text-neutral-400">
          Todavía no hay actividad registrada. Aparece acá cuando el agente
          empiece a responder por WhatsApp.
        </p>
      )}
    </div>
  );
}
