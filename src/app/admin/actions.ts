"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { leerCupoAgentes, planAdmite } from "@/lib/admin/limite-agentes";
import { parsearCanchasDeForm, reemplazarCanchas } from "@/lib/canchas";
import { cifrar, generarTokenIntegracion } from "@/lib/crypto";
import { requerirViboAdmin } from "@/lib/dal";
import { hashPassword } from "@/lib/password";
import { generarPasswordInicial } from "@/lib/password-generado";
import { reactivarClientePorLimite } from "@/lib/planes/uso";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";

export type EstadoAdmin = {
  error?: string;
  ok?: boolean;
  // Secretos que se muestran UNA sola vez, al crearlos: después ya no hay forma
  // de recuperarlos (están cifrados o hasheados). Nunca se persisten en claro.
  mostrarUnaVez?: { titulo: string; items: { label: string; valor: string }[] };
};

// --- Alta de cliente -----------------------------------------------------

const clienteSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre del complejo es obligatorio"),
  planId: z.string().min(1, "Elegí un plan"),
  emailOwner: z.string().trim().toLowerCase().email("Email inválido"),
});

export async function crearClienteAction(
  _previo: EstadoAdmin,
  formData: FormData,
): Promise<EstadoAdmin> {
  // Cada action revalida el rol por su cuenta: una server action es un endpoint
  // POST alcanzable por URL, no la protege el hecho de que la página que la
  // renderiza sea de admin.
  await requerirViboAdmin();

  const parsed = clienteSchema.safeParse({
    nombre: formData.get("nombre"),
    planId: formData.get("planId"),
    emailOwner: formData.get("emailOwner"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { nombre, planId, emailOwner } = parsed.data;

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) return { error: "El plan seleccionado no existe" };

  const yaExiste = await prisma.usuario.findUnique({
    where: { email: emailOwner },
  });
  if (yaExiste) {
    return { error: `Ya hay un usuario con el email ${emailOwner}` };
  }

  const password = generarPasswordInicial();
  const passwordHash = await hashPassword(password);

  let cliente;
  try {
    // Cliente y usuario en una sola escritura anidada: un cliente sin dueño no
    // podría loguearse y habría que limpiarlo a mano.
    cliente = await prisma.cliente.create({
      data: {
        nombre,
        planId,
        usuarios: {
          create: { email: emailOwner, passwordHash, rol: "CLIENTE_OWNER" },
        },
      },
    });
  } catch (error) {
    // El chequeo de arriba y este create no son atómicos: dos altas del mismo
    // email a la vez pasan las dos. La unique de la base es la que decide de
    // verdad; acá solo se traduce a un mensaje entendible en vez de un 500.
    if (esViolacionDeUnique(error)) {
      return { error: `Ya hay un usuario con el email ${emailOwner}` };
    }
    throw error;
  }

  revalidatePath("/admin");

  return {
    mostrarUnaVez: {
      titulo: `Acceso de ${nombre}`,
      items: [
        { label: "Email", valor: emailOwner },
        { label: "Contraseña", valor: password },
        { label: "Cliente", valor: cliente.id },
      ],
    },
  };
}

// --- Cambio de plan ------------------------------------------------------

export async function cambiarPlanAction(
  _previo: EstadoAdmin,
  formData: FormData,
): Promise<EstadoAdmin> {
  await requerirViboAdmin();

  const clienteId = String(formData.get("clienteId") ?? "");
  const planId = String(formData.get("planId") ?? "");

  if (!clienteId || !planId) return { error: "Faltan datos" };

  try {
    // Todo adentro de la transacción: leer el conteo afuera dejaría una ventana
    // en la que un alta de agente concurrente ve el plan viejo, pasa su propio
    // chequeo, y termina dejando al cliente por encima del tope del plan nuevo.
    // Es la ventana inversa a la que cierra crearAgenteAction.
    await prisma.$transaction(async (tx) => {
      const [cliente, plan] = await Promise.all([
        tx.cliente.findUnique({
          where: { id: clienteId },
          select: { _count: { select: { agentes: true } } },
        }),
        tx.plan.findUnique({ where: { id: planId } }),
      ]);

      if (!cliente || !plan) throw new ErrorNegocio("Cliente o plan inexistente");

      // Un downgrade por debajo de los agentes que ya tiene dejaría al cliente
      // pasado de límite sin ninguna acción suya.
      if (!planAdmite(cliente._count.agentes, plan.maxAgentes)) {
        throw new ErrorNegocio(
          `El cliente tiene ${cliente._count.agentes} agentes y el plan ${plan.nombre} permite ${plan.maxAgentes}. ` +
            "Eliminá agentes antes de bajar de plan.",
        );
      }

      await tx.cliente.update({ where: { id: clienteId }, data: { planId } });
    });
  } catch (error) {
    if (error instanceof ErrorNegocio) return { error: error.message };
    throw error;
  }

  revalidatePath(`/admin/clientes/${clienteId}`);
  revalidatePath("/admin");
  return {};
}

// --- Regenerar la contraseña del dueño -----------------------------------

export async function regenerarPasswordOwnerAction(
  _previo: EstadoAdmin,
  formData: FormData,
): Promise<EstadoAdmin> {
  await requerirViboAdmin();

  const usuarioId = String(formData.get("usuarioId") ?? "");
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });

  if (!usuario) return { error: "Usuario inexistente" };
  if (usuario.rol !== "CLIENTE_OWNER") {
    return { error: "Solo se regenera la contraseña de dueños de complejo" };
  }
  // El tipo permite clienteId null. Un CLIENTE_OWNER sin cliente es un dato roto:
  // sin esto, más abajo revalidaríamos "/admin/clientes/null" y la página real
  // se quedaría con la caché vieja.
  if (!usuario.clienteId) {
    return { error: "El usuario no tiene un cliente asociado" };
  }

  const password = generarPasswordInicial();
  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: usuarioId },
      data: { passwordHash: await hashPassword(password) },
    }),
    // Los links de recuperación pendientes se invalidan: si alguien pidió uno y
    // le cambiamos la contraseña, ese link no debería seguir sirviendo.
    prisma.passwordResetToken.deleteMany({ where: { usuarioId, usedAt: null } }),
  ]);

  revalidatePath(`/admin/clientes/${usuario.clienteId}`);

  return {
    mostrarUnaVez: {
      titulo: `Contraseña nueva de ${usuario.email}`,
      items: [
        { label: "Email", valor: usuario.email },
        { label: "Contraseña", valor: password },
      ],
    },
  };
}

// --- Alta de agente ------------------------------------------------------

const agenteSchema = z.object({
  clienteId: z.string().min(1),
  nombre: z.string().trim().min(2, "El nombre del agente es obligatorio"),
  deporte: z.string().trim().min(2, "El deporte es obligatorio"),
  promptBase: z.string().trim().min(1, "El prompt base es obligatorio"),
  airtableBaseId: z
    .string()
    .trim()
    .regex(/^app[A-Za-z0-9]{14}$/, "El Base ID de Airtable tiene el formato appXXXXXXXXXXXXXX"),
  airtableApiKey: z.string().trim().min(1, "La API key de Airtable es obligatoria"),
  evolutionInstanceId: z.string().trim().min(1, "La instancia de Evolution es obligatoria"),
  evolutionApiUrl: z.string().trim().url("La URL de Evolution API tiene que ser una URL válida"),
  evolutionApiKey: z.string().trim().min(1, "La API key de Evolution es obligatoria"),
  n8nWorkflowId: z.string().trim().optional(),
});

export async function crearAgenteAction(
  _previo: EstadoAdmin,
  formData: FormData,
): Promise<EstadoAdmin> {
  await requerirViboAdmin();

  const parsed = agenteSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>,
  );

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const datos = parsed.data;
  const token = generarTokenIntegracion();

  try {
    // El límite de agentes se chequea DENTRO de la transacción y con el conteo
    // recién leído. Hacerlo antes, fuera, dejaría una ventana en la que dos
    // altas simultáneas pasan el chequeo y dejan al cliente por encima del tope.
    await prisma.$transaction(async (tx) => {
      const cupo = await leerCupoAgentes(tx, datos.clienteId);

      if (!cupo) throw new ErrorNegocio("El cliente no existe");

      if (cupo.alcanzado) {
        throw new ErrorNegocio(
          `Límite alcanzado: el plan ${cupo.plan} permite ${cupo.maximo} agente(s). ` +
            "Hacé un upgrade de plan para agregar otro.",
        );
      }

      await tx.agente.create({
        data: {
          clienteId: datos.clienteId,
          nombre: datos.nombre,
          deporte: datos.deporte,
          promptBase: datos.promptBase,
          airtableBaseId: datos.airtableBaseId,
          evolutionInstanceId: datos.evolutionInstanceId,
          n8nWorkflowId: datos.n8nWorkflowId || null,
          // Las cuatro credenciales sensibles van cifradas (SDD 7.1). El cifrado
          // ocurre acá, en el borde: a la base nunca entra un valor en claro.
          airtableApiKeyEnc: cifrar(datos.airtableApiKey),
          evolutionApiUrlEnc: cifrar(datos.evolutionApiUrl),
          evolutionApiKeyEnc: cifrar(datos.evolutionApiKey),
          tokenIntegracionEnc: cifrar(token),
          // El hash es lo que después resuelve una llamada de n8n a este agente.
          tokenIntegracionHash: hashToken(token),
        },
      });
    });
  } catch (error) {
    if (error instanceof ErrorNegocio) return { error: error.message };
    throw error;
  }

  revalidatePath(`/admin/clientes/${datos.clienteId}`);
  revalidatePath("/admin");

  return {
    mostrarUnaVez: {
      titulo: `Token de integración de ${datos.nombre}`,
      items: [
        { label: "Token para n8n", valor: token },
        {
          label: "Cómo se usa",
          valor: "Header: Authorization: Bearer <token>",
        },
      ],
    },
  };
}

// --- Regenerar el token de integración -----------------------------------

export async function regenerarTokenAction(
  _previo: EstadoAdmin,
  formData: FormData,
): Promise<EstadoAdmin> {
  await requerirViboAdmin();

  const agenteId = String(formData.get("agenteId") ?? "");
  const agente = await prisma.agente.findUnique({
    where: { id: agenteId },
    select: { id: true, nombre: true, clienteId: true },
  });

  if (!agente) return { error: "Agente inexistente" };

  const token = generarTokenIntegracion();
  await prisma.agente.update({
    where: { id: agenteId },
    data: {
      tokenIntegracionEnc: cifrar(token),
      // Se regenera el hash junto con el token: el anterior deja de resolver,
      // que es justo lo que se quiere si se sospecha que se filtró.
      tokenIntegracionHash: hashToken(token),
    },
  });

  revalidatePath(`/admin/agentes/${agenteId}`);

  return {
    mostrarUnaVez: {
      titulo: `Token nuevo de ${agente.nombre}`,
      items: [
        { label: "Token para n8n", valor: token },
        {
          label: "Atención",
          valor: "El token anterior dejó de servir. Actualizá el workflow de n8n.",
        },
      ],
    },
  };
}

// --- Editar agente -------------------------------------------------------

const editarAgenteSchema = z.object({
  agenteId: z.string().min(1),
  nombre: z.string().trim().min(2, "El nombre del agente es obligatorio"),
  deporte: z.string().trim().min(2, "El deporte es obligatorio"),
  promptBase: z.string().trim().min(1, "El prompt base es obligatorio"),
  airtableBaseId: z
    .string()
    .trim()
    .regex(/^app[A-Za-z0-9]{14}$/, "El Base ID de Airtable tiene el formato appXXXXXXXXXXXXXX"),
  evolutionInstanceId: z.string().trim().min(1, "La instancia de Evolution es obligatoria"),
  n8nWorkflowId: z.string().trim().optional(),
  // Los secretos son opcionales al editar: vacío = dejar el que ya está.
  airtableApiKey: z.string().trim().optional(),
  evolutionApiUrl: z.string().trim().optional(),
  evolutionApiKey: z.string().trim().optional(),
});

export async function editarAgenteAction(
  _previo: EstadoAdmin,
  formData: FormData,
): Promise<EstadoAdmin> {
  await requerirViboAdmin();

  const parsed = editarAgenteSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>,
  );

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const d = parsed.data;

  if (d.evolutionApiUrl && !z.string().url().safeParse(d.evolutionApiUrl).success) {
    return { error: "La URL de Evolution API tiene que ser una URL válida" };
  }

  const agente = await prisma.agente.findUnique({
    where: { id: d.agenteId },
    select: { clienteId: true },
  });
  if (!agente) return { error: "Agente inexistente" };

  await prisma.agente.update({
    where: { id: d.agenteId },
    data: {
      nombre: d.nombre,
      deporte: d.deporte,
      promptBase: d.promptBase,
      airtableBaseId: d.airtableBaseId,
      evolutionInstanceId: d.evolutionInstanceId,
      n8nWorkflowId: d.n8nWorkflowId || null,
      // Solo se re-cifra lo que el admin efectivamente escribió: un campo vacío
      // significa "no lo cambies", no "borralo".
      ...(d.airtableApiKey ? { airtableApiKeyEnc: cifrar(d.airtableApiKey) } : {}),
      ...(d.evolutionApiUrl ? { evolutionApiUrlEnc: cifrar(d.evolutionApiUrl) } : {}),
      ...(d.evolutionApiKey ? { evolutionApiKeyEnc: cifrar(d.evolutionApiKey) } : {}),
    },
  });

  revalidatePath(`/admin/agentes/${d.agenteId}`);
  revalidatePath(`/admin/clientes/${agente.clienteId}`);
  redirect(`/admin/clientes/${agente.clienteId}`);
}

// --- Canchas de un agente ------------------------------------------------

/**
 * Guarda la configuración de canchas de un agente.
 *
 * El precio de acá es la única fuente de "ingresos estimados": en Airtable no
 * existe (requerimientos 8.1 — hoy está hardcodeado en el prompt del agente).
 * El `numero` es lo que cruza con el single select de Airtable: la reserva dice
 * "Cancha 3" y acá se le pone precio a la 3. La validación vive en
 * `parsearCanchasDeForm` (compartida con la acción del panel cliente).
 */
export async function guardarCanchasAction(
  _previo: EstadoAdmin,
  formData: FormData,
): Promise<EstadoAdmin> {
  await requerirViboAdmin();

  const agenteId = String(formData.get("agenteId") ?? "");
  if (!agenteId) return { error: "Falta el agente" };

  const agente = await prisma.agente.findUnique({
    where: { id: agenteId },
    select: { clienteId: true },
  });
  if (!agente) return { error: "Agente inexistente" };

  const parsed = parsearCanchasDeForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  await reemplazarCanchas(agenteId, parsed.canchas);

  revalidatePath(`/admin/agentes/${agenteId}`);
  revalidatePath(`/admin/clientes/${agente.clienteId}`);
  return { ok: true };
}

// --- Reactivar sedes pausadas por límite de plan -------------------------

/**
 * Reactiva las sedes de un cliente pausadas por haber agotado el pozo del plan
 * (sprint 5, requerimientos 4.2). El caso típico es tras un upgrade a mitad de
 * mes. Si el pozo sigue agotado, la próxima conversación vuelve a pausar — por
 * eso el admin ve el uso actual al lado del botón.
 */
export async function reactivarLimiteAction(
  _previo: EstadoAdmin,
  formData: FormData,
): Promise<EstadoAdmin> {
  await requerirViboAdmin();

  const clienteId = String(formData.get("clienteId") ?? "");
  if (!clienteId) return { error: "Falta el cliente" };

  const reactivadas = await reactivarClientePorLimite(clienteId);
  if (reactivadas === 0) {
    return { error: "No había sedes pausadas por límite para reactivar" };
  }

  revalidatePath(`/admin/clientes/${clienteId}`);
  revalidatePath("/admin");
  return {};
}

/** Error esperable de negocio, para distinguirlo de una falla real. */
class ErrorNegocio extends Error {}

/** P2002 es el código de Prisma para "chocaste contra una restricción unique". */
function esViolacionDeUnique(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
