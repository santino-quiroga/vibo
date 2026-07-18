import { BotonLogout } from "@/components/boton-logout";
import { BotonEnlace } from "@/components/ui/boton-enlace";
import { NavLateral } from "@/components/cliente/nav-lateral";
import { FranjaDamero } from "@/components/marca/damero";
import { Logo } from "@/components/marca/logo";
import { contarSinLeer } from "@/lib/cliente/conversaciones";
import { requerirClienteOwner } from "@/lib/dal";

/**
 * El armazón del panel cliente (punto 5: sidebar de 4 secciones + header).
 *
 * El layout también pasa por requerirClienteOwner. No alcanza con que lo haga
 * cada página: un layout se renderiza para todas sus rutas hijas, así que si
 * mañana se agrega una página y alguien se olvida del chequeo, acá ya está.
 * Igual las páginas lo repiten — es barato (cache() lo resuelve una vez) y no
 * depende de que nadie se acuerde.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await requerirClienteOwner();
  const sinLeer = await contarSinLeer();

  return (
    <div className="flex min-h-svh flex-col">
      <FranjaDamero />

      <header className="bg-card border-b border-black/10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Logo tamano="xs" />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-neutral-500 sm:inline">
              {usuario.email}
            </span>
            <BotonEnlace variant="ghost" size="sm" href="/cuenta">
              Cuenta
            </BotonEnlace>
            <BotonLogout />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row md:py-8">
        <NavLateral sinLeer={sinLeer} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
