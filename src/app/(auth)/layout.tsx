import { Damero, FranjaDamero } from "@/components/marca/damero";
import { Logo } from "@/components/marca/logo";

/**
 * Split de dos paneles con costura de damero.
 *
 * Es la estructura de la p1 del manual —paneles positivo y negativo separados
 * por una costura— y de paso coincide con el login de la referencia. El panel
 * negro es la única superficie oscura de toda la app: el resto es claro
 * (requerimientos §12, solo modo claro en v1).
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <FranjaDamero />

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Formulario */}
        <main className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-sm">
            <div className="mb-10">
              <Logo tamano="lg" stacked className="text-vibo-negro" />
            </div>
            {children}
          </div>
        </main>

        {/* Costura: vertical en desktop, no existe en mobile */}
        <Damero
          c1="var(--vibo-negro)"
          c2="var(--vibo-blanco)"
          cuadro={14}
          className="hidden w-6 shrink-0 lg:block"
        />

        {/* Panel de marca. En mobile se esconde: en una pantalla chica compite
            con el formulario, que es lo único que la persona vino a hacer. */}
        <aside className="bg-vibo-negro text-vibo-blanco relative hidden flex-1 flex-col justify-center overflow-hidden p-12 lg:flex xl:p-16">
          {/* El claim es el ancla del panel y va agrupado con su volanta:
              separarlos con justify-between dejaba dos huecos muertos y hacía
              ver el panel vacío. */}
          <div className="max-w-md">
            <span className="etiqueta text-vibo-rojo">
              Agentes de IA para WhatsApp
            </span>
            <p className="font-display mt-4 text-[2.75rem] leading-[1.02] font-bold text-balance">
              Operamos el canal
              <br />
              que ya usás.
            </p>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-neutral-400">
              Tus turnos y conversaciones, en un solo
              lugar.
            </p>
          </div>

          <Logo tamano="xs" className="text-vibo-blanco absolute right-12 bottom-12" />
        </aside>
      </div>
    </div>
  );
}
