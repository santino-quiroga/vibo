/**
 * Pruebas del armado de CSV.
 *
 * Todas apuntan al mismo riesgo: que un dato con un carácter especial corra las
 * columnas y el archivo se lea mal sin que nadie se dé cuenta. Un CSV corrido no
 * falla — se abre igual, con los datos en la columna equivocada.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BOM, armarCsv, celda } from "@/lib/admin/csv";

describe("celda", () => {
  it("deja pasar un valor simple sin tocarlo", () => {
    assert.equal(celda("Padel AI"), "Padel AI");
    assert.equal(celda(150000), "150000");
  });

  it("null y undefined quedan vacíos, no como texto 'null'", () => {
    assert.equal(celda(null), "");
    assert.equal(celda(undefined), "");
  });

  it("entrecomilla si hay punto y coma (correría la columna)", () => {
    assert.equal(celda("Club Padel; sede centro"), '"Club Padel; sede centro"');
  });

  it("duplica las comillas internas", () => {
    assert.equal(celda('El "Club" de Pádel'), '"El ""Club"" de Pádel"');
  });

  it("entrecomilla si hay saltos de línea (romperían la fila)", () => {
    assert.equal(celda("linea1\nlinea2"), '"linea1\nlinea2"');
    assert.equal(celda("linea1\r\nlinea2"), '"linea1\r\nlinea2"');
  });
});

describe("armarCsv", () => {
  it("arranca con el BOM para que Excel lea bien los acentos", () => {
    const csv = armarCsv(["a"], [["Córdoba"]]);
    assert.ok(csv.startsWith(BOM), "sin BOM, Excel muestra CÃ³rdoba");
  });

  it("separa con punto y coma y termina las filas con CRLF", () => {
    const csv = armarCsv(["nombre", "plan"], [["Padel AI", "Starter"]]);
    const sinBom = csv.slice(BOM.length);
    assert.equal(sinBom, "nombre;plan\r\nPadel AI;Starter\r\n");
  });

  it("un dato con separador no corre las columnas", () => {
    const csv = armarCsv(["nombre", "plan"], [["Club; centro", "Starter"]]);
    const filas = csv.slice(BOM.length).trimEnd().split("\r\n");
    // La fila tiene que seguir teniendo 2 columnas reales, no 3.
    assert.equal(filas[1], '"Club; centro";Starter');
  });

  it("soporta una tabla vacía sin romperse", () => {
    const csv = armarCsv(["nombre"], []);
    assert.equal(csv.slice(BOM.length), "nombre\r\n");
  });
});
