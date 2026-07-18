import Link from "next/link";

import { BotonLogout } from "@/components/boton-logout";
import { FranjaDamero } from "@/components/marca/damero";
import { Logo } from "@/components/marca/logo";
import { requerirViboAdmin } from "@/lib/dal";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // El layout no reemplaza el chequeo de cada página: los layouts no se vuelven
  // a ejecutar en toda navegación, así que cada página llama igual al DAL.
  const usuario = await requerirViboAdmin();

  return (
    <div className="flex min-h-svh flex-col">
      {/* La franja de damero encabeza cada página, como en el manual.
          Acá va en rojo/acento: es la señal de que esto es el panel interno. */}
      <FranjaDamero c1="var(--vibo-rojo)" c2="var(--vibo-acento)" />

      <header className="bg-vibo-negro text-vibo-blanco">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="focus-visible:outline-vibo-rojo rounded-xs focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              <Logo tamano="xs" />
            </Link>
            <span className="etiqueta text-vibo-rojo border-vibo-rojo/40 border-l pl-4">
              Admin interno
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-neutral-400 sm:inline">
              {usuario.email}
            </span>
            <Link
              href="/cuenta"
              className="focus-visible:outline-vibo-rojo rounded-xs text-sm text-neutral-300 underline-offset-4 hover:text-vibo-blanco hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              Cuenta
            </Link>
            <BotonLogout sobreOscuro />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
