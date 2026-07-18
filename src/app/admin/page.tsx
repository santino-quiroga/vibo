import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { BotonEnlace } from "@/components/ui/boton-enlace";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listarClientes } from "@/lib/admin/datos";
import { limiteAlcanzado } from "@/lib/admin/limite-agentes";
import { requerirViboAdmin } from "@/lib/dal";

export const metadata: Metadata = { title: "Clientes | Admin Vibo" };

const formatoFecha = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default async function AdminPage() {
  await requerirViboAdmin();
  const clientes = await listarClientes();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {clientes.length === 0
              ? "Todavía no hay clientes."
              : `${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"}`}
          </p>
        </div>
        <BotonEnlace href="/admin/clientes/nuevo">
          Nuevo cliente
        </BotonEnlace>
      </header>

      {clientes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-card p-10 text-center">
          <p className="text-sm text-neutral-500">
            Las cuentas de cliente se crean desde acá — no hay registro público.
          </p>
          <BotonEnlace className="mt-4" href="/admin/clientes/nuevo">
            Crear el primero
          </BotonEnlace>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-300 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Complejo</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Agentes</TableHead>
                <TableHead>Alta</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.map((cliente) => {
                const enLimite = limiteAlcanzado(
                  cliente._count.agentes,
                  cliente.plan.maxAgentes,
                );
                return (
                  <TableRow key={cliente.id}>
                    <TableCell className="font-medium">{cliente.nombre}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{cliente.plan.nombre}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className={enLimite ? "text-vibo-acento" : undefined}>
                        {cliente._count.agentes} / {cliente.plan.maxAgentes}
                      </span>
                      {enLimite && (
                        <span className="text-vibo-acento ml-2 text-xs">
                          límite alcanzado
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-neutral-500">
                      {formatoFecha.format(cliente.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <BotonEnlace
                        size="sm"
                        variant="outline"
                        href={`/admin/clientes/${cliente.id}`}
                      >
                        Ver
                      </BotonEnlace>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
