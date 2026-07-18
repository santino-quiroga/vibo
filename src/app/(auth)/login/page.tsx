import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión | Vibo" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; password?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Iniciar sesión</h1>
        <p className="text-neutral-500 mt-2 text-sm">
          Entrá con las credenciales que te dio el equipo de Vibo.
        </p>
      </header>

      <LoginForm
        callbackUrl={params.callbackUrl}
        passwordActualizada={params.password === "actualizada"}
      />
    </>
  );
}
