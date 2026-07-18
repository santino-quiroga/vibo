import { cn } from "@/lib/utils";

/**
 * El asterisco de Vibo — tres barras redondeadas a 0°, 60° y 120°.
 *
 * Es el símbolo que hace de punto sobre la V y funciona solo como isotipo
 * mínimo (avatares, merch). Reproducido del manual de identidad, p1.
 *
 * Hereda el color con currentColor, así que se le aplica desde afuera.
 */
export function Asterisco({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn("block h-full w-full", className)}
    >
      <g fill="currentColor">
        <rect x="9.9" y="2" width="4.2" height="20" rx="1.1" />
        <rect
          x="9.9"
          y="2"
          width="4.2"
          height="20"
          rx="1.1"
          transform="rotate(60 12 12)"
        />
        <rect
          x="9.9"
          y="2"
          width="4.2"
          height="20"
          rx="1.1"
          transform="rotate(120 12 12)"
        />
      </g>
    </svg>
  );
}
