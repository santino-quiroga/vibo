import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Mismo criterio que Input: campo claro sobre el fondo gris, borde
        // marcado y foco en rojo de marca.
        "flex field-sizing-content min-h-16 w-full rounded-sm border border-neutral-400 bg-card px-3 py-2 text-base transition-colors outline-none placeholder:text-neutral-400 focus-visible:border-vibo-rojo focus-visible:ring-3 focus-visible:ring-vibo-rojo/20 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
