import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { BotonEnlace } from "@/components/ui/boton-enlace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { obtenerAgente } from "@/lib/admin/datos";
import { descifrar, enmascarar } from "@/lib/crypto";
import { requerirViboAdmin } from "@/lib/dal";

import { CanchasForm } from "@/components/canchas-form";
import { guardarCanchasAction } from "@/app/admin/actions";

import { EditarAgenteForm } from "./editar-agente-form";
import { RegenerarTokenForm } from "./regenerar-token-form";

export const metadata: Metadata = { title: "Agente | Admin Vibo" };

/**
 * Descifra solo para enmascarar.
 *
 * El valor en claro vive apenas lo que dura esta función, del lado del servidor:
 * lo único que cruza al browser son los últimos 4 caracteres (SDD 7.1). Si la
 * credencial no se puede descifrar (ENCRYPTION_KEY cambiada o fila corrupta),
 * se dice, en vez de mostrar un enmascarado falso que aparente que está sana.
 */
function vistaSegura(valorCifrado: string | null): {
  texto: string;
  error: boolean;
} {
  if (!valorCifrado) return { texto: "— sin definir —", error: true };
  try {
    return { texto: enmascarar(descifrar(valorCifrado)), error: false };
  } catch {
    return { texto: "no se puede descifrar", error: true };
  }
}

/**
 * Detecta si la URL de Evolution guardada NO es https (SDD 7.2, "fix" del §11).
 *
 * Evolution suele correr en http plano sobre IP:puerto, y por ahí viajan la API
 * key y el texto de los mensajes sin cifrar en tránsito. No se bloquea (rompería
 * la instancia actual), pero se advierte. Se evalúa acá, server-side, sobre el
 * valor real descifrado; el valor en claro no cruza al browser.
 */
function evolutionEsInsegura(cifrado: string | null): boolean {
  if (!cifrado) return false;
  try {
    return descifrar(cifrado).trim().toLowerCase().startsWith("http://");
  } catch {
    return false;
  }
}

function Credencial({
  label,
  cifrado,
}: {
  label: string;
  cifrado: string | null;
}) {
  const { texto, error } = vistaSegura(cifrado);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-neutral-200 py-2 last:border-0">
      <span className="text-sm text-neutral-500">{label}</span>
      <span
        className={`font-mono text-sm ${error ? "text-vibo-acento" : "text-foreground"}`}
      >
        {texto}
      </span>
    </div>
  );
}

export default async function AgenteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirViboAdmin();
  const { id } = await params;

  const agente = await obtenerAgente(id);
  if (!agente) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <BotonEnlace
        variant="ghost"
        size="sm"
        className="mb-4"
        href={`/admin/clientes/${agente.cliente.id}`}
      >
        ← {agente.cliente.nombre}
      </BotonEnlace>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{agente.nombre}</h1>
          <p className="mt-1 text-sm text-neutral-500">{agente.deporte}</p>
        </div>
        <Badge variant="outline">{agente.estado}</Badge>
      </header>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credenciales guardadas</CardTitle>
            <CardDescription>
              Cifradas en la base. Se muestran los últimos 4 caracteres, solo
              para confirmar cuál es cuál.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Credencial label="Airtable API key" cifrado={agente.airtableApiKeyEnc} />
            <Credencial label="Evolution URL" cifrado={agente.evolutionApiUrlEnc} />
            <Credencial label="Evolution API key" cifrado={agente.evolutionApiKeyEnc} />
            <Credencial label="Token de integración" cifrado={agente.tokenIntegracionEnc} />

            {evolutionEsInsegura(agente.evolutionApiUrlEnc) && (
              <div className="callout mt-3 bg-neutral-100 px-4 py-3 text-sm">
                <span className="font-semibold">La URL de Evolution es http, sin cifrar.</span>{" "}
                La API key y los mensajes viajan en claro. Conviene poner esa
                instancia detrás de https (un reverse proxy con TLS) antes de
                operar con clientes reales.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Token de integración</CardTitle>
            <CardDescription>
              Con este token el workflow de n8n de este agente le habla a Vibo.
              No se puede volver a ver: si se perdió, se regenera.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegenerarTokenForm agenteId={agente.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Canchas y precios</CardTitle>
            <CardDescription>
              El precio no existe en Airtable: vive acá. Es lo que multiplica los
              turnos confirmados para estimar ingresos, y el número es lo que
              cruza con &quot;Cancha N&quot; en las reservas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CanchasForm
              agenteId={agente.id}
              accion={guardarCanchasAction}
              canchas={agente.canchas.map((c) => ({
                numero: c.numero,
                // Decimal de Prisma no cruza a un client component: se pasa como
                // string, que además es como lo quiere un input.
                precio: c.precio.toString(),
                duracionTurnoMin: c.duracionTurnoMin,
                horarioApertura: c.horarioApertura,
                horarioCierre: c.horarioCierre,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuración</CardTitle>
            <CardDescription>
              Dejá un campo de credencial vacío para no cambiarlo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditarAgenteForm
              agente={{
                id: agente.id,
                nombre: agente.nombre,
                deporte: agente.deporte,
                promptBase: agente.promptBase,
                airtableBaseId: agente.airtableBaseId,
                evolutionInstanceId: agente.evolutionInstanceId,
                n8nWorkflowId: agente.n8nWorkflowId,
              }}
              clienteId={agente.cliente.id}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
