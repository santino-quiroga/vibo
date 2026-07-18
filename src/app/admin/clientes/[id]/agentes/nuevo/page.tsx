import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BotonEnlace } from "@/components/ui/boton-enlace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { estadoLimiteAgentes, obtenerCliente } from "@/lib/admin/datos";
import { requerirViboAdmin } from "@/lib/dal";

import { NuevoAgenteForm } from "./nuevo-agente-form";

export const metadata: Metadata = { title: "Nuevo agente | Admin Vibo" };

export default async function NuevoAgentePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirViboAdmin();
  const { id } = await params;

  const [cliente, limite] = await Promise.all([
    obtenerCliente(id),
    estadoLimiteAgentes(id),
  ]);

  if (!cliente || !limite) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <BotonEnlace
        variant="ghost"
        size="sm"
        className="mb-4"
        href={`/admin/clientes/${cliente.id}`}
      >
        ← {cliente.nombre}
      </BotonEnlace>

      {limite.alcanzado ? (
        <Card>
          <CardHeader>
            <CardTitle>Límite de agentes alcanzado</CardTitle>
            <CardDescription>
              El plan {limite.plan} permite {limite.maximo} agente(s) y{" "}
              {cliente.nombre} ya tiene {limite.usados}. El límite es duro y
              también aplica al admin: hay que subir de plan para agregar otro.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BotonEnlace href={`/admin/clientes/${cliente.id}`}>
              Volver y cambiar el plan
            </BotonEnlace>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo agente</CardTitle>
            <CardDescription>
              Una sede o servicio de {cliente.nombre}. Las credenciales se
              guardan cifradas y no se vuelven a mostrar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NuevoAgenteForm clienteId={cliente.id} />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
