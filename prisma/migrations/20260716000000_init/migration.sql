-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('CLIENTE_OWNER', 'VIBO_ADMIN');

-- CreateEnum
CREATE TYPE "EstadoAgente" AS ENUM ('ACTIVO', 'PAUSADO_MANUAL', 'PAUSADO_LIMITE');

-- CreateEnum
CREATE TYPE "EstadoConversacion" AS ENUM ('ABIERTA', 'IA_RESPONDIENDO', 'REQUIERE_ATENCION_HUMANA', 'CERRADA');

-- CreateEnum
CREATE TYPE "RemitenteMensaje" AS ENUM ('CONTACTO', 'IA', 'HUMANO');

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL,
    "clienteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "maxAgentes" INTEGER NOT NULL,
    "maxConversacionesMes" INTEGER NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "deporte" TEXT NOT NULL,
    "estado" "EstadoAgente" NOT NULL DEFAULT 'ACTIVO',
    "promptBase" TEXT NOT NULL,
    "airtableBaseId" TEXT NOT NULL,
    "airtableApiKeyEnc" TEXT NOT NULL,
    "evolutionInstanceId" TEXT NOT NULL,
    "evolutionApiUrlEnc" TEXT NOT NULL,
    "evolutionApiKeyEnc" TEXT NOT NULL,
    "n8nWorkflowId" TEXT,
    "tokenIntegracionEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cancha" (
    "id" TEXT NOT NULL,
    "agenteId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,
    "duracionTurnoMin" INTEGER NOT NULL,
    "horarioApertura" TEXT NOT NULL,
    "horarioCierre" TEXT NOT NULL,

    CONSTRAINT "Cancha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsoMensual" (
    "id" TEXT NOT NULL,
    "agenteId" TEXT NOT NULL,
    "cicloInicio" TIMESTAMP(3) NOT NULL,
    "cicloFin" TIMESTAMP(3) NOT NULL,
    "conversacionesCount" INTEGER NOT NULL DEFAULT 0,
    "limiteAlcanzadoEn" TIMESTAMP(3),

    CONSTRAINT "UsoMensual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversacion" (
    "id" TEXT NOT NULL,
    "agenteId" TEXT NOT NULL,
    "contactoTelefono" TEXT NOT NULL,
    "contactoNombre" TEXT,
    "estado" "EstadoConversacion" NOT NULL DEFAULT 'ABIERTA',
    "pausadaManual" BOOLEAN NOT NULL DEFAULT false,
    "ultimoMensajeAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensaje" (
    "id" TEXT NOT NULL,
    "conversacionId" TEXT NOT NULL,
    "remitente" "RemitenteMensaje" NOT NULL,
    "contenido" TEXT NOT NULL,
    "evolutionMsgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mensaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_usuarioId_idx" ON "PasswordResetToken"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Cancha_agenteId_numero_key" ON "Cancha"("agenteId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "UsoMensual_agenteId_cicloInicio_key" ON "UsoMensual"("agenteId", "cicloInicio");

-- CreateIndex
CREATE INDEX "Conversacion_agenteId_contactoTelefono_idx" ON "Conversacion"("agenteId", "contactoTelefono");

-- CreateIndex
CREATE INDEX "Mensaje_conversacionId_createdAt_idx" ON "Mensaje"("conversacionId", "createdAt");

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agente" ADD CONSTRAINT "Agente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cancha" ADD CONSTRAINT "Cancha_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsoMensual" ADD CONSTRAINT "UsoMensual_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversacion" ADD CONSTRAINT "Conversacion_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensaje" ADD CONSTRAINT "Mensaje_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "Conversacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
