"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  cancelarTurnoAction,
  reprogramarTurnoAction,
  type EstadoTurnoAccion,
} from "@/app/dashboard/turnos/actions";
import { EstadoTurno } from "@/components/cliente/estado-turno";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatearFechaCorta, formatearHora } from "@/lib/airtable/tipos";
import type { TurnoListado } from "@/lib/cliente/datos";

const INICIAL: EstadoTurnoAccion = {};

const moneda = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function BotonPendiente({
  etiqueta,
  pendiente,
  variant,
}: {
  etiqueta: string;
  pendiente: string;
  variant?: "default" | "outline" | "ghost";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? pendiente : etiqueta}
    </Button>
  );
}

/**
 * Reprogramar un turno (§8): nueva fecha y hora.
 *
 * Los campos arrancan con los valores actuales del turno, no vacíos: en la
 * práctica se reprograma moviendo una hora o un día, así que obligar a recargar
 * todo desde cero invita a errores de tipeo sobre un dato que ya existe.
 */
function FormReprogramar({ turno }: { turno: TurnoListado }) {
  const [estado, accion] = useActionState(reprogramarTurnoAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="agenteId" value={turno.agenteId} />
      <input type="hidden" name="recordId" value={turno.recordId} />
      {turno.cancha && <input type="hidden" name="cancha" value={turno.cancha} />}

      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert>
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`fecha-${turno.recordId}`} className="text-xs">
            Nueva fecha
          </Label>
          <Input
            id={`fecha-${turno.recordId}`}
            name="fecha"
            type="date"
            required
            defaultValue={turno.fecha}
            className="w-40"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`hora-${turno.recordId}`} className="text-xs">
            Nueva hora
          </Label>
          <Input
            id={`hora-${turno.recordId}`}
            name="hora"
            type="time"
            required
            defaultValue={
              turno.horaInicioMin !== null ? formatearHora(turno.horaInicioMin) : ""
            }
            className="w-32"
          />
        </div>

        <BotonPendiente etiqueta="Reprogramar" pendiente="Guardando..." />
      </div>

      <p className="text-xs text-neutral-500">
        El turno se mueve de horario. El estado y la cancha no cambian.
      </p>
    </form>
  );
}

/**
 * Cancelar un turno (§8), en dos pasos.
 *
 * La confirmación no es ceremonia: esto escribe en la base de turnos real del
 * complejo y no hay "deshacer" — un click de más en el celular, apoyado en el
 * mostrador, cancela el partido de alguien.
 */
function FormCancelar({ turno }: { turno: TurnoListado }) {
  const [estado, accion] = useActionState(cancelarTurnoAction, INICIAL);
  const [confirmando, setConfirmando] = useState(false);

  if (estado.ok) {
    return <p className="text-sm text-neutral-500">{estado.ok}</p>;
  }

  return (
    <div className="space-y-2">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      {!confirmando ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setConfirmando(true)}
        >
          Cancelar turno
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">
            ¿Cancelar el turno de{" "}
            <span className="font-medium">{turno.nombre ?? "este contacto"}</span>
            {turno.cancha ? ` en ${turno.cancha}` : ""} del{" "}
            {formatearFechaCorta(turno.fecha)}
            {turno.horaInicioMin !== null ? ` a las ${formatearHora(turno.horaInicioMin)}` : ""}?
          </p>
          <div className="flex items-center gap-2">
            <form action={accion}>
              <input type="hidden" name="agenteId" value={turno.agenteId} />
              <input type="hidden" name="recordId" value={turno.recordId} />
              <BotonPendiente etiqueta="Sí, cancelar" pendiente="Cancelando..." />
            </form>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmando(false)}
            >
              No
            </Button>
          </div>
          <p className="text-xs text-neutral-500">
            El turno queda como «Cancelada» en tu base de turnos y la franja se
            libera. No se borra: vas a seguir viéndolo en esta lista.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * La lista de Reservas (§8), con las acciones de cancelar y reprogramar.
 *
 * Es un componente cliente sólo por el acordeón: cada fila se expande en una
 * fila extra con los formularios, en vez de abrir un modal. Con la mano en el
 * celular, un panel que empuja la lista hacia abajo es más fácil de cerrar y no
 * tapa el turno que se está mirando.
 */
export function TablaTurnos({
  turnos,
  variasSedes,
}: {
  turnos: TurnoListado[];
  variasSedes: boolean;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);

  // Cancelar y reprogramar mueven el turno de estado o de horario, así que un
  // turno ya cancelado no ofrece acciones: reprogramar algo que se cayó sería
  // revivirlo a medias, sin que nadie haya decidido eso.
  const columnas = variasSedes ? 7 : 6;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cuándo</TableHead>
            <TableHead>Contacto</TableHead>
            <TableHead>Cancha</TableHead>
            {variasSedes && <TableHead>Sede</TableHead>}
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Precio</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {turnos.map((turno) => {
            const expandido = abierto === turno.recordId;
            const cancelado = turno.estado === "CANCELADA";

            return [
              <TableRow key={turno.recordId}>
                <TableCell className="whitespace-nowrap">
                  <span className="font-medium">{formatearFechaCorta(turno.fecha)}</span>
                  <span className="ml-2 font-mono text-neutral-500">
                    {turno.horaInicioMin !== null
                      ? formatearHora(turno.horaInicioMin)
                      : "—"}
                  </span>
                </TableCell>

                <TableCell>
                  <span className="block">{turno.nombre ?? "Sin nombre"}</span>
                  {turno.telefono && (
                    <span className="block font-mono text-xs text-neutral-500">
                      {turno.telefono}
                    </span>
                  )}
                </TableCell>

                <TableCell className="whitespace-nowrap">{turno.cancha ?? "—"}</TableCell>

                {variasSedes && (
                  <TableCell className="whitespace-nowrap text-neutral-500">
                    {turno.agenteNombre}
                  </TableCell>
                )}

                <TableCell>
                  <EstadoTurno estado={turno.estado} />
                </TableCell>

                <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                  {turno.precio !== null ? (
                    moneda.format(turno.precio)
                  ) : (
                    // No es "$0": es que nadie le puso precio a esa cancha en
                    // Vibo. Mostrar cero sería mentir.
                    <span
                      className="text-neutral-400"
                      title="La cancha de este turno no tiene precio cargado"
                    >
                      sin precio
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-right whitespace-nowrap">
                  {cancelado ? (
                    <span className="text-xs text-neutral-400">—</span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-expanded={expandido}
                      onClick={() => setAbierto(expandido ? null : turno.recordId)}
                    >
                      {expandido ? "Cerrar" : "Gestionar"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>,

              expandido && (
                <TableRow key={`${turno.recordId}-panel`} className="hover:bg-transparent">
                  <TableCell colSpan={columnas} className="bg-neutral-50/60 p-4">
                    <div className="grid gap-6 md:grid-cols-[1fr_auto_auto]">
                      <FormReprogramar turno={turno} />
                      <span
                        aria-hidden="true"
                        className="hidden w-px bg-neutral-200 md:block"
                      />
                      <FormCancelar turno={turno} />
                    </div>
                  </TableCell>
                </TableRow>
              ),
            ];
          })}
        </TableBody>
      </Table>
    </div>
  );
}
