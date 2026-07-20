import type { Metadata } from "next";
import Link from "next/link";

import { AutoRefresco } from "@/components/cliente/auto-refresco";
import { EstadoConversacionBadge } from "@/components/cliente/estado-conversacion";
import { FiltroConversaciones } from "@/components/cliente/filtro-conversaciones";
import { Card, CardContent } from "@/components/ui/card";
import {
  esFiltroEstado,
  listarConversaciones,
  type FiltroEstado,
} from "@/lib/cliente/conversaciones";
import { horaRelativa } from "@/lib/cliente/formato";
import { requerirClienteOwner } from "@/lib/dal";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Conversaciones | Vibo" };

export default async function ConversacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string; estado?: string; q?: string }>;
}) {
  await requerirClienteOwner();

  const params = await searchParams;
  const estado: FiltroEstado = esFiltroEstado(params.estado) ? params.estado : "todas";

  const { conversaciones, agentes } = await listarConversaciones({
    agenteId: params.sede,
    estado,
    busqueda: params.q,
  });

  const variasSedes = agentes.length > 1;

  return (
    <div className="space-y-6">
      {/* La bandeja se lee sola de Postgres, así que refrescar seguido es barato. */}
      <AutoRefresco segundos={10} />
      <div>
        <h1 className="t-pagina">Conversaciones</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Los chats de WhatsApp de tus agentes. Podés tomar el control de uno
          cuando haga falta atender a mano.
        </p>
      </div>

      {agentes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">Todavía no tenés agentes.</p>
            <p className="mt-2 text-sm text-neutral-500">
              Cuando tengas uno andando, sus conversaciones aparecen acá.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <FiltroConversaciones
            sedeActual={params.sede ?? null}
            estadoActual={estado}
            busquedaActual={params.q ?? ""}
          />

          {conversaciones.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-sm text-neutral-500">
                  No hay conversaciones que coincidan con el filtro.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-neutral-200">
                  {conversaciones.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/dashboard/conversaciones/${c.id}`}
                        className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-neutral-100"
                      >
                        {/* El punto de "sin leer" ocupa lugar siempre, aunque
                            esté vacío, para que las filas no bailen al alinear. */}
                        <span className="mt-1.5 flex w-2 shrink-0 justify-center">
                          {c.sinLeer && (
                            <span
                              className="bg-vibo-rojo size-2 rounded-full"
                              aria-label="Sin leer"
                            />
                          )}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span
                              className={cn(
                                "truncate",
                                c.sinLeer ? "font-semibold" : "font-medium",
                              )}
                            >
                              {c.contactoNombre ?? c.contactoTelefono}
                            </span>
                            <span className="shrink-0 text-xs text-neutral-500 tabular-nums">
                              {horaRelativa(c.ultimoMensajeAt)}
                            </span>
                          </div>

                          <p className="mt-0.5 truncate text-sm text-neutral-500">
                            {c.ultimoTexto ?? "Sin mensajes"}
                          </p>

                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <EstadoConversacionBadge estado={c.estado} />
                            {c.pausadaManual && (
                              <span className="etiqueta text-[10px] text-neutral-400">
                                En manual
                              </span>
                            )}
                            {variasSedes && (
                              <span className="text-xs text-neutral-400">
                                {c.agenteNombre}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
