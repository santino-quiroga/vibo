import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BotonEnlace } from "@/components/ui/boton-enlace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { obtenerHilo, marcarLeida } from "@/lib/cliente/conversaciones";
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

  return (
    <div className="space-y-4">
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
                  vista sin scrollear todo. */}
              <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
                {hilo.mensajes.length === 0 ? (
                  <p className="py-6 text-center text-sm text-neutral-500">
                    Todavía no hay mensajes en esta conversación.
                  </p>
                ) : (
                  hilo.mensajes.map((mensaje) => {
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

        {/* Panel lateral de contacto (requerimientos punto 9). El turno asociado
            queda para más adelante: cruzar por teléfono contra Airtable tiene su
            propia complejidad de formatos y no bloquea el resto de la sección. */}
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
        </aside>
      </div>
    </div>
  );
}
