import type { Metadata } from "next";

import { BotonEnlace } from "@/components/ui/boton-enlace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FranjaDamero } from "@/components/marca/damero";
import { Logo } from "@/components/marca/logo";
import { verificarSesion } from "@/lib/dal";
import { rutaInicialPorRol } from "@/lib/rutas";

import { CambiarPasswordForm } from "./cambiar-password-form";

export const metadata: Metadata = { title: "Cuenta | Vibo" };

/**
 * Página de cuenta, compartida por los dos roles (SDD §6.1). Vive en /cuenta,
 * fuera de /dashboard y /admin, para que la alcancen ambos: el proxy solo exige
 * sesión, sin restringir por rol.
 */
export default async function CuentaPage() {
  const usuario = await verificarSesion();

  return (
    <div className="flex min-h-svh flex-col">
      <FranjaDamero />

      <header className="bg-card border-b border-neutral-300">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-4 py-3">
          <Logo tamano="xs" />
          <BotonEnlace variant="ghost" size="sm" href={rutaInicialPorRol(usuario.rol)}>
            ← Volver
          </BotonEnlace>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="t-pagina">Cuenta</h1>
        <p className="mt-1 text-sm text-neutral-500">{usuario.email}</p>

        <div className="mt-6">
          <Card id="cambiar-password">
            <CardHeader>
              <CardTitle className="text-base">Cambiar contraseña</CardTitle>
              <CardDescription>
                Cambiá la contraseña que usás para entrar. Vas a necesitar la
                actual.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CambiarPasswordForm />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
