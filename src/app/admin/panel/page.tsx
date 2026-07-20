import type { Metadata } from "next";
import Link from "next/link";

import { BotonEnlace } from "@/components/ui/boton-enlace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { agentesConErrores, resumenDelPanel } from "@/lib/admin/panel";
import { requerirViboAdmin } from "@/lib/dal";

export const metadata: Metadata = { title: "Panel | Admin Vibo" };

const moneda = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const fechaHora = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function Metrica({
  titulo,
  valor,
  nota,
  alerta = false,
}: {
  titulo: string;
  valor: string;
  nota?: string;
  alerta?: boolean;
}) {
  return (
    <div className="bg-card rounded-[12px] border border-neutral-200 p-4">
      <p className="etiqueta text-xs text-neutral-500">{titulo}</p>
      <p
        className={`mt-1 font-serif text-3xl tabular-nums ${alerta ? "text-vibo-acento" : ""}`}
      >
        {valor}
      </p>
      {nota && <p className="mt-1 text-xs text-neutral-500">{nota}</p>}
    </div>
  );
}

/**
 * Inicio del admin (SDD v2 §5).
 *
 * Responde de un vistazo las preguntas que antes había que reconstruir abriendo
 * cliente por cliente: cuánto entra, quién está en riesgo, qué agentes están
 * apagados y por qué, y qué se rompió.
 *
 * Los tres motivos de pausa se muestran separados a propósito: cada uno pide una
 * acción distinta (upsell, cobranza, o nada) y sumarlos en un solo número
 * borraría justamente la información útil.
 */
export default async function PanelAdminPage() {
  await requerirViboAdmin();

  const [resumen, errores] = await Promise.all([resumenDelPanel(), agentesConErrores()]);

  const enRiesgo =
    resumen.clientesPorEstado.EN_GRACIA + resumen.clientesPorEstado.VENCIDO;
  const sinCobrar = resumen.mrrPotencial - resumen.mrr;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Cómo viene el negocio de Vibo, no el de un cliente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BotonEnlace variant="outline" href="/admin/planes">
            Planes
          </BotonEnlace>
          <BotonEnlace variant="outline" href="/admin">
            Ver clientes
          </BotonEnlace>
        </div>
      </header>

      <div className="space-y-8">
        <section aria-label="Ingresos">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metrica
              titulo="MRR"
              valor={moneda.format(resumen.mrr)}
              nota={`${resumen.clientesPorEstado.AL_DIA} cliente(s) al día`}
            />
            <Metrica
              titulo="Sin cobrar"
              valor={moneda.format(sinCobrar)}
              // No es plata perdida: es servicio que se está dando y no se cobró.
              // Por eso va destacado cuando hay algo — es recuperable llamando.
              alerta={sinCobrar > 0}
              nota="Servicio dado que no se está cobrando"
            />
            <Metrica
              titulo="Clientes"
              valor={String(resumen.totalClientes)}
              nota={`${resumen.clientesPorEstado.SIN_SUSCRIPCION} sin suscripción`}
            />
            <Metrica
              titulo="En riesgo"
              valor={String(enRiesgo)}
              alerta={enRiesgo > 0}
              nota={`${resumen.clientesPorEstado.EN_GRACIA} en gracia · ${resumen.clientesPorEstado.VENCIDO} vencido(s)`}
            />
          </div>
        </section>

        <section aria-label="Agentes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agentes</CardTitle>
              <CardDescription>
                Los pausados van separados por motivo: cada uno se resuelve
                distinto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <Metrica titulo="Activos" valor={String(resumen.agentesActivos)} />
                <Metrica
                  titulo="En configuración"
                  valor={String(resumen.agentesEnConfiguracion)}
                  nota="Esperan que los actives"
                />
                <Metrica
                  titulo="Límite de plan"
                  valor={String(resumen.agentesPausados.PAUSADO_LIMITE)}
                  alerta={resumen.agentesPausados.PAUSADO_LIMITE > 0}
                  nota="Oportunidad de upsell"
                />
                <Metrica
                  titulo="Falta de pago"
                  valor={String(resumen.agentesPausados.PAUSADO_POR_PAGO)}
                  alerta={resumen.agentesPausados.PAUSADO_POR_PAGO > 0}
                  nota="Cobranza"
                />
                <Metrica
                  titulo="Pausados por el cliente"
                  valor={String(resumen.agentesPausados.PAUSADO_MANUAL)}
                  nota="Decisión suya, no hay nada que hacer"
                />
              </div>
            </CardContent>
          </Card>
        </section>

        <section aria-label="Integraciones">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Salud de integraciones</CardTitle>
              <CardDescription>
                Agentes cuya conexión con Airtable o Evolution falló en las
                últimas 48 horas, después de agotar los reintentos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {errores.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Ninguna integración falló en las últimas 48 horas.
                </p>
              ) : (
                <ul className="divide-y divide-neutral-200">
                  {errores.map((error) => (
                    <li key={error.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link
                          href={`/admin/agentes/${error.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {error.nombre}
                        </Link>
                        <span className="text-xs text-neutral-500">
                          {error.clienteNombre} · {fechaHora.format(error.cuando)}
                        </span>
                      </div>
                      {error.mensaje && (
                        <p className="mt-1 font-mono text-xs break-all text-neutral-500">
                          {error.mensaje}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
