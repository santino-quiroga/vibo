import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * `sobreOscuro` lo adapta al header negro del admin: la variante outline usa
 * fondo claro y ahí quedaría como un bloque blanco compitiendo con el logo.
 */
export function BotonLogout({ sobreOscuro = false }: { sobreOscuro?: boolean }) {
  return (
    <form action={logoutAction}>
      <Button
        type="submit"
        variant="outline"
        size="sm"
        className={cn(
          sobreOscuro &&
            "border-neutral-700 bg-transparent text-neutral-300 hover:border-neutral-500 hover:bg-neutral-900 hover:text-vibo-blanco dark:bg-transparent",
        )}
      >
        Cerrar sesión
      </Button>
    </form>
  );
}
