import { cn } from "@/lib/utils";

/**
 * Select nativo con el estilo del resto de los campos.
 *
 * Se usa este y no el Select de Base UI a propósito: aquel necesita JS para
 * mandar el valor en el submit, y todos los formularios de este panel están
 * pensados para funcionar también sin JS.
 */
export function SelectNativo({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "bg-card h-10 w-full rounded-sm border border-neutral-400 px-3 text-sm",
        "focus-visible:border-vibo-rojo focus-visible:ring-vibo-rojo/20 outline-none focus-visible:ring-3",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
