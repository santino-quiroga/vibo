import { DIAS_SEMANA } from "@/lib/airtable/campos";
import { formatearHora } from "@/lib/airtable/tipos";
import type { Ocupacion } from "@/lib/kpis";
import { cn } from "@/lib/utils";

/**
 * Ocupación por franja y día (punto 6.1).
 *
 * Dos decisiones que no son estéticas:
 *
 * 1. Una celda sin slots activos se dibuja rayada, no en el color del 0%. "No
 *    se vende a esa hora" y "se vende y no vino nadie" son cosas distintas, y
 *    justo acá se toman decisiones de precio: pintarlas igual empujaría al
 *    dueño a rematar un horario en el que ni siquiera abre.
 *
 * 2. El porcentaje va escrito en cada celda además del color. El color es la
 *    lectura rápida de dónde se llena; el número es el dato. Que el color sea
 *    lo único sería ilegible para daltonismo y para una pantalla al sol, que es
 *    exactamente el contexto del punto 12 (uso real desde el celular).
 */

/** La rampa secuencial de la marca (--ocup-0..5), del blanco roto al #7A1024. */
function nivel(ocupacion: number): { fondo: string; texto: string } {
  if (ocupacion === 0) return { fondo: "bg-ocupacion-0", texto: "text-neutral-400" };
  if (ocupacion <= 0.2) return { fondo: "bg-ocupacion-1", texto: "text-vibo-negro" };
  if (ocupacion <= 0.4) return { fondo: "bg-ocupacion-2", texto: "text-vibo-negro" };
  if (ocupacion <= 0.6) return { fondo: "bg-ocupacion-3", texto: "text-vibo-blanco" };
  if (ocupacion <= 0.8) return { fondo: "bg-ocupacion-4", texto: "text-vibo-blanco" };
  return { fondo: "bg-ocupacion-5", texto: "text-vibo-blanco" };
}

const porcentaje = (v: number) => `${Math.round(v * 100)}%`;

export function HeatmapOcupacion({ ocupacion }: { ocupacion: Ocupacion }) {
  if (ocupacion.franjas.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No hay horarios cargados en la base de turnos de esta sede, así que no se
        puede calcular sobre cuántos lugares se llenó.
      </p>
    );
  }

  const celda = (dia: number, hora: number) =>
    ocupacion.celdas.find((c) => c.diaSemana === dia && c.horaInicioMin === hora);

  return (
    <div className="space-y-3">
      {/* El contenedor scrollea solo: 8 columnas no entran a 390px, y lo que no
          puede pasar es que empuje el ancho de la página entera. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[34rem] border-collapse text-center">
          <caption className="sr-only">
            Ocupación por franja horaria y día de la semana. Cada celda es el
            porcentaje de lugares vendidos sobre los disponibles.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="etiqueta w-14 pb-2 text-left text-xs">
                Hora
              </th>
              {DIAS_SEMANA.map((dia) => (
                <th key={dia} scope="col" className="etiqueta pb-2 text-xs">
                  {/* Abreviado en mobile: "Miércoles" no entra en 40px. */}
                  <span aria-hidden="true">{dia.slice(0, 3)}</span>
                  <span className="sr-only">{dia}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ocupacion.franjas.map((hora) => (
              <tr key={hora}>
                <th
                  scope="row"
                  className="pr-2 text-right font-mono text-xs font-normal text-neutral-500"
                >
                  {formatearHora(hora)}
                </th>
                {DIAS_SEMANA.map((dia, indiceDia) => {
                  const c = celda(indiceDia, hora);

                  if (!c || c.ocupacion === null) {
                    return (
                      <td key={dia} className="border border-black/10 p-0">
                        <div
                          className="rayado flex h-8 items-center justify-center"
                          title={`${dia} ${formatearHora(hora)}: sin horarios activos`}
                        >
                          <span className="sr-only">
                            {dia} {formatearHora(hora)}: sin horarios activos
                          </span>
                        </div>
                      </td>
                    );
                  }

                  const { fondo, texto } = nivel(c.ocupacion);
                  return (
                    <td key={dia} className="border border-black/10 p-0">
                      <div
                        className={cn(
                          "flex h-8 items-center justify-center text-xs font-medium tabular-nums",
                          fondo,
                          texto,
                        )}
                        title={`${dia} ${formatearHora(hora)}: ${c.ocupados} de ${c.capacidad} lugares`}
                      >
                        <span aria-hidden="true">{porcentaje(c.ocupacion)}</span>
                        <span className="sr-only">
                          {dia} {formatearHora(hora)}: {porcentaje(c.ocupacion)},{" "}
                          {c.ocupados} de {c.capacidad} lugares
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="flex border border-black/15">
            {["bg-ocupacion-0", "bg-ocupacion-1", "bg-ocupacion-2", "bg-ocupacion-3", "bg-ocupacion-4", "bg-ocupacion-5"].map(
              (c) => (
                <span key={c} className={cn("h-3 w-3", c)} aria-hidden="true" />
              ),
            )}
          </span>
          Vacío → lleno
        </span>
        <span className="flex items-center gap-1.5">
          <span className="rayado h-3 w-3 border border-black/15" aria-hidden="true" />
          Sin horarios activos
        </span>
      </div>
    </div>
  );
}
