import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { FalloAgente } from "@/lib/cliente/datos";

/**
 * El estado degradado que exige el SDD (4.4).
 *
 * La regla es no fallar nunca en silencio sobre los turnos, porque son el dato
 * más importante del negocio del cliente. Un número que salió de datos
 * incompletos y no lo dice es peor que un error: el dueño lo usa para decidir
 * precios creyendo que está completo.
 *
 * Se nombra la sede que falló. Con "Todas las sedes" el agregado sigue en
 * pantalla — pero saber cuál falta es la diferencia entre un dato con un hueco
 * conocido y un dato en el que no se puede confiar.
 */
export function AvisoDegradado({
  fallos,
  descartes,
  // La unidad de lo descartado, para que el aviso diga "reserva" en Turnos/Inicio
  // y "horario" en la sub-vista de Slots.
  unidad = { singular: "reserva", plural: "reservas" },
}: {
  fallos: FalloAgente[];
  descartes: number;
  unidad?: { singular: string; plural: string };
}) {
  if (fallos.length === 0 && descartes === 0) return null;

  return (
    <Alert variant="destructive">
      <AlertTitle>Faltan datos en lo que ves abajo</AlertTitle>
      <AlertDescription className="space-y-1">
        {fallos.map((fallo) => (
          <p key={fallo.agente}>
            <span className="font-medium">{fallo.agente}:</span> {fallo.mensaje}
          </p>
        ))}
        {descartes > 0 && (
          <p>
            {descartes === 1
              ? `Hay 1 ${unidad.singular} que no se pudo leer`
              : `Hay ${descartes} ${unidad.plural} que no se pudieron leer`}{" "}
            porque les falta la fecha o el horario. No están contados en los
            números de esta pantalla.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
