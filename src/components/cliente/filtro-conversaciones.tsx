import { SelectNativo } from "@/components/admin/select-nativo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FiltroEstado } from "@/lib/cliente/conversaciones";

/**
 * Filtros de la bandeja (requerimientos punto 9): sede, estado y búsqueda.
 *
 * Form GET, como el resto del panel: el filtro queda en la URL, funciona sin JS
 * y se puede compartir o volver con el botón atrás. El punto 12 espera uso real
 * desde el celular.
 */

const ESTADOS: Array<{ valor: FiltroEstado; etiqueta: string }> = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "no_leidas", etiqueta: "No leídas" },
  { valor: "ia_respondiendo", etiqueta: "IA respondiendo" },
  { valor: "requiere_humano", etiqueta: "Requieren atención" },
];

export function FiltroConversaciones({
  agentes,
  sedeActual,
  estadoActual,
  busquedaActual,
}: {
  agentes: { id: string; nombre: string }[];
  sedeActual: string | null;
  estadoActual: FiltroEstado;
  busquedaActual: string;
}) {
  const hayVariasSedes = agentes.length > 1;

  return (
    <form
      method="GET"
      action="/dashboard/conversaciones"
      className="bg-card flex flex-wrap items-end gap-3 border border-black/10 p-3"
    >
      <div className="min-w-0 flex-1 space-y-1 sm:max-w-56">
        <label htmlFor="q" className="etiqueta text-xs">
          Buscar contacto
        </label>
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={busquedaActual}
          placeholder="Nombre o teléfono"
        />
      </div>

      {hayVariasSedes && (
        <div className="min-w-0 flex-1 space-y-1 sm:max-w-48">
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

      <div className="min-w-0 flex-1 space-y-1 sm:max-w-48">
        <label htmlFor="estado" className="etiqueta text-xs">
          Estado
        </label>
        <SelectNativo id="estado" name="estado" defaultValue={estadoActual}>
          {ESTADOS.map((e) => (
            <option key={e.valor} value={e.valor}>
              {e.etiqueta}
            </option>
          ))}
        </SelectNativo>
      </div>

      <Button type="submit" variant="outline">
        Filtrar
      </Button>
    </form>
  );
}
