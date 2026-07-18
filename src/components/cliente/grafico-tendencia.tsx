import type { PuntoTendencia } from "@/lib/cliente/datos";

/**
 * Gráfico de líneas de la tendencia de reservas de la semana.
 *
 * SVG a mano, sin librería: es un dibujo simple y así no suma JS de cliente. El
 * foco es la línea (negra); el resto —ejes, grilla— casi no existe, según el
 * estándar limpio del dashboard. El único acento de color es el punto de hoy,
 * en rojo.
 */

const W = 600;
const H = 170;
const PAD_X = 18;
const PAD_TOP = 22;
const PAD_BOTTOM = 30;
const INNER_W = W - PAD_X * 2;
const INNER_H = H - PAD_TOP - PAD_BOTTOM;
const BASE_Y = PAD_TOP + INNER_H;

export function GraficoTendencia({ datos }: { datos: PuntoTendencia[] }) {
  if (datos.length < 2) return null;

  const max = Math.max(1, ...datos.map((d) => d.total));
  const total = datos.reduce((s, d) => s + d.total, 0);

  const puntos = datos.map((d, i) => ({
    ...d,
    x: PAD_X + (i * INNER_W) / (datos.length - 1),
    y: PAD_TOP + (1 - d.total / max) * INNER_H,
    ultimo: i === datos.length - 1,
  }));

  const linea = puntos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area =
    `M ${puntos[0].x.toFixed(1)},${BASE_Y} ` +
    puntos.map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
    ` L ${puntos[puntos.length - 1].x.toFixed(1)},${BASE_Y} Z`;

  return (
    <div>
      <p className="text-sm text-neutral-500">
        {total} {total === 1 ? "turno reservado" : "turnos reservados"} en los últimos 7 días
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-auto w-full"
        role="img"
        aria-label={`Tendencia de reservas: ${datos
          .map((d) => `${d.etiqueta} ${d.total}`)
          .join(", ")}`}
      >
        <defs>
          <linearGradient id="grad-tendencia" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0F0F0F" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#0F0F0F" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Área tenue bajo la línea, para dar cuerpo sin robar protagonismo. */}
        <path d={area} fill="url(#grad-tendencia)" />

        {/* La línea: negra, fina, crisp a cualquier tamaño. */}
        <polyline
          points={linea}
          fill="none"
          stroke="#0F0F0F"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {puntos.map((p) => (
          <g key={p.fecha}>
            {p.ultimo ? (
              <>
                {/* Punto de hoy: el único acento rojo. */}
                <circle cx={p.x} cy={p.y} r={7} fill="#ffffff" />
                <circle cx={p.x} cy={p.y} r={4.5} fill="#E0202C" />
              </>
            ) : (
              <circle cx={p.x} cy={p.y} r={3} fill="#0F0F0F" />
            )}
            <text
              x={p.x}
              y={H - 10}
              textAnchor="middle"
              fontSize={13}
              fill="#6b6b6b"
              fontFamily="var(--font-sans)"
            >
              {p.etiqueta}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
