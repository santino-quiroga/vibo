/**
 * Verifica el endpoint de contexto (SDD v2 §1) simulando las llamadas de n8n.
 *
 * Lo que importa probar acá no es que devuelva 200, sino la razón de ser de la
 * sección: **que un cambio hecho en Vibo aparezca en la próxima respuesta**. Por
 * eso el test edita un precio y una regla en la base y vuelve a pedir el
 * contexto, en vez de sólo mirar la forma del JSON.
 *
 * El token vive solo dentro de este proceso: se descifra de la base y se usa en
 * los headers, nunca se imprime.
 *
 *   NODE_OPTIONS="--conditions=react-server" VIBO_AGENTE=<id> npx tsx scripts/probar-contexto.ts
 */

import "dotenv/config";

import { descifrar } from "../src/lib/crypto";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.VIBO_BASE ?? "http://localhost:3000";
const AGENTE = process.env.VIBO_AGENTE;

let fallos = 0;
function chequear(nombre: string, ok: boolean, detalle = "") {
  console.log(`  ${ok ? "OK  " : "FALLO"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos++;
}

type Contexto = {
  puedeResponder: boolean;
  motivo: string | null;
  promptBase: string;
  tono: string | null;
  negocio: { nombre: string; deporte: string; direccion: string | null; telefono: string | null };
  reglas: {
    anticipacionMinimaMin: number | null;
    politicaCancelacion: string | null;
    senia: { requiere: boolean; detalle: string | null };
  };
  faq: string | null;
  canchas: Array<{
    numero: number;
    precio: number;
    duracionTurnoMin: number;
    horarioApertura: string;
    horarioCierre: string;
  }>;
};

async function main() {
  if (!AGENTE) throw new Error("Falta VIBO_AGENTE");

  const agente = await prisma.agente.findUnique({
    where: { id: AGENTE },
    select: { id: true, estado: true, tokenIntegracionEnc: true },
  });
  if (!agente?.tokenIntegracionEnc) {
    throw new Error("El agente no tiene token. Regeneralo desde el admin.");
  }

  const token = descifrar(agente.tokenIntegracionEnc);
  const auth = { Authorization: `Bearer ${token}` };
  const url = `${BASE}/api/integracion/agentes/${AGENTE}/contexto`;

  const pedir = async (query = ""): Promise<{ status: number; body: Contexto }> => {
    const r = await fetch(`${url}${query}`, { headers: auth });
    return { status: r.status, body: (await r.json()) as Contexto };
  };

  console.log("--- Autenticación (mismas reglas que el resto de /api/integracion) ---");

  chequear("sin token → 401", (await fetch(url)).status === 401);
  chequear(
    "token inválido → 401",
    (await fetch(url, { headers: { Authorization: "Bearer no-existe" } })).status === 401,
  );
  chequear(
    "token válido pero otro agenteId en la URL → 403",
    (
      await fetch(`${BASE}/api/integracion/agentes/otro-id/contexto`, { headers: auth })
    ).status === 403,
  );

  console.log("\n--- Forma del contrato (v2 §1) ---");

  const { status, body } = await pedir();
  chequear("200", status === 200, `status ${status}`);
  chequear("trae promptBase no vacío", typeof body.promptBase === "string" && body.promptBase.length > 0);
  chequear("puedeResponder es boolean", typeof body.puedeResponder === "boolean");
  chequear("motivo presente (null si puede responder)", "motivo" in body);
  chequear("reglas.senia es { requiere, detalle }", typeof body.reglas?.senia?.requiere === "boolean");
  chequear("canchas es array", Array.isArray(body.canchas));
  chequear(
    "cada cancha trae precio y duración",
    body.canchas.every(
      (c) => typeof c.precio === "number" && typeof c.duracionTurnoMin === "number",
    ),
    `${body.canchas.length} cancha(s)`,
  );

  console.log(`  contexto: ${body.canchas.length} canchas, negocio="${body.negocio.nombre}"`);
  console.log(
    `  reglas: anticipacion=${body.reglas.anticipacionMinimaMin} min, seña requiere=${body.reglas.senia.requiere}`,
  );

  console.log("\n--- Lo que motivó la sección: ¿un cambio en Vibo llega al bot? ---");

  const canchaPrevia = await prisma.cancha.findFirst({
    where: { agenteId: AGENTE },
    orderBy: { numero: "asc" },
    select: { id: true, numero: true, precio: true },
  });

  if (!canchaPrevia) {
    chequear("hay una cancha para editar", false, "el agente no tiene canchas cargadas");
  } else {
    const precioViejo = Number(canchaPrevia.precio);
    const precioNuevo = precioViejo + 1234;

    await prisma.cancha.update({
      where: { id: canchaPrevia.id },
      data: { precio: precioNuevo },
    });

    const despues = await pedir();
    const cancha = despues.body.canchas.find((c) => c.numero === canchaPrevia.numero);
    chequear(
      "cambiar el precio en Vibo se ve en el contexto",
      cancha?.precio === precioNuevo,
      `esperado ${precioNuevo}, vino ${cancha?.precio}`,
    );

    // Se restaura para no dejar el agente con un precio de prueba.
    await prisma.cancha.update({
      where: { id: canchaPrevia.id },
      data: { precio: precioViejo },
    });
    console.log(`  precio restaurado a ${precioViejo}`);
  }

  // Los estados se prueban sobre un agente REAL, así que la restauración va en
  // finally: si un chequeo tira, el agente no puede quedar sin poder responder.
  // (Pasó: una corrida abortada lo dejó EN_CONFIGURACION.)
  const estadoPrevio = agente.estado;
  try {
    console.log("\n--- EN_CONFIGURACION no le responde a nadie (SDD v2 §2) ---");

    await prisma.agente.update({ where: { id: AGENTE }, data: { estado: "EN_CONFIGURACION" } });
    const enConfig = await pedir();
    chequear(
      "agente en configuración → puedeResponder false",
      enConfig.body.puedeResponder === false,
      "si respondiera, un cliente real hablaría con un agente sin verificar",
    );
    chequear(
      "motivo agente_en_configuracion",
      enConfig.body.motivo === "agente_en_configuracion",
      `vino "${enConfig.body.motivo}"`,
    );
    chequear(
      "igual manda el contexto (para el chat de prueba y el cache de n8n)",
      enConfig.body.promptBase.length > 0 && enConfig.body.canchas.length > 0,
    );

    console.log("\n--- Estado del agente: pausar corta la respuesta ---");

    await prisma.agente.update({ where: { id: AGENTE }, data: { estado: "PAUSADO_MANUAL" } });

    const pausado = await pedir();
    chequear("agente pausado → puedeResponder false", pausado.body.puedeResponder === false);
    chequear(
      "motivo agente_pausado_manual",
      pausado.body.motivo === "agente_pausado_manual",
      `vino "${pausado.body.motivo}"`,
    );
    chequear(
      "aun pausado sigue mandando el prompt y las canchas",
      pausado.body.promptBase.length > 0 && Array.isArray(pausado.body.canchas),
      "n8n puede cachearlo para cuando se reactive",
    );
  } finally {
    await prisma.agente.update({
      where: { id: AGENTE },
      data: { estado: estadoPrevio },
    });
    console.log(`  estado restaurado a ${estadoPrevio}`);
  }

  console.log(
    `\n${fallos === 0 ? "Todo OK." : `${fallos} chequeo(s) fallaron.`}`,
  );
  process.exitCode = fallos === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
