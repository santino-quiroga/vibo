"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Mantiene la vista al día sin que el dueño tenga que recargar.
 *
 * El panel es todo server-rendered, así que un mensaje que entra por WhatsApp no
 * aparece hasta que alguien aprieta F5. Para una bandeja de conversaciones eso
 * la vuelve inservible como pantalla de trabajo: hay que estar recargando para
 * enterarse de que un cliente escribió.
 *
 * `router.refresh()` vuelve a ejecutar los server components y actualiza lo que
 * cambió, **conservando el estado de los client components** — el texto a medio
 * escribir en el chat no se pierde. Por eso no se usa `location.reload()`.
 *
 * No hay websockets ni SSE a propósito: mantener una conexión abierta no encaja
 * con funciones serverless, y para el volumen de este panel el polling alcanza.
 */
export function AutoRefresco({
  /** Cada cuánto refrescar, en segundos. */
  segundos = 10,
}: {
  segundos?: number;
}) {
  const router = useRouter();
  // Arranca en 0 y no en Date.now(): leer el reloj durante el render es impuro.
  // Se siembra dentro del efecto, que es donde sí corresponde.
  const ultimoRefresco = useRef(0);

  useEffect(() => {
    const intervalo = segundos * 1000;
    ultimoRefresco.current = Date.now();

    function refrescar() {
      ultimoRefresco.current = Date.now();
      router.refresh();
    }

    /**
     * Se saltea el refresco si el dueño está escribiendo.
     *
     * `router.refresh()` conserva el estado de los client components, así que en
     * teoría el textarea sobrevive igual. Pero un refresco en medio de una
     * respuesta a un cliente es justo el momento donde un bug de más costaría
     * perder el texto, y esperar unos segundos no cuesta nada.
     */
    function estaEscribiendo(): boolean {
      const activo = document.activeElement;
      if (activo instanceof HTMLTextAreaElement || activo instanceof HTMLInputElement) {
        return activo.value.trim() !== "";
      }
      return false;
    }

    const id = setInterval(() => {
      // Con la pestaña de fondo no se refresca: nadie lo está mirando, y cada
      // refresco es una invocación de función que se paga.
      if (document.visibilityState !== "visible") return;
      if (estaEscribiendo()) return;
      refrescar();
    }, intervalo);

    // Al volver a la pestaña se refresca en el acto, sin esperar el intervalo:
    // es el momento exacto en que la persona quiere ver lo que se perdió.
    function alVolver() {
      if (document.visibilityState !== "visible") return;
      // Guarda contra el ida y vuelta rápido entre pestañas, que si no dispara
      // un refresco por cada cambio de foco.
      if (Date.now() - ultimoRefresco.current < intervalo) return;
      if (estaEscribiendo()) return;
      refrescar();
    }

    document.addEventListener("visibilitychange", alVolver);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [router, segundos]);

  return null;
}
