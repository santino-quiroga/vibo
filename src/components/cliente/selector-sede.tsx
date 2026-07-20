"use client";

import { MapPin } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgenteEnAlcance } from "@/lib/cliente/datos";

const TODAS = "__todas__";

/**
 * Selector de sede del header (punto 5: el alcance es transversal al panel).
 *
 * Vive en el header y no en cada página, así que no puede ser un form GET: un
 * layout de Next no recibe searchParams. Navega con el router conservando el
 * resto de la query — cambiar de sede no te tiene que resetear el período que
 * venías mirando.
 */
export function SelectorSede({ agentes }: { agentes: AgenteEnAlcance[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Con una sola sede no hay nada que elegir: se muestra el nombre y listo.
  // Un desplegable de un solo ítem es ruido.
  if (agentes.length <= 1) {
    const unica = agentes[0];
    if (!unica) return null;

    // Se esconde en mobile: con una sola sede el dato es decorativo (el
    // subtítulo de cada página ya dice el alcance) y ahí el ancho hace falta
    // para lo que sí es accionable.
    return (
      <span className="hidden items-center gap-2 text-sm text-neutral-500 sm:flex">
        <MapPin className="size-4 shrink-0 text-neutral-400" strokeWidth={1.75} />
        <span className="max-w-40 truncate">{unica.nombre}</span>
      </span>
    );
  }

  const actual = searchParams.get("sede") ?? TODAS;

  function alCambiar(valor: unknown) {
    const sede = String(valor);
    const params = new URLSearchParams(searchParams.toString());

    if (sede === TODAS) params.delete("sede");
    else params.set("sede", sede);

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Select value={actual} onValueChange={alCambiar}>
      <SelectTrigger
        aria-label="Sede"
        className="h-9 gap-2 rounded-[10px] border-neutral-200 pr-2 pl-3 transition-colors duration-150 hover:bg-neutral-100"
      >
        <MapPin className="size-4 text-neutral-400" strokeWidth={1.75} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-[10px]">
        <SelectItem value={TODAS}>Todas las sedes</SelectItem>
        {agentes.map((agente) => (
          <SelectItem key={agente.id} value={agente.id}>
            {agente.nombre}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
