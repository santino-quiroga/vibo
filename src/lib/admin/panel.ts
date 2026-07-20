import "server-only";

import type { EstadoAgente, EstadoPago } from "@/generated/prisma/enums";
import { cicloDe } from "@/lib/ciclo";
import { prisma } from "@/lib/prisma";

/**
 * Los datos del Inicio del admin (SDD v2 §5) y las señales de riesgo (§7).
 *
 * Hasta acá el admin sólo tenía el listado de clientes: para saber cómo venía el
 * negocio de Vibo había que abrir cliente por cliente. Esto responde de un
 * vistazo las cuatro preguntas del §5: cuánto entra por mes, quién está en
 * riesgo, qué agentes están apagados y por qué, y qué integraciones se rompieron.
 */

export type ResumenPanel = {
  /** Suma de Plan.precio de los clientes AL_DIA. */
  mrr: number;
  /**
   * Lo que se cobraría si todos pagaran. La diferencia con el MRR es plata que
   * ya se está sirviendo y no se está cobrando — el número que más importa
   * mirar, porque es el que se puede recuperar llamando.
   */
  mrrPotencial: number;
  clientesPorEstado: Record<EstadoPago, number>;
  totalClientes: number;
  /** Agentes apagados, separados por motivo: cada uno pide una acción distinta. */
  agentesPausados: Record<
    Extract<EstadoAgente, "PAUSADO_LIMITE" | "PAUSADO_POR_PAGO" | "PAUSADO_MANUAL">,
    number
  >;
  agentesActivos: number;
  agentesEnConfiguracion: number;
};

const ESTADOS_PAGO: EstadoPago[] = ["SIN_SUSCRIPCION", "AL_DIA", "EN_GRACIA", "VENCIDO"];

export async function resumenDelPanel(): Promise<ResumenPanel> {
  const [clientes, agentes] = await Promise.all([
    prisma.cliente.findMany({
      // Un archivado no factura ni cuenta como cliente: contarlo inflaría el
      // MRR potencial con plata que nadie va a pagar nunca.
      where: { archivadoAt: null },
      select: { estadoPago: true, plan: { select: { precio: true } } },
    }),
    prisma.agente.groupBy({ by: ["estado"], _count: true }),
  ]);

  const clientesPorEstado = Object.fromEntries(
    ESTADOS_PAGO.map((e) => [e, 0]),
  ) as Record<EstadoPago, number>;

  let mrr = 0;
  let mrrPotencial = 0;

  for (const cliente of clientes) {
    clientesPorEstado[cliente.estadoPago]++;
    const precio = Number(cliente.plan.precio);
    mrrPotencial += precio;
    if (cliente.estadoPago === "AL_DIA") mrr += precio;
  }

  const porEstadoAgente = new Map(agentes.map((a) => [a.estado, a._count]));
  const contar = (e: EstadoAgente) => porEstadoAgente.get(e) ?? 0;

  return {
    mrr,
    mrrPotencial,
    clientesPorEstado,
    totalClientes: clientes.length,
    agentesPausados: {
      PAUSADO_LIMITE: contar("PAUSADO_LIMITE"),
      PAUSADO_POR_PAGO: contar("PAUSADO_POR_PAGO"),
      PAUSADO_MANUAL: contar("PAUSADO_MANUAL"),
    },
    agentesActivos: contar("ACTIVO"),
    agentesEnConfiguracion: contar("EN_CONFIGURACION"),
  };
}

export type AgenteConError = {
  id: string;
  nombre: string;
  clienteId: string;
  clienteNombre: string;
  cuando: Date;
  mensaje: string | null;
};

/**
 * Agentes con errores recientes de integración (SDD v2 §5).
 *
 * Se acota a las últimas 48hs: la pregunta es "¿qué está roto ahora?". Un error
 * de la semana pasada que no se repitió ya se resolvió solo, y dejarlo en la
 * lista convierte el tablero en ruido.
 */
export async function agentesConErrores(horas = 48): Promise<AgenteConError[]> {
  const desde = new Date(Date.now() - horas * 60 * 60 * 1000);

  const filas = await prisma.agente.findMany({
    where: {
      ultimoErrorIntegracionAt: { gte: desde },
      // Un error en un cliente archivado ya no hay que ir a arreglarlo.
      cliente: { archivadoAt: null },
    },
    select: {
      id: true,
      nombre: true,
      clienteId: true,
      ultimoErrorIntegracionAt: true,
      ultimoErrorIntegracionMsg: true,
      cliente: { select: { nombre: true } },
    },
    orderBy: { ultimoErrorIntegracionAt: "desc" },
    take: 20,
  });

  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    clienteId: f.clienteId,
    clienteNombre: f.cliente.nombre,
    cuando: f.ultimoErrorIntegracionAt!,
    mensaje: f.ultimoErrorIntegracionMsg,
  }));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Señales de riesgo (SDD v2 §7).
 * ──────────────────────────────────────────────────────────────────────────── */

/** Debajo de esto, el cliente casi no está usando lo que paga: riesgo de churn. */
const UMBRAL_USO_BAJO = 0.1;
/** Por encima, se le está quedando chico el plan: oportunidad de upsell. */
const UMBRAL_USO_ALTO = 0.8;
/** Días sin entrar al panel a partir de los cuales conviene mirarlo. */
const DIAS_AUSENTE = 14;

export type SenalRiesgo =
  | { tipo: "uso_bajo"; detalle: string }
  | { tipo: "uso_alto"; detalle: string }
  | { tipo: "ausente"; detalle: string }
  | { tipo: "sin_ingresar"; detalle: string };

export type RiesgoCliente = {
  usadas: number;
  limite: number;
  /** null si el plan no tiene tope (no debería pasar, pero no se divide por cero). */
  porcentaje: number | null;
  ultimoAcceso: Date | null;
  senales: SenalRiesgo[];
};

/**
 * Calcula las señales de riesgo de cada cliente, en una sola pasada.
 *
 * Devuelve un Map por clienteId para que el listado no dispare una consulta por
 * fila. Con pocos clientes daría igual, pero es el listado que se abre siempre
 * y no cuesta nada hacerlo bien de entrada.
 */
export async function riesgosPorCliente(): Promise<Map<string, RiesgoCliente>> {
  const ciclo = cicloDe();

  const [clientes, usoPorAgente] = await Promise.all([
    prisma.cliente.findMany({
      where: { archivadoAt: null },
      select: {
        id: true,
        plan: { select: { maxConversacionesMes: true } },
        agentes: { select: { id: true } },
        usuarios: {
          where: { rol: "CLIENTE_OWNER" },
          select: { ultimoAccesoAt: true },
        },
      },
    }),
    prisma.usoMensual.groupBy({
      by: ["agenteId"],
      where: { cicloInicio: ciclo.inicio },
      _sum: { conversacionesCount: true },
    }),
  ]);

  const usoDeAgente = new Map(
    usoPorAgente.map((u) => [u.agenteId, u._sum.conversacionesCount ?? 0]),
  );

  const ahora = Date.now();
  const resultado = new Map<string, RiesgoCliente>();

  for (const cliente of clientes) {
    // El pozo es del cliente: se suma el ciclo actual de todas sus sedes.
    const usadas = cliente.agentes.reduce(
      (total, a) => total + (usoDeAgente.get(a.id) ?? 0),
      0,
    );
    const limite = cliente.plan.maxConversacionesMes;
    const porcentaje = limite > 0 ? usadas / limite : null;

    // Se toma el acceso más reciente entre los owners de la cuenta.
    const ultimoAcceso = cliente.usuarios.reduce<Date | null>((mejor, u) => {
      if (!u.ultimoAccesoAt) return mejor;
      return !mejor || u.ultimoAccesoAt > mejor ? u.ultimoAccesoAt : mejor;
    }, null);

    const senales: SenalRiesgo[] = [];

    if (porcentaje !== null && porcentaje >= UMBRAL_USO_ALTO) {
      senales.push({
        tipo: "uso_alto",
        detalle: `Usó ${Math.round(porcentaje * 100)}% del plan — se le queda chico`,
      });
    } else if (porcentaje !== null && porcentaje <= UMBRAL_USO_BAJO) {
      senales.push({
        tipo: "uso_bajo",
        detalle: `Sólo ${usadas} de ${limite} conversaciones — casi no lo usa`,
      });
    }

    if (!ultimoAcceso) {
      senales.push({ tipo: "sin_ingresar", detalle: "Nunca entró al panel" });
    } else {
      const dias = Math.floor((ahora - ultimoAcceso.getTime()) / 86_400_000);
      if (dias >= DIAS_AUSENTE) {
        senales.push({ tipo: "ausente", detalle: `Hace ${dias} días que no entra` });
      }
    }

    resultado.set(cliente.id, { usadas, limite, porcentaje, ultimoAcceso, senales });
  }

  return resultado;
}
