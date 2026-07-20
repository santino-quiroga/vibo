/**
 * Armado de CSV para el export del admin (SDD v2 §8).
 *
 * Sin `server-only` a propósito: es una función pura y así se puede probar con
 * el runner de tests. El escapeo es lo único delicado acá y merece tests —un
 * nombre de complejo con una coma, o una nota interna con comillas, rompen un
 * CSV armado a mano y el error aparece recién al abrirlo en Excel.
 *
 * Dos decisiones para que abra bien en Excel en español:
 *
 * 1. **Separador `;`** y no coma. Excel con configuración regional es-AR espera
 *    punto y coma; con coma mete todo en una sola columna.
 * 2. **BOM UTF-8** al principio. Sin él, Excel asume la codificación del sistema
 *    y "Padel Córdoba" se ve "PadelÂ CÃ³rdoba".
 */

const SEPARADOR = ";";

/** El BOM que hace que Excel reconozca UTF-8. */
export const BOM = "﻿";

/**
 * Escapa un valor para una celda de CSV.
 *
 * Se entrecomilla si contiene el separador, comillas o saltos de línea, y las
 * comillas internas se duplican, que es como lo define el formato.
 */
export function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return "";

  const texto = String(valor);
  const necesitaComillas =
    texto.includes(SEPARADOR) ||
    texto.includes('"') ||
    texto.includes("\n") ||
    texto.includes("\r");

  if (!necesitaComillas) return texto;
  return `"${texto.replace(/"/g, '""')}"`;
}

/**
 * Arma un CSV completo a partir de encabezados y filas.
 *
 * Usa CRLF entre filas: es lo que espera Excel y lo que dice el RFC del formato.
 */
export function armarCsv(encabezados: string[], filas: unknown[][]): string {
  const lineas = [
    encabezados.map(celda).join(SEPARADOR),
    ...filas.map((fila) => fila.map(celda).join(SEPARADOR)),
  ];
  return BOM + lineas.join("\r\n") + "\r\n";
}
