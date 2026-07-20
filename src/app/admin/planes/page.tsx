import type { Metadata } from "next";

import { BotonEnlace } from "@/components/ui/boton-enlace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requerirViboAdmin } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

import { PlanForm } from "./plan-form";

export const metadata: Metadata = { title: "Planes | Admin Vibo" };

const moneda = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

/**
 * CRUD de planes (SDD v2 §6).
 *
 * Antes vivían sólo en el seed: cambiar un precio era editar código y correr un
 * script. Con facturación real eso no va — `Plan.precio` es lo que se le cobra
 * al cliente y tiene que poder tocarse desde acá.
 *
 * No hay borrado: un plan con clientes no se puede eliminar sin dejarlos
 * huérfanos, y uno sin clientes tampoco molesta. Si alguna vez hace falta, se
 * agrega con el chequeo correspondiente.
 */
export default async function PlanesPage() {
  await requerirViboAdmin();

  const planes = await prisma.plan.findMany({
    select: {
      id: true,
      nombre: true,
      maxAgentes: true,
      maxConversacionesMes: true,
      precio: true,
      mercadoPagoPlanId: true,
      _count: { select: { clientes: true } },
    },
    orderBy: { precio: "asc" },
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <BotonEnlace variant="ghost" size="sm" className="mb-4" href="/admin/panel">
        ← Panel
      </BotonEnlace>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planes</h1>
          <p className="mt-1 text-sm text-neutral-500">
            El precio es el monto real que se cobra por Mercado Pago.
          </p>
        </div>
        <PlanForm />
      </header>

      <div className="space-y-4">
        {planes.map((plan) => {
          const precio = Number(plan.precio);
          return (
            <Card key={plan.id}>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base">{plan.nombre}</CardTitle>
                  <p className="mt-1 text-sm text-neutral-500">
                    {precio > 0 ? (
                      moneda.format(precio)
                    ) : (
                      <span className="text-vibo-acento">sin precio definido</span>
                    )}
                    {" · "}
                    {plan.maxAgentes} sede(s) · {plan.maxConversacionesMes}{" "}
                    conversaciones/mes
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {plan._count.clientes} cliente(s)
                    {plan.mercadoPagoPlanId
                      ? ` · MP ${plan.mercadoPagoPlanId}`
                      : " · sin vincular a Mercado Pago"}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <PlanForm
                  plan={{
                    id: plan.id,
                    nombre: plan.nombre,
                    maxAgentes: plan.maxAgentes,
                    maxConversacionesMes: plan.maxConversacionesMes,
                    precio,
                    mercadoPagoPlanId: plan.mercadoPagoPlanId,
                    clientes: plan._count.clientes,
                  }}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
