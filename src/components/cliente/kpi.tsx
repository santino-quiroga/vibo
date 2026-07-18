import { cn } from "@/lib/utils";

/**
 * Un KPI de Inicio (punto 6).
 *
 * `nota` es para decir de dónde sale el número o por qué no está. Los cuatro
 * KPIs son estimaciones sobre datos de terceros, y un número grande sin
 * contexto invita a confiar más de lo que corresponde — sobre todo "ingresos
 * estimados", que el propio punto 6 aclara que no reemplaza la facturación.
 */
export function Kpi({
  titulo,
  valor,
  variacion,
  nota,
}: {
  titulo: string;
  valor: string;
  variacion?: number | null;
  nota?: string;
}) {
  return (
    <div className="tarjeta p-5">
      <h3 className="etiqueta text-neutral-500">{titulo}</h3>

      {/* Fraunces (font-serif), reservada para los números grandes de KPI. El
          número es lo primero que se lee: grande, con aire arriba. */}
      <p className="mt-3 font-serif text-3xl leading-none font-semibold tracking-tight tabular-nums">
        {valor}
      </p>

      {variacion !== undefined && variacion !== null && (
        <Variacion valor={variacion} />
      )}

      {nota && <p className="mt-3 text-xs leading-snug text-neutral-500">{nota}</p>}
    </div>
  );
}

/**
 * La variación contra el período anterior (punto 6).
 *
 * Sin verde ni rojo semáforo: el rojo de la marca es el color de acento, no el
 * de "mal", y usarlo acá chocaría con el #7A1024 que sí significa peligro.
 * La flecha y el signo ya dicen para dónde fue.
 */
function Variacion({ valor }: { valor: number }) {
  const subio = valor > 0;
  const plano = Math.abs(valor) < 0.005;
  const texto = plano
    ? "Sin cambios vs. período anterior"
    : `${subio ? "▲" : "▼"} ${Math.abs(Math.round(valor * 100))}% vs. período anterior`;

  return (
    <p
      className={cn(
        "mt-1 text-xs tabular-nums",
        plano ? "text-neutral-500" : "text-vibo-negro font-medium",
      )}
    >
      {texto}
    </p>
  );
}
