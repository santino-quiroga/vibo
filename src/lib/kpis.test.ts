/**
 * Pruebas de las fórmulas del punto 6.1.
 *
 * Se corren con `npm test` (node:test, sin framework: no hace falta más para
 * funciones puras). Cubren sobre todo los casos donde un cálculo mal hecho
 * daría un número creíble pero falso — que son los peligrosos, porque nadie los
 * sale a buscar.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Reserva, Slot } from "@/lib/airtable/tipos";
import {
  calcularOcupacion,
  ingresosEstimados,
  ocurrenciasPorDia,
  precioEnTramo,
  tasaConversion,
  turnosReservados,
  variacion,
  type CanchaConfig,
} from "@/lib/kpis";

function reserva(parcial: Partial<Reserva> & { fecha: string }): Reserva {
  return {
    recordId: `rec${Math.random().toString(36).slice(2, 10)}`,
    idReserva: null,
    nombre: "Test",
    telefono: null,
    horaInicioMin: 1200,
    cancha: "Cancha 1",
    estado: "CONFIRMADA",
    montoSenia: null,
    notas: null,
    creadaPorBot: true,
    ultimaActualizacion: null,
    ...parcial,
  };
}

function slot(parcial: Partial<Slot>): Slot {
  return {
    recordId: `rec${Math.random().toString(36).slice(2, 10)}`,
    nombre: "Slot test",
    horaInicioMin: 1200,
    duracionMin: 90,
    diasActivos: [1],
    activo: true,
    canchas: ["Cancha 1"],
    ...parcial,
  };
}

describe("turnosReservados", () => {
  it("suma confirmadas y pendientes de seña, y excluye canceladas", () => {
    const reservas = [
      reserva({ fecha: "2026-07-06", estado: "CONFIRMADA" }),
      reserva({ fecha: "2026-07-06", estado: "PENDIENTE_SENIA" }),
      reserva({ fecha: "2026-07-06", estado: "CANCELADA" }),
    ];
    assert.equal(turnosReservados(reservas), 2);
  });

  it("no cuenta una reserva con estado ilegible", () => {
    // Si Airtable devuelve un single select que no conocemos, la fila entra con
    // estado null. Contarla sería inventar un turno que no sabemos si existe.
    const reservas = [reserva({ fecha: "2026-07-06", estado: null })];
    assert.equal(turnosReservados(reservas), 0);
  });
});

describe("tasaConversion", () => {
  it("sin conversaciones dice que no hay datos, no 0%", () => {
    const r = tasaConversion([reserva({ fecha: "2026-07-06" })], 0);
    assert.equal(r.hayDatos, false);
  });

  it("divide confirmadas del bot sobre conversaciones", () => {
    const reservas = [
      reserva({ fecha: "2026-07-06", estado: "CONFIRMADA" }),
      reserva({ fecha: "2026-07-06", estado: "CONFIRMADA" }),
      reserva({ fecha: "2026-07-06", estado: "PENDIENTE_SENIA" }),
    ];
    const r = tasaConversion(reservas, 8);
    assert.equal(r.hayDatos, true);
    if (!r.hayDatos) return;
    assert.equal(r.turnos, 2, "las pendientes de seña no cuentan acá");
    assert.equal(r.tasa, 0.25);
    assert.equal(r.excede, false);
  });

  it("no cuenta una reserva cargada a mano como conversión", () => {
    // Una reserva confirmada pero NO creada por el bot no salió de una
    // conversación, así que no es una conversión. Sin este filtro, las cargas
    // manuales del dueño inflarían la tasa.
    const reservas = [
      reserva({ fecha: "2026-07-06", estado: "CONFIRMADA", creadaPorBot: true }),
      reserva({ fecha: "2026-07-06", estado: "CONFIRMADA", creadaPorBot: false }),
    ];
    const r = tasaConversion(reservas, 4);
    assert.equal(r.hayDatos, true);
    if (!r.hayDatos) return;
    assert.equal(r.turnos, 1, "solo cuenta la creada por el bot");
    assert.equal(r.tasa, 0.25);
  });

  it("marca 'excede' cuando hay más turnos que conversaciones", () => {
    // El caso que mostraba '2620%': más reservas del bot que conversaciones
    // registradas. Se marca para mostrarlo acotado, no como un porcentaje absurdo.
    const reservas = [
      reserva({ fecha: "2026-07-06", estado: "CONFIRMADA" }),
      reserva({ fecha: "2026-07-06", estado: "CONFIRMADA" }),
      reserva({ fecha: "2026-07-06", estado: "CONFIRMADA" }),
    ];
    const r = tasaConversion(reservas, 1);
    assert.equal(r.hayDatos, true);
    if (!r.hayDatos) return;
    assert.equal(r.turnos, 3);
    assert.equal(r.excede, true);
  });
});

describe("ingresosEstimados", () => {
  const canchas: CanchaConfig[] = [
    { numero: 1, precio: 20000, tramos: [] },
    { numero: 2, precio: 30000, tramos: [] },
  ];

  it("multiplica confirmadas por el precio de su cancha", () => {
    const reservas = [
      reserva({ fecha: "2026-07-06", cancha: "Cancha 1" }),
      reserva({ fecha: "2026-07-06", cancha: "Cancha 1" }),
      reserva({ fecha: "2026-07-06", cancha: "Cancha 2" }),
    ];
    const r = ingresosEstimados(reservas, canchas);
    assert.equal(r.total, 70000);
    assert.equal(r.sinPrecio, 0);
  });

  it("ignora canceladas y pendientes de seña", () => {
    const reservas = [
      reserva({ fecha: "2026-07-06", cancha: "Cancha 1", estado: "CANCELADA" }),
      reserva({ fecha: "2026-07-06", cancha: "Cancha 1", estado: "PENDIENTE_SENIA" }),
    ];
    assert.equal(ingresosEstimados(reservas, canchas).total, 0);
  });

  it("no valúa una cancha que no está configurada, y lo reporta", () => {
    // Este es el caso que importa: si el cliente agrega "Cancha 3" en Airtable
    // y nadie le pone precio en Vibo, el total tiene que quedar corto Y decirlo.
    // Un total corto silencioso es peor que un error.
    const reservas = [
      reserva({ fecha: "2026-07-06", cancha: "Cancha 1" }),
      reserva({ fecha: "2026-07-06", cancha: "Cancha 3" }),
      reserva({ fecha: "2026-07-06", cancha: null }),
    ];
    const r = ingresosEstimados(reservas, canchas);
    assert.equal(r.total, 20000);
    assert.equal(r.sinPrecio, 2);
  });

  it("valúa cada turno por su franja horaria, no por un precio fijo", () => {
    // El bug reportado: la cancha tiene un precio base (noche) pero de día cobra
    // otro. Ingresos tiene que sumar el precio del tramo de cada turno.
    const conTramo: CanchaConfig[] = [
      {
        numero: 1,
        precio: 48000, // base (noche)
        tramos: [{ desdeMin: 8 * 60, hastaMin: 18 * 60, precio: 30000 }],
      },
    ];
    const reservas = [
      reserva({ fecha: "2026-07-06", cancha: "Cancha 1", horaInicioMin: 12 * 60 + 30 }), // 12:30 → tramo
      reserva({ fecha: "2026-07-06", cancha: "Cancha 1", horaInicioMin: 20 * 60 }), // 20:00 → base
    ];
    const r = ingresosEstimados(reservas, conTramo);
    assert.equal(r.total, 30000 + 48000);
    // Con tramos no hay un unitario único: la UI lo muestra sin "× precio".
    assert.equal(r.porCancha[0].precio, null);
  });
});

describe("precioEnTramo", () => {
  const cancha: CanchaConfig = {
    numero: 1,
    precio: 48000,
    tramos: [{ desdeMin: 8 * 60, hastaMin: 18 * 60, precio: 30000 }],
  };

  it("usa el precio del tramo cuando la hora cae adentro", () => {
    assert.equal(precioEnTramo(cancha, 12 * 60 + 30), 30000);
    assert.equal(precioEnTramo(cancha, 8 * 60), 30000); // borde inferior, inclusive
  });

  it("cae al precio base fuera de todo tramo", () => {
    assert.equal(precioEnTramo(cancha, 18 * 60), 48000); // borde superior, exclusivo
    assert.equal(precioEnTramo(cancha, 20 * 60), 48000);
    assert.equal(precioEnTramo(cancha, 7 * 60), 48000);
  });

  it("sin hora, cobra el precio base", () => {
    assert.equal(precioEnTramo(cancha, null), 48000);
  });
});

describe("ocurrenciasPorDia", () => {
  it("cuenta los días de la semana del período, sin correrse por zona horaria", () => {
    // 2026-07-06 es lunes. Una semana completa: uno de cada día.
    const cuenta = ocurrenciasPorDia({ desde: "2026-07-06", hasta: "2026-07-12" });
    assert.deepEqual(cuenta, [1, 1, 1, 1, 1, 1, 1]);
  });

  it("un solo día cuenta una vez, en el día correcto", () => {
    // El bug clásico: new Date("2026-07-06") es medianoche UTC = domingo 21hs en
    // Argentina. Si esto da domingo en vez de lunes, el heatmap está corrido.
    const cuenta = ocurrenciasPorDia({ desde: "2026-07-06", hasta: "2026-07-06" });
    assert.deepEqual(cuenta, [0, 1, 0, 0, 0, 0, 0], "2026-07-06 es lunes (índice 1)");
  });
});

describe("calcularOcupacion", () => {
  const lunes = { desde: "2026-07-06", hasta: "2026-07-06" };

  it("un slot de una cancha con un turno confirmado da 100%", () => {
    const r = calcularOcupacion(
      [reserva({ fecha: "2026-07-06", horaInicioMin: 1200, cancha: "Cancha 1" })],
      [slot({ horaInicioMin: 1200, diasActivos: [1], canchas: ["Cancha 1"] })],
      lunes,
    );
    const celda = r.celdas.find((c) => c.diaSemana === 1 && c.horaInicioMin === 1200);
    assert.equal(celda?.capacidad, 1);
    assert.equal(celda?.ocupacion, 1);
  });

  it("un slot que aplica a 3 canchas son 3 lugares vendibles", () => {
    const r = calcularOcupacion(
      [reserva({ fecha: "2026-07-06", horaInicioMin: 1200, cancha: "Cancha 1" })],
      [
        slot({
          horaInicioMin: 1200,
          diasActivos: [1],
          canchas: ["Cancha 1", "Cancha 2", "Cancha 3"],
        }),
      ],
      lunes,
    );
    const celda = r.celdas.find((c) => c.diaSemana === 1 && c.horaInicioMin === 1200);
    assert.equal(celda?.capacidad, 3);
    assert.equal(celda?.ocupacion, 1 / 3);
  });

  it("dos slots duplicados sobre la misma cancha no inflan la capacidad", () => {
    // Si esto contara 2, la ocupación daría 50% cuando en realidad está llena.
    // El cliente malvendería un horario que no le sobra.
    const r = calcularOcupacion(
      [reserva({ fecha: "2026-07-06", horaInicioMin: 1200, cancha: "Cancha 1" })],
      [
        slot({ horaInicioMin: 1200, diasActivos: [1], canchas: ["Cancha 1"] }),
        slot({ horaInicioMin: 1200, diasActivos: [1], canchas: ["Cancha 1"] }),
      ],
      lunes,
    );
    const celda = r.celdas.find((c) => c.diaSemana === 1 && c.horaInicioMin === 1200);
    assert.equal(celda?.capacidad, 1);
    assert.equal(celda?.ocupacion, 1);
  });

  it("un slot inactivo no aporta capacidad", () => {
    const r = calcularOcupacion(
      [],
      [slot({ horaInicioMin: 1200, diasActivos: [1], activo: false })],
      lunes,
    );
    assert.equal(r.celdas.length, 0, "sin slots activos no hay franjas que mostrar");
    assert.equal(r.global, null);
  });

  it("la capacidad se multiplica por las veces que cae ese día en el período", () => {
    // Dos lunes en el período: 2026-07-06 y 2026-07-13.
    const r = calcularOcupacion(
      [reserva({ fecha: "2026-07-06", horaInicioMin: 1200, cancha: "Cancha 1" })],
      [slot({ horaInicioMin: 1200, diasActivos: [1], canchas: ["Cancha 1"] })],
      { desde: "2026-07-06", hasta: "2026-07-13" },
    );
    const celda = r.celdas.find((c) => c.diaSemana === 1 && c.horaInicioMin === 1200);
    assert.equal(celda?.capacidad, 2);
    assert.equal(celda?.ocupacion, 0.5);
  });

  it("una franja sin slots es null y no 0%", () => {
    // "No se vende a esa hora" y "se vende y no vino nadie" son cosas distintas;
    // pintarlas iguales en el heatmap le haría bajar el precio de un horario
    // que ni siquiera está abierto.
    const r = calcularOcupacion(
      [],
      [slot({ horaInicioMin: 1200, diasActivos: [1], canchas: ["Cancha 1"] })],
      lunes,
    );
    const domingo = r.celdas.find((c) => c.diaSemana === 0 && c.horaInicioMin === 1200);
    assert.equal(domingo?.capacidad, 0);
    assert.equal(domingo?.ocupacion, null);
  });

  it("las canceladas no ocupan", () => {
    const r = calcularOcupacion(
      [reserva({ fecha: "2026-07-06", horaInicioMin: 1200, estado: "CANCELADA" })],
      [slot({ horaInicioMin: 1200, diasActivos: [1], canchas: ["Cancha 1"] })],
      lunes,
    );
    const celda = r.celdas.find((c) => c.diaSemana === 1 && c.horaInicioMin === 1200);
    assert.equal(celda?.ocupados, 0);
  });
});

describe("variacion", () => {
  it("compara contra el período anterior", () => {
    assert.equal(variacion(150, 100), 0.5);
    assert.equal(variacion(50, 100), -0.5);
  });

  it("sin período anterior no hay variación, no es +100%", () => {
    assert.equal(variacion(10, 0), null);
  });
});
