-- AlterTable
ALTER TABLE "Agente" ADD COLUMN     "ultimoErrorIntegracionAt" TIMESTAMP(3),
ADD COLUMN     "ultimoErrorIntegracionMsg" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "ultimoAccesoAt" TIMESTAMP(3);

