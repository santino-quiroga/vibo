import { NextResponse } from "next/server";

import { reconciliarLimites } from "@/lib/planes/ciclo-cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/ciclo — el cron diario de límites (SDD 9.5).
 *
 * Lo dispara Vercel Cron (configurado en vercel.json). Vercel manda el header
 * `Authorization: Bearer <CRON_SECRET>`; se valida contra la variable de
 * entorno. Sin CRON_SECRET configurado, en producción se rechaza todo: es
 * preferible que el cron no corra a que corra abierto a cualquiera.
 *
 * Esta ruta queda fuera del proxy de sesión (ver src/proxy.ts): no la llama un
 * usuario logueado.
 */
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;

  if (!secreto) {
    // En dev se permite para poder probarlo; en producción, sin secreto no corre.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "CRON_SECRET no configurado" },
        { status: 500 },
      );
    }
  } else {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secreto}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  const resultado = await reconciliarLimites();
  return NextResponse.json({ ok: true, ...resultado });
}
