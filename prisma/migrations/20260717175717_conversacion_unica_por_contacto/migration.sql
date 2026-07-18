-- DropIndex
DROP INDEX "Conversacion_agenteId_contactoTelefono_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Conversacion_agenteId_contactoTelefono_key" ON "Conversacion"("agenteId", "contactoTelefono");

