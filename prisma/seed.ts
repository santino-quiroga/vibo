/**
 * Seed de datos de desarrollo.
 *
 * Solo carga los tres planes en borrador. Los números son placeholders a
 * propósito: el punto 4.2 del documento de requerimientos deja los límites
 * reales sin definir hasta que se fijen precios, y el sprint 6 los ajusta.
 *
 * Uso: npm run db:seed
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const PLANES_BORRADOR = [
  { nombre: "Starter", maxAgentes: 1, maxConversacionesMes: 200 },
  { nombre: "Profesional", maxAgentes: 3, maxConversacionesMes: 500 },
  { nombre: "Multi-sede", maxAgentes: 10, maxConversacionesMes: 2000 },
];

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  for (const plan of PLANES_BORRADOR) {
    // Plan.nombre no es unique en el schema (el SDD no lo define así), por eso
    // se busca antes de crear en vez de usar upsert.
    const existente = await prisma.plan.findFirst({
      where: { nombre: plan.nombre },
    });

    if (existente) {
      await prisma.plan.update({ where: { id: existente.id }, data: plan });
      console.log(`Plan actualizado: ${plan.nombre}`);
    } else {
      await prisma.plan.create({ data: plan });
      console.log(`Plan creado: ${plan.nombre}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
