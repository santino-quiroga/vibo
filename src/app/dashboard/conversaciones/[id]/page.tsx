import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AutoRefresco } from "@/components/cliente/auto-refresco";
import { EstadoTurno } from "@/components/cliente/estado-turno";
import { BotonEnlace } from "@/components/ui/boton-enlace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatearFechaCorta, formatearHora } from "@/lib/airtable/tipos";
import { obtenerHilo, marcarLeida } from "@/lib/cliente/conversaciones";
import { turnosDelContacto } from "@/lib/cliente/datos";
import { horaCompleta } from "@/lib/cliente/formato";
import { requerirClienteOwner } from "@/lib/dal";
import { cn } from "@/lib/utils";

import { PanelChat } from "./panel-chat";

export const metadata: Metadata = { title: "Conversación | Vibo" };

/** De qué lado va cada burbuja y cómo se rotula quién habló. */
const REMITENTE = {
  CONTACTO: { lado: "izq", etiqueta: "Contacto", burbuja: "bg-neutral-100 text-foreground" },
  IA: { lado: "der", etiqueta: "IA", burbuja: "bg-vibo-negro text-vibo-blanco" },
  HUMANO: { lado: "der", etiqueta: "Vos", burbuja: "bg-vibo-acento text-vibo-blanco" },
} as const;

export default async function HiloPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirClienteOwner();
  const { id } = await params;

  const hilo = await obtenerHilo(id);
  if (!hilo) notFound();

  // Se marca leída al abrir. Es idempotente; el contador de la navegación se
  // actualiza en la próxima navegación, no hace falta que sea al instante.
  await marcarLeida(id);

  const turnos = await turnosDelContacto(hilo.agenteId, hilo.contactoTelefono);

  return (
    <div className="space-y-4">
      {/* El hilo abierto es donde más se nota: si el contacto responde, tiene que
          aparecer sin recargar. El componente se saltea el refresco mientras hay
          algo escrito en el cuadro de texto. */}
      <AutoRefresco segundos={10} />
      <BotonEnlace variant="ghost" size="sm" href="/dashboard/conversaciones">
        ← Conversaciones
      </BotonEnlace>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {hilo.contactoNombre ?? hilo.contactoTelefono}
              </CardTitle>
              <p className="text-sm text-neutral-500">
                {hilo.agenteNombre}
                {hilo.contactoNombre ? ` · ${hilo.contactoTelefono}` : ""}
              </p>
            </CardHeader>
            <CardContent>
              {/* El hilo scrollea dentro de su caja para no estirar la página en
                  chats largos. Alto acotado para que la barra de envío quede a la
                  vista sin scrollear todo.

                  `flex-col-reverse` + la lista invertida deja la caja anclada
                  abajo (último mensaje) desde el primer render, sin parpadeo ni
                  JS: al abrir se ven los mensajes más nuevos, como en WhatsApp.
                  El orden visual sigue siendo viejo→nuevo de arriba hacia abajo.
                  `justify-end` mantiene los chats cortos pegados arriba. */}
              <div className="flex max-h-[55vh] flex-col-reverse justify-end gap-3 overflow-y-auto pr-1">
                {hilo.mensajes.length === 0 ? (
                  <p className="py-6 text-center text-sm text-neutral-500">
                    Todavía no hay mensajes en esta conversación.
                  </p>
                ) : (
                  hilo.mensajes.slice().reverse().map((mensaje) => {
                    const config = REMITENTE[mensaje.remitente];
                    const derecha = config.lado === "der";
                    return (
                      <div
                        key={mensaje.id}
                        className={cn("flex", derecha ? "justify-end" : "justify-start")}
                      >
                        <div className="max-w-[80%]">
                          <div
                            className={cn(
                              "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
                              config.burbuja,
                            )}
                          >
                            {mensaje.contenido}
                          </div>
                          <div
                            className={cn(
                              "mt-0.5 text-[10px] text-neutral-400",
                              derecha ? "text-right" : "text-left",
                            )}
                          >
                            {config.etiqueta} · {horaCompleta(mensaje.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <PanelChat conversacionId={hilo.id} pausadaManual={hilo.pausadaManual} />
            </CardContent>
          </Card>
        </div>

        {/* Panel lateral de contacto (requerimientos punto 9): datos, y el
            turno asociado si existe. */}
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contacto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="etiqueta block text-xs text-neutral-500">Nombre</span>
                {hilo.contactoNombre ?? "Sin nombre"}
              </div>
              <div>
                <span className="etiqueta block text-xs text-neutral-500">Teléfono</span>
                <span className="font-mono">{hilo.contactoTelefono}</span>
              </div>
              <div>
                <span className="etiqueta block text-xs text-neutral-500">Sede</span>
                {hilo.agenteNombre}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Turnos de este contacto</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {turnos.length === 0 ? (
                <p className="text-neutral-500">
                  No hay turnos a nombre de este teléfono en los últimos 30 días
                  ni en los próximos 90.
                </p>
              ) : (
                <>
                  <ul className="divide-y divide-neutral-200">
                    {turnos.map((turno) => (
                      <li key={turno.recordId} className="flex items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {formatearFechaCorta(turno.fecha)}
                            {turno.horaInicioMin !== null && (
                              <span className="ml-1.5 font-mono text-neutral-500">
                                {formatearHora(turno.horaInicioMin)}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {turno.cancha ?? "Sin cancha"}
                          </p>
                        </div>
                        <EstadoTurno estado={turno.estado} className="text-[10px]" />
                      </li>
                    ))}
                  </ul>
                  {/* El cruce es por los últimos dígitos del teléfono, no por un
                      id compartido: conviene que quien lo lee sepa que es una
                      coincidencia y no un vínculo garantizado. */}
                  <p className="mt-3 text-xs text-neutral-400">
                    Coincidencia por teléfono con tu base de turnos.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
