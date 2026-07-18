/**
 * Un Airtable de mentira, para desarrollar sin tocar la base de ningún cliente.
 *
 * El SDD (9.3) es explícito: un entorno que no sea producción no apunta a la
 * base real de un cliente. Esto es lo que hace que esa regla se pueda cumplir
 * de verdad en vez de ser una buena intención — se levanta esto, se apunta
 * AIRTABLE_API_URL acá, y no hay forma de escribirle a nadie por accidente.
 *
 * Imita la forma de la API que consume src/lib/airtable/cliente.ts: records con
 * id + fields, paginación por offset, 401 sin Authorization. NO imita el
 * esquema real de la base de un cliente — para eso está airtable-sonda.ts,
 * que mira la base de verdad. Este simulador sirve para ver que el pipeline
 * completo (leer → parsear → calcular → pintar) funcione.
 *
 *   npx tsx scripts/airtable-simulado.ts          → escucha en 8976
 *   AIRTABLE_API_URL=http://localhost:8976 npm run dev
 */

import { createServer } from "node:http";

const PUERTO = Number(process.env.PUERTO ?? 8976);

/** Un complejo de pádel de verdad: 3 canchas, turnos de 90', de 8 a 23. */
const HORAS = ["08:00", "09:30", "11:00", "14:00", "15:30", "17:00", "18:30", "20:00", "21:30"];
const CANCHAS = ["Cancha 1", "Cancha 2", "Cancha 3"];

const DIAS_TODOS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

type Registro = { id: string; fields: Record<string, unknown> };

const slots: Registro[] = HORAS.map((hora, i) => ({
  id: `recSLOT${String(i).padStart(3, "0")}`,
  fields: {
    "Nombre Slot": `Turno ${hora}`,
    "Hora inicio": hora,
    Duracion: 90,
    "Dias Activos": DIAS_TODOS,
    Activo: true,
    Cancha: CANCHAS,
  },
}));

function fechaHace(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Reservas de los últimos 45 días con una forma creíble: los horarios de la
 * noche se llenan y los de la mañana no. Es lo que hace que el heatmap muestre
 * algo que se pueda mirar y decir "esto tiene sentido" — con datos uniformes,
 * un bug de agrupación por día u hora sería invisible.
 */
function generarReservas() {
  const reservas: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let n = 0;

  for (let dia = 0; dia < 45; dia++) {
    const fecha = fechaHace(dia);
    const diaSemana = new Date(`${fecha}T12:00:00Z`).getUTCDay();
    const finde = diaSemana === 0 || diaSemana === 6;

    for (const hora of HORAS) {
      const nocturno = hora >= "18:30";
      // Probabilidad de que se venda: la noche y el finde se llenan.
      const chance = (nocturno ? 0.75 : 0.2) * (finde ? 1.2 : 1);

      for (const cancha of CANCHAS) {
        if (Math.random() > chance) continue;
        n++;
        // 1 de cada 10 se cancela, 1 de cada 8 queda pendiente de seña.
        const r = Math.random();
        const estado = r < 0.1 ? "Cancelada" : r < 0.225 ? "Pendiente de seña" : "Confirmada";

        reservas.push({
          id: `recRES${String(n).padStart(4, "0")}`,
          fields: {
            "ID Reserva": n,
            Nombre: `Contacto ${n}`,
            "Teléfono": `+54911${String(40000000 + n).slice(0, 8)}`,
            Fecha: fecha,
            "Hora inicio": hora,
            Cancha: cancha,
            Estado: estado,
            ...(estado === "Pendiente de seña" ? { "Monto seña": 5000 } : {}),
            "Creada por bot": Math.random() > 0.15,
            Ultima_Actualizacion: `${fecha}T12:00:00.000Z`,
          },
        });
      }
    }
  }
  return reservas;
}

const reservas = generarReservas();

// Para asignar ids a los registros creados por POST.
let contadorRegistros = 0;

/** Filtro por rango, imitando lo que Airtable resuelve del lado del servidor. */
function aplicarFiltro(
  filas: Array<{ id: string; fields: Record<string, unknown> }>,
  formula: string | null,
) {
  if (!formula) return filas;
  // Sólo se entiende la forma que arma filtroPorRango(). Cualquier otra cosa se
  // rechaza en vez de ignorarse: un filtro que no se aplica devolvería de más y
  // el bug aparecería como un KPI inflado, no como un error.
  const fechas = [...formula.matchAll(/'(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1]);
  if (fechas.length !== 2) return null;
  const [desde, hasta] = fechas;
  return filas.filter((f) => {
    const fecha = String(f.fields["Fecha"] ?? "");
    return fecha >= desde && fecha <= hasta;
  });
}

const servidor = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PUERTO}`);

  const responder = (status: number, cuerpo: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(cuerpo));
  };

  if (!req.headers.authorization?.startsWith("Bearer ")) {
    return responder(401, {
      error: { type: "AUTHENTICATION_REQUIRED", message: "Authentication required" },
    });
  }

  // /v0/:baseId/:tabla  — el prefijo /v0 se lo pone el cliente
  const partes = url.pathname.split("/").filter(Boolean);
  const tabla = decodeURIComponent(partes[partes.length - 1] ?? "");

  // Para POST/PATCH la tabla es la ante-última parte (la última es el recordId
  // en PATCH). Para GET, es la última.
  const metodo = req.method ?? "GET";
  const nombreTabla =
    metodo === "PATCH" ? decodeURIComponent(partes[partes.length - 2] ?? "") : tabla;
  const recordIdPath = metodo === "PATCH" ? decodeURIComponent(partes[partes.length - 1] ?? "") : null;

  const fuente = nombreTabla === "Reservas" ? reservas : nombreTabla === "Slots" ? slots : null;
  if (!fuente) {
    return responder(404, {
      error: { type: "TABLE_NOT_FOUND", message: `Table "${nombreTabla}" not found` },
    });
  }

  // --- Escritura: crear (POST) o actualizar (PATCH) ---
  if (metodo === "POST" || metodo === "PATCH") {
    let cuerpo = "";
    req.on("data", (c) => (cuerpo += c));
    req.on("end", () => {
      let datos: { fields?: Record<string, unknown> };
      try {
        datos = JSON.parse(cuerpo);
      } catch {
        return responder(400, { error: { type: "INVALID_JSON", message: "body no es JSON" } });
      }
      const fields = datos.fields ?? {};

      if (metodo === "POST") {
        contadorRegistros++;
        const registro = { id: `recNEW${String(contadorRegistros).padStart(6, "0")}`, fields };
        fuente.push(registro);
        console.log(`  + ${nombreTabla}: ${JSON.stringify(fields).slice(0, 80)}`);
        return responder(200, registro);
      }

      // PATCH: merge sobre el registro existente.
      const registro = fuente.find((r) => r.id === recordIdPath);
      if (!registro) {
        return responder(404, { error: { type: "NOT_FOUND", message: "record not found" } });
      }
      registro.fields = { ...registro.fields, ...fields };
      console.log(`  ~ ${nombreTabla}/${recordIdPath}: ${JSON.stringify(fields).slice(0, 60)}`);
      return responder(200, registro);
    });
    return;
  }

  // --- Lectura (GET) ---
  const filtradas = aplicarFiltro(fuente, url.searchParams.get("filterByFormula"));
  if (filtradas === null) {
    return responder(422, {
      error: { type: "INVALID_FILTER_BY_FORMULA", message: "Formula no reconocida por el simulador" },
    });
  }

  // Paginación como la real: de a 100 y un offset opaco.
  const pageSize = Math.min(Number(url.searchParams.get("pageSize") ?? 100), 100);
  const desde = Number(url.searchParams.get("offset") ?? 0);
  const pagina = filtradas.slice(desde, desde + pageSize);
  const siguiente = desde + pageSize;

  responder(200, {
    records: pagina,
    ...(siguiente < filtradas.length ? { offset: String(siguiente) } : {}),
  });
});

servidor.listen(PUERTO, () => {
  console.log(`Airtable simulado en http://localhost:${PUERTO}`);
  console.log(`  ${reservas.length} reservas, ${slots.length} slots, ${CANCHAS.length} canchas`);
  console.log(`\nApuntá la app con:  AIRTABLE_API_URL=http://localhost:${PUERTO} npm run dev\n`);
});
