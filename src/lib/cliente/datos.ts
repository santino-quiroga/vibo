import "server-only";

import { cache } from "react";

import type { EstadoAgente } from "@/generated/prisma/enums";

import { DIAS_SEMANA, numeroDeCancha } from "@/lib/airtable/campos";
import { ErrorAirtable } from "@/lib/airtable/cliente";
import {
  TTL_KPIS,
  TTL_TURNOS,
  leerReservasCacheado,
  leerSlotsCacheado,
} from "@/lib/airtable/lectura";
import { diaDeLaSemana, type Reserva, type Slot } from "@/lib/airtable/tipos";
import { aMinutos } from "@/lib/canchas-validacion";
import { requerirClienteOwner } from "@/lib/dal";
import {
  calcularOcupacion,
  fechasDelPeriodo,
  ingresosEstimados,
  precioEnTramo,
  tasaConversion,
  turnosReservados,
  variacion,
  type CanchaConfig,
  type Periodo,
} from "@/lib/kpis";
import {
  dentroDe,
  hoyEnArgentina,
  inicioDeSemana,
  rangoCompleto,
  resolverPeriodo,
  sumarDias,
  type ClaveRango,
} from "@/lib/periodos";
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
  estado: EstadoAgente;
};

export type ClienteDeSesion = {
  nombre: string;
  plan: string;
};

/** El complejo de la sesión, para el header (nombre de empresa y plan). */
export const clienteDeLaSesion = cache(async (): Promise<ClienteDeSesion> => {
  const { clienteId } = await requerirClienteOwner();
  const cliente = await prisma.cliente.findUniqueOrThrow({
    where: { id: clienteId },
    select: { nombre: true, plan: { select: { nombre: true } } },
  });
  return { nombre: cliente.nombre, plan: cliente.plan.nombre };
});

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
    select: {
      agenteId: true,
      numero: true,
      precio: true,
      tramos: { select: { desde: true, hasta: true, precio: true } },
    },
  });

  const porAgente = new Map<string, CanchaConfig[]>();
  for (const fila of filas) {
    const lista = porAgente.get(fila.agenteId) ?? [];
    // Decimal → number recién acá. El precio de una cancha entra cómodo en un
    // double; lo que no hay que hacer es guardarlo así. Los tramos se pasan a
    // minutos del día para cruzarlos con la hora de inicio de cada turno.
    lista.push({
      numero: fila.numero,
      precio: Number(fila.precio),
      tramos: fila.tramos.map((t) => ({
        desdeMin: aMinutos(t.desde),
        hastaMin: aMinutos(t.hasta),
        precio: Number(t.precio),
      })),
    });
    porAgente.set(fila.agenteId, lista);
  }
  return porAgente;
}

/** Un agente cuyos datos no se pudieron leer, para decirlo sin romper la página. */
export type FalloAgente = { agente: string; mensaje: string };

/** Una reserva junto con la sede de la que salió, ya que `traerCrudos` aplana varias. */
export type ReservaConAgente = Reserva & { agenteId: string };

type DatosCrudos = {
  reservas: ReservaConAgente[];
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
    crudos.reservas.push(
      ...reservas.filas.map((fila) => ({ ...fila, agenteId: agente.id })),
    );
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
  /** La sede dueña del turno: es la base de Airtable contra la que se escribe. */
  agenteId: string;
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

    const configs = new Map(
      (canchasPorAgente.get(agente.id) ?? []).map((c) => [c.numero, c]),
    );
    descartes += resultado.value.reservas.descartes.length;

    for (const reserva of resultado.value.reservas.filas) {
      const numero = reserva.cancha ? numeroDeCancha(reserva.cancha) : null;
      const config = numero !== null ? configs.get(numero) : undefined;
      turnos.push({
        ...reserva,
        agenteId: agente.id,
        agenteNombre: agente.nombre,
        // El precio real depende de la hora del turno, no sólo de la cancha
        // (franja día/noche). null y no 0: "esta cancha no tiene precio
        // configurado" no es "sale gratis". La UI los muestra distinto.
        precio: config ? precioEnTramo(config, reserva.horaInicioMin) : null,
      });
    }
  });

  // Las más nuevas arriba, tipo pila: la reserva que entró recién queda primera.
  // Se ordena por "ID Reserva" (el autonumber de Airtable, que crece con cada
  // alta), así "nuevo" es orden en que se cargó la reserva y no la fecha del
  // partido. Una fila sin ID cae al fondo —no puede pretender ser la más nueva—
  // y desempata por fecha/hora, también de más reciente a más viejo.
  turnos.sort((a, b) => {
    if (a.idReserva !== b.idReserva) {
      if (a.idReserva === null) return 1;
      if (b.idReserva === null) return -1;
      return b.idReserva - a.idReserva;
    }
    if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
    return (b.horaInicioMin ?? 0) - (a.horaInicioMin ?? 0);
  });

  const canchasDisponibles = [
    ...new Set(turnos.map((t) => t.cancha).filter((c): c is string => c !== null)),
  ].sort();

  return { turnos, fallos, descartes, canchasDisponibles };
}

/** Una sede con sus canchas configuradas, para el alta manual de un turno. */
export type SedeParaAlta = {
  id: string;
  nombre: string;
  /** Números de cancha configurados en Vibo; se escriben como "Cancha N". */
  canchas: number[];
};

/**
 * Las sedes del cliente con sus canchas, para el formulario de alta.
 *
 * Las canchas salen de la config de Vibo y no de los turnos existentes: son las
 * que tienen precio cargado y las únicas cuyo "Cancha N" se puede escribir en
 * Airtable con la garantía de que la opción existe (SDD §3, convención de
 * nombres). Una sede sin canchas configuradas no puede recibir altas, y la UI
 * lo dice en vez de ofrecer un select vacío.
 */
export async function sedesParaAlta(): Promise<SedeParaAlta[]> {
  const agentes = await agentesDelCliente();
  if (agentes.length === 0) return [];

  const canchas = await prisma.cancha.findMany({
    where: { agenteId: { in: agentes.map((a) => a.id) } },
    select: { agenteId: true, numero: true },
    orderBy: { numero: "asc" },
  });

  return agentes.map((agente) => ({
    id: agente.id,
    nombre: agente.nombre,
    canchas: canchas.filter((c) => c.agenteId === agente.id).map((c) => c.numero),
  }));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Turno asociado a un contacto (requerimientos §9: el panel lateral de una
 * conversación muestra "turno asociado si existe").
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Los últimos dígitos de un teléfono, sin nada que no sea número.
 *
 * Es lo único que se puede comparar con confianza entre las dos fuentes: por
 * WhatsApp el teléfono llega como "5492323330438" (país + el 9 de celular de
 * Argentina + área + número), y en Airtable lo tipea una persona, que escribe
 * "2323 33-0438", "+54 9 2323 330438" o "15 33-0438" según el día. Comparar los
 * últimos 8 dígitos saltea todas esas variantes de prefijo.
 *
 * El riesgo asumido es el inverso: dos contactos distintos cuyos últimos 8
 * dígitos coincidan se cruzarían entre sí. Con la cantidad de contactos de un
 * complejo es despreciable, y por eso el panel rotula el turno como "posible
 * coincidencia" en vez de afirmarlo como un vínculo cierto.
 */
function sufijoTelefono(valor: string): string | null {
  const digitos = valor.replace(/\D/g, "");
  return digitos.length >= 8 ? digitos.slice(-8) : null;
}

export type TurnoDeContacto = {
  recordId: string;
  fecha: string;
  horaInicioMin: number | null;
  cancha: string | null;
  estado: Reserva["estado"];
};

/** Cuántos días para atrás y para adelante se buscan turnos del contacto. */
const VENTANA_CONTACTO = { atras: 30, adelante: 90 };

/**
 * Turnos de un contacto en la base de turnos de su sede.
 *
 * Devuelve una lista vacía —no un error— si Airtable falla: es información de
 * apoyo en un panel lateral, y romper el chat entero porque no se pudo leer un
 * dato secundario sería peor que no mostrarlo. El fallo queda en el log.
 */
export async function turnosDelContacto(
  agenteId: string,
  telefono: string,
): Promise<TurnoDeContacto[]> {
  // Misma frontera de siempre (§6.3): la sede tiene que ser del cliente de la
  // sesión, aunque el que llame ya lo haya verificado.
  const agentes = await agentesDelCliente();
  if (!agentes.some((a) => a.id === agenteId)) return [];

  const sufijo = sufijoTelefono(telefono);
  if (!sufijo) return [];

  const hoy = hoyEnArgentina();
  const desde = sumarDias(hoy, -VENTANA_CONTACTO.atras);
  const hasta = sumarDias(hoy, VENTANA_CONTACTO.adelante);

  let filas: Reserva[];
  try {
    ({ filas } = await leerReservasCacheado(agenteId, desde, hasta, TTL_TURNOS));
  } catch (error) {
    console.error(`[airtable] turnos del contacto, agente ${agenteId}:`, error);
    return [];
  }

  return filas
    .filter((r) => r.telefono !== null && sufijoTelefono(r.telefono) === sufijo)
    .sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
      return (a.horaInicioMin ?? 0) - (b.horaInicioMin ?? 0);
    })
    .map((r) => ({
      recordId: r.recordId,
      fecha: r.fecha,
      horaInicioMin: r.horaInicioMin,
      cancha: r.cancha,
      estado: r.estado,
    }));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Calendario operativo (requerimientos §8).
 *
 * **No es el heatmap de Inicio.** Aquel responde "¿qué franjas se me llenan?"
 * con un porcentaje agregado por día de la semana. Este responde "¿quién juega
 * dónde y a qué hora?" con nombre y cancha de cada turno, en días concretos del
 * calendario, para que alguien en la recepción lo lea de un vistazo. Comparten
 * la forma de grilla horaria y nada más: distinto dato, distinta pregunta.
 * ──────────────────────────────────────────────────────────────────────────── */

export type VistaCalendario = "dia" | "semana";

export function esVistaCalendario(valor: unknown): valor is VistaCalendario {
  return valor === "dia" || valor === "semana";
}

/** Un turno tal como se ve en una celda del calendario. */
export type TurnoEnCalendario = {
  recordId: string;
  nombre: string | null;
  telefono: string | null;
  cancha: string | null;
  estado: Reserva["estado"];
  agenteNombre: string;
};

export type DatosCalendario = {
  vista: VistaCalendario;
  /** Las columnas: un día en vista "dia", siete (lun-dom) en vista "semana". */
  dias: string[];
  /** Las filas: franjas horarias en minutos del día, ordenadas. */
  franjas: number[];
  /** Clave `${fecha}|${minutos}` → los turnos de esa celda. */
  celdas: Map<string, TurnoEnCalendario[]>;
  /**
   * Turnos del período que no se pudieron ubicar en la grilla porque su hora de
   * inicio vino vacía o ilegible. Se listan aparte en vez de descartarse: son
   * turnos reales que alguien tiene que atender, y desaparecerlos de la vista
   * operativa es peor que mostrarlos sin horario.
   */
  sinHorario: TurnoEnCalendario[];
  /** Para los botones de anterior/siguiente y el rótulo del período. */
  ancla: string;
  anterior: string;
  siguiente: string;
  fallos: FalloAgente[];
  descartes: number;
  /** Con más de una sede en alcance conviene rotular a cuál pertenece cada turno. */
  variasSedes: boolean;
  /**
   * Las canchas que se pueden elegir en el filtro.
   *
   * Salen de los horarios de la sede además de los turnos del período, y no
   * sólo de los turnos como en la vista Reservas: acá se navega semana a
   * semana, y si las opciones dependieran de lo vendido, la cancha elegida
   * desaparecería del filtro al pasar a una semana donde todavía no vendió
   * nada — dejando un filtro activo que no se puede sacar.
   */
  canchasDisponibles: string[];
  /** La cancha por la que se está filtrando, o null. */
  canchaActual: string | null;
};

export async function datosDeCalendario(
  vista: VistaCalendario,
  ancla: string,
  agenteIdPedido?: string,
  canchaPedida?: string,
): Promise<DatosCalendario> {
  const alcance = await resolverAlcance(agenteIdPedido);
  const agentes = agentesEnAlcance(alcance);

  const desde = vista === "semana" ? inicioDeSemana(ancla) : ancla;
  const dias =
    vista === "semana"
      ? Array.from({ length: 7 }, (_, i) => sumarDias(desde, i))
      : [desde];
  const hasta = dias[dias.length - 1];

  const paso = vista === "semana" ? 7 : 1;
  const navegacion = {
    ancla: desde,
    anterior: sumarDias(desde, -paso),
    siguiente: sumarDias(desde, paso),
  };

  if (agentes.length === 0) {
    return {
      vista,
      dias,
      franjas: [],
      celdas: new Map(),
      sinHorario: [],
      ...navegacion,
      fallos: [],
      descartes: 0,
      variasSedes: false,
      canchasDisponibles: [],
      canchaActual: null,
    };
  }

  // Los slots entran para que la grilla tenga las franjas del complejo aunque
  // no haya ninguna reserva: un día vacío tiene que verse como filas libres, no
  // como una tabla en blanco que no dice si está libre o si falló la lectura.
  const crudos = await traerCrudos(agentes, { desde, hasta }, TTL_TURNOS, true);

  const franjas = new Set<number>();
  const canchas = new Set<string>();
  for (const slot of crudos.slots) {
    if (slot.activo && slot.horaInicioMin !== null) franjas.add(slot.horaInicioMin);
    // Las canchas del filtro salen de los horarios de la sede, que no cambian
    // de una semana a la otra.
    for (const cancha of slot.canchas) canchas.add(cancha);
  }
  for (const reserva of crudos.reservas) {
    if (reserva.cancha) canchas.add(reserva.cancha);
  }

  const canchasDisponibles = [...canchas].sort();
  // Sólo se acepta una cancha que exista: si llega cualquier cosa por la URL se
  // muestra todo, en vez de una grilla vacía sin explicación.
  const canchaActual =
    canchaPedida && canchasDisponibles.includes(canchaPedida) ? canchaPedida : null;

  const celdas = new Map<string, TurnoEnCalendario[]>();
  const sinHorario: TurnoEnCalendario[] = [];

  const nombrePorAgente = new Map(agentes.map((a) => [a.id, a.nombre]));

  for (const reserva of crudos.reservas) {
    // Un turno cancelado no ocupa la cancha: mostrarlo en la grilla operativa
    // haría creer que esa franja está tomada cuando en realidad está libre.
    if (reserva.estado === "CANCELADA") continue;
    if (!dias.includes(reserva.fecha)) continue;
    if (canchaActual && reserva.cancha !== canchaActual) continue;

    const turno: TurnoEnCalendario = {
      recordId: reserva.recordId,
      nombre: reserva.nombre,
      telefono: reserva.telefono,
      cancha: reserva.cancha,
      estado: reserva.estado,
      agenteNombre: nombrePorAgente.get(reserva.agenteId) ?? "",
    };

    if (reserva.horaInicioMin === null) {
      sinHorario.push(turno);
      continue;
    }

    franjas.add(reserva.horaInicioMin);
    const clave = `${reserva.fecha}|${reserva.horaInicioMin}`;
    const lista = celdas.get(clave) ?? [];
    lista.push(turno);
    celdas.set(clave, lista);
  }

  // Dentro de una celda, ordenados por cancha: es como se lee la recepción
  // ("Cancha 1: Pérez, Cancha 2: García").
  for (const lista of celdas.values()) {
    lista.sort((a, b) => (a.cancha ?? "").localeCompare(b.cancha ?? "", "es"));
  }

  return {
    vista,
    dias,
    franjas: [...franjas].sort((a, b) => a - b),
    celdas,
    sinHorario,
    ...navegacion,
    fallos: crudos.fallos,
    descartes: crudos.descartes,
    variasSedes: agentes.length > 1,
    canchasDisponibles,
    canchaActual,
  };
}
