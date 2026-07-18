/**
 * Verifica los endpoints de integración simulando las llamadas de n8n.
 *
 * El token vive solo dentro de este proceso: se descifra desde la base y se usa
 * en los headers, nunca se imprime. Prueba el camino feliz y, sobre todo, que
 * la autenticación rechace lo que tiene que rechazar.
 *
 * Requiere: dev server en :3000, y el agente apuntado al simulador de Evolution.
 *   NODE_OPTIONS="--conditions=react-server" VIBO_AGENTE=<id> npx tsx scripts/probar-integracion.ts
 */

import "dotenv/config";

import { cifrar, descifrar } from "../src/lib/crypto";
import { prisma } from "../src/lib/prisma";

const BASE = process.env.VIBO_BASE ?? "http://localhost:3000";
const AGENTE = process.env.VIBO_AGENTE;
const EVOLUTION_SIM = process.env.EVOLUTION_SIM ?? "http://localhost:8977";

let fallos = 0;
function chequear(nombre: string, ok: boolean, detalle = "") {
  console.log(`  ${ok ? "OK  " : "FALLO"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos++;
}

async function main() {
  if (!AGENTE) throw new Error("Falta VIBO_AGENTE");

  const agente = await prisma.agente.findUnique({
    where: { id: AGENTE },
    select: { id: true, estado: true, tokenIntegracionEnc: true },
  });
  if (!agente?.tokenIntegracionEnc) {
    throw new Error("El agente no tiene token. Regeneralo desde el admin.");
  }

  // Apunta la URL de Evolution del agente al simulador, para que el envío no
  // toque nada real. Se guarda cifrado, como cualquier credencial.
  await prisma.agente.update({
    where: { id: AGENTE },
    data: { evolutionApiUrlEnc: cifrar(EVOLUTION_SIM), evolutionApiKeyEnc: cifrar("sim-key") },
  });
  console.log(`Agente apuntado al Evolution simulado (${EVOLUTION_SIM}).`);

  const token = descifrar(agente.tokenIntegracionEnc);
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const telefono = `54911${Date.now().toString().slice(-8)}`;

  console.log("\n--- Autenticación ---");

  const sinToken = await fetch(`${BASE}/api/integracion/agentes/${AGENTE}/puede-responder`);
  chequear("sin token → 401", sinToken.status === 401, `status ${sinToken.status}`);

  const tokenMalo = await fetch(`${BASE}/api/integracion/agentes/${AGENTE}/puede-responder`, {
    headers: { Authorization: "Bearer token-que-no-existe" },
  });
  chequear("token inválido → 401", tokenMalo.status === 401, `status ${tokenMalo.status}`);

  const otroAgente = await fetch(
    `${BASE}/api/integracion/agentes/otro-agente-id/puede-responder`,
    { headers: auth },
  );
  chequear(
    "token válido pero otro agenteId en la URL → 403",
    otroAgente.status === 403,
    `status ${otroAgente.status}`,
  );

  console.log("\n--- puede-responder ---");

  const puede = await fetch(`${BASE}/api/integracion/agentes/${AGENTE}/puede-responder`, {
    headers: auth,
  });
  const puedeJson = await puede.json();
  chequear(
    "agente activo → puedeResponder true",
    puede.status === 200 && puedeJson.puedeResponder === true,
    JSON.stringify(puedeJson),
  );

  console.log("\n--- log de mensajes ---");

  const entrante = await fetch(`${BASE}/api/integracion/mensajes`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      agenteId: AGENTE,
      telefono,
      remitente: "CONTACTO",
      contenido: "Hola, ¿tenés cancha el sábado a las 20?",
      contactoNombre: "Cliente de Prueba",
    }),
  });
  const entranteJson = await entrante.json();
  chequear(
    "CONTACTO → 201 y estado IA_RESPONDIENDO",
    entrante.status === 201 && entranteJson.estado === "IA_RESPONDIENDO",
    JSON.stringify(entranteJson),
  );

  const respuestaIa = await fetch(`${BASE}/api/integracion/mensajes`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      agenteId: AGENTE,
      telefono,
      remitente: "IA",
      contenido: "¡Hola! Sí, tengo la Cancha 2 libre a las 20. ¿Te la reservo?",
      evolutionMsgId: "wamid.test123",
    }),
  });
  const respuestaIaJson = await respuestaIa.json();
  chequear(
    "IA → 201 y estado ABIERTA",
    respuestaIa.status === 201 && respuestaIaJson.estado === "ABIERTA",
    JSON.stringify(respuestaIaJson),
  );

  // El mismo teléfono no crea una segunda conversación.
  const conteo = await prisma.conversacion.count({ where: { agenteId: AGENTE, contactoTelefono: telefono } });
  chequear("una sola conversación por contacto", conteo === 1, `conversaciones: ${conteo}`);

  const mensajes = await prisma.mensaje.count({
    where: { conversacion: { agenteId: AGENTE, contactoTelefono: telefono } },
  });
  chequear("dos mensajes registrados", mensajes === 2, `mensajes: ${mensajes}`);

  console.log("\n--- rechazo de cuerpo inválido ---");

  const remitenteMalo = await fetch(`${BASE}/api/integracion/mensajes`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ agenteId: AGENTE, telefono, remitente: "HUMANO", contenido: "x" }),
  });
  chequear(
    "remitente HUMANO por el endpoint → 400",
    remitenteMalo.status === 400,
    `status ${remitenteMalo.status}`,
  );

  const otroEnCuerpo = await fetch(`${BASE}/api/integracion/mensajes`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ agenteId: "otro-id", telefono, remitente: "IA", contenido: "x" }),
  });
  chequear(
    "agenteId ajeno en el cuerpo → 403",
    otroEnCuerpo.status === 403,
    `status ${otroEnCuerpo.status}`,
  );

  console.log(`\n${fallos === 0 ? "Todo OK." : `${fallos} chequeo(s) fallaron.`}`);
  if (fallos > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
