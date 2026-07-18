"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import { enviarEmailRecuperacion } from "@/lib/email";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  PREFIJO_ADMIN,
  PREFIJO_DASHBOARD,
  RUTA_LOGIN,
  rolPuedeAcceder,
  rutaInicialPorRol,
} from "@/lib/rutas";
import { RESET_TOKEN_TTL_MS, generarResetToken, hashToken } from "@/lib/tokens";

export type EstadoFormulario = { error?: string; ok?: string };

// --- Login ---------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

export async function loginAction(
  _estadoPrevio: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const callbackUrl = formData.get("callbackUrl");

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      // El redirect lo hacemos nosotros: necesitamos mandar a cada rol a su panel.
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // Mensaje genérico a propósito: no decimos si falló el email o la contraseña.
      return { error: "Email o contraseña incorrectos" };
    }
    throw error;
  }

  // El rol se lee de la base y no con auth(): signIn recién setea la cookie en
  // la respuesta, así que la sesión todavía no existe para esta request y auth()
  // devolvería null. Sin el rol, un VIBO_ADMIN caería en /dashboard y llegaría a
  // /admin recién por el rebote del proxy.
  // La consulta extra no preocupa: es una vez por login, no un camino caliente.
  const usuario = await prisma.usuario.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    select: { rol: true },
  });

  const destinoPorRol = usuario
    ? rutaInicialPorRol(usuario.rol)
    : PREFIJO_DASHBOARD;

  // Un callbackUrl controlado por el usuario es un open redirect si se usa tal
  // cual. Solo aceptamos rutas internas de la superficie que le toca a ese rol.
  const callbackValido =
    typeof callbackUrl === "string" &&
    (callbackUrl.startsWith(PREFIJO_DASHBOARD) ||
      callbackUrl.startsWith(PREFIJO_ADMIN)) &&
    usuario !== null &&
    rolPuedeAcceder(usuario.rol, callbackUrl);

  redirect(callbackValido ? (callbackUrl as string) : destinoPorRol);
}

// --- Logout --------------------------------------------------------------

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: RUTA_LOGIN });
}

// --- Pedir link de recuperación ------------------------------------------

const recuperarSchema = z.object({ email: z.string().email("Email inválido") });

export async function pedirRecuperacionAction(
  _estadoPrevio: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const parsed = recuperarSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const email = parsed.data.email.toLowerCase();
  const usuario = await prisma.usuario.findUnique({ where: { email } });

  // Respuesta idéntica exista o no la cuenta: si dijéramos "ese email no está
  // registrado", cualquiera podría averiguar qué clientes tienen cuenta en Vibo.
  if (usuario) {
    const { token, tokenHash } = generarResetToken();

    // Los pedidos anteriores se invalidan: si el dueño pide el link dos veces,
    // que el primero deje de servir.
    await prisma.passwordResetToken.deleteMany({
      where: { usuarioId: usuario.id, usedAt: null },
    });

    await prisma.passwordResetToken.create({
      data: {
        usuarioId: usuario.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const urlReset = `${urlBase()}/restablecer-password?token=${token}`;
    await enviarEmailRecuperacion(usuario.email, urlReset);
  }

  return {
    ok: "Si el email está registrado, te mandamos un link para restablecer la contraseña.",
  };
}

// --- Restablecer con el token --------------------------------------------

const restablecerSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(10, "La contraseña tiene que tener al menos 10 caracteres"),
    confirmacion: z.string(),
  })
  .refine((d) => d.password === d.confirmacion, {
    message: "Las contraseñas no coinciden",
    path: ["confirmacion"],
  });

export async function restablecerPasswordAction(
  _estadoPrevio: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const parsed = restablecerSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmacion: formData.get("confirmacion"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const registro = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });

  const tokenInvalido =
    !registro || registro.usedAt !== null || registro.expiresAt < new Date();

  if (tokenInvalido) {
    return {
      error: "El link no es válido o ya venció. Pedí uno nuevo.",
    };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const consumido = await prisma.$transaction(async (tx) => {
    // Marcar el token ANTES de tocar la contraseña es lo que hace efectivo el
    // "un solo uso": el where con usedAt: null solo matchea si nadie lo consumió
    // todavía, así que si dos requests entran con el mismo link a la vez, una
    // sola obtiene count 1 y la otra se va sin cambiar nada.
    // El expiresAt se revalida acá y no solo en la lectura de arriba: entre una
    // cosa y la otra el token pudo vencer.
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: registro.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    if (count === 0) return false;

    await tx.usuario.update({
      where: { id: registro.usuarioId },
      data: { passwordHash },
    });

    // Cualquier otro link pendiente de este usuario también queda invalidado.
    await tx.passwordResetToken.deleteMany({
      where: { usuarioId: registro.usuarioId, usedAt: null },
    });

    return true;
  });

  if (!consumido) {
    return { error: "El link no es válido o ya venció. Pedí uno nuevo." };
  }

  redirect(`${RUTA_LOGIN}?password=actualizada`);
}

/**
 * Origen con el que se arma el link del email.
 *
 * Nunca sale del header Host: ese header lo controla quien hace la request. Si
 * lo usáramos, un atacante podría pedir el reset del email de un cliente con
 * `Host: evil.com`, y al cliente le llegaría un mail legítimo nuestro con un
 * link al dominio del atacante. Un clic y le entrega un token válido.
 *
 * Por eso el origen sale solo de configuración del servidor.
 */
function urlBase(): string {
  const configurada = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (configurada) return configurada.replace(/\/$/, "");

  // En Vercel, cuando AUTH_URL no está seteada.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Falta AUTH_URL: sin un origen configurado no se puede armar un link de recuperación seguro",
    );
  }

  return "http://localhost:3000";
}
