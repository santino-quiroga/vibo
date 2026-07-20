import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // 40px de alto y 14px de padding: cómodo para el dedo (§12 cuenta con
        // uso real desde el celular) y con aire alrededor del texto.
        // El foco es un borde rojo sutil más un halo bajo, no un anillo grueso.
        "h-10 w-full min-w-0 rounded-[10px] border border-neutral-200 bg-card px-3.5 py-2 text-base transition-[border-color,box-shadow] duration-150 ease-out outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-neutral-400 hover:border-neutral-300 focus-visible:border-vibo-rojo/60 focus-visible:ring-2 focus-visible:ring-vibo-rojo/15 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/15 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
