"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Muestra secretos recién generados que no se pueden volver a ver.
 *
 * Contraseñas y tokens de integración se guardan hasheados o cifrados, así que
 * este es el único momento en que existen en claro para el equipo. La UI lo dice
 * explícitamente para que nadie cierre la pantalla creyendo que después los
 * recupera de algún lado.
 */
export function SecretoUnaVez({
  titulo,
  items,
}: {
  titulo: string;
  items: { label: string; valor: string }[];
}) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sin esto, copiar y navegar dentro de los 2 segundos dispara un setState
  // sobre un componente ya desmontado.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copiar(label: string, valor: string) {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(label);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiado(null), 2000);
    } catch {
      // Sin permiso de portapapeles el valor igual está a la vista para copiarlo a mano.
    }
  }

  // La sombra dura del manual se reserva para un elemento por pantalla. En
  // estas, es este: son credenciales que existen en claro una sola vez, y tiene
  // que ser lo que la vista grita.
  return (
    <div className="border-vibo-negro sombra-dura bg-card border-2 p-5">
      <p className="etiqueta text-vibo-rojo">{titulo}</p>
      <p className="mt-2 text-sm font-semibold">
        Guardá esto ahora: por seguridad no se puede volver a ver.
      </p>

      <dl className="mt-4 space-y-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex flex-wrap items-center gap-2 border border-neutral-300 bg-neutral-100 px-3 py-2"
          >
            <dt className="etiqueta w-24 shrink-0 text-neutral-500">
              {item.label}
            </dt>
            <dd className="text-foreground min-w-0 flex-1 font-mono text-sm break-all">
              {item.valor}
            </dd>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => copiar(item.label, item.valor)}
            >
              {copiado === item.label ? "Copiado" : "Copiar"}
            </Button>
          </div>
        ))}
      </dl>
    </div>
  );
}
