import "server-only";

import { construirContexto, type ContextoAgente } from "@/lib/integracion/contexto";
import { prisma } from "@/lib/prisma";

/**
 * Chat de prueba (sandbox) del SDD v2 §3.
 *
 * Sirve para que el dueño pruebe su agente —uno nuevo en EN_CONFIGURACION, o un
 * cambio de precio sobre uno ya activo— **antes** de que eso le llegue a un
 * cliente real por WhatsApp.
 *
 * Cuatro reglas que definen qué es esto, y que están puestas a propósito:
 *
 * 1. **Es efímero.** No crea `Conversacion` ni `Mensaje`. El historial vive en
 *    el navegador y se pierde al recargar. Si se persistiera, ensuciaría la
 *    bandeja de Conversaciones con charlas que nunca existieron.
 * 2. **No cuenta contra el plan.** No toca `UsoMensual`: nadie le habló al
 *    negocio, así que consumir el pozo del cliente sería cobrarle por probar.
 * 3. **No toca Airtable ni Evolution.** No hay tools acá: el modelo puede decir
 *    que "reservó", pero no se guarda en ningún lado. De ahí el disclaimer
 *    obligatorio en la UI.
 * 4. **Tiene tope diario por agente.** La API key de OpenAI es global de Vibo
 *    (el costo lo absorbe Vibo, no el cliente), así que sin tope un cliente
 *    probando en bucle es gasto directo nuestro.
 */

/** Tope de mensajes por agente y por día. */
export const TOPE_DIARIO = 30;

/** Modelo barato: esto es para validar el prompt, no para producción. */
const MODELO = "gpt-4o-mini";

/** Cuántos mensajes del historial se mandan, para acotar el costo por llamada. */
const MAX_HISTORIAL = 12;

export type MensajePrueba = {
  rol: "user" | "assistant";
  contenido: string;
};

export type ResultadoPrueba =
  | { ok: true; respuesta: string; restantes: number }
  | { ok: false; error: string; restantes?: number };

/** El día de hoy a medianoche UTC, que es la clave del contador diario. */
function diaDeHoy(): Date {
  const ahora = new Date();
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
}

/**
 * Consume una unidad del tope diario, de forma atómica.
 *
 * El upsert + increment en una sola operación es lo que evita que dos pestañas
 * abiertas se pasen del tope: no hay un "leer, decidir, escribir" en el medio.
 * Devuelve null si ya no queda cupo.
 */
async function consumirCupoDiario(agenteId: string): Promise<number | null> {
  const fecha = diaDeHoy();

  const fila = await prisma.pruebaAgenteUso.upsert({
    where: { agenteId_fecha: { agenteId, fecha } },
    create: { agenteId, fecha, mensajesCount: 1 },
    update: { mensajesCount: { increment: 1 } },
    select: { mensajesCount: true },
  });

  if (fila.mensajesCount > TOPE_DIARIO) {
    // Se pasó: se devuelve el incremento para que el contador no siga subiendo
    // con intentos rechazados y el tope se libere bien mañana.
    await prisma.pruebaAgenteUso.update({
      where: { agenteId_fecha: { agenteId, fecha } },
      data: { mensajesCount: { decrement: 1 } },
    });
    return null;
  }

  return TOPE_DIARIO - fila.mensajesCount;
}

/**
 * Arma el system prompt con lo mismo que recibe n8n (SDD v2 §3).
 *
 * Es el punto de todo el sandbox: si el prompt de prueba se armara distinto del
 * real, lo que el dueño valida acá no diría nada sobre lo que va a responder el
 * agente de verdad. Por eso reusa `construirContexto` en vez de rehacerlo.
 */
function armarSystemPrompt(ctx: ContextoAgente): string {
  const partes = [ctx.promptBase];

  if (ctx.tono) partes.push(`## TONO\n- ${ctx.tono}`);

  const neg = ctx.negocio;
  const datos = [
    neg.nombre && `- Nombre: ${neg.nombre}`,
    neg.deporte && `- Deporte: ${neg.deporte}`,
    neg.direccion && `- Dirección: ${neg.direccion}`,
    neg.telefono && `- Teléfono: ${neg.telefono}`,
  ].filter(Boolean);
  if (datos.length) partes.push(`## NEGOCIO\n${datos.join("\n")}`);

  if (ctx.canchas.length) {
    const filas = ctx.canchas.map((c) => {
      let fila = `- Cancha ${c.numero}: $${c.precio.toLocaleString("es-AR")} (precio base) · turnos de ${c.duracionTurnoMin} min · de ${c.horarioApertura} a ${c.horarioCierre}`;
      if (c.descripcion) fila += `\n  Descripción: ${c.descripcion}`;
      if (c.tramos.length) {
        const bandas = c.tramos
          .map((t) => `${t.desde}–${t.hasta} $${t.precio.toLocaleString("es-AR")}`)
          .join("; ");
        fila += `\n  Precios por horario: ${bandas} (fuera de esas franjas, el precio base)`;
      }
      return fila;
    });
    partes.push(`## CANCHAS Y PRECIOS\n${filas.join("\n")}`);
  }

  // Mismo criterio que el bloque de n8n: sólo se afirma lo que está cargado. Un
  // campo vacío no se convierte en una regla.
  const reglas: string[] = [];
  if (ctx.reglas.anticipacionMinimaMin !== null) {
    const horas = ctx.reglas.anticipacionMinimaMin / 60;
    reglas.push(
      `- Anticipación mínima para reservar: ${
        Number.isInteger(horas) ? `${horas} hora(s)` : `${ctx.reglas.anticipacionMinimaMin} minutos`
      }`,
    );
  }
  if (ctx.reglas.politicaCancelacion) {
    reglas.push(`- Cancelación: ${ctx.reglas.politicaCancelacion}`);
  }
  if (ctx.reglas.senia.requiere && ctx.reglas.senia.detalle) {
    reglas.push(`- Seña: ${ctx.reglas.senia.detalle}`);
  }
  if (reglas.length) partes.push(`## REGLAS DE RESERVA\n${reglas.join("\n")}`);

  if (ctx.faq) partes.push(`## PREGUNTAS FRECUENTES\n${ctx.faq}`);

  // El agente real tiene tools para consultar disponibilidad y reservar; acá no.
  // Sin esta aclaración el modelo inventaría horarios libres y confirmaría
  // reservas que no existen, y el dueño creería que su agente ya reserva bien.
  partes.push(
    [
      "## MODO PRUEBA",
      "- Esto es una simulación para que el dueño del complejo valide tu configuración.",
      "- NO tenés acceso a la agenda real: no sabés qué turnos están libres ni ocupados.",
      "- Si te piden disponibilidad o reservar, respondé con el tono y las reglas de arriba,",
      "  pero aclarando que en la prueba no podés consultar la agenda ni confirmar un turno.",
      "- Nunca inventes precios, horarios ni políticas que no estén escritos arriba.",
    ].join("\n"),
  );

  return partes.join("\n\n");
}

/**
 * Responde un mensaje del chat de prueba.
 *
 * `agenteId` tiene que venir ya autorizado por quien llama (la Server Action
 * verifica que sea del cliente de la sesión). Acá no se vuelve a chequear, pero
 * tampoco se acepta un agenteId de ningún input directo.
 */
export async function responderPrueba(
  agenteId: string,
  historial: MensajePrueba[],
): Promise<ResultadoPrueba> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Config faltante, no culpa del usuario: se dice sin pedirle que haga nada.
    console.error("[prueba] falta OPENAI_API_KEY");
    return { ok: false, error: "El chat de prueba no está disponible en este momento." };
  }

  const contexto = await construirContexto({ id: agenteId, estado: "ACTIVO" }, null);
  if (!contexto) return { ok: false, error: "Agente inexistente" };

  const restantes = await consumirCupoDiario(agenteId);
  if (restantes === null) {
    return {
      ok: false,
      error: `Llegaste al tope de ${TOPE_DIARIO} mensajes de prueba por día para esta sede. Se renueva mañana.`,
    };
  }

  const mensajes = [
    { role: "system" as const, content: armarSystemPrompt(contexto) },
    ...historial.slice(-MAX_HISTORIAL).map((m) => ({ role: m.rol, content: m.contenido })),
  ];

  try {
    const respuesta = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODELO, messages: mensajes, max_tokens: 500 }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!respuesta.ok) {
      // El detalle de OpenAI al log; al dueño, algo que pueda entender.
      const detalle = (await respuesta.text().catch(() => "")).slice(0, 300);
      console.error(`[prueba] OpenAI ${respuesta.status}: ${detalle}`);
      return { ok: false, error: "No se pudo generar la respuesta. Probá de nuevo.", restantes };
    }

    const datos = (await respuesta.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const texto = datos.choices?.[0]?.message?.content?.trim();

    if (!texto) {
      return { ok: false, error: "La respuesta llegó vacía. Probá de nuevo.", restantes };
    }

    return { ok: true, respuesta: texto, restantes };
  } catch (error) {
    console.error("[prueba] fallo llamando a OpenAI:", error);
    return { ok: false, error: "No se pudo generar la respuesta. Probá de nuevo.", restantes };
  }
}

/** Cuántos mensajes de prueba le quedan hoy a una sede, para mostrarlo en la UI. */
export async function cupoRestante(agenteId: string): Promise<number> {
  const fila = await prisma.pruebaAgenteUso.findUnique({
    where: { agenteId_fecha: { agenteId, fecha: diaDeHoy() } },
    select: { mensajesCount: true },
  });
  return Math.max(0, TOPE_DIARIO - (fila?.mensajesCount ?? 0));
}
