/**
 * Verifica el panel del admin (SDD v2 §5) y las señales de riesgo (§7).
 *
 * Crea clientes de juguete con estados distintos y comprueba que los números
 * salgan bien. Los borra al final, siempre.
 */
import "dotenv/config";

import { agentesConErrores, resumenDelPanel, riesgosPorCliente } from "../src/lib/admin/panel";
import { registrarErrorIntegracion } from "../src/lib/admin/salud";
import { cicloDe } from "../src/lib/ciclo";
import { prisma } from "../src/lib/prisma";

let fallos = 0;
const chequear = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "OK  " : "FALLO"} ${n}${d ? ` — ${d}` : ""}`);
  if (!ok) fallos++;
};

const S = Date.now().toString().slice(-6);
const creados: string[] = [];

async function crearCliente(nombre: string, planId: string, extra: Record<string, unknown> = {}) {
  const c = await prisma.cliente.create({
    data: {
      nombre: `ZZ ${nombre} ${S}`,
      planId,
      ...extra,
      usuarios: { create: { email: `zz-${nombre}-${S}@t.test`, passwordHash: "x", rol: "CLIENTE_OWNER" } },
    },
    select: { id: true },
  });
  creados.push(c.id);
  return c.id;
}

async function main() {
  const plan = await prisma.plan.findFirstOrThrow({
    where: { nombre: "Starter" },
    select: { id: true, precio: true, maxConversacionesMes: true },
  });
  const precio = Number(plan.precio);

  const base = await resumenDelPanel();
  console.log(`base: MRR ${base.mrr}, clientes ${base.totalClientes}\n`);

  console.log("--- MRR: sólo suma los clientes AL_DIA ---");
  const alDia = await crearCliente("AlDia", plan.id, { estadoPago: "AL_DIA" });
  await crearCliente("Vencido", plan.id, { estadoPago: "VENCIDO" });
  await crearCliente("Gracia", plan.id, { estadoPago: "EN_GRACIA", graciaDesde: new Date() });

  const r1 = await resumenDelPanel();
  chequear("el MRR subió sólo por el que está al día", r1.mrr === base.mrr + precio, `${base.mrr} -> ${r1.mrr}`);
  chequear("el potencial subió por los tres", r1.mrrPotencial === base.mrrPotencial + precio * 3);
  chequear(
    "«sin cobrar» refleja lo que se sirve y no se cobra",
    r1.mrrPotencial - r1.mrr === base.mrrPotencial - base.mrr + precio * 2,
  );
  chequear("cuenta los vencidos", r1.clientesPorEstado.VENCIDO === base.clientesPorEstado.VENCIDO + 1);
  chequear("cuenta los en gracia", r1.clientesPorEstado.EN_GRACIA === base.clientesPorEstado.EN_GRACIA + 1);

  console.log("\n--- Agentes pausados, separados por motivo ---");
  const agente = await prisma.agente.create({
    data: {
      clienteId: alDia, nombre: "Sede ZZ", deporte: "Padel", estado: "PAUSADO_POR_PAGO",
      promptBase: "x", airtableBaseId: "app0", airtableApiKeyEnc: "x",
      evolutionInstanceId: "i", evolutionApiUrlEnc: "x", evolutionApiKeyEnc: "x",
    },
    select: { id: true },
  });
  const r2 = await resumenDelPanel();
  chequear(
    "el pausado por pago se cuenta aparte",
    r2.agentesPausados.PAUSADO_POR_PAGO === base.agentesPausados.PAUSADO_POR_PAGO + 1,
  );
  chequear("no se mezcla con los de límite", r2.agentesPausados.PAUSADO_LIMITE === base.agentesPausados.PAUSADO_LIMITE);

  console.log("\n--- Salud de integraciones ---");
  registrarErrorIntegracion(agente.id, "airtable", "auth: Airtable respondió 401");
  await new Promise((r) => setTimeout(r, 600));
  const errores = await agentesConErrores();
  const mio = errores.find((e) => e.id === agente.id);
  chequear("aparece el agente con error", mio !== undefined);
  chequear("dice qué servicio falló", mio?.mensaje?.includes("[airtable]") ?? false, mio?.mensaje ?? "");

  console.log("\n--- Señales de riesgo (§7) ---");
  const ciclo = cicloDe();
  // Uso alto: 90% del tope.
  await prisma.usoMensual.create({
    data: {
      agenteId: agente.id, cicloInicio: ciclo.inicio, cicloFin: ciclo.fin,
      conversacionesCount: Math.floor(plan.maxConversacionesMes * 0.9),
    },
  });
  const riesgos = await riesgosPorCliente();
  const rAlDia = riesgos.get(alDia);
  chequear("calcula el uso del cliente", rAlDia !== undefined && rAlDia.usadas > 0, `${rAlDia?.usadas}/${rAlDia?.limite}`);
  chequear(
    "detecta uso alto (upsell)",
    rAlDia?.senales.some((s) => s.tipo === "uso_alto") ?? false,
    rAlDia?.senales.map((s) => s.tipo).join(",") ?? "",
  );
  chequear(
    "detecta que nunca entró al panel",
    rAlDia?.senales.some((s) => s.tipo === "sin_ingresar") ?? false,
  );

  const rVencido = riesgos.get(creados[1]);
  chequear(
    "un cliente sin uso da señal de uso bajo (churn)",
    rVencido?.senales.some((s) => s.tipo === "uso_bajo") ?? false,
    rVencido?.senales.map((s) => s.tipo).join(",") ?? "",
  );
}

main()
  .catch((e) => {
    console.error(e);
    fallos++;
  })
  .finally(async () => {
    for (const id of creados) {
      await prisma.usoMensual.deleteMany({ where: { agente: { clienteId: id } } });
      await prisma.agente.deleteMany({ where: { clienteId: id } });
      await prisma.usuario.deleteMany({ where: { clienteId: id } });
      await prisma.cliente.delete({ where: { id } }).catch(() => {});
    }
    console.log(`\n${creados.length} cliente(s) de prueba eliminados`);
    console.log(fallos === 0 ? "Todo OK." : `${fallos} fallo(s).`);
    process.exitCode = fallos === 0 ? 0 : 1;
    await prisma.$disconnect();
  });
