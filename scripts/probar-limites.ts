/**
 * Verifica el límite de conversaciones del plan (sprint 5), de punta a punta.
 *
 * Siembra el uso cerca del tope en vez de mandar 200 mensajes, pero cruza el
 * límite por el camino real (POST /api/integracion/mensajes), así se ejercita el
 * conteo, el pozo compartido, el bloqueo, /puede-responder, la reactivación
 * manual y el cron.
 *
 *   NODE_OPTIONS="--conditions=react-server" VIBO_AGENTE=<id> npx tsx scripts/probar-limites.ts
 */

import "dotenv/config";

import { cicloDe } from "../src/lib/ciclo";
import { descifrar } from "../src/lib/crypto";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.VIBO_BASE ?? "http://localhost:3000";
const AGENTE = process.env.VIBO_AGENTE!;
const CRON_URL = `${BASE}/api/cron/ciclo`;

let fallos = 0;
const chequear = (nombre: string, ok: boolean, detalle = "") => {
  console.log(`  ${ok ? "OK   " : "FALLO"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos++;
};

async function main() {
  const agente = await prisma.agente.findUnique({
    where: { id: AGENTE },
    select: {
      tokenIntegracionEnc: true,
      clienteId: true,
      cliente: { select: { plan: { select: { maxConversacionesMes: true } } } },
    },
  });
  if (!agente?.tokenIntegracionEnc) throw new Error("El agente no tiene token.");

  const token = descifrar(agente.tokenIntegracionEnc);
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const clienteId = agente.clienteId;
  const limite = agente.cliente.plan.maxConversacionesMes;
  const ciclo = cicloDe();

  const enviar = (telefono: string) =>
    fetch(`${BASE}/api/integracion/mensajes`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ agenteId: AGENTE, telefono, remitente: "CONTACTO", contenido: "hola" }),
    }).then((r) => r.json());

  const puedeResponder = () =>
    fetch(`${BASE}/api/integracion/agentes/${AGENTE}/puede-responder`, { headers: auth }).then((r) => r.json());

  const estadoAgente = async () =>
    (await prisma.agente.findUnique({ where: { id: AGENTE }, select: { estado: true } }))!.estado;

  const usoActual = async () =>
    (await prisma.usoMensual.aggregate({
      where: { agente: { clienteId }, cicloInicio: ciclo.inicio },
      _sum: { conversacionesCount: true },
    }))._sum.conversacionesCount ?? 0;

  console.log(`\nLímite del plan: ${limite}. Sembrando el pozo en ${limite - 1}...`);

  // --- Reset + siembra ---
  const telA = `54900${Date.now().toString().slice(-9)}`;
  const telB = `54901${Date.now().toString().slice(-9)}`;

  await prisma.$transaction([
    prisma.agente.updateMany({ where: { clienteId }, data: { estado: "ACTIVO" } }),
    prisma.usoMensual.deleteMany({ where: { agente: { clienteId }, cicloInicio: ciclo.inicio } }),
    prisma.usoMensual.create({
      data: { agenteId: AGENTE, cicloInicio: ciclo.inicio, cicloFin: ciclo.fin, conversacionesCount: limite - 1 },
    }),
  ]);

  console.log("\n--- Cruzar el límite ---");

  const r1 = await enviar(telA);
  chequear(
    `conversación ${limite}: cuenta pero no bloquea aún`,
    r1.uso?.usadas === limite && r1.uso?.bloqueado === true,
    JSON.stringify(r1.uso),
  );
  // El pozo llegó a `limite` con esta conversación → bloquea en este mismo mensaje.
  chequear("agente pasó a PAUSADO_LIMITE", (await estadoAgente()) === "PAUSADO_LIMITE");
  chequear("puede-responder = false", (await puedeResponder()).puedeResponder === false);
  chequear(
    "motivo = agente_pausado_limite",
    (await puedeResponder()).motivo === "agente_pausado_limite",
  );

  console.log("\n--- No cuenta dos veces la misma conversación ---");
  const usoAntes = await usoActual();
  await enviar(telA); // mismo teléfono, misma conversación
  const usoDespues = await usoActual();
  chequear("mismo contacto no incrementa el pozo", usoAntes === usoDespues, `${usoAntes} -> ${usoDespues}`);

  console.log("\n--- Cron NO reactiva con el pozo agotado ---");
  const cron1 = await fetch(CRON_URL).then((r) => r.json());
  chequear("cron corre pero no reactiva", cron1.ok === true && cron1.sedesReactivadas === 0, JSON.stringify(cron1));
  chequear("agente sigue PAUSADO_LIMITE", (await estadoAgente()) === "PAUSADO_LIMITE");

  console.log("\n--- Reactivación manual (simula upgrade) ---");
  // Simula el upgrade: sube el pozo disponible bajando el consumo sembrado a la
  // mitad, y reactiva por el cron (reconcilia contra el uso actual).
  await prisma.usoMensual.updateMany({
    where: { agente: { clienteId }, cicloInicio: ciclo.inicio },
    data: { conversacionesCount: Math.floor(limite / 2) },
  });
  const cron2 = await fetch(CRON_URL).then((r) => r.json());
  chequear("cron reactiva cuando el pozo bajó", cron2.sedesReactivadas >= 1, JSON.stringify(cron2));
  chequear("agente volvió a ACTIVO", (await estadoAgente()) === "ACTIVO");
  chequear("puede-responder = true de nuevo", (await puedeResponder()).puedeResponder === true);

  console.log("\n--- Limpieza ---");
  await prisma.$transaction([
    prisma.mensaje.deleteMany({ where: { conversacion: { agenteId: AGENTE, contactoTelefono: { in: [telA, telB] } } } }),
    prisma.conversacion.deleteMany({ where: { agenteId: AGENTE, contactoTelefono: { in: [telA, telB] } } }),
    prisma.usoMensual.deleteMany({ where: { agente: { clienteId }, cicloInicio: ciclo.inicio } }),
    prisma.agente.updateMany({ where: { clienteId }, data: { estado: "ACTIVO" } }),
  ]);
  console.log("  datos de prueba borrados, agente en ACTIVO.");

  console.log(`\n${fallos === 0 ? "Todo OK." : `${fallos} chequeo(s) fallaron.`}`);
  if (fallos > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
