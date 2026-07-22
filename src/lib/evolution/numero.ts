/**
 * Normaliza el teléfono del contacto al formato que Evolution acepta sin drama:
 * sólo dígitos.
 *
 * El `contactoTelefono` se guarda tal como lo manda n8n desde el webhook de
 * WhatsApp, y ahí suele venir como JID (`5493511234567@s.whatsapp.net`) o con
 * `+`, espacios y guiones. Mandarle eso crudo a `sendText` es una causa concreta
 * de que el envío manual falle. Acá se recorta todo lo que no sea número: el
 * sufijo del JID (todo lo que sigue a `@`) y cualquier separador.
 *
 * No se inventa código de país: si n8n guardó un número sin él, esto no lo
 * arregla (no hay de dónde sacarlo). Sólo saca lo que sobra.
 *
 * Vive separado de `cliente.ts` (que es `server-only`) para poder testearlo solo.
 */
export function normalizarNumero(telefono: string): string {
  const sinJid = telefono.split("@")[0];
  return sinJid.replace(/\D/g, "");
}
