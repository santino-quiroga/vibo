"use server";

import { z } from "zod";

import { verificarSesion } from "@/lib/dal";
import { hashPassword, verificarPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export type EstadoCuenta = { error?: string; ok?: boolean };

const schema = z
  .object({
    actual: z.string().min(1, "Ingresá tu contraseña actual"),
    nueva: z.string().min(8, "La contraseña nueva tiene que tener al menos 8 caracteres"),
    repetir: z.string().min(1, "Repetí la contraseña nueva"),
  })
  .refine((d) => d.nueva === d.repetir, {
    message: "Las contraseñas nuevas no coinciden",
    path: ["repetir"],
  })
  .refine((d) => d.nueva !== d.actual, {
    message: "La contraseña nueva tiene que ser distinta de la actual",
    path: ["nueva"],
  });

/**
 * Cambio de contraseña del usuario logueado (SDD §6.1, agregado en revisión de MVP).
 *
 * Distinto del flujo de "olvidé mi contraseña": acá el usuario ya tiene sesión y
 * conoce su contraseña actual, así que se la pide para confirmar identidad (que
 * no sea alguien que agarró una sesión abierta). No depende del email.
 *
 * La sesión actual (JWT) sigue válida después del cambio — el usuario cambió su
 * propia contraseña, no hay motivo para echarlo. Sí se invalidan los links de
 * recuperación pendientes: si había uno dando vueltas, deja de servir.
 */
export async function cambiarPasswordAction(
  _previo: EstadoCuenta,
  formData: FormData,
): Promise<EstadoCuenta> {
  const usuario = await verificarSesion();

  const parsed = schema.safeParse({
    actual: formData.get("actual"),
    nueva: formData.get("nueva"),
    repetir: formData.get("repetir"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const fila = await prisma.usuario.findUnique({
    where: { id: usuario.id },
    select: { passwordHash: true },
  });
  if (!fila) return { error: "No se encontró tu usuario" };

  const coincide = await verificarPassword(parsed.data.actual, fila.passwordHash);
  if (!coincide) return { error: "La contraseña actual no es correcta" };

  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: usuario.id },
      data: { passwordHash: await hashPassword(parsed.data.nueva) },
    }),
    // Los links de recuperación pendientes dejan de servir tras un cambio manual.
    prisma.passwordResetToken.deleteMany({ where: { usuarioId: usuario.id, usedAt: null } }),
  ]);

  return { ok: true };
}
