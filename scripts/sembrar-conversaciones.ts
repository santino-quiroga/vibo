/**
 * Siembra conversaciones de prueba a través de los endpoints de integración.
 *
 * Usa la API real (como haría n8n), no inserts directos: así lo que se ve en la
 * bandeja pasó por el mismo camino que en producción. Ayuda de desarrollo.
 */

import "dotenv/config";

import { descifrar } from "../src/lib/crypto";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.VIBO_BASE ?? "http://localhost:3000";
const AGENTE = process.env.VIBO_AGENTE;

const CONTACTOS = [
  { nombre: "Martina Gómez", tel: "5491144440001", estado: "activa" },
  { nombre: "Diego Fernández", tel: "5491144440002", estado: "activa" },
  { nombre: "Lucía Paredes", tel: "5491144440003", estado: "requiere" },
  { nombre: "Tomás Rivas", tel: "5491144440004", estado: "sin_leer" },
];

async function main() {
  if (!AGENTE) throw new Error("Falta VIBO_AGENTE");
  const agente = await prisma.agente.findUnique({
    where: { id: AGENTE },
    select: { tokenIntegracionEnc: true },
  });
  if (!agente?.tokenIntegracionEnc) throw new Error("El agente no tiene token.");

  const token = descifrar(agente.tokenIntegracionEnc);
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const log = (agenteId: string, tel: string, remitente: string, contenido: string, nombre?: string) =>
    fetch(`${BASE}/api/integracion/mensajes`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ agenteId, telefono: tel, remitente, contenido, contactoNombre: nombre }),
    });

  for (const c of CONTACTOS) {
    await log(AGENTE, c.tel, "CONTACTO", "Hola, quería consultar por un turno.", c.nombre);
    if (c.estado !== "sin_leer") {
      await log(AGENTE, c.tel, "IA", "¡Hola! Claro, ¿para qué día lo buscás?");
      await log(AGENTE, c.tel, "CONTACTO", "El sábado a la tarde si hay.");
    }
    if (c.estado === "requiere") {
      // Toma de control: la marcamos como que requiere atención humana.
      const conv = await prisma.conversacion.findUnique({
        where: { agenteId_contactoTelefono: { agenteId: AGENTE, contactoTelefono: c.tel } },
        select: { id: true },
      });
      if (conv) {
        await prisma.conversacion.update({
          where: { id: conv.id },
          data: { pausadaManual: true, estado: "REQUIERE_ATENCION_HUMANA" },
        });
      }
    }
    console.log(`  sembrada: ${c.nombre} (${c.estado})`);
  }

  console.log("\nListo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
