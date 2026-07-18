import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PREFIJO_ADMIN, PREFIJO_DASHBOARD, RUTA_LOGIN } from "@/lib/rutas";
import type { RolUsuario } from "@/generated/prisma/enums";

type UsuarioSesion = {
  id: string;
  email: string;
  rol: RolUsuario;
  clienteId: string | null;
};

/**
 * Data Access Layer — el chequeo de autorización que vale.
 *
 * El proxy hace un chequeo optimista sobre la cookie para redirigir rápido, pero
 * la documentación de Next es explícita en que no debe ser la única defensa. Todo
 * acceso a datos tiene que pasar por acá, lo más cerca posible de la base.
 *
 * `cache()` memoiza por render: aunque varios componentes de la misma página
 * llamen a verificarSesion(), la sesión se resuelve una sola vez.
 */
export const verificarSesion = cache(async (): Promise<UsuarioSesion> => {
  const session = await auth();

  if (!session?.user?.id) {
    redirect(RUTA_LOGIN);
  }

  return {
    id: session.user.id,
    email: session.user.email ?? "",
    rol: session.user.rol,
    clienteId: session.user.clienteId,
  };
});

/**
 * Sesión de un dueño de complejo, con su clienteId garantizado no-nulo.
 *
 * Devolver el clienteId acá es deliberado: es la forma de cumplir la regla dura
 * del SDD (sección 6.3) de que ninguna consulta del panel cliente se arme sin
 * filtrar por el clienteId de la sesión. El clienteId sale del JWT firmado,
 * nunca de un parámetro que mande el frontend.
 */
export const requerirClienteOwner = cache(
  async (): Promise<UsuarioSesion & { clienteId: string }> => {
    const usuario = await verificarSesion();

    if (usuario.rol !== "CLIENTE_OWNER") {
      redirect(PREFIJO_ADMIN);
    }

    // Un CLIENTE_OWNER sin cliente asociado es un dato inconsistente: no se le
    // puede filtrar nada, así que no se le puede mostrar nada.
    if (!usuario.clienteId) {
      redirect(RUTA_LOGIN);
    }

    return { ...usuario, clienteId: usuario.clienteId };
  },
);

/** Sesión del equipo de Vibo (panel admin interno). */
export const requerirViboAdmin = cache(async (): Promise<UsuarioSesion> => {
  const usuario = await verificarSesion();

  if (usuario.rol !== "VIBO_ADMIN") {
    redirect(PREFIJO_DASHBOARD);
  }

  return usuario;
});
