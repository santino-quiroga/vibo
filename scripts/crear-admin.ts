/**
 * Crea (o actualiza) un usuario VIBO_ADMIN.
 *
 * Es el arranque en frío del sistema: como no hay registro público, sin este
 * script no habría manera de entrar por primera vez. El alta de clientes y de
 * los demás usuarios se hace desde el admin interno a partir del sprint 2.
 *
 * Uso:
 *   npm run crear-admin -- alguien@vibo.ar 'una-password-larga'
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    console.error("Uso: npm run crear-admin -- <email> <password>");
    process.exit(1);
  }

  if (password.length < 10) {
    console.error("La contraseña tiene que tener al menos 10 caracteres.");
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  const passwordHash = await bcrypt.hash(password, 12);

  const usuario = await prisma.usuario.upsert({
    where: { email: email.toLowerCase() },
    create: {
      email: email.toLowerCase(),
      passwordHash,
      rol: "VIBO_ADMIN",
      // clienteId queda null: un VIBO_ADMIN no pertenece a ningún cliente.
    },
    update: { passwordHash, rol: "VIBO_ADMIN" },
  });

  console.log(`Listo. VIBO_ADMIN: ${usuario.email} (id ${usuario.id})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
