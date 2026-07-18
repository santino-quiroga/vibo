import "server-only";

import { cache } from "react";

import { DIAS_SEMANA, numeroDeCancha } from "@/lib/airtable/campos";
import { ErrorAirtable } from "@/lib/airtable/cliente";
import {
  TTL_KPIS,
  TTL_TURNOS,
  leerReservasCacheado,
  leerSlotsCacheado,
} from "@/lib/airtable/lectura";
import { diaDeLaSemana, type Reserva, type Slot } from "@/lib/airtable/tipos";
import { requerirClienteOwner } from "@/lib/dal";
import {
  calcularOcupacion,
  fechasDelPeriodo,
  ingresosEstimados,
  tasaConversion,
  turnosReservados,
  variacion,
  type CanchaConfig,
  type Periodo,
} from "@/lib/kpis";
import { dentroDe, rangoCompleto, resolverPeriodo, type ClaveRango } from "@/lib/periodos";
import { prisma } from "@/lib/prisma";

/**
 * Lecturas del panel cliente.
 *
 * Esta es la frontera de autorización (SDD 6.3): **ninguna consulta de acá se
 * arma sin el clienteId de la sesión.** La capa de Airtable no autoriza nada,
 * confía en el agenteId que le pasan — así que si algo saltea este archivo, no
 * hay una segunda red abajo.
 */

export type AgenteEnAlcance = {
  id: string;
  nombre: string;
  deporte: string;
  estado: "ACTIVO" | "PAUSADO_MANUAL" | "PAUSADO_LIMITE";
};

/** Los agentes del cliente de la sesión, y sólo esos. */
export const agentesDelCliente = cache(async (): Promise<AgenteEnAlcance[]> => {
  const { clienteId } = await requerirClienteOwner();
  return prisma.agente.findMany({
    where: { clienteId },
    select: { id: true, nombre: true, deporte: true, estado: true },
    orderBy: { createdAt: "asc" },
  });
});

export type Alcance = {
  agentes: AgenteEnAlcance[];
  /** null = "Todas las sedes". */
  seleccionado: AgenteEnAlcance | null;
};

/**
 * Resuelve el selector de alcance del punto 6 ("Todas las sedes" o una sede).
 *
 * El `agenteId` llega por querystring, así que es texto que escribe el usuario.
 * No se usa para consultar: se busca dentro de la lista que YA está filtrada por
 * el clienteId de la sesión. Por eso pedir el agente de otro cliente no devuelve
 * sus datos ni un error que confirme que ese id existe — cae en "Todas las
 * sedes", que es lo que ese usuario sí puede ver.
 */
export async function resolverAlcance(agenteIdPedido?: string): Promise<Alcance> {
  const agentes = await agentesDelCliente();
  const seleccionado = agenteIdPedido
    ? (agentes.find((a) => a.id === agenteIdPedido) ?? null)
    : null;
  return { agentes, seleccionado };
}

/** Qué agentes entran en el cálculo según el alcance elegido. */
function agentesEnAlcance(alcance: Alcance): AgenteEnAlcance[] {
  return alcance.seleccionado ? [alcance.seleccionado] : alcance.agentes;
}

async function canchasDe(agenteIds: string[]): Promise<Map<string, CanchaConfig[]>> {
  const filas = await prisma.cancha.findMany({
    where: { agenteId: { in: agenteIds } },
    select: { agenteId: true, numero: true, precio: true },
  });

  const porAgente = new Map<string, CanchaConfig[]>();
  for (const fila of filas) {
    const lista = porAgente.get(fila.agenteId) ?? [];
    // Decimal → number recién acá. El precio de una cancha entra cómodo en un
    // double; lo que no hay que hacer es guardarlo así.
    lista.push({ numero: fila.numero, precio: Number(fila.precio) });
    porAgente.set(fila.agenteId, lista);
  }
  return porAgente;
}

/** Un agente cuyos datos no se pudieron leer, para decirlo sin romper la página. */
export type FalloAgente = { agente: string; mensaje: string };

type DatosCrudos = {
  reservas: Reserva[];
  slots: Slot[];
  canchas: CanchaConfig[];
  descartes: number;
  fallos: FalloAgente[];
};

/**
 * Junta reservas y slots de todos los agentes del alcance.
 *
 * Usa allSettled y no all: si un agente tiene la base de Airtable caída, los
 * demás se siguen mostrando. El SDD (4.4) pide estado degradado visible, no una
 * pantalla rota — es el dato más importante del negocio del cliente.
 */
async function traerCrudos(
  agentes: AgenteEnAlcance[],
  rango: Periodo,
  ttl: number,
  conSlots: boolean,
): Promise<DatosCrudos> {
  const canchasPorAgente = await canchasDe(agentes.map((a) => a.id));

  const resultados = await Promise.allSettled(
    agentes.map(async (agente) => {
      const [reservas, slots] = await Promise.all([
        leerReservasCacheado(agente.id, rango.desde, rango.hasta, ttl),
        conSlots ? leerSlotsCacheado(agente.id) : Promise.resolve({ filas: [], descartes: [] }),
      ]);
      return { agente, reservas, slots };
    }),
  );

  const crudos: DatosCrudos = {
    reservas: [],
    slots: [],
    canchas: [],
    descartes: 0,
    fallos: [],
  };

  resultados.forEach((resultado, i) => {
    const agente = agentes[i];

    if (resultado.status === "rejected") {
      const error = resultado.reason;
      crudos.fallos.push({
        agente: agente.nombre,
        mensaje:
          error instanceof ErrorAirtable
            ? error.mensajeUsuario
            : "No se pudieron cargar los turnos de esta sede.",
      });
      // El detalle técnico al log del servidor, no a la pantalla del dueño.
      console.error(`[airtable] agente ${agente.id}:`, error);
      return;
    }

    const { reservas, slots } = resultado.value;
    crudos.reservas.push(...reservas.filas);
    crudos.slots.push(...slots.filas);
    crudos.canchas.push(...(canchasPorAgente.get(agente.id) ?? []));
    crudos.descartes += reservas.descartes.length + slots.descartes.length;
  });

  return crudos;
}

/** Un punto de la tendencia semanal: un día y sus turnos reservados. */
export type PuntoTendencia = { fecha: string; etiqueta: string; total: number };

/** El turno más reciente que agendó el bot, para el widget de actividad. */
export type UltimoTurnoBot = { fecha: string; horaInicioMin: number | null } | null;

export type DatosInicio = {
  etiqueta: string;
  periodo: Periodo;
  turnos: { actual: number; variacion: number | null };
  conversion: ReturnType<typeof tasaConversion>;
  ingresos: ReturnType<typeof ingresosEstimados>;
  ocupacion: ReturnType<typeof calcularOcupacion>;
  /** Turnos reservados por día en los últimos 7 días (para el gráfico). */
  tendencia: PuntoTendencia[];
  ultimoTurnoBot: UltimoTurnoBot;
  fallos: FalloAgente[];
  descartes: number;
  sinCanchas: boolean;
  /**
   * Ninguna sede del alcance se pudo leer: los números no son cero, son
   * desconocidos. La UI tiene que mostrar "—" y no "0" — un dueño que ve "0
   * turnos este mes" junto a un aviso chico entiende que no vendió nada, que es
   * lo contrario de lo que pasó.
   */
  sinDatos: boolean;
};

/** Los 4 KPIs del punto 6, con las fórmulas del 6.1. */
export async function datosDeInicio(
  clave: ClaveRango,
  agenteIdPedido?: string,
): Promise<DatosInicio> {
  const alcance = await resolverAlcance(agenteIdPedido);
  const agentes = agentesEnAlcance(alcance);
  const { actual, anterior, etiqueta } = resolverPeriodo(clave);

  if (agentes.length === 0) {
    return {
      etiqueta,
      periodo: actual,
      turnos: { actual: 0, variacion: null },
      conversion: { hayDatos: false },
      ingresos: { total: 0, porCancha: [], sinPrecio: 0 },
      ocupacion: { celdas: [], franjas: [], global: null },
      tendencia: [],
      ultimoTurnoBot: null,
      fallos: [],
      descartes: 0,
      sinCanchas: false,
      sinDatos: false,
    };
  }

  // Una sola lectura que cubre los dos períodos y, además, la ventana de 7 días
  // del gráfico de tendencia. Pedirlo por separado sería más requests contra el
  // rate limit de Airtable, multiplicado por cantidad de sedes.
  const semana = resolverPeriodo("semana").actual;
  const base = rangoCompleto(actual, anterior);
  const rango: Periodo = {
    desde: base.desde <= semana.desde ? base.desde : semana.desde,
    hasta: base.hasta >= semana.hasta ? base.hasta : semana.hasta,
  };
  const crudos = await traerCrudos(agentes, rango, TTL_KPIS, true);

  const deActual = crudos.reservas.filter((r) => dentroDe(r.fecha, actual));
  const deAnterior = crudos.reservas.filter((r) => dentroDe(r.fecha, anterior));

  const conversaciones = await contarConversaciones(
    agentes.map((a) => a.id),
    actual,
  );

  // Tendencia: turnos reservados por cada uno de los últimos 7 días.
  const tendencia: PuntoTendencia[] = [...fechasDelPeriodo(semana)].map((fecha) => {
    const total = crudos.reservas.filter(
      (r) =>
        r.fecha === fecha &&
        (r.estado === "CONFIRMADA" || r.estado === "PENDIENTE_SENIA"),
    ).length;
    const dia = diaDeLaSemana(fecha);
    return {
      fecha,
      etiqueta: dia !== null ? DIAS_SEMANA[dia].slice(0, 3) : "",
      total,
    };
  });

  return {
    etiqueta,
    periodo: actual,
    turnos: {
      actual: turnosReservados(deActual),
      variacion: variacion(turnosReservados(deActual), turnosReservados(deAnterior)),
    },
    conversion: tasaConversion(deActual, conversaciones),
    ingresos: ingresosEstimados(deActual, crudos.canchas),
    ocupacion: calcularOcupacion(deActual, crudos.slots, actual),
    tendencia,
    ultimoTurnoBot: ultimoTurnoAgendado(crudos.reservas),
    fallos: crudos.fallos,
    descartes: crudos.descartes,
    sinCanchas: crudos.canchas.length === 0,
    // Si falló ALGUNA sede pero no todas, el número que sale es parcial y el
    // aviso de arriba nombra cuál falta. Si fallaron todas, no hay número.
    sinDatos: crudos.fallos.length === agentes.length,
  };
}

/**
 * El turno confirmado más reciente que agendó el bot, de las reservas cargadas.
 *
 * Es lo que el widget de actividad muestra como "última acción". Se ordena por
 * fecha y hora de inicio; solo cuentan los creados por el bot (creadaPorBot),
 * que son los que hizo el agente, no las cargas manuales del dueño.
 */
function ultimoTurnoAgendado(reservas: Reserva[]): UltimoTurnoBot {
  const delBot = reservas.filter(
    (r) => r.creadaPorBot && r.estado === "CONFIRMADA",
  );
  if (delBot.length === 0) return null;

  const ultimo = delBot.reduce((mejor, r) => {
    if (r.fecha !== mejor.fecha) return r.fecha > mejor.fecha ? r : mejor;
    return (r.horaInicioMin ?? 0) > (mejor.horaInicioMin ?? 0) ? r : mejor;
  });
  return { fecha: ultimo.fecha, horaInicioMin: ultimo.horaInicioMin };
}

/**
 * Conversaciones del período, de la base de Vibo (no de Airtable).
 *
 * Hasta el sprint 4 esta tabla está vacía porque nadie la escribe todavía: n8n
 * recién va a loguear mensajes ahí. Devolver 0 hace que la tasa de conversión
 * se muestre como "sin datos", que es la verdad.
 */
async function contarConversaciones(agenteIds: string[], periodo: Periodo): Promise<number> {
  return prisma.conversacion.count({
    where: {
      agenteId: { in: agenteIds },
      ultimoMensajeAt: {
        gte: new Date(`${periodo.desde}T00:00:00-03:00`),
        lt: new Date(`${periodo.hasta}T23:59:59.999-03:00`),
      },
    },
  });
}

export type TurnoListado = Reserva & {
  agenteNombre: string;
  precio: number | null;
};

export type DatosTurnos = {
  turnos: TurnoListado[];
  fallos: FalloAgente[];
  descartes: number;
  canchasDisponibles: string[];
};

/**
 * La sección Turnos (punto 8): lista de reservas del alcance y período.
 *
 * Se cachea mucho menos que los KPIs (SDD 4.1): acá el dueño espera ver la
 * reserva que entró recién, no un número agregado.
 */
export async function datosDeTurnos(
  clave: ClaveRango,
  agenteIdPedido?: string,
): Promise<DatosTurnos> {
  const alcance = await resolverAlcance(agenteIdPedido);
  const agentes = agentesEnAlcance(alcance);
  const { actual } = resolverPeriodo(clave);

  if (agentes.length === 0) {
    return { turnos: [], fallos: [], descartes: 0, canchasDisponibles: [] };
  }

  const canchasPorAgente = await canchasDe(agentes.map((a) => a.id));

  const resultados = await Promise.allSettled(
    agentes.map(async (agente) => ({
      agente,
      reservas: await leerReservasCacheado(agente.id, actual.desde, actual.hasta, TTL_TURNOS),
    })),
  );

  const turnos: TurnoListado[] = [];
  const fallos: FalloAgente[] = [];
  let descartes = 0;

  resultados.forEach((resultado, i) => {
    const agente = agentes[i];

    if (resultado.status === "rejected") {
      const error = resultado.reason;
      fallos.push({
        agente: agente.nombre,
        mensaje:
          error instanceof ErrorAirtable
            ? error.mensajeUsuario
            : "No se pudieron cargar los turnos de esta sede.",
      });
      console.error(`[airtable] agente ${agente.id}:`, error);
      return;
    }

    const precios = new Map(
      (canchasPorAgente.get(agente.id) ?? []).map((c) => [c.numero, c.precio]),
    );
    descartes += resultado.value.reservas.descartes.length;

    for (const reserva of resultado.value.reservas.filas) {
      const numero = reserva.cancha ? numeroDeCancha(reserva.cancha) : null;
      turnos.push({
        ...reserva,
        agenteNombre: agente.nombre,
        // null y no 0: "esta cancha no tiene precio configurado" no es "sale
        // gratis". La UI los muestra distinto.
        precio: numero !== null ? (precios.get(numero) ?? null) : null,
      });
    }
  });

  // Más próximos primero: es el orden en que un dueño mira su agenda.
  turnos.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
    return (a.horaInicioMin ?? 0) - (b.horaInicioMin ?? 0);
  });

  const canchasDisponibles = [
    ...new Set(turnos.map((t) => t.cancha).filter((c): c is string => c !== null)),
  ].sort();

  return { turnos, fallos, descartes, canchasDisponibles };
}
