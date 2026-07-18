/**
 * Imprime el estado de los datos de prueba locales.
 *
 * Es una ayuda de desarrollo, no parte del producto: sirve para saber con qué
 * usuario entrar y qué agentes existen sin tener que abrir Prisma Studio.
 */

import "dotenv/config";

import { prisma } from "../src/lib/prisma";

async function main() {
  const clientes = await prisma.cliente.findMany({
    select: {
      id: true,
      nombre: true,
      plan: { select: { nombre: true } },
      usuarios: { select: { email: true, rol: true } },
      agentes: {
        select: {
          id: true,
          nombre: true,
          estado: true,
          airtableBaseId: true,
          _count: { select: { canchas: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const c of clientes) {
    console.log(`\n${c.nombre}  [plan ${c.plan.nombre}]`);
    for (const u of c.usuarios) console.log(`   usuario: ${u.email}  (${u.rol})`);
    for (const a of c.agentes) {
      console.log(
        `   agente:  ${a.nombre} | ${a.estado} | base ${a.airtableBaseId} | ${a._count.canchas} cancha(s) | ${a.id}`,
      );
    }
    if (c.agentes.length === 0) console.log("   (sin agentes)");
  }
  console.log();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
