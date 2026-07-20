"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { responderPrueba, type MensajePrueba } from "@/lib/agentes/prueba";
import { parsearCanchasDeForm, reemplazarCanchas } from "@/lib/canchas";
import { requerirClienteOwner } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

export type EstadoAgente = { error?: string; ok?: boolean };

/**
 * Verifica que el agente sea del cliente de la sesión (SDD §6.3). Todas las
 * acciones de esta sección pasan por acá: ninguna toca un agente sin confirmar
 * que es del cliente logueado.
 */
async function agenteDelCliente(agenteId: string) {
  const { clienteId } = await requerirClienteOwner();
  return prisma.agente.findFirst({
    where: { id: agenteId, clienteId },
    select: { id: true, estado: true },
  });
}

const configSchema = z.object({
  agenteId: z.string().min(1),
  nombre: z.string().trim().min(2, "El nombre es obligatorio"),
  deporte: z.string().trim().min(2, "El deporte es obligatorio"),
  promptBase: z.string().trim().min(1, "El prompt base es obligatorio"),
  direccion: z.string().trim().optional(),
  telefonoContacto: z.string().trim().optional(),
  tono: z.string().trim().optional(),
  anticipacionMinHoras: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^\d{1,3}$/.test(v), "La anticipación va en horas (número entero)"),
  politicaCancelacion: z.string().trim().optional(),
  senia: z.string().trim().optional(),
  faq: z.string().trim().optional(),
});

/**
 * Edita la configuración de negocio del agente (requerimientos §7).
 *
 * OJO: esto se guarda en Vibo pero NO se sincroniza con n8n — el bot sigue
 * usando su prompt de n8n. Sincronizarlo es parte de "conectar el agente real".
 */
export async function editarConfigAgenteAction(
  _previo: EstadoAgente,
  formData: FormData,
): Promise<EstadoAgente> {
  const parsed = configSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>,
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const d = parsed.data;
  const agente = await agenteDelCliente(d.agenteId);
  if (!agente) return { error: "Agente inexistente" };

  await prisma.agente.update({
    where: { id: d.agenteId },
    data: {
      nombre: d.nombre,
      deporte: d.deporte,
      promptBase: d.promptBase,
      direccion: d.direccion || null,
      telefonoContacto: d.telefonoContacto || null,
      tono: d.tono || null,
      // Un 0 se guarda como null: "reservar con 0 horas de anticipación" no es
      // una regla, y si se guardara como número el bot se la diría al cliente
      // como si lo fuera.
      anticipacionMinHoras: Number(d.anticipacionMinHoras) > 0
        ? Number(d.anticipacionMinHoras)
        : null,
      politicaCancelacion: d.politicaCancelacion || null,
      senia: d.senia || null,
      faq: d.faq || null,
    },
  });

  revalidatePath(`/dashboard/agentes/${d.agenteId}`);
  revalidatePath("/dashboard/agentes");
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Chat de prueba (SDD v2 §3).
 * ──────────────────────────────────────────────────────────────────────────── */

export type EstadoPrueba = {
  error?: string;
  respuesta?: string;
  restantes?: number;
};

const mensajePruebaSchema = z.object({
  agenteId: z.string().min(1),
  texto: z.string().trim().min(1, "Escribí un mensaje").max(1000, "Mensaje demasiado largo"),
  /** El historial lo manda el cliente: la charla es efímera y no se persiste. */
  historial: z.string().optional(),
});

const historialSchema = z.array(
  z.object({
    rol: z.enum(["user", "assistant"]),
    contenido: z.string().max(4000),
  }),
);

/**
 * Responde un mensaje del chat de prueba.
 *
 * El historial viaja desde el navegador porque la conversación **no se
 * persiste** (§3). Eso significa que es input del usuario y no una fuente
 * confiable: se valida con zod y se recorta. Lo peor que puede hacer alguien
 * manipulándolo es alterar su propia simulación, que no toca ningún dato real.
 *
 * Lo que NO se confía nunca es el `agenteId`: se verifica contra el cliente de
 * la sesión, como toda acción de esta sección (§6.3). Sin eso, alguien podría
 * leer el `promptBase` de otro cliente a través de la respuesta (v2 §9).
 */
export async function responderPruebaAction(
  _previo: EstadoPrueba,
  formData: FormData,
): Promise<EstadoPrueba> {
  const parsed = mensajePruebaSchema.safeParse({
    agenteId: formData.get("agenteId"),
    texto: formData.get("texto"),
    historial: formData.get("historial") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const agente = await agenteDelCliente(parsed.data.agenteId);
  if (!agente) return { error: "Agente inexistente" };

  let historial: MensajePrueba[] = [];
  if (parsed.data.historial) {
    try {
      const crudo = historialSchema.safeParse(JSON.parse(parsed.data.historial));
      if (crudo.success) historial = crudo.data;
    } catch {
      // Historial ilegible: se sigue sin él. Perder el contexto de la
      // simulación es mejor que fallar el mensaje.
    }
  }

  const resultado = await responderPrueba(parsed.data.agenteId, [
    ...historial,
    { rol: "user", contenido: parsed.data.texto },
  ]);

  if (!resultado.ok) {
    return { error: resultado.error, restantes: resultado.restantes };
  }
  return { respuesta: resultado.respuesta, restantes: resultado.restantes };
}

/** Guarda las canchas del agente, scoped al cliente. Misma validación que el admin. */
export async function guardarCanchasClienteAction(
  _previo: EstadoAgente,
  formData: FormData,
): Promise<EstadoAgente> {
  const agenteId = String(formData.get("agenteId") ?? "");
  const agente = await agenteDelCliente(agenteId);
  if (!agente) return { error: "Agente inexistente" };

  const parsed = parsearCanchasDeForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  await reemplazarCanchas(agenteId, parsed.canchas);

  revalidatePath(`/dashboard/agentes/${agenteId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Pausa o reactiva el bot desde el panel cliente (requerimientos §7, toggle).
 *
 * Solo alterna entre ACTIVO y PAUSADO_MANUAL. **No toca PAUSADO_LIMITE**: una
 * pausa por límite de plan la levanta el cambio de ciclo o el admin (§4.2), no
 * el cliente — si el pozo está agotado, reactivar acá no tendría efecto real.
 *
 * Para que la pausa manual calle al bot de verdad, n8n tiene que consultar
 * /puede-responder (que ya respeta PAUSADO_MANUAL). Eso es parte del cableado
 * de n8n, externo a Vibo.
 */
export async function alternarPausaAction(
  _previo: EstadoAgente,
  formData: FormData,
): Promise<EstadoAgente> {
  const agenteId = String(formData.get("agenteId") ?? "");
  const agente = await agenteDelCliente(agenteId);
  if (!agente) return { error: "Agente inexistente" };

  if (agente.estado === "PAUSADO_LIMITE") {
    return {
      error:
        "Este agente está pausado por el límite del plan. Se reactiva solo al empezar el próximo ciclo, o contactando a Vibo para subir de plan.",
    };
  }

  if (agente.estado === "PAUSADO_POR_PAGO") {
    return {
      error:
        "Este agente está pausado por falta de pago. Se reactiva al regularizar la suscripción — escribinos si ya pagaste.",
    };
  }

  // El botón ya viene deshabilitado en este estado, pero la acción lo rechaza
  // igual: un cliente que arme el POST a mano no puede darse de alta el bot solo.
  // Activarlo es del admin, después de verificar las credenciales (SDD v2 §2).
  if (agente.estado === "EN_CONFIGURACION") {
    return {
      error:
        "Este agente todavía se está configurando. El equipo de Vibo lo activa cuando termina de conectarlo a WhatsApp.",
    };
  }

  const nuevo = agente.estado === "ACTIVO" ? "PAUSADO_MANUAL" : "ACTIVO";
  await prisma.agente.update({
    where: { id: agenteId },
    data: { estado: nuevo },
  });

  revalidatePath(`/dashboard/agentes/${agenteId}`);
  revalidatePath("/dashboard/agentes");
  return { ok: true };
}
