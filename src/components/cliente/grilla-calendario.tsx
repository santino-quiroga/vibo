import { formatearFechaCorta, formatearHora } from "@/lib/airtable/tipos";
import type { DatosCalendario, TurnoEnCalendario } from "@/lib/cliente/datos";
import { cn } from "@/lib/utils";

/**
 * Calendario operativo (requerimientos §8): quién juega dónde y a qué hora.
 *
 * Es la vista que mira alguien parado en la recepción, no el dueño analizando
 * el mes. De ahí las decisiones:
 *
 * 1. **El nombre del contacto y la cancha van en la celda**, no detrás de un
 *    hover ni de un click. Si hay que abrir algo para saber quién viene a las
 *    20:00, la vista no sirve para lo que se pidió.
 *
 * 2. **Una celda vacía es una franja libre**, y se dibuja como tal (apagada,
 *    con un guión). No se deja en blanco: en una grilla operativa "no hay nada
 *    a esa hora" es justamente la información que se busca para meter un turno.
 *
 * 3. **Los cancelados no aparecen** (se filtran antes, en `datosDeCalendario`).
 *    Acá una celda ocupada significa "la cancha está tomada"; un turno caído
 *    que siga dibujado haría rechazar una reserva que se podía tomar. Para ver
 *    lo que se canceló está la vista de Reservas, que sí los lista.
 */

/** El turno como se ve dentro de una celda: cancha primero, después quién. */
function Turno({
  turno,
  variasSedes,
}: {
  turno: TurnoEnCalendario;
  variasSedes: boolean;
}) {
  const nombre = turno.nombre ?? turno.telefono ?? "Sin nombre";

  return (
    <li
      className={cn(
        "rounded-[6px] border-l-2 bg-neutral-50 px-2 py-1.5 text-left",
        // Pendiente de seña se distingue: el turno está tomado pero todavía no
        // pagado, y es lo que alguien en recepción tiene que ir a cobrar.
        turno.estado === "PENDIENTE_SENIA"
          ? "border-warning bg-warning-suave/40"
          : "border-neutral-300",
      )}
    >
      <p className="truncate text-[11px] font-medium text-neutral-500">
        {turno.cancha ?? "Sin cancha"}
        {turno.estado === "PENDIENTE_SENIA" && (
          <span className="text-warning"> · falta seña</span>
        )}
      </p>
      <p className="text-foreground truncate text-[13px] font-medium" title={nombre}>
        {nombre}
      </p>
      {/* El teléfono de quien reservó (requerimiento de testing): en recepción
          hace falta para llamar/confirmar. Sólo se muestra como línea aparte
          cuando además hay nombre; si no hay nombre, el teléfono ya ocupa la
          línea principal de arriba y repetirlo sería ruido. */}
      {turno.nombre && turno.telefono && (
        <p className="truncate font-mono text-[11px] text-neutral-400" title={turno.telefono}>
          {turno.telefono}
        </p>
      )}
      {variasSedes && turno.agenteNombre && (
        <p className="truncate text-[11px] text-neutral-400">{turno.agenteNombre}</p>
      )}
    </li>
  );
}

export function GrillaCalendario({ datos }: { datos: DatosCalendario }) {
  if (datos.franjas.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-neutral-500">
        No hay horarios cargados ni turnos en este período. Cargá los horarios de
        tus canchas en «Horarios disponibles» para ver la grilla completa.
      </p>
    );
  }

  const unaColumna = datos.dias.length === 1;

  return (
    <div className="space-y-4">
      {/* Scrollea adentro de su caja: 7 columnas más la de la hora no entran en
          un celular, y lo que no puede pasar es que empujen el ancho de la
          página (requisito de mobile real, §12). */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table
          className={cn(
            "w-full border-collapse text-sm",
            !unaColumna && "min-w-[52rem]",
          )}
        >
          <caption className="sr-only">
            Turnos por franja horaria y día. Cada celda muestra la cancha y el
            nombre del contacto de cada turno reservado.
          </caption>

          <thead>
            <tr>
              <th scope="col" className="etiqueta w-16 pb-2 text-left text-xs">
                Hora
              </th>
              {datos.dias.map((dia) => (
                <th
                  key={dia}
                  scope="col"
                  className="etiqueta pb-2 text-left text-xs whitespace-nowrap"
                >
                  {formatearFechaCorta(dia)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {datos.franjas.map((hora) => (
              <tr key={hora}>
                <th
                  scope="row"
                  className="border border-black/10 px-2 py-2 text-right align-top font-mono text-xs font-normal text-neutral-500"
                >
                  {formatearHora(hora)}
                </th>

                {datos.dias.map((dia) => {
                  const turnos = datos.celdas.get(`${dia}|${hora}`) ?? [];

                  return (
                    <td
                      key={dia}
                      className="border border-black/10 p-1.5 align-top"
                    >
                      {turnos.length === 0 ? (
                        <span
                          className="block py-1 text-center text-xs text-neutral-300"
                          title={`${formatearFechaCorta(dia)} ${formatearHora(hora)}: libre`}
                        >
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">
                            {formatearFechaCorta(dia)} {formatearHora(hora)}: libre
                          </span>
                        </span>
                      ) : (
                        <ul className="space-y-1">
                          {turnos.map((turno) => (
                            <Turno
                              key={turno.recordId}
                              turno={turno}
                              variasSedes={datos.variasSedes}
                            />
                          ))}
                        </ul>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Los turnos sin hora legible no se pierden: son gente que va a venir. */}
      {datos.sinHorario.length > 0 && (
        <div className="callout bg-neutral-100 px-4 py-3">
          <p className="text-sm font-medium">
            {datos.sinHorario.length} turno(s) sin horario en la grilla
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Su hora de inicio está vacía o no se pudo leer en la base de turnos.
            Están reservados igual:
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {datos.sinHorario.map((turno) => (
              <li key={turno.recordId} className="text-neutral-600">
                {turno.nombre ?? turno.telefono ?? "Sin nombre"}
                {turno.cancha ? ` · ${turno.cancha}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
