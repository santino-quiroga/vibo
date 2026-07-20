import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EstadoPagoBadge } from "@/components/pagos/estado-pago";
import { BarraUso } from "@/components/plan/barra-uso";
import { BotonEnlace } from "@/components/ui/boton-enlace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FranjaDamero } from "@/components/marca/damero";
import { Logo } from "@/components/marca/logo";
import { verificarSesion } from "@/lib/dal";
import { usoDelCliente } from "@/lib/planes/uso";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Plan | Vibo" };

const moneda = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const formatoFecha = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Vista de Plan del menú de usuario (requerimientos §5).
 *
 * Hasta acá el uso del plan sólo se veía como un widget de Inicio, mezclado con
 * los KPIs del negocio. Son dos cosas distintas: uno es cómo le va al complejo,
 * el otro es qué contrató con Vibo y cuánto le queda. El §5 lo pide como entrada
 * propia del menú de usuario y esta es esa pantalla.
 *
 * Vive bajo /cuenta y no bajo /dashboard porque es información de la cuenta, no
 * una quinta sección del producto.
 */
export default async function PlanPage() {
  const usuario = await verificarSesion();

  // El plan es del cliente; un VIBO_ADMIN no tiene uno propio y ve el panel de
  // administración, donde el uso de cada cliente ya se muestra por separado.
  if (usuario.rol !== "CLIENTE_OWNER" || !usuario.clienteId) {
    redirect("/cuenta");
  }

  const [uso, cliente] = await Promise.all([
    usoDelCliente(usuario.clienteId),
    prisma.cliente.findUnique({
      where: { id: usuario.clienteId },
      select: {
        nombre: true,
        plan: { select: { nombre: true, maxAgentes: true, precio: true } },
        _count: { select: { agentes: true } },
        // Facturación (SDD v2 §4.6). El cliente ve su propio estado, sin nada
        // de lo interno: ni el id de la suscripción ni las notas del admin.
        estadoPago: true,
        fechaProximoCobro: true,
        pagos: {
          select: { id: true, monto: true, fecha: true, estado: true },
          orderBy: { fecha: "desc" },
          take: 6,
        },
      },
    }),
  ]);

  return (
    <div className="flex min-h-svh flex-col">
      <FranjaDamero />

      <header className="bg-card border-b border-neutral-300">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-4 py-3">
          <Logo tamano="xs" />
          <BotonEnlace variant="ghost" size="sm" href="/dashboard">
            ← Volver
          </BotonEnlace>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
        <div>
          <h1 className="t-pagina">Plan</h1>
          <p className="mt-1 text-sm text-neutral-500">{cliente?.nombre}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Uso del ciclo</CardTitle>
            <CardDescription>
              Las conversaciones son un pozo compartido entre todas tus sedes.
              Cuando se agota, el agente deja de responder hasta el próximo ciclo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarraUso uso={uso} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">Facturación</CardTitle>
              <CardDescription>
                El estado de tu suscripción con Vibo.
              </CardDescription>
            </div>
            {cliente && <EstadoPagoBadge estado={cliente.estadoPago} />}
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {cliente?.estadoPago === "EN_GRACIA" && (
              <div className="callout bg-warning-suave px-4 py-3">
                <span className="font-semibold">No pudimos procesar tu último pago.</span>{" "}
                Tu agente sigue funcionando, pero si no se regulariza va a
                pausarse. Si ya pagaste, escribinos.
              </div>
            )}

            {cliente?.estadoPago === "VENCIDO" && (
              <div className="callout bg-vibo-acento/6 px-4 py-3">
                <span className="font-semibold">Tu agente está pausado por falta de pago.</span>{" "}
                No se perdió nada: tus turnos, conversaciones y configuración
                quedan como están, y vuelve a andar apenas se registre el pago.
              </div>
            )}

            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-neutral-500">Plan</dt>
                <dd>
                  {cliente?.plan.nombre}
                  {Number(cliente?.plan.precio ?? 0) > 0 &&
                    ` · ${moneda.format(Number(cliente?.plan.precio))} por mes`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Próximo cobro</dt>
                <dd>
                  {cliente?.fechaProximoCobro
                    ? formatoFecha.format(cliente.fechaProximoCobro)
                    : "—"}
                </dd>
              </div>
            </dl>

            {cliente && cliente.pagos.length > 0 ? (
              <div>
                <p className="etiqueta mb-2 text-xs text-neutral-500">Últimos pagos</p>
                <ul className="divide-y divide-neutral-200">
                  {cliente.pagos.map((pago) => (
                    <li key={pago.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        {formatoFecha.format(pago.fecha)}
                        {pago.estado !== "APROBADO" && (
                          <span className="ml-2 text-xs text-neutral-500">
                            {pago.estado === "RECHAZADO" ? "rechazado" : "pendiente"}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums">{moneda.format(Number(pago.monto))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-neutral-500">Todavía no hay pagos registrados.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sedes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>
              Usás{" "}
              <span className="font-semibold tabular-nums">
                {cliente?._count.agentes ?? 0}
              </span>{" "}
              de{" "}
              <span className="font-semibold tabular-nums">
                {cliente?.plan.maxAgentes ?? 0}
              </span>{" "}
              sedes del plan {cliente?.plan.nombre}.
            </p>
            <p className="mt-2 text-neutral-500">
              Las sedes las da de alta el equipo de Vibo. Si necesitás una más,
              escribinos y vemos de subirte de plan.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
