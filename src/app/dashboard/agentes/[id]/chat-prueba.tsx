"use client";

import { useState } from "react";

import { responderPruebaAction, type EstadoPrueba } from "@/app/dashboard/agentes/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Turno = { rol: "user" | "assistant"; contenido: string };

/**
 * Chat de prueba del agente (SDD v2 §3).
 *
 * La conversación vive **sólo acá, en el estado del componente**: no se
 * persiste, no crea `Conversacion` ni `Mensaje`, y se pierde al recargar. Por
 * eso el historial viaja al servidor en cada envío — no hay dónde leerlo.
 *
 * Se maneja con `useState` y no con `useActionState` porque hace falta ir
 * acumulando turnos: la acción devuelve una respuesta suelta, y el hilo lo arma
 * este componente.
 */
export function ChatPrueba({
  agenteId,
  cupoInicial,
  tope,
  enConfiguracion,
}: {
  agenteId: string;
  cupoInicial: number;
  tope: number;
  enConfiguracion: boolean;
}) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restantes, setRestantes] = useState(cupoInicial);

  const sinCupo = restantes <= 0;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const mensaje = texto.trim();
    if (!mensaje || enviando) return;

    setError(null);
    setEnviando(true);

    // Se pinta el mensaje del usuario antes de la respuesta: la espera de la IA
    // es de segundos y ver el propio mensaje en el hilo es lo que hace que la
    // demora se sienta como "está pensando" y no como "se colgó".
    const historial = turnos;
    setTurnos([...historial, { rol: "user", contenido: mensaje }]);
    setTexto("");

    const datos = new FormData();
    datos.set("agenteId", agenteId);
    datos.set("texto", mensaje);
    datos.set("historial", JSON.stringify(historial));

    const resultado: EstadoPrueba = await responderPruebaAction({}, datos);

    if (resultado.restantes !== undefined) setRestantes(resultado.restantes);

    if (resultado.error) {
      setError(resultado.error);
      // Se devuelve el texto al campo para no perder lo escrito, igual que en
      // el envío manual de Conversaciones (SDD §4.4).
      setTexto(mensaje);
      setTurnos(historial);
    } else if (resultado.respuesta) {
      setTurnos([
        ...historial,
        { rol: "user", contenido: mensaje },
        { rol: "assistant", contenido: resultado.respuesta },
      ]);
    }

    setEnviando(false);
  }

  return (
    <div className="space-y-4">
      {/* Disclaimer obligatorio del §3. Va arriba y siempre visible, no como
          nota al pie: el riesgo real es que el dueño crea que reservó algo. */}
      <div className="callout bg-neutral-100 px-4 py-3 text-sm">
        <span className="font-semibold">Esto es una simulación.</span> Las
        reservas que se mencionen acá <span className="font-semibold">no son reales</span>:
        no se guardan en tu base de turnos ni le llega nada a nadie por WhatsApp.
        Tampoco consume las conversaciones de tu plan.
      </div>

      {enConfiguracion && (
        <p className="text-sm text-neutral-500">
          Este agente todavía no está conectado a WhatsApp. Probalo acá todas las
          veces que quieras: cuando esté listo, Vibo lo activa.
        </p>
      )}

      {turnos.length > 0 && (
        <div className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
          {turnos.map((turno, i) => {
            const propio = turno.rol === "user";
            return (
              <div
                key={i}
                className={cn("flex", propio ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
                    propio
                      ? "bg-neutral-100 text-foreground"
                      : "bg-vibo-negro text-vibo-blanco",
                  )}
                >
                  {turno.contenido}
                </div>
              </div>
            );
          })}
          {enviando && (
            <p className="text-xs text-neutral-400">El agente está escribiendo…</p>
          )}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={enviar} className="space-y-2">
        <Textarea
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={sinCupo}
          placeholder={
            sinCupo
              ? "Llegaste al tope de pruebas por hoy"
              : "Escribile como si fueras un cliente…"
          }
          aria-label="Mensaje de prueba"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-neutral-500">
            Te quedan <span className="tabular-nums">{restantes}</span> de {tope}{" "}
            mensajes de prueba hoy.
          </p>
          <div className="flex items-center gap-2">
            {turnos.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTurnos([]);
                  setError(null);
                }}
              >
                Empezar de nuevo
              </Button>
            )}
            <Button type="submit" size="sm" disabled={enviando || sinCupo || !texto.trim()}>
              {enviando ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
