/**
 * Las fórmulas del punto 6.1 de requerimientos, y nada más.
 *
 * Son funciones puras a propósito: no tocan la red ni la base. De acá salen los
 * números que el dueño del complejo va a mirar para decidir precios y promos,
 * así que tienen que poder probarse con datos armados a mano, sin Airtable.
 *
 * Dos cosas que estas funciones nunca hacen:
 *   - inventar un dato que falta (una reserva sin cancha no se cuenta como si
 *     fuera de la Cancha 1)
 *   - esconder lo que no pudieron calcular (todo lo que queda afuera se
 *     devuelve contado, para poder decirlo en pantalla)
 */

import { numeroDeCancha } from "@/lib/airtable/campos";
import { diaDeLaSemana, type FechaCalendario, type Reserva, type Slot } from "@/lib/airtable/tipos";

/** La config de canchas de Vibo: el precio no vive en Airtable (punto 8.1). */
export type CanchaConfig = {
  numero: number;
  precio: number;
};

export type Periodo = {
  desde: FechaCalendario;
  hasta: FechaCalendario;
};

/**
 * Turnos reservados (6.1): Confirmada + Pendiente de seña. Cancelada no cuenta.
 *
 * Ojo con la diferencia contra los otros KPIs: este incluye las pendientes de
 * seña porque son turnos que ocupan la cancha, pero ingresos y ocupación usan
 * sólo las confirmadas. No es una inconsistencia mía, es lo que dice el 6.1.
 */
export function turnosReservados(reservas: Reserva[]): number {
  return reservas.filter(
    (r) => r.estado === "CONFIRMADA" || r.estado === "PENDIENTE_SENIA",
  ).length;
}

export function turnosConfirmados(reservas: Reserva[]): Reserva[] {
  return reservas.filter((r) => r.estado === "CONFIRMADA");
}

export type TasaConversion =
  | { hayDatos: false }
  | {
      hayDatos: true;
      turnos: number;
      conversaciones: number;
      tasa: number;
      /**
       * true si hay más turnos del agente que conversaciones registradas
       * (tasa > 1). No es un error: significa varios turnos por chat, o que el
       * log de conversaciones quedó incompleto. La UI lo muestra distinto en vez
       * de un porcentaje absurdo.
       */
      excede: boolean;
    };

/**
 * Tasa de conversión: turnos confirmados por el agente ÷ conversaciones del período.
 *
 * El §6 la describe como "% de conversaciones que terminan en turno confirmado",
 * así que el numerador cuenta solo los turnos **creados por el bot** (campo
 * "Creada por bot" del §8.1): una reserva cargada a mano por el dueño no salió de
 * una conversación, así que no es una conversión. Sin este filtro, las cargas
 * manuales inflan la tasa.
 *
 * Las conversaciones salen de la plataforma, no de Airtable. Si todavía no hay
 * ninguna registrada (n8n recién las loguea desde el sprint 4), devuelve
 * `hayDatos: false` en vez de 0% — un 0% diría "nadie compró", y lo que pasa es
 * "todavía no medimos".
 */
export function tasaConversion(
  reservas: Reserva[],
  conversaciones: number,
): TasaConversion {
  if (conversaciones <= 0) return { hayDatos: false };
  const turnos = reservas.filter(
    (r) => r.estado === "CONFIRMADA" && r.creadaPorBot,
  ).length;
  const tasa = turnos / conversaciones;
  return { hayDatos: true, turnos, conversaciones, tasa, excede: tasa > 1 };
}

export type Ingresos = {
  total: number;
  /** Desglose por cancha, para que el número no sea una caja negra. */
  porCancha: Array<{ numero: number; turnos: number; precio: number; subtotal: number }>;
  /**
   * Turnos confirmados que no se pudieron valuar porque su cancha no está
   * configurada en Vibo (o el texto de Airtable no sigue "Cancha N").
   * Se muestran: si no, el total queda corto y nadie se entera de por qué.
   */
  sinPrecio: number;
};

/**
 * Ingresos estimados (6.1): Σ confirmados por cancha × precio configurado en Vibo.
 */
export function ingresosEstimados(
  reservas: Reserva[],
  canchas: CanchaConfig[],
): Ingresos {
  const precioPorNumero = new Map(canchas.map((c) => [c.numero, c.precio]));
  const conteo = new Map<number, number>();
  let sinPrecio = 0;

  for (const reserva of turnosConfirmados(reservas)) {
    const numero = reserva.cancha ? numeroDeCancha(reserva.cancha) : null;
    if (numero === null || !precioPorNumero.has(numero)) {
      sinPrecio++;
      continue;
    }
    conteo.set(numero, (conteo.get(numero) ?? 0) + 1);
  }

  const porCancha = [...conteo.entries()]
    .map(([numero, turnos]) => {
      const precio = precioPorNumero.get(numero) ?? 0;
      return { numero, turnos, precio, subtotal: turnos * precio };
    })
    .sort((a, b) => a.numero - b.numero);

  return {
    total: porCancha.reduce((suma, c) => suma + c.subtotal, 0),
    porCancha,
    sinPrecio,
  };
}

/** Cuántas veces cae cada día de la semana dentro del período (0 = Domingo). */
export function ocurrenciasPorDia(periodo: Periodo): number[] {
  const cuenta = [0, 0, 0, 0, 0, 0, 0];
  for (const fecha of fechasDelPeriodo(periodo)) {
    const dia = diaDeLaSemana(fecha);
    if (dia !== null) cuenta[dia]++;
  }
  return cuenta;
}

/**
 * Itera las fechas del período, como strings de calendario.
 *
 * Avanza con Date.UTC y no con la hora local: en UTC no hay horario de verano
 * ni saltos, así que sumar un día siempre suma exactamente un día.
 */
export function* fechasDelPeriodo({ desde, hasta }: Periodo): Generator<FechaCalendario> {
  const fin = Date.parse(`${hasta}T00:00:00Z`);
  let actual = Date.parse(`${desde}T00:00:00Z`);
  if (Number.isNaN(actual) || Number.isNaN(fin)) return;

  // Tope defensivo: 2 años. Evita colgar el render si llega un rango absurdo.
  for (let i = 0; actual <= fin && i < 750; i++) {
    yield new Date(actual).toISOString().slice(0, 10);
    actual += 86_400_000;
  }
}

export type Celda = {
  diaSemana: number;
  horaInicioMin: number;
  ocupados: number;
  capacidad: number;
  /** ocupados ÷ capacidad, o null si no hay slots (no es 0%, es "no aplica"). */
  ocupacion: number | null;
};

export type Ocupacion = {
  celdas: Celda[];
  /** Las franjas horarias que tienen algún slot, ordenadas. Son las filas del heatmap. */
  franjas: number[];
  /** Promedio ponderado del período: total ocupados ÷ total capacidad. */
  global: number | null;
};

/**
 * Ocupación y horarios pico (6.1).
 *
 * Numerador: turnos confirmados en esa franja y ese día de la semana.
 * Denominador: slots activos para esa franja y ese día, contando una vez por
 * cancha cubierta, multiplicado por cuántas veces cayó ese día en el período.
 *
 * El detalle que importa: un slot que aplica a 3 canchas son 3 lugares
 * vendibles, no uno. Y si dos slots duplicados apuntan a la misma cancha en la
 * misma franja, la cancha se cuenta una sola vez — por eso el Set. Sin eso, la
 * capacidad se infla y la ocupación da falsamente baja, que es el error que más
 * caro sale acá: haría que el cliente malvenda un horario que en realidad está
 * lleno.
 */
export function calcularOcupacion(
  reservas: Reserva[],
  slots: Slot[],
  periodo: Periodo,
): Ocupacion {
  const activos = slots.filter((s) => s.activo && s.horaInicioMin !== null);
  const ocurrencias = ocurrenciasPorDia(periodo);

  // clave "dia|hora" → canchas distintas vendibles en esa franja
  const capacidadPorCelda = new Map<string, Set<string>>();
  const franjas = new Set<number>();

  for (const slot of activos) {
    const hora = slot.horaInicioMin as number;
    franjas.add(hora);
    for (const dia of slot.diasActivos) {
      const clave = `${dia}|${hora}`;
      const canchas = capacidadPorCelda.get(clave) ?? new Set<string>();
      for (const cancha of slot.canchas) canchas.add(cancha);
      capacidadPorCelda.set(clave, canchas);
    }
  }

  const ocupadosPorCelda = new Map<string, number>();
  for (const reserva of turnosConfirmados(reservas)) {
    if (reserva.horaInicioMin === null) continue;
    const dia = diaDeLaSemana(reserva.fecha);
    if (dia === null) continue;
    const clave = `${dia}|${reserva.horaInicioMin}`;
    ocupadosPorCelda.set(clave, (ocupadosPorCelda.get(clave) ?? 0) + 1);
  }

  const celdas: Celda[] = [];
  let totalOcupados = 0;
  let totalCapacidad = 0;

  for (const hora of franjas) {
    for (let dia = 0; dia < 7; dia++) {
      const clave = `${dia}|${hora}`;
      const canchas = capacidadPorCelda.get(clave);
      const capacidad = (canchas?.size ?? 0) * ocurrencias[dia];
      const ocupados = ocupadosPorCelda.get(clave) ?? 0;

      celdas.push({
        diaSemana: dia,
        horaInicioMin: hora,
        ocupados,
        capacidad,
        ocupacion: capacidad > 0 ? ocupados / capacidad : null,
      });

      totalOcupados += ocupados;
      totalCapacidad += capacidad;
    }
  }

  return {
    celdas,
    franjas: [...franjas].sort((a, b) => a - b),
    global: totalCapacidad > 0 ? totalOcupados / totalCapacidad : null,
  };
}

/** Variación relativa contra el período anterior. null si antes no hubo nada con qué comparar. */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return (actual - anterior) / anterior;
}
