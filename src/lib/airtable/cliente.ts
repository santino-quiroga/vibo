import "server-only";

/**
 * Cliente HTTP de Airtable — la única puerta de salida hacia su API.
 *
 * Responsabilidades, todas del SDD sección 4.1 y 4.4:
 *   - throttlear por base (Airtable corta a ~5 req/seg por base)
 *   - reintentar con backoff lo que es transitorio, y sólo eso
 *   - paginar, porque la API devuelve de a 100 registros
 *   - fallar con un motivo que la UI pueda explicar, nunca en silencio
 *
 * Regla de este archivo: **la API key no se loguea, no se serializa y no entra
 * en ninguna clave de caché.** Se recibe por parámetro, se usa en el header y
 * muere ahí.
 */

/**
 * La API de Airtable. Se puede apuntar a otro lado con AIRTABLE_API_URL.
 *
 * No es un gancho para tests: el SDD (9.3) prohíbe que un entorno que no sea
 * producción apunte a la base real de un cliente, y con más razón acá, donde la
 * capa de escritura cancela y reprograma turnos. Esta variable es lo que
 * permite cumplirlo — en dev se apunta a un simulador y no hay forma de tocar
 * datos de nadie por accidente.
 *
 * En producción no se define, y entonces es la API real.
 */
const API = process.env.AIRTABLE_API_URL ?? "https://api.airtable.com/v0";

/** ~4.5 req/seg: debajo del techo de 5, con aire para no rozarlo. */
const MS_ENTRE_REQUESTS = 220;

const TIMEOUT_MS = 10_000;
const INTENTOS = 3;

export type MotivoError =
  | "auth" // API key inválida o sin permiso sobre la base
  | "no_encontrado" // base o tabla que no existe (o nombre mal escrito)
  | "rate" // 429, incluso después de reintentar
  | "red" // timeout o falla de conexión
  | "desconocido";

export class ErrorAirtable extends Error {
  readonly motivo: MotivoError;

  constructor(motivo: MotivoError, mensaje: string) {
    super(mensaje);
    this.name = "ErrorAirtable";
    this.motivo = motivo;
  }

  /** Lo que se le puede mostrar a un dueño de complejo, que no sabe qué es Airtable. */
  get mensajeUsuario(): string {
    switch (this.motivo) {
      case "auth":
        return "No se pudo acceder a los datos de turnos. El equipo de Vibo tiene que revisar la conexión de este agente.";
      case "no_encontrado":
        return "No se encontró la base de turnos de este agente. El equipo de Vibo tiene que revisar la configuración.";
      case "rate":
        return "Los turnos están tardando más de lo normal. Probá de nuevo en un momento.";
      case "red":
      case "desconocido":
        return "No se pudieron cargar los turnos. Probá de nuevo en un momento.";
    }
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Una cola por base, para no pasarse del rate limit.
 *
 * Cada request espera a que el anterior de *la misma base* haya terminado y
 * haya pasado el intervalo mínimo. Bases distintas no se bloquean entre sí,
 * porque el límite de Airtable es por base y serializar todo sería lento al
 * pedo con "Todas las sedes".
 *
 * Es best-effort: en Vercel cada instancia tiene su propia cola, así que dos
 * instancias concurrentes pueden pasarse. Por eso además se maneja el 429.
 */
const colas = new Map<string, Promise<unknown>>();

function encolar<T>(baseId: string, tarea: () => Promise<T>): Promise<T> {
  const anterior = colas.get(baseId) ?? Promise.resolve();

  // El catch es lo que evita que una tarea fallida rompa la cola para las
  // siguientes: cada una espera su *turno*, no el éxito de la anterior.
  const resultado = anterior.then(
    () => tarea(),
    () => tarea(),
  );

  // La cola avanza recién después del intervalo, gane o pierda la tarea.
  colas.set(
    baseId,
    resultado.then(
      () => esperar(MS_ENTRE_REQUESTS),
      () => esperar(MS_ENTRE_REQUESTS),
    ),
  );

  return resultado;
}

type RespuestaLista = {
  records: Array<{ id: string; fields: Record<string, unknown> }>;
  offset?: string;
};

function clasificar(status: number): MotivoError {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "no_encontrado";
  if (status === 429) return "rate";
  return "desconocido";
}

/** Sólo se reintenta lo que puede cambiar solo. Un 401 no se arregla insistiendo. */
function valeReintentar(motivo: MotivoError, status?: number): boolean {
  if (motivo === "rate" || motivo === "red") return true;
  return status !== undefined && status >= 500;
}

async function pedirUnaVez(
  url: string,
  apiKey: string,
): Promise<RespuestaLista> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Airtable es la fuente de verdad de los turnos: el caché lo maneja la
      // capa de arriba (unstable_cache), con TTL explícito por tipo de consulta.
      cache: "no-store",
    });
  } catch (error) {
    const esTimeout = error instanceof Error && error.name === "TimeoutError";
    throw new ErrorAirtable(
      "red",
      esTimeout ? `Airtable no respondió en ${TIMEOUT_MS}ms` : "Falló la conexión con Airtable",
    );
  }

  if (!respuesta.ok) {
    const motivo = clasificar(respuesta.status);
    // El cuerpo del error de Airtable no trae la key, pero se recorta igual:
    // no hay razón para arrastrar un blob entero al log.
    const detalle = (await respuesta.text().catch(() => "")).slice(0, 200);
    const error = new ErrorAirtable(
      motivo,
      `Airtable respondió ${respuesta.status}: ${detalle}`,
    );
    // Se cuelga el status para decidir el reintento sin volver a parsear.
    (error as ErrorAirtable & { status?: number }).status = respuesta.status;
    throw error;
  }

  return (await respuesta.json()) as RespuestaLista;
}

async function conReintentos(url: string, apiKey: string): Promise<RespuestaLista> {
  let ultimo: unknown;

  for (let intento = 1; intento <= INTENTOS; intento++) {
    try {
      return await pedirUnaVez(url, apiKey);
    } catch (error) {
      ultimo = error;
      if (!(error instanceof ErrorAirtable)) throw error;

      const status = (error as ErrorAirtable & { status?: number }).status;
      const ultimoIntento = intento === INTENTOS;
      if (ultimoIntento || !valeReintentar(error.motivo, status)) throw error;

      // Backoff exponencial: 300ms, 900ms. Airtable pide 30s tras un 429, pero
      // esperar 30s en el render de una página es peor que mostrar el estado
      // degradado que exige el SDD 4.4 — así que se intenta corto y se avisa.
      await esperar(300 * 3 ** (intento - 1));
    }
  }

  throw ultimo;
}

export type ConfigBase = {
  baseId: string;
  apiKey: string;
};

/**
 * Lista todos los registros de una tabla, siguiendo la paginación.
 *
 * `filterByFormula` se pasa ya armado por el que llama. Ojo: Airtable lo evalúa
 * del lado del servidor y una fórmula inválida da 422, no un filtro vacío.
 */
export async function listarRegistros(
  { baseId, apiKey }: ConfigBase,
  tabla: string,
  opciones: { filterByFormula?: string; pageSize?: number } = {},
): Promise<Array<{ id: string; fields: Record<string, unknown> }>> {
  const acumulado: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let offset: string | undefined;

  // Tope de páginas: 50 × 100 = 5000 registros. Es una válvula de seguridad
  // contra un loop infinito si Airtable devolviera siempre el mismo offset;
  // si un cliente real lo toca, el que llama tiene que filtrar mejor.
  for (let pagina = 0; pagina < 50; pagina++) {
    const params = new URLSearchParams();
    params.set("pageSize", String(opciones.pageSize ?? 100));
    if (opciones.filterByFormula) {
      params.set("filterByFormula", opciones.filterByFormula);
    }
    if (offset) params.set("offset", offset);

    const url = `${API}/${baseId}/${encodeURIComponent(tabla)}?${params.toString()}`;
    const datos = await encolar(baseId, () => conReintentos(url, apiKey));

    acumulado.push(...datos.records);
    if (!datos.offset) return acumulado;
    offset = datos.offset;
  }

  return acumulado;
}

/** Escapa un valor para interpolarlo en un filterByFormula sin romperlo. */
export function escaparFormula(valor: string): string {
  return valor.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export type Registro = { id: string; fields: Record<string, unknown> };

/**
 * Escritura de un registro (crear o actualizar).
 *
 * `typecast: false` es deliberado (ver nota del SDD §3): si un valor de un
 * single/multi-select no coincide exacto con una opción existente —ej. "Cancha
 * 5" cuando no existe—, Airtable tiene que **fallar**, no crear una opción nueva
 * "inventada". Con typecast en true, un valor mal formado ensuciaría la tabla en
 * silencio.
 *
 * Reintentos conservadores: solo ante 429 (rate limit, que garantiza que no se
 * procesó). Un error de red en un POST es ambiguo —pudo haber creado el
 * registro—, así que no se reintenta para no duplicar; el que llama reintenta a
 * mano si hace falta.
 */
async function escribir(
  { baseId, apiKey }: ConfigBase,
  metodo: "POST" | "PATCH",
  ruta: string,
  fields: Record<string, unknown>,
): Promise<Registro> {
  const url = `${API}/${baseId}/${ruta}`;

  const intentar = async (): Promise<Registro> => {
    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields, typecast: false }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      const esTimeout = error instanceof Error && error.name === "TimeoutError";
      throw new ErrorAirtable(
        "red",
        esTimeout ? `Airtable no respondió en ${TIMEOUT_MS}ms` : "Falló la conexión con Airtable",
      );
    }

    if (!respuesta.ok) {
      const motivo = clasificar(respuesta.status);
      const detalle = (await respuesta.text().catch(() => "")).slice(0, 200);
      const error = new ErrorAirtable(motivo, `Airtable respondió ${respuesta.status}: ${detalle}`);
      (error as ErrorAirtable & { status?: number }).status = respuesta.status;
      throw error;
    }

    return (await respuesta.json()) as Registro;
  };

  // Un solo reintento, y solo ante 429.
  return encolar(baseId, async () => {
    try {
      return await intentar();
    } catch (error) {
      if (error instanceof ErrorAirtable && error.motivo === "rate") {
        await esperar(600);
        return intentar();
      }
      throw error;
    }
  });
}

/** Crea un registro en una tabla. */
export function crearRegistro(
  config: ConfigBase,
  tabla: string,
  fields: Record<string, unknown>,
): Promise<Registro> {
  return escribir(config, "POST", encodeURIComponent(tabla), fields);
}

/** Actualiza (PATCH) un registro por su record id. */
export function actualizarRegistro(
  config: ConfigBase,
  tabla: string,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<Registro> {
  return escribir(
    config,
    "PATCH",
    `${encodeURIComponent(tabla)}/${encodeURIComponent(recordId)}`,
    fields,
  );
}
