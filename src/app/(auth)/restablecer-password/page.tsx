import type { Metadata } from "next";

import { BotonEnlace } from "@/components/ui/boton-enlace";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";

import { RestablecerForm } from "./restablecer-form";

export const metadata: Metadata = { title: "Restablecer contraseña | Vibo" };

export default async function RestablecerPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // Se valida acá para no mostrarle un formulario a alguien cuyo link ya venció
  // y que solo se enteraría al enviarlo. La validación que manda igual es la de
  // la server action: esta es de conveniencia, no de seguridad.
  const registro = token
    ? await prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashToken(token) },
      })
    : null;

  const linkValido =
    registro !== null && registro.usedAt === null && registro.expiresAt > new Date();

  if (!linkValido) {
    return (
      <>
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Link no válido</h1>
          <p className="text-neutral-500 mt-2 text-sm">
            Este link ya se usó o venció. Los links duran 1 hora y sirven una
            sola vez.
          </p>
        </header>

        <div className="space-y-3">
          <BotonEnlace
            href="/recuperar-password"
            className="w-full"
          >
            Pedir un link nuevo
          </BotonEnlace>
          <BotonEnlace
            href="/login"
            variant="outline"
            className="w-full"
          >
            Volver a iniciar sesión
          </BotonEnlace>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Elegí una contraseña nueva
        </h1>
        <p className="text-neutral-500 mt-2 text-sm">Mínimo 10 caracteres.</p>
      </header>

      <RestablecerForm token={token!} />
    </>
  );
}
