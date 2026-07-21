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
import { prisma } from "@/lib/prisma";

import { EstadoPagoBadge } from "@/components/pagos/estado-pago";

import { CambiarPlanForm } from "./cambiar-plan-form";
import { BajaClienteForm } from "./baja-cliente-form";
import { MarcarPagadoForm } from "./marcar-pagado-form";
import { NotasForm } from "./notas-form";
import { VincularSuscripcionForm } from "./vincular-suscripcion-form";
import { ReactivarLimiteForm } from "./reactivar-limite-form";
import { RegenerarPasswordForm } from "./regenerar-password-form";

export const metadata: Metadata = { title: "Cliente | Admin Vibo" };

const formatoFecha = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const moneda = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
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

  // Lo que un borrado destruiría. Se cuenta acá para poder mostrarlo antes de
  // pedir la confirmación: nadie debería confirmar sin ver el alcance.
  const [conversaciones, mensajes] = await Promise.all([
    prisma.conversacion.count({ where: { agente: { clienteId: cliente.id } } }),
    prisma.mensaje.count({ where: { conversacion: { agente: { clienteId: cliente.id } } } }),
  ]);

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
        {cliente.archivadoAt && (
          <div className="callout bg-neutral-100 px-4 py-3 text-sm">
            <span className="font-semibold">Cliente archivado.</span> No aparece
            en el listado ni en las métricas, y su bot no responde.
          </div>
        )}

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
            <BarraUso uso={uso} compacto />

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
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">Facturación</CardTitle>
              <CardDescription>
                La suscripción se genera en Mercado Pago y el link se le manda al
                cliente por fuera de Vibo. Acá se ve el resultado.
              </CardDescription>
            </div>
            <EstadoPagoBadge estado={cliente.estadoPago} />
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-neutral-500">Precio del plan</dt>
                <dd className="tabular-nums">
                  {Number(cliente.plan.precio) > 0 ? (
                    moneda.format(Number(cliente.plan.precio))
                  ) : (
                    // Un plan en 0 no es gratis: es que nadie le puso precio.
                    // Mercado Pago no puede cobrar sobre esto.
                    <span className="text-vibo-acento">sin precio definido</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Próximo cobro</dt>
                <dd>
                  {cliente.fechaProximoCobro
                    ? formatoFecha.format(cliente.fechaProximoCobro)
                    : "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-neutral-500">Suscripción de Mercado Pago</dt>
                <dd>
                  <VincularSuscripcionForm
                    clienteId={cliente.id}
                    suscripcionId={cliente.mercadoPagoSubscriptionId}
                  />
                </dd>
              </div>
            </dl>

            {cliente.estadoPago === "EN_GRACIA" && cliente.graciaDesde && (
              <div className="callout bg-neutral-100 px-4 py-3 text-sm">
                En período de gracia desde el{" "}
                {formatoFecha.format(cliente.graciaDesde)}. Al vencerse, sus
                agentes se pausan automáticamente.
              </div>
            )}

            {cliente.estadoPago === "VENCIDO" && (
              <div className="callout bg-neutral-100 px-4 py-3 text-sm">
                <span className="font-semibold">Servicio cortado por falta de pago.</span>{" "}
                Sus agentes están pausados y el bot no responde.
              </div>
            )}

            <div>
              <MarcarPagadoForm
                clienteId={cliente.id}
                montoSugerido={Number(cliente.plan.precio)}
                hayAgentesPausados={cliente.agentes.some(
                  (a) => a.estado === "PAUSADO_POR_PAGO",
                )}
              />
            </div>

            {cliente.pagos.length > 0 && (
              <div>
                <p className="etiqueta mb-2 text-xs text-neutral-500">Últimos pagos</p>
                <ul className="divide-y divide-neutral-200 text-sm">
                  {cliente.pagos.map((pago) => (
                    <li key={pago.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        {formatoFecha.format(pago.fecha)}
                        <span className="ml-2 text-xs text-neutral-500">
                          {pago.origen === "MANUAL" ? "manual" : "Mercado Pago"}
                          {pago.estado !== "APROBADO" && ` · ${pago.estado.toLowerCase()}`}
                        </span>
                      </span>
                      <span className="tabular-nums">{moneda.format(Number(pago.monto))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notas internas</CardTitle>
            <CardDescription>
              Sólo las ve el equipo de Vibo. El cliente nunca accede a esto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NotasForm clienteId={cliente.id} notas={cliente.notasInternas} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dar de baja</CardTitle>
            <CardDescription>
              Archivar conserva todo y se puede revertir. Eliminar es definitivo
              y sólo se habilita si el cliente nunca tuvo un pago.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BajaClienteForm
              clienteId={cliente.id}
              nombre={cliente.nombre}
              archivado={cliente.archivadoAt !== null}
              alcance={{
                usuarios: cliente.usuarios.length,
                agentes: cliente.agentes.length,
                conversaciones,
                mensajes,
                pagos: cliente._count.pagos,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
