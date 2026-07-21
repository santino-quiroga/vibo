# Pricing y unit economics

**Objetivo:** saber cuánto cuesta de verdad servir a un cliente con la infraestructura
actual, confirmar que la estructura de planes cierra, y dejar definido el precio del
piloto.

**Responsable:** Santino (números de costo), decisión de precios en conjunto.
**Fechas:** este documento queda vigente desde hoy (21 jul); primera revisión con
datos reales de consumo en la revisión mensual del 31 ago (ver
`kpis-ciclo-revision.md`). Los costos de LLM se recalculan con la factura real de
OpenAI del primer mes de piloto.

---

## 1. Estructura de costos actual (fijos, hoy)

| Rubro | Costo | Nota |
|-------|-------|------|
| VPS Hostinger (n8n + Evolution) | USD 25/mes | Compartido por TODOS los clientes. Punto único de falla (ver auditoría §4.2). |
| Vercel (Vibo) | USD 0 hoy | Hobby alcanza para el piloto; presupuestar Pro (USD 20/mes) al crecer tráfico/equipo. |
| Neon Postgres | USD 0 hoy | Free tier sobra para esta escala. |
| Resend + dominio | ~USD 10–15/año | Dominio pendiente de compra (necesario para mandar emails a clientes reales). |
| OpenAI (LLM) | variable | Único costo que escala por conversación — ver §2. |

**Total fijo hoy: ~USD 25–27/mes** para servir a N clientes, hasta que el VPS quede
chico (no antes de ~5–10 clientes).

## 2. Costo por conversación (gpt-5-mini)

Supuestos (verificar contra la página de precios de OpenAI y contra la factura real
del primer mes — esta cuenta usa los valores de referencia de gpt-5-mini:
USD 0,25 / millón de tokens de entrada, USD 2 / millón de salida):

- Conversación típica de reserva: 6–10 mensajes del cliente final.
- Cada mensaje re-ejecuta el agente con system prompt (~2.500 tokens: promptBase +
  bloque Vibo + reglas del workflow) + historial + llamadas a tools
  (disponibilidad/reserva). Entrada acumulada estimada: 25.000–40.000 tokens.
- Salida total: 1.500–2.500 tokens.
- Algunos audios → transcripción (Whisper), centavos por minuto, marginal.

**Costo estimado por conversación completa: USD 0,01 – 0,03.**

| Plan | Conversaciones/mes | Costo LLM/mes (techo) |
|------|--------------------|------------------------|
| Starter | 200 | ~USD 2–6 |
| Profesional | 500 | ~USD 5–15 |
| Multi-sede | 2000 | ~USD 20–60 |

Conclusión importante: **el LLM no es el costo del negocio.** A esta escala, el costo
real de servir a un cliente es el trabajo humano (onboarding, soporte, monitoreo) y
el riesgo operativo — por eso los límites de `onboarding-limites-soporte.md` son la
verdadera protección del margen.

## 3. Costo marginal por cliente (todo incluido)

- LLM: USD 2–6 (Starter típico).
- Chip + número de respaldo pre-calentado: ~un chip prepago por cliente + 15 min/sem
  de mantenimiento (amortizado, despreciable en plata; no en disciplina).
- Reposición ante ban (si ocurre): un chip + 2–4 hs de trabajo (runbook de la
  auditoría §4.1). Presupuestar 1 reposición cada 10 cliente-mes como colchón
  pesimista; el tráfico reactivo debería mantenerlo muy por debajo.
- Fracción del VPS: USD 25 ÷ N clientes.

**Costo marginal total por cliente Starter: < USD 15/mes** con 2+ clientes activos.
Contra un precio de $150.000/mes, el **margen bruto supera el 85–90%** a cualquier
tipo de cambio razonable. El modelo cierra sobrado; el cuello es capacidad de
onboarding y soporte de 2 personas, no la infraestructura.

## 4. Planes (ya cargados en la plataforma y en el seed)

Diferenciados por **conversaciones/mes y sedes** — no por cantidad de agentes. El
tope de conversaciones es un pozo compartido del cliente entre todas sus sedes (así
está implementado: al agotarse, las sedes pasan a `PAUSADO_LIMITE` y el cron las
reactiva al ciclo siguiente).

| Plan | Precio/mes | Sedes | Conversaciones/mes |
|------|-----------:|------:|-------------------:|
| Starter | $150.000 | 1 | 200 |
| Profesional | $350.000 | 3 | 500 |
| Multi-sede | $750.000 | 10 | 2000 |

Guía de venta: complejo de 2–6 canchas con una sede = Starter. La señal de upsell ya
existe en el panel admin (uso ≥ 80% del tope).

Nota de producto: una "conversación" cuenta contactos nuevos del ciclo, no mensajes
— un cliente final que escribe 10 veces en el mes consume 1. Decirlo en la venta:
es un límite generoso y fácil de explicar.

## 5. Piloto: pago con descuento (decidido el 21/07/2026)

**Oferta piloto — primeros 3–5 clientes:**

- **$75.000/mes (50% del Starter) durante 3 meses**, después precio de lista.
- A cambio, por contrato simple: testimonio (video corto), permiso para publicar sus
  métricas como caso de éxito, 2 referidos presentados, y tolerancia de piloto
  (respuesta a incidentes en horario hábil, producto en evolución).
- Incluye la cláusula de reposición de número (< 1 día hábil) y el anexo de alcance
  de soporte.
- Cobro: Mercado Pago si la config de producción está lista (roadmap S3); si no,
  transferencia + "Marcar como pagado" manual en el admin. **El cobro manual no
  posterga la venta.**

Por qué pago y no gratis: un dueño que paga $75.000 usa el sistema y responde los
mensajes de seguimiento; uno que lo tiene gratis lo deja morir y no valida nada. El
descuento compra el testimonio, no el "sí".

## 6. Qué revisar con datos reales (31 ago)

1. Factura real de OpenAI ÷ conversaciones reales = costo por conversación verdadero
   (reemplaza los supuestos de §2).
2. Horas reales de onboarding y soporte por cliente (del log de
   `onboarding-limites-soporte.md`) → costo humano por cliente, el número que falta.
3. ¿Alguien chocó el tope de 200? ¿El pozo compartido se entendió en la venta?
4. Precios en ARS con inflación: definir regla de actualización (p. ej. revisión
   trimestral o indexación al plan siguiente de MP) antes de que el primer piloto
   pase a precio pleno (mediados de noviembre 2026).
