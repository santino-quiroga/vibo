import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Salud de las integraciones por agente (SDD v2 §5).
 *
 * Sella en el agente el último error que devolvió Airtable o Evolution después
 * de agotar los reintentos. Es lo que permite que el admin vea "a este cliente
 * se le rompió la integración" antes de que el cliente llame.
 *
 * Dos decisiones:
 *
 * 1. **Nunca lanza.** Si registrar el error falla, no puede tumbar la operación
 *    que ya venía fallando: sería convertir un problema de Airtable en un 500
 *    de Vibo. Se loguea y sigue.
 * 2. **No se hace await desde el camino caliente.** Quien llama lo dispara sin
 *    esperar: el dueño mirando sus turnos no tiene por qué esperar a que se
 *    escriba una métrica de diagnóstico.
 */

/** Se recorta para que un blob de error no crezca sin techo en la fila. */
const MAX_MENSAJE = 300;

export function registrarErrorIntegracion(
  agenteId: string,
  servicio: "airtable" | "evolution",
  mensaje: string,
): void {
  const texto = `[${servicio}] ${mensaje}`.slice(0, MAX_MENSAJE);

  void prisma.agente
    .update({
      where: { id: agenteId },
      data: {
        ultimoErrorIntegracionAt: new Date(),
        ultimoErrorIntegracionMsg: texto,
      },
    })
    .catch((error: unknown) => {
      console.error(`[salud] no se pudo registrar el error de ${agenteId}:`, error);
    });
}

/**
 * Limpia el sello de error de un agente tras una lectura exitosa.
 *
 * Sin esto, un error de hace tres semanas quedaría marcado para siempre y el
 * panel mostraría como rotos agentes que ya andan — que es la forma más rápida
 * de que un tablero de salud se vuelva ruido y se deje de mirar.
 *
 * Se hace condicional (`ultimoErrorIntegracionAt: { not: null }`) para no
 * escribir en cada lectura de cada agente: el 99% de las veces no hay nada que
 * limpiar.
 */
export function limpiarErrorIntegracion(agenteId: string): void {
  void prisma.agente
    .updateMany({
      where: { id: agenteId, ultimoErrorIntegracionAt: { not: null } },
      data: { ultimoErrorIntegracionAt: null, ultimoErrorIntegracionMsg: null },
    })
    .catch(() => {
      // Silencio a propósito: es una limpieza oportunista, no algo que deba
      // ensuciar los logs si falla.
    });
}
