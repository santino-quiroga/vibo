-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('SIN_SUSCRIPCION', 'AL_DIA', 'EN_GRACIA', 'VENCIDO');

-- CreateEnum
CREATE TYPE "EstadoPagoRegistro" AS ENUM ('APROBADO', 'RECHAZADO', 'PENDIENTE');

-- CreateEnum
CREATE TYPE "OrigenPago" AS ENUM ('MERCADOPAGO', 'MANUAL');

-- AlterEnum
ALTER TYPE "EstadoAgente" ADD VALUE 'PAUSADO_POR_PAGO';

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "estadoPago" "EstadoPago" NOT NULL DEFAULT 'SIN_SUSCRIPCION',
ADD COLUMN     "fechaProximoCobro" TIMESTAMP(3),
ADD COLUMN     "graciaDesde" TIMESTAMP(3),
ADD COLUMN     "mercadoPagoSubscriptionId" TEXT,
ADD COLUMN     "ultimoAvisoPagoEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "mercadoPagoPlanId" TEXT,
ADD COLUMN     "precio" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoPagoRegistro" NOT NULL,
    "origen" "OrigenPago" NOT NULL,
    "mpPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pago_mpPaymentId_key" ON "Pago"("mpPaymentId");

-- CreateIndex
CREATE INDEX "Pago_clienteId_fecha_idx" ON "Pago"("clienteId", "fecha");

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

