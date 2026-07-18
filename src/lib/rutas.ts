import type { RolUsuario } from "@/generated/prisma/enums";

// Rutas de cada superficie (SDD sección 6.1). Se definen en un solo lugar
// porque las consumen tanto el proxy (chequeo optimista) como el DAL (chequeo real).
export const RUTA_LOGIN = "/login";
export const PREFIJO_DASHBOARD = "/dashboard";
export const PREFIJO_ADMIN = "/admin";

// API routes por superficie. Se protegen igual que las páginas: el SDD (sección
// 6.1) pide explícitamente que no alcance con proteger el render inicial, para
// que nadie llegue a una ruta de admin conociendo la URL.
export const PREFIJO_API_ADMIN = "/api/admin";
export const PREFIJO_API_DASHBOARD = "/api/dashboard";

// Rutas de integración de n8n: no usan sesión de usuario, se autentican con el
// token por agente (SDD sección 6.2). Quedan fuera del proxy a propósito.
export const PREFIJO_API_INTEGRACION = "/api/integracion";

// Rutas accesibles sin sesión. El resto queda protegido por defecto: si mañana
// alguien agrega una página nueva y se olvida de protegerla, queda cerrada, no abierta.
export const RUTAS_PUBLICAS = [
  RUTA_LOGIN,
  "/recuperar-password",
  "/restablecer-password",
];

/** A dónde mandar a cada rol después de loguearse. */
export function rutaInicialPorRol(rol: RolUsuario): string {
  return rol === "VIBO_ADMIN" ? PREFIJO_ADMIN : PREFIJO_DASHBOARD;
}

export function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
  );
}

/** Rutas que solo puede ver un rol puntual. */
export function rolPuedeAcceder(rol: RolUsuario, pathname: string): boolean {
  const soloAdmin =
    pathname.startsWith(PREFIJO_ADMIN) || pathname.startsWith(PREFIJO_API_ADMIN);
  if (soloAdmin) return rol === "VIBO_ADMIN";

  const soloCliente =
    pathname.startsWith(PREFIJO_DASHBOARD) ||
    pathname.startsWith(PREFIJO_API_DASHBOARD);
  if (soloCliente) return rol === "CLIENTE_OWNER";

  return true;
}
