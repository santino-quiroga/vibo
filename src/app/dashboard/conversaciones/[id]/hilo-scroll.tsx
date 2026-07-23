"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

// En cliente usamos layout effect (scrollea antes de pintar, sin parpadeo); en
// SSR cae a useEffect para no tirar el warning de useLayoutEffect en el server.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Caja del hilo que abre anclada abajo (últimos mensajes) y sigue el fondo
 * cuando llegan mensajes nuevos, salvo que el usuario haya subido a leer algo.
 *
 * El orden de los mensajes en el DOM queda natural (viejo→nuevo): sólo movemos
 * la posición del scroll, no el contenido. `dep` cambia con la cantidad de
 * mensajes, así el auto-refresco vuelve a pegar la vista abajo si correspondía.
 */
export function HiloScroll({
  dep,
  className,
  children,
}: {
  dep: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pegadoAbajo = useRef(true);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (el && pegadoAbajo.current) el.scrollTop = el.scrollHeight;
  }, [dep]);

  function alScrollear() {
    const el = ref.current;
    if (!el) return;
    // "Pegado abajo" con un margen chico, para no pelearle al usuario que subió.
    pegadoAbajo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  return (
    <div ref={ref} onScroll={alScrollear} className={className}>
      {children}
    </div>
  );
}
