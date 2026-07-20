/**
 * Verifica el archivado y el borrado de clientes.
 *
 * Lo que importa: que archivar sea reversible y corte el servicio, que borrar
 * NO deje usuarios huérfanos (el SetNull por defecto lo haría), y que un cliente
 * con pagos no se pueda borrar.
 */
import "dotenv/config";

import { resumenDelPanel } from "../src/lib/admin/panel";
import { evaluarPuedeResponder } from "../src/lib/integracion/mensajes";
import { prisma } from "../src/lib/prisma";

let fallos = 0;
const chequear = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "OK  " : "FALLO"} ${n}${d ? ` — ${d}` : ""}`);
  if (!ok) fallos++;
};

const S = Date.now().toString().slice(-6);
const creados: string[] = [];

async function crear(nombre: string, planId: string) {
  const c = await prisma.cliente.create({
    data: {
      nombre: `ZZ ${nombre} ${S}`,
      planId,
      usuarios: { create: { email: `zz-${nombre}-${S}@t.test`, passwordHash: "x", rol: "CLIENTE_OWNER" } },
      agentes: {
        create: {
          nombre: `Sede ${nombre}`, deporte: "Padel", estado: "ACTIVO", promptBase: "x",
          airtableBaseId: "app0", airtableApiKeyEnc: "x",
          evolutionInstanceId: "i", evolutionApiUrlEnc: "x", evolutionApiKeyEnc: "x",
        },
      },
    },
    select: { id: true, nombre: true, agentes: { select: { id: true } } },
  });
  creados.push(c.id);
  return c;
}

async function main() {
  const plan = await prisma.plan.findFirstOrThrow({ select: { id: true } });

  console.log("--- Archivar: corta el servicio y sale de las métricas ---");
  const a = await crear("Archivable", plan.id);
  const base = await resumenDelPanel();

  const antes = await evaluarPuedeResponder(
    { id: a.agentes[0].id, estado: "ACTIVO", clienteArchivado: false }, null,
  );
  chequear("antes de archivar, el bot responde", antes.puedeResponder === true);

  await prisma.cliente.update({ where: { id: a.id }, data: { archivadoAt: new Date() } });

  const despues = await evaluarPuedeResponder(
    { id: a.agentes[0].id, estado: "ACTIVO", clienteArchivado: true }, null,
  );
  chequear("archivado → el bot NO responde", despues.puedeResponder === false);
  chequear("con motivo cliente_archivado", despues.motivo === "cliente_archivado", despues.motivo ?? "");

  const conArchivado = await resumenDelPanel();
  chequear(
    "sale del conteo de clientes del panel",
    conArchivado.totalClientes === base.totalClientes - 1,
    `${base.totalClientes} -> ${conArchivado.totalClientes}`,
  );

  // Reversible
  await prisma.cliente.update({ where: { id: a.id }, data: { archivadoAt: null } });
  const restaurado = await resumenDelPanel();
  chequear("desarchivar lo devuelve", restaurado.totalClientes === base.totalClientes);

  console.log("\n--- Borrar: no puede dejar usuarios huérfanos ---");
  const b = await crear("Borrable", plan.id);
  const usuariosAntes = await prisma.usuario.count({ where: { clienteId: b.id } });
  chequear("el cliente tiene usuarios", usuariosAntes > 0, `${usuariosAntes}`);

  // Mismo orden que la Server Action.
  await prisma.$transaction(async (tx) => {
    const ags = await tx.agente.findMany({ where: { clienteId: b.id }, select: { id: true } });
    const ids = ags.map((x) => x.id);
    await tx.conversacion.deleteMany({ where: { agenteId: { in: ids } } });
    await tx.usoMensual.deleteMany({ where: { agenteId: { in: ids } } });
    await tx.cancha.deleteMany({ where: { agenteId: { in: ids } } });
    await tx.agente.deleteMany({ where: { clienteId: b.id } });
    await tx.usuario.deleteMany({ where: { clienteId: b.id } });
    await tx.cliente.delete({ where: { id: b.id } });
  });
  creados.splice(creados.indexOf(b.id), 1);

  const huerfanos = await prisma.usuario.count({ where: { clienteId: null, rol: "CLIENTE_OWNER" } });
  chequear(
    "NO quedaron CLIENTE_OWNER sin cliente",
    huerfanos === 0,
    huerfanos > 0 ? `${huerfanos} login(s) huérfanos` : "",
  );
  chequear(
    "el cliente ya no existe",
    (await prisma.cliente.findUnique({ where: { id: b.id } })) === null,
  );

  console.log("\n--- Un cliente con pagos no se puede borrar ---");
  const c = await crear("ConPagos", plan.id);
  await prisma.pago.create({
    data: { clienteId: c.id, monto: 150000, fecha: new Date(), estado: "APROBADO", origen: "MANUAL" },
  });
  const conPagos = await prisma.cliente.findUniqueOrThrow({
    where: { id: c.id }, select: { _count: { select: { pagos: true } } },
  });
  chequear(
    "la regla lo detecta (tiene pagos)",
    conPagos._count.pagos > 0,
    "la acción rechaza el borrado y ofrece archivar",
  );
}

main()
  .catch((e) => { console.error(e); fallos++; })
  .finally(async () => {
    for (const id of creados) {
      await prisma.pago.deleteMany({ where: { clienteId: id } });
      await prisma.conversacion.deleteMany({ where: { agente: { clienteId: id } } });
      await prisma.usoMensual.deleteMany({ where: { agente: { clienteId: id } } });
      await prisma.cancha.deleteMany({ where: { agente: { clienteId: id } } });
      await prisma.agente.deleteMany({ where: { clienteId: id } });
      await prisma.usuario.deleteMany({ where: { clienteId: id } });
      await prisma.cliente.delete({ where: { id } }).catch(() => {});
    }
    console.log(`\n${creados.length} cliente(s) de prueba eliminados`);
    console.log(fallos === 0 ? "Todo OK." : `${fallos} fallo(s).`);
    process.exitCode = fallos === 0 ? 0 : 1;
    await prisma.$disconnect();
  });
