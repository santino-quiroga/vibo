"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  archivarClienteAction,
  desarchivarClienteAction,
  eliminarClienteAction,
  type EstadoAdmin,
} from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INICIAL: EstadoAdmin = {};

function Boton({ etiqueta, cargando }: { etiqueta: string; cargando: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? cargando : etiqueta}
    </Button>
  );
}

function BotonBorrar({ habilitado }: { habilitado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending || !habilitado}>
      {pending ? "Eliminando..." : "Eliminar definitivamente"}
    </Button>
  );
}

export type AlcanceBaja = {
  usuarios: number;
  agentes: number;
  conversaciones: number;
  mensajes: number;
  pagos: number;
};

/**
 * Baja de un cliente: archivar (reversible) o eliminar (definitivo).
 *
 * El borrado se muestra deshabilitado —no oculto— cuando el cliente tiene
 * pagos, con el motivo al lado. Esconderlo dejaría al admin buscando una opción
 * que existe; mostrarlo bloqueado explica la regla.
 */
export function BajaClienteForm({
  clienteId,
  nombre,
  archivado,
  alcance,
}: {
  clienteId: string;
  nombre: string;
  archivado: boolean;
  alcance: AlcanceBaja;
}) {
  const [estadoArchivo, accionArchivo] = useActionState(
    archivado ? desarchivarClienteAction : archivarClienteAction,
    INICIAL,
  );
  const [estadoBorrado, accionBorrado] = useActionState(eliminarClienteAction, INICIAL);
  const [abierto, setAbierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");

  const puedeBorrarse = alcance.pagos === 0;
  const nombreCoincide = confirmacion.trim() === nombre;

  return (
    <div className="space-y-4">
      {(estadoArchivo.error ?? estadoBorrado.error) && (
        <Alert variant="destructive">
          <AlertDescription>
            {estadoArchivo.error ?? estadoBorrado.error}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <p className="text-sm">
          {archivado ? (
            <>
              Este cliente está <span className="font-semibold">archivado</span>:
              no aparece en el listado ni en las métricas, y su bot no responde.
            </>
          ) : (
            <>
              Archivar lo saca del listado y de las métricas, y su bot deja de
              responder. No se borra nada y se puede revertir.
            </>
          )}
        </p>
        <form action={accionArchivo}>
          <input type="hidden" name="clienteId" value={clienteId} />
          <Boton
            etiqueta={archivado ? "Devolver a la operación" : "Archivar cliente"}
            cargando={archivado ? "Restaurando..." : "Archivando..."}
          />
        </form>
      </div>

      <div className="border-t border-neutral-200 pt-4">
        {!abierto ? (
          <div className="space-y-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-vibo-acento"
              onClick={() => setAbierto(true)}
            >
              Eliminar definitivamente
            </Button>
            {!puedeBorrarse && (
              <p className="text-xs text-neutral-500">
                Tiene {alcance.pagos} pago(s) registrados: eliminarlo borraría
                contabilidad. Sólo se puede archivar.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="callout bg-vibo-acento/6 px-4 py-3 text-sm">
              <p className="font-semibold">Esto no se puede deshacer.</p>
              <p className="mt-1">Se van a borrar:</p>
              <ul className="mt-1 list-inside list-disc text-neutral-600">
                <li>{alcance.usuarios} usuario(s) — pierden el acceso</li>
                <li>{alcance.agentes} agente(s) y sus credenciales</li>
                <li>
                  {alcance.conversaciones} conversación(es) y {alcance.mensajes}{" "}
                  mensaje(s) de sus clientes
                </li>
              </ul>
            </div>

            {puedeBorrarse ? (
              <form action={accionBorrado} className="space-y-3">
                <input type="hidden" name="clienteId" value={clienteId} />
                <div className="space-y-1.5">
                  <Label htmlFor="confirmacion" className="text-xs">
                    Escribí <span className="font-semibold">{nombre}</span> para
                    confirmar
                  </Label>
                  <Input
                    id="confirmacion"
                    name="confirmacion"
                    value={confirmacion}
                    onChange={(e) => setConfirmacion(e.target.value)}
                    autoComplete="off"
                    className="max-w-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <BotonBorrar habilitado={nombreCoincide} />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAbierto(false);
                      setConfirmacion("");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-vibo-acento">
                  No se puede eliminar: tiene {alcance.pagos} pago(s)
                  registrados. Archivalo.
                </p>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)}>
                  Cerrar
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
