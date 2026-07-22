-- CreateTable
CREATE TABLE "TarifaFranja" (
    "id" TEXT NOT NULL,
    "canchaId" TEXT NOT NULL,
    "horaDesde" TEXT NOT NULL,
    "horaHasta" TEXT NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "TarifaFranja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TarifaFranja_canchaId_idx" ON "TarifaFranja"("canchaId");

-- AddForeignKey
ALTER TABLE "TarifaFranja" ADD CONSTRAINT "TarifaFranja_canchaId_fkey" FOREIGN KEY ("canchaId") REFERENCES "Cancha"("id") ON DELETE CASCADE ON UPDATE CASCADE;
