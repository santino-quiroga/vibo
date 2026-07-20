import { NextResponse } from "next/server";

import { procesarCobranza } from "@/lib/pagos/cobranza-cron";
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

  // Dos responsabilidades en el mismo cron diario: los ciclos de plan (SDD v1
  // §9.5) y la cobranza (SDD v2 §4.4, que se le suma explícitamente).
  //
  // Van con allSettled y no en secuencia: si la cobranza falla, la
  // reconciliación de límites igual tiene que haber corrido, y al revés. Un
  // error en una no puede dejar clientes sin reactivar ni deudas sin vencer.
  const [limites, cobranza] = await Promise.allSettled([
    reconciliarLimites(),
    procesarCobranza(),
  ]);

  if (limites.status === "rejected") {
    console.error("[cron] falló la reconciliación de límites:", limites.reason);
  }
  if (cobranza.status === "rejected") {
    console.error("[cron] falló la cobranza:", cobranza.reason);
  }

  const huboFallo = limites.status === "rejected" || cobranza.status === "rejected";

  return NextResponse.json(
    {
      ok: !huboFallo,
      limites: limites.status === "fulfilled" ? limites.value : { error: true },
      cobranza: cobranza.status === "fulfilled" ? cobranza.value : { error: true },
    },
    // Si algo falló se devuelve 500 para que quede visible en los logs de Vercel
    // en vez de pasar por un cron "verde" que en realidad no hizo la mitad.
    { status: huboFallo ? 500 : 200 },
  );
}
