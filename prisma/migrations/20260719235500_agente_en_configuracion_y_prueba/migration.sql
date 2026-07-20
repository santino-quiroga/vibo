-- AlterEnum
ALTER TYPE "EstadoAgente" ADD VALUE 'EN_CONFIGURACION';

-- CreateTable
CREATE TABLE "PruebaAgenteUso" (
    "id" TEXT NOT NULL,
    "agenteId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "mensajesCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PruebaAgenteUso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PruebaAgenteUso_agenteId_fecha_key" ON "PruebaAgenteUso"("agenteId", "fecha");

-- AddForeignKey
ALTER TABLE "PruebaAgenteUso" ADD CONSTRAINT "PruebaAgenteUso_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

