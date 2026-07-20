import type { Metadata } from "next";
import Link from "next/link";

import { EstadoAgenteBadge } from "@/components/estado-agente";
import { TogglePausa } from "@/components/cliente/toggle-pausa";
import { Card, CardContent } from "@/components/ui/card";
import { agentesConMetricas } from "@/lib/cliente/agentes";
import { requerirClienteOwner } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Agentes | Vibo" };

export default async function AgentesPage() {
  const { clienteId } = await requerirClienteOwner();

  const [agentes, cliente] = await Promise.all([
    agentesConMetricas(),
    prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { plan: { select: { nombre: true, maxAgentes: true } } },
    }),
  ]);

  const maxAgentes = cliente?.plan.maxAgentes ?? 0;
  const enLimite = agentes.length >= maxAgentes;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-pagina">Agentes</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Tus sedes y cómo está configurado cada agente. Usás {agentes.length} de{" "}
          {maxAgentes} {maxAgentes === 1 ? "sede" : "sedes"} del plan{" "}
          {cliente?.plan.nombre}.
        </p>
      </div>

      {enLimite && (
        <div className="callout bg-neutral-100 px-4 py-3 text-sm">
          <span className="font-semibold">Llegaste al límite de sedes de tu plan.</span>{" "}
          Para sumar otra sede, escribile al equipo de Vibo para subir de plan. Dar
          de alta agentes lo hace Vibo, no se hace desde acá.
        </div>
      )}

      {agentes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">Todavía no tenés agentes.</p>
            <p className="mt-2 text-sm text-neutral-500">
              El equipo de Vibo los configura y te avisa cuando estén andando.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {agentes.map((agente) => (
            <Card key={agente.id}>
              <CardContent className="space-y-4 pt-6">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/dashboard/agentes/${agente.id}`}
                    className="group min-w-0"
                  >
                    <p className="truncate font-medium group-hover:underline">
                      {agente.nombre}
                    </p>
                    <p className="text-sm text-neutral-500">{agente.deporte}</p>
                  </Link>
                  <EstadoAgenteBadge estado={agente.estado} />
                </div>

                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      agente.canalConfigurado ? "bg-vibo-rojo" : "bg-neutral-300",
                    )}
                    aria-hidden="true"
                  />
                  {agente.canalConfigurado
                    ? "Canal de WhatsApp configurado"
                    : "Canal sin configurar"}
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-black/10 pt-3 text-sm">
                  <div>
                    <p className="etiqueta text-neutral-500">Turnos del mes</p>
                    <p className="text-xl font-semibold tabular-nums">
                      {agente.turnosMes ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="etiqueta text-neutral-500">Conversaciones</p>
                    <p className="text-xl font-semibold tabular-nums">
                      {agente.conversacionesMes}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-neutral-200 pt-3">
                  <Link
                    href={`/dashboard/agentes/${agente.id}`}
                    className="text-sm underline-offset-4 hover:underline"
                  >
                    Ver y editar
                  </Link>
                  <TogglePausa agenteId={agente.id} estado={agente.estado} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
