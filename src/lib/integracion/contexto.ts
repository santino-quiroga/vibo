import "server-only";

import { prisma } from "@/lib/prisma";

import { evaluarPuedeResponder, type PuedeResponder } from "./mensajes";

/**
 * El contexto que n8n necesita para responder (SDD v2 §1).
 *
 * Reemplaza el enfoque de v1, donde n8n preguntaba sólo "¿puedo responder?" y
 * tenía el prompt, los precios y las reglas **pegados adentro del workflow**.
 * Ese era el hallazgo que motivó esta sección: el dueño editaba un precio en
 * Vibo y el bot seguía cotizando el viejo, porque Vibo no era la fuente de
 * verdad de nada de eso — sólo del estado.
 *
 * Ahora n8n pide esto antes de cada respuesta y arma el system prompt con lo
 * que venga acá. Un cambio hecho en la sección Agentes tiene efecto en la
 * próxima respuesta del bot, sin tocar el workflow.
 *
 * ── Desvíos respecto del contrato tal como está escrito en el doc v2 §1 ──
 *
 * 1. `reglas.senia` es `{ requiere, detalle }` y no `{ requiere, monto }`.
 *    El doc asumía un monto fijo, pero `Agente.senia` es texto libre y en la
 *    práctica la seña se expresa como porcentaje ("50% para confirmar"), que no
 *    entra en un número. Decisión tomada con el usuario: no estructurarla
 *    todavía y mandar el texto tal cual. `requiere` significa exactamente "el
 *    dueño cargó una política de seña", NO "hay que cobrar tanto" — quien arma
 *    el prompt tiene que leer `detalle`, no inventar un monto.
 *
 * 2. `anticipacionMinimaMin` puede ser `null`. El doc lo tipa como `number`,
 *    pero el campo es opcional y mandar `0` cuando nadie lo configuró sería
 *    afirmar "se puede reservar para dentro de un minuto", que es una regla de
 *    negocio que nadie tomó.
 *
 * 3. Se agregan `tono`, `faq` y `negocio`, que el doc no lista. Son campos que
 *    el cliente YA edita en la sección Agentes (requerimientos §7) y que hoy no
 *    tienen ningún efecto sobre el bot — exactamente el problema que esta
 *    sección viene a resolver. Dejarlos afuera obligaría a una segunda ronda
 *    para lo mismo. Son aditivos: un consumidor que sólo lea los campos del
 *    contrato original sigue funcionando igual.
 */

export type ContextoAgente = {
  puedeResponder: boolean;
  /** Sólo cuando `puedeResponder` es false. */
  motivo: string | null;
  promptBase: string;
  /** Extensión: cómo habla el asistente (requerimientos §7). */
  tono: string | null;
  /** Extensión: datos del negocio, para responder "¿dónde están?". */
  negocio: {
    nombre: string;
    deporte: string;
    direccion: string | null;
    telefono: string | null;
  };
  reglas: {
    /** Minutos. `null` si el dueño no configuró anticipación mínima. */
    anticipacionMinimaMin: number | null;
    politicaCancelacion: string | null;
    senia: {
      /** Hay una política de seña cargada. El monto/porcentaje va en `detalle`. */
      requiere: boolean;
      detalle: string | null;
    };
  };
  /** Extensión: base de conocimiento del negocio (requerimientos §7). */
  faq: string | null;
  canchas: Array<{
    numero: number;
    precio: number;
    duracionTurnoMin: number;
    horarioApertura: string;
    horarioCierre: string;
  }>;
};

/** Texto que en la práctica está vacío (el textarea guarda espacios). */
function texto(valor: string | null): string | null {
  const limpio = valor?.trim();
  return limpio ? limpio : null;
}

/**
 * Arma el contexto completo de un agente ya autenticado.
 *
 * `telefono` es opcional y sirve para lo mismo que en v1: saber si ESE chat
 * puntual está en manual porque el dueño tomó el control. Sin él sólo se evalúa
 * el estado del agente entero — y perder eso haría que el bot siguiera
 * respondiendo en un chat que el dueño se llevó a mano.
 */
export async function construirContexto(
  agente: { id: string; estado: string },
  telefono: string | null,
): Promise<ContextoAgente | null> {
  const [fila, canchas, permiso] = await Promise.all([
    prisma.agente.findUnique({
      where: { id: agente.id },
      select: {
        nombre: true,
        deporte: true,
        direccion: true,
        telefonoContacto: true,
        tono: true,
        promptBase: true,
        anticipacionMinHoras: true,
        politicaCancelacion: true,
        senia: true,
        faq: true,
      },
    }),
    prisma.cancha.findMany({
      where: { agenteId: agente.id },
      select: {
        numero: true,
        precio: true,
        duracionTurnoMin: true,
        horarioApertura: true,
        horarioCierre: true,
      },
      orderBy: { numero: "asc" },
    }),
    evaluarPuedeResponder(agente, telefono),
  ]);

  if (!fila) return null;

  const senia = texto(fila.senia);

  return {
    ...aplanarPermiso(permiso),
    promptBase: fila.promptBase,
    tono: texto(fila.tono),
    negocio: {
      nombre: fila.nombre,
      deporte: fila.deporte,
      direccion: texto(fila.direccion),
      telefono: texto(fila.telefonoContacto),
    },
    reglas: {
      // El campo se guarda en horas porque es como lo piensa el dueño ("dos
      // horas antes"); el contrato lo pide en minutos.
      //
      // Un 0 se trata como "sin regla", igual que null: "hay que reservar con al
      // menos 0 horas de anticipación" no es una regla, es ruido — y el bot lo
      // diría igual, como si fuera una condición del negocio.
      anticipacionMinimaMin:
        fila.anticipacionMinHoras && fila.anticipacionMinHoras > 0
          ? fila.anticipacionMinHoras * 60
          : null,
      politicaCancelacion: texto(fila.politicaCancelacion),
      senia: { requiere: senia !== null, detalle: senia },
    },
    faq: texto(fila.faq),
    // Decimal → number recién acá: un precio de cancha entra cómodo en un
    // double, lo que no hay que hacer es guardarlo así.
    canchas: canchas.map((c) => ({
      numero: c.numero,
      precio: Number(c.precio),
      duracionTurnoMin: c.duracionTurnoMin,
      horarioApertura: c.horarioApertura,
      horarioCierre: c.horarioCierre,
    })),
  };
}

/** `motivo` siempre presente (null si puede responder), como pide el contrato. */
function aplanarPermiso(permiso: PuedeResponder): {
  puedeResponder: boolean;
  motivo: string | null;
} {
  return {
    puedeResponder: permiso.puedeResponder,
    motivo: permiso.motivo ?? null,
  };
}
