/**
 * Prueba el Code node "Vibo - Contexto cache" fuera de n8n.
 *
 * Es la pieza más riesgosa de la migración: implementa el fail-open con cache
 * del SDD v2 §1. Se ejecuta el mismo JS que va a correr en n8n, con un
 * $getWorkflowStaticData y un $input simulados, contra la respuesta REAL del
 * endpoint de contexto.
 */
import { readFileSync } from "node:fs";

import "dotenv/config";
import { descifrar } from "../src/lib/crypto";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.VIBO_BASE ?? "http://localhost:3000";
const AGENTE = process.env.VIBO_AGENTE!;

let fallos = 0;
const chequear = (nombre: string, ok: boolean, detalle = "") => {
  console.log(`  ${ok ? "OK  " : "FALLO"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos++;
};

const doc = JSON.parse(readFileSync("docs/n8n-nodos-vibo-v2.json", "utf-8")) as {
  nodes: Array<{ name: string; parameters: { jsCode?: string } }>;
};
const jsCode = doc.nodes.find((n) => n.name === "Vibo - Contexto cache")!.parameters.jsCode!;

type Salida = {
  puedeResponder: boolean;
  motivo: string | null;
  desdeCache: boolean;
  sinContexto: boolean;
  promptBase: string;
  bloqueVibo: string;
};

/** Ejecuta el jsCode del nodo con el store y la entrada dados. */
function correrNodo(store: Record<string, unknown>, entrada: unknown): Salida {
  const fn = new Function(
    "$getWorkflowStaticData",
    "$input",
    `return (function(){ ${jsCode} })();`,
  );
  const salida = fn(
    () => store,
    { first: () => ({ json: entrada }) },
  ) as Array<{ json: Salida }>;
  return salida[0].json;
}

async function main() {
  const agente = await prisma.agente.findUnique({
    where: { id: AGENTE },
    select: { tokenIntegracionEnc: true },
  });
  const token = descifrar(agente!.tokenIntegracionEnc!);

  const r = await fetch(`${BASE}/api/integracion/agentes/${AGENTE}/contexto`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const contexto = await r.json();

  console.log("--- Camino feliz: Vibo responde ---");
  const store: Record<string, unknown> = {};
  const vivo = correrNodo(store, contexto);
  chequear("puedeResponder true", vivo.puedeResponder === true);
  chequear("no viene de cache", vivo.desdeCache === false);
  chequear("armó el bloque para el prompt", vivo.bloqueVibo.length > 0);
  chequear("el bloque trae los precios", vivo.bloqueVibo.includes("CANCHAS Y PRECIOS"));
  chequear("expone el promptBase de Vibo", vivo.promptBase.includes("## IDENTIDAD"));
  // La limpieza del paso 1 tiene que verse acá: la política vive sólo en reglas.
  chequear(
    "el promptBase ya no trae la política contradictoria",
    !/CANCELACI[ÓO]N/i.test(vivo.promptBase),
  );
  chequear("guardó el contexto en el store", store.viboContexto !== undefined);
  console.log("\n  ── bloque que se inyecta en el system prompt ──");
  console.log(vivo.bloqueVibo.split("\n").map((l) => "  | " + l).join("\n"));

  // Regla dura: el bloque sólo afirma lo que está cargado. Un campo vacío no se
  // convierte en una afirmación — sobre todo si habla de plata o de reglas que
  // el cliente final va a tomar como ciertas.
  console.log("\n--- Un campo vacío NO puede volverse una afirmación ---");
  const vacio = correrNodo(
    {},
    {
      ...contexto,
      reglas: {
        anticipacionMinimaMin: null,
        politicaCancelacion: null,
        senia: { requiere: false, detalle: null },
      },
    },
  );
  chequear(
    "seña sin cargar NO produce «no se pide seña»",
    !/sena/i.test(vacio.bloqueVibo),
    "vacío significa «nadie lo cargó», no «no se cobra»",
  );
  chequear(
    "anticipación null no inventa una regla",
    !/[Aa]nticipacion/.test(vacio.bloqueVibo),
  );
  chequear(
    "sin reglas cargadas no aparece la sección entera",
    !vacio.bloqueVibo.includes("REGLAS DE RESERVA"),
  );

  console.log("\n--- Vibo caído, con cache (lo que motivó el nodo) ---");
  const caido = correrNodo(store, {});
  chequear("responde igual (fail-open)", caido.puedeResponder === true);
  chequear("marca que viene de cache", caido.desdeCache === true);
  chequear(
    "conserva el prompt y los precios del cache",
    caido.bloqueVibo === vivo.bloqueVibo,
    "sin esto el bot cotiza sin precios",
  );

  chequear(
    "el promptBase también sale del cache",
    caido.promptBase === vivo.promptBase && caido.promptBase.length > 0,
  );

  console.log("\n--- Vibo caído SIN cache (primera ejecución) ---");
  const sinCache = correrNodo({}, { error: "boom" });
  chequear("responde igual (fail-open)", sinCache.puedeResponder === true);
  chequear("avisa que no hay contexto", sinCache.sinContexto === true);
  chequear("bloque vacío, no basura", sinCache.bloqueVibo === "");
  // Lo que más importa del caso degradado: el bot se queda sin precios, así que
  // lo único inaceptable sería que igual cotice algo inventado.
  chequear(
    "aun sin contexto manda un prompt (no queda mudo)",
    sinCache.promptBase.length > 0,
  );
  chequear(
    "el prompt de fallback PROHÍBE inventar precios",
    /NO los inventes/i.test(sinCache.promptBase),
    "sin esto, un bot sin datos cotiza cualquier cosa",
  );

  console.log("\n--- Agente pausado: tiene que CORTAR ---");
  const pausado = correrNodo({}, { ...contexto, puedeResponder: false, motivo: "agente_pausado_limite" });
  chequear("puedeResponder false", pausado.puedeResponder === false);
  chequear("propaga el motivo", pausado.motivo === "agente_pausado_limite");

  console.log("\n--- Pausado y DESPUÉS se cae Vibo: fail-open gana ---");
  const storeP: Record<string, unknown> = {};
  correrNodo(storeP, { ...contexto, puedeResponder: false, motivo: "agente_pausado_limite" });
  const trasCaida = correrNodo(storeP, {});
  chequear(
    "responde (SDD §4.4: mejor una conversación de más)",
    trasCaida.puedeResponder === true,
  );

  console.log(`\n${fallos === 0 ? "Todo OK." : `${fallos} fallo(s).`}`);
  process.exitCode = fallos === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
