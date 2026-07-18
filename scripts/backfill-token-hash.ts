/**
 * Rellena tokenIntegracionHash para los agentes que ya tenían token.
 *
 * El hash se agregó en el sprint 4 para resolver una llamada de n8n a su agente
 * por índice. Los agentes creados antes tienen solo el token cifrado; este
 * script lo descifra y calcula el hash, sin cambiar el token en sí — así los
 * workflows de n8n que ya lo usen siguen funcionando.
 *
 * Es idempotente: saltea los que ya tienen hash. Corré una vez por entorno.
 */

import "dotenv/config";

import { descifrar } from "../src/lib/crypto";
import { prisma } from "../src/lib/prisma";
import { hashToken } from "../src/lib/tokens";

async function main() {
  const agentes = await prisma.agente.findMany({
    where: { tokenIntegracionEnc: { not: null }, tokenIntegracionHash: null },
    select: { id: true, nombre: true, tokenIntegracionEnc: true },
  });

  if (agentes.length === 0) {
    console.log("Nada que rellenar: todos los agentes con token ya tienen hash.");
    return;
  }

  let ok = 0;
  for (const agente of agentes) {
    try {
      const token = descifrar(agente.tokenIntegracionEnc as string);
      await prisma.agente.update({
        where: { id: agente.id },
        data: { tokenIntegracionHash: hashToken(token) },
      });
      ok++;
      console.log(`  ${agente.nombre}: hash rellenado`);
    } catch (error) {
      // Si no se puede descifrar (ENCRYPTION_KEY distinta), se avisa y se sigue:
      // ese agente va a necesitar que le regeneren el token desde el admin.
      console.error(
        `  ${agente.nombre}: NO se pudo descifrar el token — regenerarlo desde el admin. ${
          (error as Error).message
        }`,
      );
    }
  }

  console.log(`\n${ok}/${agentes.length} agentes rellenados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
