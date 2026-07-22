-- AlterTable: descripción libre por cancha
ALTER TABLE "Cancha" ADD COLUMN     "descripcion" TEXT;

-- AlterTable: día de anclaje del ciclo de conversaciones (renovación = 1 mes post-pago)
ALTER TABLE "Cliente" ADD COLUMN     "cicloDiaAnclaje" INTEGER;

-- CreateTable: precios diferenciales por franja horaria
CREATE TABLE "TramoPrecio" (
    "id" TEXT NOT NULL,
    "canchaId" TEXT NOT NULL,
    "desde" TEXT NOT NULL,
    "hasta" TEXT NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "TramoPrecio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TramoPrecio_canchaId_idx" ON "TramoPrecio"("canchaId");

-- AddForeignKey
ALTER TABLE "TramoPrecio" ADD CONSTRAINT "TramoPrecio_canchaId_fkey" FOREIGN KEY ("canchaId") REFERENCES "Cancha"("id") ON DELETE CASCADE ON UPDATE CASCADE;
