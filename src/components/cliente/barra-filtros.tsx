import { SelectNativo } from "@/components/admin/select-nativo";
import { Button } from "@/components/ui/button";
import type { AgenteEnAlcance } from "@/lib/cliente/datos";
import { RANGOS, type ClaveRango } from "@/lib/periodos";

/**
 * El selector de alcance del punto 5 (transversal a Inicio y Turnos) más el
 * corte de período del punto 6.
 *
 * Es un form GET de verdad y no un dropdown con router.push: así el filtro
 * funciona sin JS, queda en la URL (se puede compartir y volver con el botón
 * atrás) y el submit lo hace el browser. El punto 12 espera uso real desde el
 * celular, donde el JS tarda más en llegar que el HTML.
 *
 * Nota: el punto 5 lo ubica en el header, pero un layout de Next no recibe
 * searchParams, así que desde ahí no podría conservar el período al cambiar de
 * sede. Va a nivel de página, que es donde el dato existe.
 */
export function BarraFiltros({
  agentes,
  sedeActual,
  rangoActual,
  accion,
  mostrarRango = true,
}: {
  agentes: AgenteEnAlcance[];
  sedeActual: string | null;
  rangoActual: ClaveRango;
  /** La ruta a la que vuelve el submit (la página actual). */
  accion: string;
  mostrarRango?: boolean;
}) {
  // Con una sola sede el selector no decide nada: ocultarlo saca ruido de una
  // pantalla que se mira desde el celular.
  const hayVariasSedes = agentes.length > 1;

  if (!hayVariasSedes && !mostrarRango) return null;

  return (
    <form
      method="GET"
      action={accion}
      className="bg-card flex flex-wrap items-end gap-3 border border-black/10 p-3"
    >
      {hayVariasSedes && (
        <div className="min-w-0 flex-1 space-y-1 sm:max-w-64">
          <label htmlFor="sede" className="etiqueta text-xs">
            Sede
          </label>
          <SelectNativo id="sede" name="sede" defaultValue={sedeActual ?? ""}>
            <option value="">Todas las sedes</option>
            {agentes.map((agente) => (
              <option key={agente.id} value={agente.id}>
                {agente.nombre}
              </option>
            ))}
          </SelectNativo>
        </div>
      )}

      {mostrarRango && (
        <div className="min-w-0 flex-1 space-y-1 sm:max-w-48">
          <label htmlFor="rango" className="etiqueta text-xs">
            Período
          </label>
          <SelectNativo id="rango" name="rango" defaultValue={rangoActual}>
            {RANGOS.map((rango) => (
              <option key={rango.clave} value={rango.clave}>
                {rango.etiqueta}
              </option>
            ))}
          </SelectNativo>
        </div>
      )}

      <Button type="submit" variant="outline">
        Aplicar
      </Button>
    </form>
  );
}
