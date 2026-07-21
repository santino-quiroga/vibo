# KPIs de negocio y ciclo de revisión

**Objetivo:** medir el negocio desde el primer piloto — no solo la técnica — y fijar
la cadencia con la que se revisa el rumbo, para que las decisiones (pricing, canal,
Evolution vs API oficial, lanzamiento) se tomen con datos y en fechas fijas, no
cuando algo explota.

**Responsable:** Santino arma el tablero y trae los números; el socio trae los del
embudo comercial y marca. La revisión es de a dos, sin excepción.

**Fechas:** revisión semanal desde el lun 27 jul (30 min, lunes 9:00). Primera
revisión mensual profunda: **lun 31 ago** (90 min). Luego, último lunes de cada mes.

---

## 1. KPIs por etapa

### Comerciales (desde Semana 3 — dueño: socio)

| KPI | Definición | Objetivo del ciclo |
|-----|-----------|--------------------|
| Contactos iniciados/sem | Prospectos con primer mensaje o visita | ≥ 10 |
| Demos dadas/sem | Demo completa con el guión | 3–5 |
| Conversión contacto→demo | demos ÷ contactos | ≥ 30–40% |
| Conversión demo→piloto | pilotos firmados ÷ demos | ≥ 25–30% |
| CAC por piloto | (horas de venta × costo hora + gastos) ÷ pilotos | medirlo primero, optimizar después |

El CAC en esta etapa es casi todo tiempo propio: registrar las horas de venta por
semana aunque duela. Sin eso, "vender más" y "quemarse" son indistinguibles.

### Del producto en manos del cliente (desde Semana 4 — dueño: Santino)

| KPI | Definición | Fuente |
|-----|-----------|--------|
| Conversaciones/mes por cliente | contactos nuevos del ciclo | panel Vibo (ya existe) |
| **Tasa de conversión conversación→reserva** | turnos con "Creada por bot" ÷ conversaciones | panel Vibo (ya existe, con el flag correcto) |
| % de reservas fuera de horario de atención | reservas del bot entre 21:00 y 09:00 | Airtable — **es EL número del caso de éxito** |
| Tasa de intervención humana | conversaciones donde el dueño tomó control ÷ total | panel Vibo |
| Uso del plan | conversaciones ÷ tope (señales ya en admin: ≤10% churn, ≥80% upsell) | panel admin |
| Último acceso del dueño | días desde el último login (≥14 días = señal de churn, ya en admin) | panel admin |

### De retención y plata (desde el mes 2 — dueños: los dos)

- **Retención de pilotos:** pilotos que pasan a precio pleno ÷ pilotos que terminan
  los 3 meses. Es la validación real del negocio; objetivo ≥ 2 de 3.
- **MRR y "sin cobrar"** (ambos ya calculados en `/admin/panel`).
- **Churn mensual** (clientes que se van ÷ activos) — con 3–5 clientes se mide por
  conversación de salida, no por porcentaje: cada baja tiene nombre y motivo escrito.
- **Costo por conversación real** (factura OpenAI ÷ conversaciones) vs. el supuesto
  de `pricing-unit-economics.md` §2.

### Operativos mínimos (guardarraíl, no tablero)

Uptime del VPS/Evolution (monitor externo), incidentes detectados por el monitor vs.
reportados por clientes (si el cliente avisa primero, el monitoreo falló), tiempo de
reposición si hay ban, horas de onboarding y de soporte por cliente.

## 2. Ciclo de revisión

### Semanal — lunes 9:00, 30 min (desde el 27 jul)

Agenda fija, en este orden:
1. Números de la semana contra el objetivo (embudo comercial + producto).
2. El roadmap maestro: ¿el hito de la semana pasada se cumplió? Si no, ¿qué se
   corta? (Se corta alcance, no se estira la fecha en silencio.)
3. Incidentes y pedidos fuera de alcance nuevos (van al backlog, no se debaten acá).
4. Compromisos de la semana: 3 máximo por persona, escritos.

### Mensual profunda — último lunes del mes, 90 min (primera: 31 ago)

Todo lo de la semanal, más las decisiones que NO se tocan semana a semana:
- **Pricing:** costo real vs. supuesto, ajuste por inflación, ¿el descuento de
  piloto sigue teniendo sentido?
- **Veredicto Evolution:** ¿hubo bans o sustos? ¿ya hay ~5 clientes? → re-evaluar
  Meta Cloud API (auditoría §2).
- **Backlog de pedidos:** ¿algo lo pidieron 2–3 clientes? → entra a producto.
- **Límites de soporte:** ¿se respetaron? ¿horas de soporte por cliente creciendo?
- **Go/no-go de hitos grandes** (el del 7 de sep decide el lanzamiento del 14).

### Regla anti-deriva

Un KPI que nadie miró en dos revisiones seguidas se elimina del tablero. Mejor 8
números que se usan que 25 que decoran. Y al revés: ninguna decisión de rumbo
(precio, canal, feature grande, contratar) se toma fuera de una revisión — se anota
y espera al lunes. Con dos socios, la disciplina del ritual es lo que reemplaza al
directorio.

## 3. Tablero

Mes 1: una planilla compartida alcanza (columnas = semanas, filas = KPIs de arriba;
carga manual el lunes temprano). No construir dashboards en Vibo para esto todavía —
el panel admin ya trae MRR, uso, señales de riesgo y salud de integraciones; el resto
se copia a mano hasta que el ritual esté firme. Automatizar recién cuando cargar la
planilla duela de verdad (probablemente nunca con < 10 clientes).
