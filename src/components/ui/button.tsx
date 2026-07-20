import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Alturas uniformes en múltiplos de 4 (36/32/40), radio 10px en todos los
// tamaños y la misma transición de 150ms. Ningún botón del sistema queda con
// el aspecto por defecto del navegador.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[10px] border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out outline-none select-none focus-visible:ring-2 focus-visible:ring-vibo-rojo/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // La acción primaria es uno de los pocos lugares donde el rojo es
        // superficie. Por eso hay como mucho una por pantalla.
        default: "bg-primary text-primary-foreground hover:bg-[#c81b26]",
        outline:
          "border-neutral-200 bg-card text-foreground hover:border-neutral-300 hover:bg-neutral-50 aria-expanded:bg-neutral-100",
        secondary:
          "bg-neutral-100 text-foreground hover:bg-neutral-200 aria-expanded:bg-neutral-200",
        ghost:
          "text-neutral-500 hover:bg-neutral-100 hover:text-foreground aria-expanded:bg-neutral-100 aria-expanded:text-foreground",
        destructive:
          "bg-destructive/8 text-destructive hover:bg-destructive/14 focus-visible:ring-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-2 px-4",
        xs: "h-7 gap-1.5 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 px-3 text-[13px]",
        lg: "h-10 gap-2 px-5",
        icon: "size-9",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
