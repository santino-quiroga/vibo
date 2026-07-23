-- Notificación al dueño (SDD v2 §12): número de WhatsApp para avisos operativos.
-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "telefonoWhatsapp" TEXT;

-- Idempotencia del aviso de "requiere atención humana" (SDD v2 §12).
-- AlterTable
ALTER TABLE "Conversacion" ADD COLUMN     "atencionHumanaNotificadaAt" TIMESTAMP(3);
