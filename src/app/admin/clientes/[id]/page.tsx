import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EstadoAgenteBadge } from "@/components/estado-agente";
import { BotonEnlace } from "@/components/ui/boton-enlace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BarraUso } from "@/components/plan/barra-uso";
import { agentesSinToken, listarPlanes, obtenerCliente } from "@/lib/admin/datos";
import { limiteAlcanzado } from "@/lib/admin/limite-agentes";
import { usoDelCliente } from "@/lib/planes/uso";
import { requerirViboAdmin } from "@/lib/dal";

import { CambiarPlanForm } from "./cambiar-plan-form";
import { ReactivarLimiteForm } from "./reactivar-limite-form";
import { RegenerarPasswordForm } from "./regenerar-password-form";

export const metadata: Metadata = { title: "Cliente | Admin Vibo" };

const formatoFecha = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default async function ClienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirViboAdmin();
  const { id } = await params;

  const [cliente, planes, sinToken] = await Promise.all([
    obtenerCliente(id),
    listarPlanes(),
    agentesSinToken(id),
  ]);
  if (!cliente) notFound();

  const uso = await usoDelCliente(cliente.id);

  const enLimite = limiteAlcanzado(cliente.agentes.length, cliente.plan.maxAgentes);
  const owner = cliente.usuarios.find((u) => u.rol === "CLIENTE_OWNER");

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <BotonEnlace variant="ghost" size="sm" className="mb-4" href="/admin">
        ← Clientes
      </BotonEnlace>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{cliente.nombre}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Alta {formatoFecha.format(cliente.createdAt)} · {cliente.id}
        </p>
      </header>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plan</CardTitle>
            <CardDescription>
              {cliente.plan.nombre} — {cliente.agentes.length} de{" "}
              {cliente.plan.maxAgentes} agente(s) usados ·{" "}
              {cliente.plan.maxConversacionesMes} conversaciones/mes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <BarraUso uso={uso} />

            {uso.bloqueado && (
              <div className="callout bg-neutral-100 px-4 py-3">
                <p className="mb-2 text-sm">
                  Reactivar levanta la pausa por límite de todas las sedes del
                  cliente. Si el pozo sigue agotado, conviene subir el plan
                  primero (arriba se ve el uso).
                </p>
                <ReactivarLimiteForm clienteId={cliente.id} />
              </div>
            )}

            <CambiarPlanForm
              clienteId={cliente.id}
              planActualId={cliente.plan.id}
              planes={planes}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Acceso del dueño</CardTitle>
            <CardDescription>
              Estas son las credenciales que se le entregan al cliente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {owner ? (
              <div className="space-y-3">
                <p className="font-mono text-sm">{owner.email}</p>
                <RegenerarPasswordForm usuarioId={owner.id} />
              </div>
            ) : (
              <p className="text-vibo-acento text-sm">
                Este cliente no tiene usuario dueño. No puede entrar al panel.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">Agentes</CardTitle>
              <CardDescription>Una sede o servicio por agente.</CardDescription>
            </div>
            {!enLimite && (
              <BotonEnlace
                size="sm"
                href={`/admin/clientes/${cliente.id}/agentes/nuevo`}
              >
                Nuevo agente
              </BotonEnlace>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {enLimite && (
              <div className="callout bg-neutral-100 px-4 py-3 text-sm">
                <span className="font-semibold">Límite de agentes alcanzado.</span>{" "}
                El plan {cliente.plan.nombre} permite {cliente.plan.maxAgentes}.
                Para agregar otro hay que subir de plan — el límite también aplica
                acá, en el admin.
              </div>
            )}

            {cliente.agentes.length === 0 ? (
              <p className="text-sm text-neutral-500">Todavía no hay agentes.</p>
            ) : (
              <ul className="divide-y divide-neutral-300 rounded-xs border border-neutral-300">
                {cliente.agentes.map((agente) => (
                  <li
                    key={agente.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{agente.nombre}</p>
                      <p className="text-xs text-neutral-500">
                        {agente.deporte}
                        {sinToken.has(agente.id) && (
                          <span className="text-vibo-acento ml-2">
                            sin token de integración
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <EstadoAgenteBadge estado={agente.estado} />
                      <BotonEnlace
                        size="sm"
                        variant="outline"
                        href={`/admin/agentes/${agente.id}`}
                      >
                        Ver
                      </BotonEnlace>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
