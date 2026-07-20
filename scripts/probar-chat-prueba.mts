/**
 * Verifica el chat de prueba (SDD v2 §3) sin pasar por la UI.
 *
 * Lo que importa probar no es que OpenAI conteste, sino las cuatro promesas del
 * sandbox: que NO persista nada, que NO consuma el plan, que respete el tope
 * diario, y que use la config real del agente.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { TOPE_DIARIO, cupoRestante, responderPrueba } from "../src/lib/agentes/prueba";

const A = process.env.VIBO_AGENTE!;
let fallos = 0;
const chequear = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "OK  " : "FALLO"} ${n}${d ? ` — ${d}` : ""}`);
  if (!ok) fallos++;
};

const contar = async () => ({
  conversaciones: await prisma.conversacion.count({ where: { agenteId: A } }),
  mensajes: await prisma.mensaje.count({ where: { conversacion: { agenteId: A } } }),
  uso: (await prisma.usoMensual.aggregate({ where: { agenteId: A }, _sum: { conversacionesCount: true } }))._sum.conversacionesCount ?? 0,
});

const antes = await contar();
const cupoAntes = await cupoRestante(A);
console.log(`estado inicial: ${antes.conversaciones} conv, ${antes.mensajes} msg, uso ${antes.uso}, cupo ${cupoAntes}/${TOPE_DIARIO}\n`);

console.log("--- Responde usando la config real del agente ---");
const r = await responderPrueba(A, [
  { rol: "user", contenido: "hola! cuanto sale la cancha y cuanto dura el turno?" },
]);

if (!r.ok) {
  chequear("respondió", false, r.error);
} else {
  chequear("respondió", true);
  console.log(`  respuesta: ${r.respuesta.replace(/\n/g, " ").slice(0, 160)}`);
  chequear("menciona el precio real ($48.000)", /48[.,]?000/.test(r.respuesta));
  chequear("menciona la duración real (90)", /90/.test(r.respuesta));
  chequear("descontó del cupo", r.restantes === cupoAntes - 1, `${cupoAntes} -> ${r.restantes}`);
}

console.log("\n--- Las 3 promesas del sandbox (§3) ---");
const despues = await contar();
chequear("NO creó conversaciones", despues.conversaciones === antes.conversaciones, `${antes.conversaciones} -> ${despues.conversaciones}`);
chequear("NO creó mensajes", despues.mensajes === antes.mensajes, `${antes.mensajes} -> ${despues.mensajes}`);
chequear("NO consumió el plan", despues.uso === antes.uso, `uso ${antes.uso} -> ${despues.uso}`);

console.log("\n--- Tope diario ---");
const fecha = new Date();
const dia = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
// Se lleva el contador al tope para probar el rechazo sin gastar 30 llamadas.
await prisma.pruebaAgenteUso.upsert({
  where: { agenteId_fecha: { agenteId: A, fecha: dia } },
  create: { agenteId: A, fecha: dia, mensajesCount: TOPE_DIARIO },
  update: { mensajesCount: TOPE_DIARIO },
});
const bloqueado = await responderPrueba(A, [{ rol: "user", contenido: "otra" }]);
chequear("con el cupo agotado, rechaza", !bloqueado.ok, bloqueado.ok ? "" : bloqueado.error);

const filaFinal = await prisma.pruebaAgenteUso.findUnique({
  where: { agenteId_fecha: { agenteId: A, fecha: dia } },
  select: { mensajesCount: true },
});
chequear(
  "un intento rechazado NO sigue subiendo el contador",
  filaFinal?.mensajesCount === TOPE_DIARIO,
  `quedó en ${filaFinal?.mensajesCount}`,
);

// Se limpia el contador de la prueba para no dejar la sede sin cupo real.
await prisma.pruebaAgenteUso.deleteMany({ where: { agenteId: A, fecha: dia } });
console.log("  contador de prueba limpiado");

console.log(`\n${fallos === 0 ? "Todo OK." : `${fallos} fallo(s).`}`);
await prisma.$disconnect();
process.exitCode = fallos === 0 ? 0 : 1;
