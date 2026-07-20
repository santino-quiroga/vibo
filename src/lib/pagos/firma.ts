import { createHmac, timingSafeEqual } from "node:crypto";

// Sin `server-only` a propósito, a diferencia del resto de `lib/`: este módulo
// es una función pura —el secreto entra por parámetro, no lee env ni toca la
// base—, así que no hay ningún valor sensible que pueda filtrarse al bundle del
// cliente. Y sin esa marca se puede probar con el runner de tests, que es lo que
// más importa acá: es la barrera que separa un pago real de uno inventado.

/**
 * Validación de la firma del webhook de Mercado Pago (SDD v2 §4.3 y §9).
 *
 * Sin esto, cualquiera que conozca la URL puede postear "pago aprobado" y
 * ponerse al día solo. Es la única barrera: el endpoint es público por
 * definición, no puede pedir sesión ni token propio.
 *
 * Mercado Pago manda dos headers:
 *
 *   x-signature: ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8eda45…
 *   x-request-id: <uuid>
 *
 * y el manifest que se firma tiene esta forma exacta (el orden y los ';'
 * finales importan; los campos ausentes se omiten enteros):
 *
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * El HMAC es SHA-256 con la clave secreta del webhook.
 */

export type ResultadoFirma =
  | { valido: true }
  | { valido: false; motivo: string };

/** Parsea "ts=...,v1=..." en sus partes. */
function partesDeFirma(header: string): { ts?: string; v1?: string } {
  const partes: { ts?: string; v1?: string } = {};
  for (const trozo of header.split(",")) {
    const [clave, valor] = trozo.split("=", 2);
    const k = clave?.trim();
    if (k === "ts") partes.ts = valor?.trim();
    if (k === "v1") partes.v1 = valor?.trim();
  }
  return partes;
}

/** Compara en tiempo constante, para no filtrar la firma por timing. */
function igualSeguro(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual explota si difieren en largo, así que eso se chequea antes;
  // el largo de un HMAC hex es fijo, no filtra nada útil.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Tolerancia de antigüedad de la firma.
 *
 * Sin esto, una notificación válida capturada alguna vez podría reenviarse para
 * siempre. Mercado Pago reintenta durante horas, así que el margen es amplio.
 */
const MAX_ANTIGUEDAD_MS = 6 * 60 * 60 * 1000;

export function validarFirmaMercadoPago(opciones: {
  xSignature: string | null;
  xRequestId: string | null;
  /** El `data.id` de la notificación (el id del pago). */
  dataId: string | null;
  secreto: string;
  ahora?: number;
}): ResultadoFirma {
  const { xSignature, xRequestId, dataId, secreto } = opciones;

  if (!xSignature) return { valido: false, motivo: "falta el header x-signature" };

  const { ts, v1 } = partesDeFirma(xSignature);
  if (!ts || !v1) return { valido: false, motivo: "x-signature mal formado" };

  const tsNumero = Number(ts);
  if (!Number.isFinite(tsNumero)) {
    return { valido: false, motivo: "timestamp inválido" };
  }

  // El ts viene en milisegundos en las notificaciones actuales; se acepta
  // también en segundos por si cambia, normalizando por magnitud.
  const tsMs = ts.length <= 10 ? tsNumero * 1000 : tsNumero;
  const ahora = opciones.ahora ?? Date.now();
  if (Math.abs(ahora - tsMs) > MAX_ANTIGUEDAD_MS) {
    return { valido: false, motivo: "firma vencida" };
  }

  // El manifest omite los campos ausentes, no los manda vacíos.
  const manifest = [
    dataId ? `id:${dataId};` : "",
    xRequestId ? `request-id:${xRequestId};` : "",
    `ts:${ts};`,
  ].join("");

  const esperado = createHmac("sha256", secreto).update(manifest).digest("hex");

  if (!igualSeguro(esperado, v1.toLowerCase())) {
    return { valido: false, motivo: "firma no coincide" };
  }

  return { valido: true };
}
