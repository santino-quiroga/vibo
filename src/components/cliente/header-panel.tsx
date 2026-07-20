import { Bell } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/marca/logo";
import { MenuUsuario } from "@/components/cliente/menu-usuario";
import { SelectorSede } from "@/components/cliente/selector-sede";
import type { AgenteEnAlcance, ClienteDeSesion } from "@/lib/cliente/datos";

/** Las iniciales del email, para el avatar. "ana.perez@x.com" -> "AP". */
function iniciales(email: string): string {
  const usuario = email.split("@")[0] ?? "";
  const partes = usuario.split(/[.\-_]+/).filter(Boolean);
  const letras =
    partes.length >= 2 ? `${partes[0][0]}${partes[1][0]}` : usuario.slice(0, 2);
  return letras.toUpperCase();
}

/**
 * Header del panel cliente.
 *
 * Tres zonas alineadas al mismo eje vertical: identidad y alcance a la
 * izquierda, acciones a la derecha, y el usuario al final. Todo con aire: es
 * la barra que se ve en todas las pantallas, así que cualquier apretujón se
 * paga en todas.
 */
export function HeaderPanel({
  email,
  cliente,
  agentes,
  sinLeer,
}: {
  email: string;
  cliente: ClienteDeSesion;
  agentes: AgenteEnAlcance[];
  sinLeer: number;
}) {
  return (
    <header className="bg-card sticky top-0 z-30 border-b border-neutral-200">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-4 px-6">
        <Logo tamano="xs" />

        <span
          aria-hidden="true"
          className="hidden h-6 w-px bg-neutral-200 sm:block"
        />

        <SelectorSede agentes={agentes} />

        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/dashboard/conversaciones"
            aria-label={
              sinLeer > 0
                ? `Notificaciones: ${sinLeer} conversaciones sin leer`
                : "Notificaciones: nada sin leer"
            }
            className="relative inline-flex size-9 items-center justify-center rounded-[10px] text-neutral-500 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-vibo-rojo/40 focus-visible:outline-none"
          >
            <Bell className="size-[18px]" strokeWidth={1.75} />
            {/* El punto rojo sólo aparece si hay algo que atender: un badge
                permanente en cero entrena a ignorarlo. */}
            {sinLeer > 0 && (
              <span className="bg-vibo-rojo absolute top-2 right-2 size-2 rounded-full ring-2 ring-white" />
            )}
          </Link>

          <span aria-hidden="true" className="mx-2 h-6 w-px bg-neutral-200" />

          {/* Plan, Cuenta, Cambiar contraseña y Cerrar sesión viven acá adentro
              (punto 5), no sueltos en la barra. */}
          <MenuUsuario
            email={email}
            clienteNombre={cliente.nombre}
            iniciales={iniciales(email)}
          />
        </div>
      </div>
    </header>
  );
}
