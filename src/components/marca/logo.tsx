import { cn } from "@/lib/utils";

import { Asterisco } from "./asterisco";

/**
 * El logo de Vibo, reproducido del manual de identidad (p1).
 *
 * Todo se dimensiona en `em` sobre el tamaño de la V, así que una sola prop
 * escala el lockup entero manteniendo las proporciones del manual: el punto
 * mide .32em y se ancla a -.22em del vértice.
 */

const TAMANOS = {
  xs: { v: "text-[22px]", texto: "text-[8px] tracking-[0.26em]" },
  sm: { v: "text-[26px]", texto: "text-[9px] tracking-[0.28em]" },
  md: { v: "text-[40px]", texto: "text-[10px] tracking-[0.32em]" },
  lg: { v: "text-[60px]", texto: "text-[12px] tracking-[0.4em]" },
  xl: { v: "text-[110px]", texto: "text-[16px] tracking-[0.5em]" },
} as const;

type Tamano = keyof typeof TAMANOS;

/** La V con el asterisco. Es el isotipo: "siempre sobre negro" (manual, p5). */
export function Isotipo({
  tamano = "md",
  className,
}: {
  tamano?: Tamano;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-display relative inline-block leading-[0.78] font-black",
        TAMANOS[tamano].v,
        className,
      )}
      aria-hidden="true"
    >
      V
      <span className="text-vibo-rojo absolute -top-[0.22em] -right-[0.22em] inline-block h-[0.32em] w-[0.32em]">
        <Asterisco />
      </span>
    </span>
  );
}

/**
 * Lockup completo: isotipo + wordmark.
 *
 * `stacked` apila la palabra debajo de la V, como la versión principal del
 * manual; sin esa prop van uno al lado del otro, alineados por la base.
 */
export function Logo({
  tamano = "md",
  stacked = false,
  className,
}: {
  tamano?: Tamano;
  stacked?: boolean;
  className?: string;
}) {
  const t = TAMANOS[tamano];

  return (
    <span
      className={cn(
        "inline-flex",
        stacked ? "flex-col items-start gap-0" : "items-end gap-[0.5em]",
        className,
      )}
      // El logo es texto para quien no lo ve: el resto del lockup es decorativo.
      role="img"
      aria-label="Vibo"
    >
      <Isotipo tamano={tamano} />
      <span
        className={cn("font-sans font-bold lowercase", t.texto)}
        aria-hidden="true"
      >
        vibo
      </span>
    </span>
  );
}
