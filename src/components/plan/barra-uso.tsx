import type { UsoPlan } from "@/lib/planes/uso";
import { cn } from "@/lib/utils";

/**
 * Barra de uso del plan (sprint 5), para Inicio y para el admin.
 *
 * Muestra el consumo del pozo de conversaciones del ciclo. Sin verde ni ámbar,
 * como el resto: el relleno es neutro mientras hay margen, pasa al acento
 * (#7A1024) cuando se agotó y bloqueó. El número va escrito además del color,
 * porque el color solo no comunica el dato.
 */
export function BarraUso({ uso, className }: { uso: UsoPlan; className?: string }) {
  const pct = Math.min(100, Math.round(uso.porcentaje * 100));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="etiqueta text-neutral-500">
          Conversaciones · {uso.cicloEtiqueta}
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {uso.usadas} / {uso.limite}
        </span>
      </div>

      {/* Barra fina, técnica: track neutro con borde sutil, relleno plano. El
          rojo aparece solo cuando hay aviso/bloqueo (es una alerta). */}
      <div
        className="h-2 w-full overflow-hidden rounded-[2px] border border-black/10 bg-neutral-100"
        role="progressbar"
        aria-valuenow={uso.usadas}
        aria-valuemin={0}
        aria-valuemax={uso.limite}
        aria-label="Uso de conversaciones del plan"
      >
        <div
          className={cn(
            "h-full transition-[width]",
            uso.bloqueado ? "bg-vibo-acento" : uso.avisoPreventivo ? "bg-vibo-rojo" : "bg-vibo-negro",
          )}
          style={{ width: `${Math.max(pct, uso.usadas > 0 ? 3 : 0)}%` }}
        />
      </div>

      {uso.bloqueado ? (
        <p className="text-vibo-acento text-sm">
          Pozo agotado. {uso.sedesPausadasPorLimite} sede(s) pausada(s): el bot no
          responde hasta el próximo ciclo o hasta reactivarlas.
        </p>
      ) : uso.avisoPreventivo ? (
        <p className="text-sm text-neutral-600">
          Vas por el {pct}% del plan. Cuando se agote, el bot deja de responder
          hasta el próximo ciclo.
        </p>
      ) : null}
    </div>
  );
}
