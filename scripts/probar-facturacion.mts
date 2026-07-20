/**
 * Prueba el ciclo de facturación completo (SDD v2 §4) sobre un cliente de juguete.
 *
 * NO usa el cliente real: crea uno propio y lo borra al final. Lo que se prueba
 * es la máquina de estados —al día, gracia, vencido, pausa, pago— que es donde
 * un error se traduce en cortarle el servicio a alguien que pagó, o en no
 * cortárselo a alguien que no.
 */
import "dotenv/config";

import { aplicarPago, type PagoMercadoPago } from "../src/lib/pagos/mercadopago";
import { procesarCobranza, diasDeGracia } from "../src/lib/pagos/cobranza-cron";
import { prisma } from "../src/lib/prisma";

let fallos = 0;
const chequear = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "OK  " : "FALLO"} ${n}${d ? ` — ${d}` : ""}`);
  if (!ok) fallos++;
};

const SUFIJO = Date.now().toString().slice(-6);
const DIA_MS = 24 * 60 * 60 * 1000;

async function main() {
  const plan = await prisma.plan.findFirstOrThrow({ select: { id: true } });

  const cliente = await prisma.cliente.create({
    data: {
      nombre: `ZZ Prueba Facturación ${SUFIJO}`,
      planId: plan.id,
      mercadoPagoSubscriptionId: `sub-prueba-${SUFIJO}`,
      usuarios: {
        create: {
          email: `zz-prueba-${SUFIJO}@ejemplo.test`,
          passwordHash: "x",
          rol: "CLIENTE_OWNER",
        },
      },
      agentes: {
        create: {
          nombre: "Sede de prueba",
          deporte: "Padel",
          estado: "ACTIVO",
          promptBase: "prueba",
          airtableBaseId: "app0",
          airtableApiKeyEnc: "x",
          evolutionInstanceId: "i",
          evolutionApiUrlEnc: "x",
          evolutionApiKeyEnc: "x",
        },
      },
    },
    select: { id: true },
  });
  console.log(`cliente de prueba: ${cliente.id}\n`);

  const estado = async () => {
    const c = await prisma.cliente.findUniqueOrThrow({
      where: { id: cliente.id },
      select: { estadoPago: true, graciaDesde: true, fechaProximoCobro: true },
    });
    const agentes = await prisma.agente.findMany({
      where: { clienteId: cliente.id },
      select: { estado: true },
    });
    return { ...c, agentes: agentes.map((a) => a.estado) };
  };

  const pago = (over: Partial<PagoMercadoPago>): PagoMercadoPago => ({
    id: `mp-${SUFIJO}-${Math.random().toString(36).slice(2, 8)}`,
    estado: "APROBADO",
    monto: 50000,
    fecha: new Date(),
    suscripcionId: `sub-prueba-${SUFIJO}`,
    emailPagador: null,
    ...over,
  });

  try {
    console.log("--- Pago aprobado: queda al día ---");
    const aprobado = pago({});
    await aplicarPago(aprobado);
    let e = await estado();
    chequear("estadoPago AL_DIA", e.estadoPago === "AL_DIA", e.estadoPago);
    chequear("se fijó el próximo cobro", e.fechaProximoCobro !== null);

    console.log("\n--- El mismo webhook otra vez: no duplica (MP reintenta) ---");
    const r = await aplicarPago(aprobado);
    chequear("marcado como duplicado", r.aplicado && r.duplicado);
    chequear(
      "hay un solo pago registrado",
      (await prisma.pago.count({ where: { clienteId: cliente.id } })) === 1,
    );

    console.log("\n--- Pago rechazado: entra en gracia, SIN cortar todavía ---");
    await aplicarPago(pago({ estado: "RECHAZADO" }));
    e = await estado();
    chequear("estadoPago EN_GRACIA", e.estadoPago === "EN_GRACIA", e.estadoPago);
    chequear("arrancó el reloj de gracia", e.graciaDesde !== null);
    chequear(
      "el agente sigue ACTIVO (la gracia no corta)",
      e.agentes.every((x) => x === "ACTIVO"),
      e.agentes.join(","),
    );

    console.log("\n--- Otro rechazo: NO reinicia el reloj de gracia ---");
    const graciaOriginal = (await estado()).graciaDesde!.getTime();
    await aplicarPago(pago({ estado: "RECHAZADO" }));
    chequear(
      "graciaDesde no se movió",
      (await estado()).graciaDesde!.getTime() === graciaOriginal,
      "si se reiniciara, la deuda no vencería nunca",
    );

    console.log("\n--- Cron a mitad de la gracia: avisa pero no corta ---");
    const gracia = diasDeGracia();
    await prisma.cliente.update({
      where: { id: cliente.id },
      data: { graciaDesde: new Date(Date.now() - Math.floor(gracia / 2) * DIA_MS) },
    });
    const mitad = await procesarCobranza();
    e = await estado();
    chequear("mandó el recordatorio", mitad.recordatoriosEnviados === 1);
    chequear("todavía no venció", e.estadoPago === "EN_GRACIA", e.estadoPago);
    chequear("el agente sigue ACTIVO", e.agentes.every((x) => x === "ACTIVO"));

    console.log("\n--- Cron con la gracia vencida: corta el servicio ---");
    await prisma.cliente.update({
      where: { id: cliente.id },
      data: { graciaDesde: new Date(Date.now() - (gracia + 1) * DIA_MS) },
    });
    const corte = await procesarCobranza();
    e = await estado();
    chequear("cliente VENCIDO", e.estadoPago === "VENCIDO", e.estadoPago);
    chequear("pausó el agente", corte.agentesPausados === 1, `${corte.agentesPausados}`);
    chequear(
      "el agente quedó PAUSADO_POR_PAGO",
      e.agentes.every((x) => x === "PAUSADO_POR_PAGO"),
      e.agentes.join(","),
    );

    console.log("\n--- Correr el cron de nuevo: idempotente ---");
    const otra = await procesarCobranza();
    chequear("no vuelve a pausar ni avisar", otra.clientesVencidos === 0 && otra.agentesPausados === 0);

    console.log("\n--- Paga: se reactiva solo ---");
    await aplicarPago(pago({ estado: "APROBADO" }));
    e = await estado();
    chequear("estadoPago AL_DIA", e.estadoPago === "AL_DIA", e.estadoPago);
    chequear("se limpió el reloj de gracia", e.graciaDesde === null);
    chequear(
      "el agente volvió a ACTIVO",
      e.agentes.every((x) => x === "ACTIVO"),
      e.agentes.join(","),
    );

    console.log("\n--- Un pago de otra suscripción no toca a nadie ---");
    const ajeno = await aplicarPago(pago({ suscripcionId: "sub-que-no-existe" }));
    chequear("no se aplica", !ajeno.aplicado, ajeno.aplicado ? "" : ajeno.motivo);
  } finally {
    // Se limpia siempre: un cliente de prueba colgado ensucia el admin.
    await prisma.pago.deleteMany({ where: { clienteId: cliente.id } });
    await prisma.agente.deleteMany({ where: { clienteId: cliente.id } });
    await prisma.usuario.deleteMany({ where: { clienteId: cliente.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    console.log("\ncliente de prueba eliminado");
  }

  console.log(`\n${fallos === 0 ? "Todo OK." : `${fallos} fallo(s).`}`);
  process.exitCode = fallos === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
