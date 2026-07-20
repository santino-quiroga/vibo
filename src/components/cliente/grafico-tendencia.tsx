"use client";

import { useState } from "react";

import type { PuntoTendencia } from "@/lib/cliente/datos";

/**
 * Tendencia de reservas de la semana.
 *
 * SVG a mano, sin librería de gráficos: es un dibujo simple y así no se suma
 * un bundle entero al panel. El protagonismo es de la línea; la grilla apenas
 * se insinúa y los ejes no existen. El único acento de color es el punto de
 * hoy, en rojo.
 *
 * El hover levanta una guía vertical y un tooltip con el dato exacto, que es
 * lo que la gente busca cuando pasa el mouse por un gráfico.
 */

const W = 640;
const H = 200;
const PAD_X = 24;
const PAD_TOP = 24;
const PAD_BOTTOM = 36;
const INNER_W = W - PAD_X * 2;
const INNER_H = H - PAD_TOP - PAD_BOTTOM;
const BASE_Y = PAD_TOP + INNER_H;

export function GraficoTendencia({ datos }: { datos: PuntoTendencia[] }) {
  const [activo, setActivo] = useState<number | null>(null);

  if (datos.length < 2) return null;

  const max = Math.max(1, ...datos.map((d) => d.total));
  const total = datos.reduce((s, d) => s + d.total, 0);
  const ancho = INNER_W / (datos.length - 1);

  const puntos = datos.map((d, i) => ({
    ...d,
    x: PAD_X + i * ancho,
    y: PAD_TOP + (1 - d.total / max) * INNER_H,
    ultimo: i === datos.length - 1,
  }));

  const linea = puntos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area =
    `M ${puntos[0].x.toFixed(1)},${BASE_Y} ` +
    puntos.map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
    ` L ${puntos[puntos.length - 1].x.toFixed(1)},${BASE_Y} Z`;

  // Tres líneas de referencia y nada más: alcanzan para leer alturas y son lo
  // bastante tenues como para no competir con la serie.
  const guias = [0, 0.5, 1].map((f) => PAD_TOP + f * INNER_H);

  const punto = activo !== null ? puntos[activo] : null;

  return (
    <div>
      <p className="text-sm text-neutral-500">
        <span className="text-foreground font-semibold tabular-nums">{total}</span>{" "}
        {total === 1 ? "turno reservado" : "turnos reservados"} en los últimos 7 días
      </p>

      <div className="relative mt-6">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full overflow-visible"
          role="img"
          aria-label={`Tendencia de reservas: ${datos
            .map((d) => `${d.etiqueta} ${d.total}`)
            .join(", ")}`}
          onMouseLeave={() => setActivo(null)}
        >
          <defs>
            <linearGradient id="grad-tendencia" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#111111" stopOpacity="0.07" />
              <stop offset="100%" stopColor="#111111" stopOpacity="0" />
            </linearGradient>
          </defs>

          {guias.map((y) => (
            <line
              key={y}
              x1={PAD_X}
              x2={W - PAD_X}
              y1={y}
              y2={y}
              stroke="#e8e8e8"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Relleno de muy baja opacidad: da cuerpo sin robar protagonismo. */}
          <path d={area} fill="url(#grad-tendencia)" />

          {/* Guía vertical del punto activo, por debajo de la línea. */}
          {punto && (
            <line
              x1={punto.x}
              x2={punto.x}
              y1={PAD_TOP}
              y2={BASE_Y}
              stroke="#dcdcdc"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}

          <polyline
            points={linea}
            fill="none"
            stroke="#111111"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {puntos.map((p, i) => (
            <g key={p.fecha}>
              {p.ultimo ? (
                <>
                  {/* Hoy: el único acento rojo del gráfico. */}
                  <circle cx={p.x} cy={p.y} r={8} fill="#ffffff" />
                  <circle cx={p.x} cy={p.y} r={5} fill="#e0202c" />
                </>
              ) : (
                // Los demás puntos sólo existen al pasar por encima: la serie
                // se lee mejor como línea limpia que como collar de puntos.
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={activo === i ? 5 : 0}
                  fill="#ffffff"
                  stroke="#111111"
                  strokeWidth={2.5}
                  className="transition-[r] duration-150 ease-out"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {/* 16 y no 12: el SVG escala con el ancho del contenedor, así
                  que en el celular un 12 del viewBox termina en ~7px reales. */}
              <text
                x={p.x}
                y={H - 10}
                textAnchor="middle"
                fontSize={16}
                fontWeight={500}
                fill={activo === i || p.ultimo ? "#666666" : "#999999"}
                className="transition-colors duration-150"
              >
                {p.etiqueta}
              </text>

              {/* Zona de captura del mouse: una banda por punto, invisible. Sin
                  esto habría que apuntarle a un círculo de 5px. */}
              <rect
                x={p.x - ancho / 2}
                y={0}
                width={ancho}
                height={H}
                fill="transparent"
                onMouseEnter={() => setActivo(i)}
              />
            </g>
          ))}
        </svg>

        {/* Tooltip en HTML y no en SVG: hereda la tipografía del sistema y se
            le puede dar sombra y radio sin pelear con el SVG. */}
        {punto && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
            style={{
              left: `${(punto.x / W) * 100}%`,
              top: `${(punto.y / H) * 100}%`,
              marginTop: "-12px",
            }}
          >
            <div className="bg-card rounded-[10px] border border-neutral-200 px-3 py-2 shadow-[var(--sombra-flotante)]">
              <p className="text-[11px] font-medium text-neutral-400 uppercase">
                {punto.etiqueta}
              </p>
              <p className="text-foreground text-sm font-semibold tabular-nums">
                {punto.total} {punto.total === 1 ? "turno" : "turnos"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
