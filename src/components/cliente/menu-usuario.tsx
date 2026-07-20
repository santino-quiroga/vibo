"use client";

import { Menu } from "@base-ui/react/menu";
import { ChevronDown } from "lucide-react";
import Link from "next/link";

import { logoutAction } from "@/app/(auth)/actions";

/**
 * El menú de usuario del punto 5: "Plan / Cuenta / Cambiar contraseña / Cerrar
 * sesión", como dropdown y no como sección propia del sidebar.
 *
 * Está agrupado a propósito: son cuatro acciones que se usan poco y una de
 * ellas cierra la sesión. Sueltas en el header (como estaban el engranaje y el
 * botón de logout) compiten en peso visual con las cuatro secciones reales del
 * producto, y "Cerrar sesión" queda a un click de distancia todo el tiempo.
 */

const ID_FORM_LOGOUT = "form-logout-usuario";

const claseItem =
  "flex cursor-default items-center rounded-[8px] px-3 py-2 text-sm text-neutral-600 outline-none select-none data-[highlighted]:bg-neutral-100 data-[highlighted]:text-foreground";

export function MenuUsuario({
  email,
  clienteNombre,
  iniciales,
}: {
  email: string;
  clienteNombre: string;
  iniciales: string;
}) {
  return (
    <>
      {/* El form del logout es hermano del menú, no hijo: Menu.Root espera sus
          propias partes como hijos y un nodo suelto adentro rompe el popup. El
          botón de "Cerrar sesión" se asocia por el atributo `form`. */}
      <form id={ID_FORM_LOGOUT} action={logoutAction} className="hidden" />

      <Menu.Root>
      <Menu.Trigger className="flex items-center gap-3 rounded-[10px] px-1.5 py-1 transition-colors duration-150 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-vibo-rojo/40 focus-visible:outline-none">
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600"
        >
          {iniciales}
        </span>
        {/* En mobile el bloque de texto se va: el avatar ya identifica la
            sesión y el ancho hace falta para el resto. */}
        <span className="hidden text-left leading-tight sm:block">
          <span className="text-foreground block text-sm font-medium">{email}</span>
          <span className="block text-xs text-neutral-400">{clienteNombre}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-neutral-400" strokeWidth={1.75} />
        <span className="sr-only">Abrir menú de usuario</span>
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-50">
          <Menu.Popup className="bg-card min-w-56 rounded-[12px] border border-neutral-200 p-1 shadow-lg">
            <div className="border-b border-neutral-200 px-3 py-2 sm:hidden">
              <p className="truncate text-sm font-medium">{email}</p>
              <p className="truncate text-xs text-neutral-400">{clienteNombre}</p>
            </div>

            <Menu.Item className={claseItem} render={<Link href="/cuenta/plan" />}>
              Plan
            </Menu.Item>
            <Menu.Item className={claseItem} render={<Link href="/cuenta" />}>
              Cuenta
            </Menu.Item>
            <Menu.Item
              className={claseItem}
              render={<Link href="/cuenta#cambiar-password" />}
            >
              Cambiar contraseña
            </Menu.Item>

            <div className="my-1 h-px bg-neutral-200" />

            {/* El logout es una Server Action, así que va como submit de un
                form y no como un link: cerrar sesión escribe (borra la cookie),
                y eso no puede ser una navegación GET.
                El form vive fuera del portal y el botón se asocia por su id
                (atributo `form` de HTML), porque el menú se renderiza en otro
                punto del DOM y no puede quedar anidado adentro del form. */}
            {/* `nativeButton` porque el render ES un <button> de verdad: sin
                esto Base UI le agrega atributos de botón emulado (role,
                aria-disabled) encima de uno nativo, y avisa por consola. */}
            <Menu.Item
              className={claseItem}
              nativeButton
              render={<button type="submit" form={ID_FORM_LOGOUT} />}
            >
              Cerrar sesión
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
      </Menu.Root>
    </>
  );
}
