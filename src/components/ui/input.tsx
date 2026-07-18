import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // h-10 y no h-8: el requerimiento §12 cuenta con uso real desde el
        // celular, y 32px queda por debajo del mínimo cómodo para el dedo.
        // bg-card sobre el fondo gris: el campo tiene que verse hundido en la
        // página, no fundido con ella.
        "h-10 w-full min-w-0 rounded-sm border border-neutral-400 bg-card px-3 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-neutral-400 focus-visible:border-vibo-rojo focus-visible:ring-3 focus-visible:ring-vibo-rojo/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
