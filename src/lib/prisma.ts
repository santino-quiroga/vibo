import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

// En dev, Next.js recarga los módulos en cada cambio. Sin este singleton cada
// recarga abriría un pool nuevo hasta agotar las conexiones de Postgres.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("Falta la variable de entorno DATABASE_URL");
  }

  // Prisma 7 ya no trae engine propio: la conexión va por un driver adapter.
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
