import { HeaderPanel } from "@/components/cliente/header-panel";
import { NavLateral } from "@/components/cliente/nav-lateral";
import { FranjaDamero } from "@/components/marca/damero";
import { contarSinLeer } from "@/lib/cliente/conversaciones";
import { agentesDelCliente, clienteDeLaSesion } from "@/lib/cliente/datos";
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
  const [sinLeer, cliente, agentes] = await Promise.all([
    contarSinLeer(),
    clienteDeLaSesion(),
    agentesDelCliente(),
  ]);

  return (
    <div className="flex min-h-svh flex-col">
      <FranjaDamero />

      <HeaderPanel
        email={usuario.email}
        cliente={cliente}
        agentes={agentes}
        sinLeer={sinLeer}
      />

      {/* Grilla de 8px: 24px de gutter en mobile, 32px de aire vertical en
          desktop y 40px entre el riel y el contenido. */}
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-6 py-8 md:flex-row md:gap-10">
        <NavLateral sinLeer={sinLeer} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
