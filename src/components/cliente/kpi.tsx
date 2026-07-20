import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Un KPI de Inicio (punto 6).
 *
 * El número es el elemento visual más importante de la pantalla: 40px, peso
 * 700, y todo lo demás alrededor en gris. El rótulo va arriba y chico; la
 * variación, abajo, como un chip discreto.
 *
 * `nota` dice de dónde sale el número o por qué no está. Los cuatro KPIs son
 * estimaciones sobre datos de terceros, y un número grande sin contexto invita
 * a confiar más de lo que corresponde — sobre todo "ingresos estimados", que el
 * propio punto 6 aclara que no reemplaza la facturación.
 */
export function Kpi({
  titulo,
  valor,
  variacion,
  periodo,
  nota,
}: {
  titulo: string;
  valor: string;
  variacion?: number | null;
  /** Contexto temporal corto, ej. "últimos 30 días". */
  periodo?: string;
  nota?: string;
}) {
  const hayPie = (variacion !== undefined && variacion !== null) || Boolean(periodo);

  return (
    <div className="tarjeta flex flex-col p-6">
      <h3 className="text-[13px] font-medium text-neutral-500">{titulo}</h3>

      <p className="t-metrica text-foreground mt-4">{valor}</p>

      {hayPie && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {variacion !== undefined && variacion !== null && (
            <Variacion valor={variacion} />
          )}
          {periodo && <span className="text-xs text-neutral-400">{periodo}</span>}
        </div>
      )}

      {nota && (
        <p className="mt-4 text-xs leading-relaxed text-neutral-400">{nota}</p>
      )}
    </div>
  );
}

/**
 * La variación contra el período anterior (punto 6).
 *
 * Verde y ámbar en vez de verde y rojo: el rojo es el color de identidad de la
 * marca, y usarlo para "bajó" lo convertiría en un semáforo además de chocar
 * con el rojo de la navegación activa. La flecha acompaña al color, así que el
 * dato no depende sólo del tono.
 */
function Variacion({ valor }: { valor: number }) {
  const plano = Math.abs(valor) < 0.005;
  const subio = valor > 0;
  const pct = Math.abs(Math.round(valor * 100));

  const Icono = plano ? Minus : subio ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium tabular-nums",
        plano && "bg-neutral-100 text-neutral-500",
        !plano && subio && "bg-exito-suave text-exito",
        !plano && !subio && "bg-warning-suave text-warning",
      )}
    >
      <Icono className="size-3.5" strokeWidth={2} />
      {plano ? "Sin cambios" : `${subio ? "+" : "−"}${pct}%`}
    </span>
  );
}
