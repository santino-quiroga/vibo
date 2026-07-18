"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

export type CanchaEditable = {
  numero: number;
  precio: string;
  duracionTurnoMin: number;
  horarioApertura: string;
  horarioCierre: string;
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
  };
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
                    Precio
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
