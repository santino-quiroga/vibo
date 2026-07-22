"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Muestra un identificador en monospace con un botón para copiarlo.
 *
 * Nace de un requerimiento de testing: el ID del agente hacía falta leerlo de la
 * URL. Se necesita a mano para cablear n8n (los endpoints de integración lo
 * llevan en la ruta), así que tenerlo a un click evita entrar al detalle y
 * copiarlo de la barra de direcciones.
 */
export function CopiarId({
  valor,
  etiqueta = "ID",
  className,
}: {
  valor: string;
  etiqueta?: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles el valor igual está a la vista para copiarlo a mano.
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      title={`Copiar ${etiqueta}`}
      className={cn(
        "group inline-flex max-w-full items-center gap-1.5 rounded-[6px] border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-500 transition-colors hover:border-neutral-300 hover:text-foreground focus-visible:ring-2 focus-visible:ring-vibo-rojo/40 focus-visible:outline-none",
        className,
      )}
    >
      <span className="etiqueta shrink-0">{etiqueta}</span>
      <span className="min-w-0 truncate font-mono">{valor}</span>
      <span className="shrink-0 text-neutral-400 group-hover:text-foreground" aria-hidden="true">
        {copiado ? "✓" : "⧉"}
      </span>
      <span className="sr-only">{copiado ? "Copiado" : "Copiar al portapapeles"}</span>
    </button>
  );
}
