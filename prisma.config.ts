import "dotenv/config";
import { defineConfig } from "prisma/config";

// Este archivo lo usa SOLO el CLI de Prisma (migrate, studio, generate).
// El cliente en runtime se configura aparte, en src/lib/prisma.ts.
//
// Por eso la URL de acá puede ser distinta a la de la app: las migraciones
// necesitan una conexión directa. Prisma toma un advisory lock al migrar, y eso
// falla a través del connection pooler de Neon (PgBouncer en modo transaction).
// En Vercel: DATABASE_URL apunta al pooler (la app) y DIRECT_URL a la conexión
// directa (las migraciones del build).
/**
 * Devuelve la variable solo si tiene contenido real.
 *
 * No alcanza con `??`: una variable declarada pero vacía (`DIRECT_URL=` en un
 * .env, o una variable en blanco cargada en Vercel) es un string vacío, no
 * undefined, así que `??` no caería al valor de respaldo y Prisma fallaría con
 * "Connection url is empty".
 */
function env(nombre: string): string | undefined {
  const valor = process.env[nombre];
  return valor && valor.trim() !== "" ? valor : undefined;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL") ?? env("DATABASE_URL"),
    // Solo la usa `prisma migrate dev` en desarrollo. En Vercel corre
    // `prisma migrate deploy`, que no necesita shadow database.
    shadowDatabaseUrl: env("SHADOW_DATABASE_URL"),
  },
});
