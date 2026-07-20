import { cn } from "@/lib/utils";

/**
 * El damero — el elemento firma de la interfaz.
 *
 * Es el motivo más reconocible del manual (franjas, costuras, esquinas). Acá
 * se usa en exactamente dos lugares: la franja superior de cada página y la
 * costura del login. En más lados dejaría de ser una firma y sería ruido.
 *
 * Los colores y el tamaño del cuadro se pasan por variables CSS porque el
 * manual lo aplica en distintas combinaciones (negro/blanco, rojo/acento).
 */
export function Damero({
  c1 = "var(--vibo-negro)",
  c2 = "var(--vibo-blanco)",
  cuadro = 12,
  className,
}: {
  c1?: string;
  c2?: string;
  cuadro?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("damero", className)}
      style={
        {
          "--damero-c1": c1,
          "--damero-c2": c2,
          "--damero-sq": `${cuadro}px`,
        } as React.CSSProperties
      }
    />
  );
}

/**
 * La franja de damero que encabeza cada página.
 *
 * 4px de alto y cuadro de 4px: a esa escala se lee como un detalle de marca y
 * no como una banda. Una franja gruesa arriba de un panel que busca calma
 * compite con el contenido, que es lo que el usuario vino a mirar.
 */
export function FranjaDamero({
  c1,
  c2,
  className,
}: {
  c1?: string;
  c2?: string;
  className?: string;
}) {
  return (
    <Damero c1={c1} c2={c2} cuadro={4} className={cn("h-1 w-full", className)} />
  );
}
