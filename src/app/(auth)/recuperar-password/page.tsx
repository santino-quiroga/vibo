import type { Metadata } from "next";

import { RecuperarForm } from "./recuperar-form";

export const metadata: Metadata = { title: "Recuperar contraseña | Vibo" };

// Render dinámico para que el nonce del CSP (proxy.ts) se aplique por request.
// Una página estática sirve HTML pre-generado sin nonce, y sus scripts inline
// quedarían bloqueados por el script-src endurecido del sprint 6.
export const dynamic = "force-dynamic";

export default function RecuperarPasswordPage() {
  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Recuperar contraseña
        </h1>
        <p className="text-neutral-500 mt-2 text-sm">
          Te mandamos un link para elegir una nueva. Vence en 1 hora.
        </p>
      </header>

      <RecuperarForm />
    </>
  );
}
