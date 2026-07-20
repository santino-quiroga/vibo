import { AlertTriangle, ArrowUpRight } from "lucide-react";

import type { UsoPlan } from "@/lib/planes/uso";
import { cn } from "@/lib/utils";

/**
 * Estado del plan (sprint 5), para Inicio y para el admin.
 *
 * Muestra el consumo del pozo de conversaciones del ciclo con el plan
 * contratado y la fecha de renovación, que es lo que responde la pregunta real
 * del dueño: "¿me alcanza hasta fin de mes?".
 *
 * La barra es de 6px con las puntas redondeadas y el relleno neutro mientras
 * hay margen; pasa a ámbar en el aviso preventivo y al acento cuando se agotó.
 * El número va escrito además del color, porque el color solo no comunica.
 *
 * `compacto` la usa el admin, donde es una fila más de una ficha y no el
 * bloque principal de la pantalla.
 */
export function BarraUso({
  uso,
  compacto = false,
  className,
}: {
  uso: UsoPlan;
  compacto?: boolean;
  className?: string;
}) {
  const pct = Math.min(100, Math.round(uso.porcentaje * 100));
  const restantes = Math.max(0, uso.limite - uso.usadas);

  return (
    <div className={cn("space-y-5", className)}>
      {!compacto && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-neutral-400">Plan actual</p>
            <p className="t-card mt-1">{uso.plan}</p>
          </div>

          <a
            href="mailto:hola@vibo.ar?subject=Quiero%20mejorar%20mi%20plan"
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-neutral-200 bg-card px-4 text-[13px] font-medium transition-[background-color,border-color] duration-150 ease-out hover:border-neutral-300 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-vibo-rojo/40 focus-visible:outline-none"
          >
            Mejorar plan
            <ArrowUpRight className="size-4 text-neutral-400" strokeWidth={1.75} />
          </a>
        </div>
      )}

      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-neutral-500">
            Conversaciones · {uso.cicloEtiqueta}
          </span>
          <span className="text-sm tabular-nums">
            <span className="text-foreground font-semibold">{uso.usadas}</span>
            <span className="text-neutral-400"> / {uso.limite}</span>
          </span>
        </div>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100"
          role="progressbar"
          aria-valuenow={uso.usadas}
          aria-valuemin={0}
          aria-valuemax={uso.limite}
          aria-label="Uso de conversaciones del plan"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300 ease-out",
              uso.bloqueado
                ? "bg-vibo-acento"
                : uso.avisoPreventivo
                  ? "bg-warning"
                  : "bg-foreground",
            )}
            // Un mínimo visible: con 1 de 200, una barra proporcional sería
            // literalmente invisible y parecería que no se contó nada.
            style={{ width: `${Math.max(pct, uso.usadas > 0 ? 2 : 0)}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400">
          <span>{restantes} disponibles</span>
          <span>Se renueva el {uso.renovacion}</span>
        </div>
      </div>

      {uso.bloqueado ? (
        <p className="text-vibo-acento bg-vibo-acento/6 flex gap-2 rounded-[10px] p-3 text-[13px] leading-relaxed">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <span>
            Pozo agotado. {uso.sedesPausadasPorLimite} sede(s) pausada(s): el bot
            no responde hasta el próximo ciclo o hasta reactivarlas.
          </span>
        </p>
      ) : uso.avisoPreventivo ? (
        <p className="text-warning bg-warning-suave flex gap-2 rounded-[10px] p-3 text-[13px] leading-relaxed">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <span>
            Vas por el {pct}% del plan. Cuando se agote, el bot deja de responder
            hasta el próximo ciclo.
          </span>
        </p>
      ) : null}
    </div>
  );
}
