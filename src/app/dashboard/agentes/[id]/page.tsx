import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CanchasForm } from "@/components/canchas-form";
import { EstadoAgenteBadge } from "@/components/estado-agente";
import { TogglePausa } from "@/components/cliente/toggle-pausa";
import { BotonEnlace } from "@/components/ui/boton-enlace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { guardarCanchasClienteAction } from "@/app/dashboard/agentes/actions";
import { TOPE_DIARIO, cupoRestante } from "@/lib/agentes/prueba";
import { obtenerAgenteDelCliente } from "@/lib/cliente/agentes";
import { requerirClienteOwner } from "@/lib/dal";

import { ChatPrueba } from "./chat-prueba";
import { ConfigAgenteForm } from "./config-form";

export const metadata: Metadata = { title: "Agente | Vibo" };

export default async function AgenteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirClienteOwner();
  const { id } = await params;

  const agente = await obtenerAgenteDelCliente(id);
  if (!agente) notFound();

  // El cupo se lee acá y no adentro del chat: el componente es cliente y no
  // puede tocar la base. Se pasa como valor inicial y él lo va actualizando con
  // lo que devuelve cada envío.
  const cupo = await cupoRestante(agente.id);

  return (
    <div className="space-y-6">
      <BotonEnlace variant="ghost" size="sm" href="/dashboard/agentes">
        ← Agentes
      </BotonEnlace>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="t-pagina">{agente.nombre}</h1>
          <p className="mt-1 text-sm text-neutral-500">{agente.deporte}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <EstadoAgenteBadge estado={agente.estado} />
          <TogglePausa agenteId={agente.id} estado={agente.estado} />
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuración del agente</CardTitle>
          <CardDescription>
            Los datos del negocio, la personalidad del asistente y las reglas de
            reserva. No incluye la conexión del canal ni las integraciones — eso
            lo maneja Vibo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConfigAgenteForm agente={agente} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Probar el agente</CardTitle>
          <CardDescription>
            Hablale como si fueras un cliente, para ver cómo responde con la
            configuración de arriba. Es el lugar para probar un cambio antes de
            que lo vea alguien de verdad.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChatPrueba
            agenteId={agente.id}
            cupoInicial={cupo}
            tope={TOPE_DIARIO}
            enConfiguracion={agente.estado === "EN_CONFIGURACION"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Canchas y precios</CardTitle>
          <CardDescription>
            El precio de cada cancha alimenta la estimación de ingresos de Inicio.
            El número tiene que coincidir con la cancha en tus reservas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CanchasForm
            agenteId={agente.id}
            accion={guardarCanchasClienteAction}
            canchas={agente.canchas}
          />
        </CardContent>
      </Card>
    </div>
  );
}
