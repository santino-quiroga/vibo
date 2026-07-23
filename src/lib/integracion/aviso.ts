/**
 * Texto del aviso al dueño cuando el bot deriva una conversación (SDD v2 §12).
 *
 * Puro y sin `server-only` para poder testearlo: recibe el `baseUrl` ya resuelto
 * en vez de leerlo del entorno. Mínimo y accionable — sede, contacto y link al
 * chat. NO incluye el texto de la conversación: el dueño lo ve al abrir el link,
 * que ya está protegido por su sesión.
 */
export function construirAviso(datos: {
  sede: string;
  contactoNombre: string | null;
  contactoTelefono: string;
  conversacionId: string;
  baseUrl: string;
}): string {
  const contacto = datos.contactoNombre
    ? `${datos.contactoNombre} (${datos.contactoTelefono})`
    : datos.contactoTelefono;
  const link = `${datos.baseUrl}/dashboard/conversaciones/${datos.conversacionId}`;

  return [
    "🔔 Un chat necesita tu atención",
    "",
    `Sede: ${datos.sede}`,
    `Contacto: ${contacto}`,
    "",
    `Abrilo acá: ${link}`,
  ].join("\n");
}
