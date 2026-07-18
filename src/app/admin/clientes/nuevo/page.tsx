import type { Metadata } from "next";

import { BotonEnlace } from "@/components/ui/boton-enlace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listarPlanes } from "@/lib/admin/datos";
import { requerirViboAdmin } from "@/lib/dal";

import { NuevoClienteForm } from "./nuevo-cliente-form";

export const metadata: Metadata = { title: "Nuevo cliente | Admin Vibo" };

export default async function NuevoClientePage() {
  await requerirViboAdmin();
  const planes = await listarPlanes();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <BotonEnlace
        variant="ghost"
        size="sm"
        className="mb-4"
        href="/admin"
      >
        ← Clientes
      </BotonEnlace>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo cliente</CardTitle>
          <CardDescription>
            Se crea el complejo y el acceso del dueño. La contraseña se genera
            sola y se muestra una única vez.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {planes.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No hay planes cargados. Corré <code>npm run db:seed</code> antes de
              dar de alta un cliente.
            </p>
          ) : (
            <NuevoClienteForm planes={planes} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
