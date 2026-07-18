/**
 * Un Evolution API de mentira, para probar el envío manual sin mandar WhatsApps.
 *
 * Enviar por Evolution manda un mensaje real a un número real. El SDD (9.3)
 * prohíbe apuntar entornos que no sean producción a la infraestructura real de
 * un cliente, y con más razón acá, donde el efecto es un mensaje a un tercero.
 * Este simulador imita el endpoint de envío para verificar el flujo completo
 * (acción → cliente Evolution → registro del mensaje HUMANO) sin efectos afuera.
 *
 * Imita Evolution API v2: POST /message/sendText/:instancia con header apikey,
 * body { number, text }, respuesta con key.id.
 *
 *   npx tsx scripts/evolution-simulado.ts
 *   Después, apuntá el agente al simulador con scripts/apuntar-evolution.ts
 */

import { createServer } from "node:http";

const PUERTO = Number(process.env.PUERTO ?? 8977);

let contador = 0;
const enviados: Array<{ number: string; text: string; id: string }> = [];

const servidor = createServer((req, res) => {
  const responder = (status: number, cuerpo: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(cuerpo));
  };

  // Health / inspección: ver qué se "envió".
  if (req.method === "GET" && req.url === "/_enviados") {
    return responder(200, enviados);
  }

  if (req.method !== "POST" || !req.url?.startsWith("/message/sendText/")) {
    return responder(404, { error: "not found" });
  }

  // Evolution valida la API key por el header apikey.
  if (!req.headers["apikey"]) {
    return responder(401, { error: "missing apikey" });
  }

  let cuerpo = "";
  req.on("data", (chunk) => (cuerpo += chunk));
  req.on("end", () => {
    let datos: { number?: string; text?: string };
    try {
      datos = JSON.parse(cuerpo);
    } catch {
      return responder(400, { error: "invalid json" });
    }

    if (!datos.number || !datos.text) {
      return responder(400, { error: "number y text son obligatorios" });
    }

    contador++;
    const id = `SIM${String(contador).padStart(6, "0")}`;
    enviados.push({ number: datos.number, text: datos.text, id });
    console.log(`  → a ${datos.number}: ${JSON.stringify(datos.text).slice(0, 60)}  [${id}]`);

    // La forma de respuesta que devuelve Evolution API v2.
    responder(201, {
      key: { remoteJid: `${datos.number}@s.whatsapp.net`, fromMe: true, id },
      status: "PENDING",
    });
  });
});

servidor.listen(PUERTO, () => {
  console.log(`Evolution simulado en http://localhost:${PUERTO}`);
  console.log(`  Ver lo "enviado": curl http://localhost:${PUERTO}/_enviados\n`);
});
