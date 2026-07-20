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
import { EstadoPagoBadge } from "@/components/pagos/estado-pago";
import { listarClientes } from "@/lib/admin/datos";
import { riesgosPorCliente } from "@/lib/admin/panel";
import { limiteAlcanzado } from "@/lib/admin/limite-agentes";
import { requerirViboAdmin } from "@/lib/dal";

export const metadata: Metadata = { title: "Clientes | Admin Vibo" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ archivados?: string }>;
}) {
  await requerirViboAdmin();
  const { archivados } = await searchParams;
  const verArchivados = archivados === "1";
  const [clientes, riesgos] = await Promise.all([
    listarClientes(verArchivados),
    riesgosPorCliente(),
  ]);

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
        <div className="flex items-center gap-2">
          <BotonEnlace
            variant="outline"
            href={verArchivados ? "/admin" : "/admin?archivados=1"}
          >
            {verArchivados ? "Ver solo activos" : "Ver archivados"}
          </BotonEnlace>
          <BotonEnlace variant="outline" href="/api/admin/clientes-csv">
            Exportar CSV
          </BotonEnlace>
          <BotonEnlace variant="outline" href="/admin/panel">
            Panel
          </BotonEnlace>
          <BotonEnlace href="/admin/clientes/nuevo">Nuevo cliente</BotonEnlace>
        </div>
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
                <TableHead>Pago</TableHead>
                <TableHead>Agentes</TableHead>
                <TableHead>Uso del ciclo</TableHead>
                <TableHead>Señales</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.map((cliente) => {
                const enLimite = limiteAlcanzado(
                  cliente._count.agentes,
                  cliente.plan.maxAgentes,
                );
                const riesgo = riesgos.get(cliente.id);
                return (
                  <TableRow key={cliente.id}>
                    <TableCell className="font-medium">
                      {cliente.nombre}
                      {cliente.archivadoAt && (
                        <span className="etiqueta ml-2 text-[10px] text-neutral-400">
                          archivado
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{cliente.plan.nombre}</Badge>
                    </TableCell>
                    <TableCell>
                      <EstadoPagoBadge estado={cliente.estadoPago} />
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
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {riesgo ? (
                        <>
                          {riesgo.usadas} / {riesgo.limite}
                          {riesgo.porcentaje !== null && (
                            <span className="ml-1 text-xs text-neutral-400">
                              ({Math.round(riesgo.porcentaje * 100)}%)
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {riesgo && riesgo.senales.length > 0 ? (
                        <ul className="space-y-0.5">
                          {riesgo.senales.map((senal) => (
                            <li
                              key={senal.tipo}
                              className={
                                senal.tipo === "uso_alto"
                                  ? "text-xs text-vibo-rojo"
                                  : "text-xs text-neutral-500"
                              }
                            >
                              {senal.detalle}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
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
