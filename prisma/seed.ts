/**
 * Seed de datos de desarrollo.
 *
 * Carga los tres planes. Los precios **ya no son borrador** (SDD v2 §4.2):
 * Mercado Pago exige un monto real para crear la suscripción, así que se
 * cerraron al implementar la facturación.
 *
 * Uso: npm run db:seed
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

/** Precios mensuales en pesos, definidos por el usuario el 2026-07-19. */
const PLANES = [
  { nombre: "Starter", maxAgentes: 1, maxConversacionesMes: 200, precio: 150000 },
  { nombre: "Profesional", maxAgentes: 3, maxConversacionesMes: 500, precio: 350000 },
  { nombre: "Multi-sede", maxAgentes: 10, maxConversacionesMes: 2000, precio: 750000 },
];

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  for (const plan of PLANES) {
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
