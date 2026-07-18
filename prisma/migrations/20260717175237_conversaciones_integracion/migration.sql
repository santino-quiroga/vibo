-- AlterTable
ALTER TABLE "Agente" ADD COLUMN     "tokenIntegracionHash" TEXT;

-- AlterTable
ALTER TABLE "Conversacion" ADD COLUMN     "leidaAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Agente_tokenIntegracionHash_key" ON "Agente"("tokenIntegracionHash");

-- CreateIndex
CREATE INDEX "Conversacion_agenteId_ultimoMensajeAt_idx" ON "Conversacion"("agenteId", "ultimoMensajeAt");

