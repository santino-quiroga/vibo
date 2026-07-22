"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Editor de canchas y precios, compartido por el admin y el panel cliente
 * (requerimientos §7: el dueño edita la config de canchas de su agente).
 *
 * La server action se pasa por prop: el admin usa la suya (scoped por rol) y el
 * cliente la propia (scoped por su clienteId). El componente es el mismo.
 */

export type EstadoCanchas = { error?: string; ok?: boolean };

export type AccionCanchas = (
  previo: EstadoCanchas,
  formData: FormData,
) => Promise<EstadoCanchas>;

export type TramoEditable = {
  desde: string;
  hasta: string;
  precio: string;
};

export type CanchaEditable = {
  numero: number;
  precio: string;
  duracionTurnoMin: number;
  horarioApertura: string;
  horarioCierre: string;
  descripcion: string;
  tramos: TramoEditable[];
};

const INICIAL: EstadoCanchas = {};

/** Valores razonables para una cancha nueva, para no arrancar de un form vacío. */
function canchaNueva(numero: number): CanchaEditable {
  return {
    numero,
    precio: "",
    duracionTurnoMin: 90,
    horarioApertura: "08:00",
    horarioCierre: "23:00",
    descripcion: "",
    tramos: [],
  };
}

/** Una franja nueva arranca en el horario pico típico de una cancha. */
function tramoNuevo(): TramoEditable {
  return { desde: "18:00", hasta: "24:00", precio: "" };
}

function BotonSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando..." : "Guardar canchas"}
    </Button>
  );
}

export function CanchasForm({
  agenteId,
  canchas: iniciales,
  accion,
}: {
  agenteId: string;
  canchas: CanchaEditable[];
  accion: AccionCanchas;
}) {
  const [estado, formAction] = useActionState(accion, INICIAL);
  const [filas, setFilas] = useState<CanchaEditable[]>(iniciales);

  function agregar() {
    // El número que sigue al más alto: en un complejo las canchas se numeran
    // corrido, y así no hay que pensarlo.
    const siguiente = filas.reduce((max, f) => Math.max(max, f.numero), 0) + 1;
    setFilas([...filas, canchaNueva(siguiente)]);
  }

  function quitar(indice: number) {
    setFilas(filas.filter((_, i) => i !== indice));
  }

  function editar(indice: number, campo: keyof CanchaEditable, valor: string) {
    setFilas(
      filas.map((fila, i) =>
        i === indice
          ? {
              ...fila,
              [campo]:
                campo === "numero" || campo === "duracionTurnoMin"
                  ? Number(valor)
                  : valor,
            }
          : fila,
      ),
    );
  }

  function editarTramos(indice: number, tramos: TramoEditable[]) {
    setFilas(filas.map((fila, i) => (i === indice ? { ...fila, tramos } : fila)));
  }

  return (
    <form action={formAction} className="space-y-4">
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert>
          <AlertDescription>Canchas guardadas.</AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="agenteId" value={agenteId} />

      {filas.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Sin canchas cargadas. Los ingresos estimados de este agente van a dar
          cero hasta que tenga al menos una con precio.
        </p>
      ) : (
        <div className="space-y-4">
          {filas.map((fila, i) => (
            <div key={i} className="rounded-md border border-neutral-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="etiqueta text-xs">Cancha {fila.numero}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => quitar(i)}>
                  Quitar
                </Button>
              </div>

              {/* Los tramos de esta cancha viajan como un JSON, paralelo al resto
                  de las columnas (lo lee `parsearCanchasDeForm`). */}
              <input type="hidden" name="tramos" value={JSON.stringify(fila.tramos)} />

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="space-y-1">
                  <Label htmlFor={`numero-${i}`} className="text-xs">
                    Número
                  </Label>
                  <Input
                    id={`numero-${i}`}
                    name="numero"
                    type="number"
                    min={1}
                    required
                    value={fila.numero}
                    onChange={(e) => editar(i, "numero", e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`precio-${i}`} className="text-xs">
                    Precio base
                  </Label>
                  <Input
                    id={`precio-${i}`}
                    name="precio"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    placeholder="20000"
                    value={fila.precio}
                    onChange={(e) => editar(i, "precio", e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`duracion-${i}`} className="text-xs">
                    Turno (min)
                  </Label>
                  <Input
                    id={`duracion-${i}`}
                    name="duracionTurnoMin"
                    type="number"
                    min={15}
                    step={5}
                    required
                    value={fila.duracionTurnoMin}
                    onChange={(e) => editar(i, "duracionTurnoMin", e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`apertura-${i}`} className="text-xs">
                    Abre
                  </Label>
                  <Input
                    id={`apertura-${i}`}
                    name="horarioApertura"
                    type="time"
                    required
                    value={fila.horarioApertura}
                    onChange={(e) => editar(i, "horarioApertura", e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`cierre-${i}`} className="text-xs">
                    Cierra
                  </Label>
                  <Input
                    id={`cierre-${i}`}
                    name="horarioCierre"
                    type="time"
                    required
                    value={fila.horarioCierre}
                    onChange={(e) => editar(i, "horarioCierre", e.target.value)}
                  />
                </div>
              </div>

              <p className="mt-1 text-[11px] text-neutral-400">
                Si la cancha cierra pasada la medianoche, poné el cierre de
                madrugada (ej. 01:00): se entiende como del día siguiente.
              </p>

              <div className="mt-3 space-y-1">
                <Label htmlFor={`descripcion-${i}`} className="text-xs">
                  Descripción <span className="text-neutral-400">(opcional)</span>
                </Label>
                <Textarea
                  id={`descripcion-${i}`}
                  name="descripcion"
                  rows={2}
                  placeholder="Ej. Cancha techada, césped sintético, iluminación LED."
                  value={fila.descripcion}
                  onChange={(e) => editar(i, "descripcion", e.target.value)}
                />
              </div>

              <TramosCancha
                indice={i}
                precioBase={fila.precio}
                tramos={fila.tramos}
                onChange={(tramos) => editarTramos(i, tramos)}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={agregar}>
          Agregar cancha
        </Button>
        <BotonSubmit />
      </div>
    </form>
  );
}

/**
 * Editor de las franjas de precio de una cancha (requerimiento de testing:
 * distintos precios según el horario). Sin franjas, la cancha cotiza siempre el
 * precio base; cada franja lo pisa en su horario.
 */
function TramosCancha({
  indice,
  precioBase,
  tramos,
  onChange,
}: {
  indice: number;
  precioBase: string;
  tramos: TramoEditable[];
  onChange: (tramos: TramoEditable[]) => void;
}) {
  function agregar() {
    onChange([...tramos, tramoNuevo()]);
  }

  function quitar(j: number) {
    onChange(tramos.filter((_, k) => k !== j));
  }

  function editar(j: number, campo: keyof TramoEditable, valor: string) {
    onChange(tramos.map((t, k) => (k === j ? { ...t, [campo]: valor } : t)));
  }

  return (
    <div className="mt-3 border-t border-neutral-200 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="etiqueta text-xs">Precios por horario</span>
        <Button type="button" variant="ghost" size="sm" onClick={agregar}>
          Agregar franja
        </Button>
      </div>

      {tramos.length === 0 ? (
        <p className="text-[11px] text-neutral-400">
          Sin franjas: todos los turnos cotizan el precio base
          {precioBase ? ` ($${precioBase})` : ""}.
        </p>
      ) : (
        <div className="space-y-2">
          {tramos.map((tramo, j) => (
            <div key={j} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor={`tramo-desde-${indice}-${j}`} className="text-[11px]">
                  Desde
                </Label>
                <Input
                  id={`tramo-desde-${indice}-${j}`}
                  type="time"
                  value={tramo.desde}
                  onChange={(e) => editar(j, "desde", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`tramo-hasta-${indice}-${j}`} className="text-[11px]">
                  Hasta
                </Label>
                <Input
                  id={`tramo-hasta-${indice}-${j}`}
                  type="time"
                  value={tramo.hasta === "24:00" ? "00:00" : tramo.hasta}
                  onChange={(e) =>
                    // 00:00 al final de una franja se guarda como 24:00 (medianoche
                    // = fin del día), que es lo que el backend interpreta.
                    editar(j, "hasta", e.target.value === "00:00" ? "24:00" : e.target.value)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`tramo-precio-${indice}-${j}`} className="text-[11px]">
                  Precio
                </Label>
                <Input
                  id={`tramo-precio-${indice}-${j}`}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="25000"
                  value={tramo.precio}
                  onChange={(e) => editar(j, "precio", e.target.value)}
                />
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => quitar(j)}>
                Quitar
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
