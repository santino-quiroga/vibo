import Link from "next/link";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";

/**
 * Un enlace con aspecto de botón.
 *
 * Existe por una razón concreta: `<Button render={<Link/>}>` renderiza un `<a>`,
 * y el Button de Base UI asume `nativeButton` y avisa que así se pierden las
 * semánticas nativas. Un `<a>` que dice ser `<button>` confunde a los lectores
 * de pantalla y responde distinto al teclado (Enter sí, Espacio no).
 *
 * Concentrarlo acá evita repetir `nativeButton={false}` en cada llamada y
 * olvidárselo en la próxima.
 */
export function BotonEnlace({
  href,
  children,
  ...props
}: { href: ComponentProps<typeof Link>["href"] } & Omit<
  ComponentProps<typeof Button>,
  "render" | "nativeButton"
>) {
  return (
    <Button nativeButton={false} render={<Link href={href} />} {...props}>
      {children}
    </Button>
  );
}
