# Onboarding estándar y límites de soporte

**Objetivo:** que sumar un cliente sea ejecutar un checklist, no un proyecto a medida;
y que el soporte tenga un alcance escrito que proteja a un equipo de 2 personas de
los pedidos infinitos de desarrollo.

**Responsable:** Santino (runbook técnico y su ejecución); el socio conduce la
reunión de relevamiento con el cliente. Los límites de soporte los sostienen **los
dos** — el que promete una excepción en una reunión, la paga en horas propias.

**Fechas:** runbook escrito y ensayado con un cliente fantasma en Semana 2
(27 jul – 2 ago); primera ejecución real en Semana 4; se corrige después de cada
onboarding hasta que dos seguidos salgan sin sorpresas.

---

## 1. Estado de partida (honesto)

Hoy el alta es artesanal y con trampas conocidas:

- Los workflows de n8n se duplican **pegando JSON a mano** (la API de n8n descarta
  las credenciales al reescribir — está comprobado; no automatizar el update).
- Cada base de Airtable puede diferir de la convención (ya pasó: la tabla de horarios
  se llamaba `Configuracion` y no "Slots", y el vocabulario de estados difería; la
  plataforma tolera ambos vocabularios al leer y reintenta al escribir, pero cada
  desvío nuevo es riesgo).
- Todo campo cargado en Vibo **se convierte en afirmaciones del bot al cliente
  final**. Un dato copiado mal en el alta ya produjo un bot afirmando una regla que
  el negocio no tenía.

El objetivo del runbook es que estas trampas estén sistematizadas, no redescubiertas.

## 2. Runbook de onboarding (objetivo: ≤ 1 día de trabajo efectivo, en ≤ 1 semana calendario)

### Día 0 — Relevamiento (reunión de 1 hora, conduce el socio, asiste Santino)

Formulario fijo que se completa EN la reunión (nada de "después te paso"):
canchas (cantidad y nombres — convención `Cancha N`), precios por turno y duración,
horarios por día, política de cancelación **completa** (qué pasa antes Y después del
límite — el modelo rellena huecos si la regla queda a medias), seña (si no se cobra,
se escribe "no se cobra seña"; el campo vacío significa "sin política", no "gratis"),
anticipación mínima real (si no existe la regla, queda vacío), tono deseado, FAQ (las
5–10 preguntas reales que más recibe), y **elección del número**: dedicado nuevo o el
del complejo (explicando el trade-off de la auditoría §4.1).

### Días 1–2 — Armado técnico (Santino, checklist)

1. **Vibo:** alta de cliente + plan; alta de agente (nace `EN_CONFIGURACION`: no
   responde hasta activarlo el admin). Cargar la config del relevamiento **campo por
   campo, releyendo cada uno como si el bot lo fuera a decir — porque lo va a decir.
   Campo sin dato real = vacío.**
2. **Airtable:** crear la base desde la base template (copiar la de la sede demo),
   NO desde cero: tablas `Reservas`/`Configuracion` con nombres de campos y opciones
   de select exactos. Cargar slots del relevamiento. Verificar opciones de estado.
3. **n8n:** duplicar workflow padre + 2 subworkflows de reservas desde los JSON
   versionados en `docs/`. Reasignar credenciales a mano en TODOS los nodos
   (el duplicado deja referencias colgadas), actualizar `agenteId`, token del
   cliente, path del webhook. Verificar que los 3 nodos Vibo usen la credencial
   Header Auth (no header manual — la trampa que ya costó una hora).
4. **Evolution:** crear instancia, vincular el número elegido (QR), apuntar el
   webhook al workflow nuevo. Guardar credenciales cifradas en Vibo.
5. **Verificación en frío** (nada de confiar en ejecuciones verdes): mensaje real de
   ida y vuelta; la conversación aparece en el panel; el contador de uso sube; una
   reserva de prueba llega a Airtable con la cancha bien asignada; se borra la
   reserva de prueba.

### Días 3–4 — Validación con el dueño

- El dueño prueba su agente en el **chat de prueba** del panel (sandbox: no toca
  Airtable ni consume plan) y corrige textos/reglas con nosotros.
- Checklist de activación del admin (ya existe en la plataforma: convención de
  canchas, typecast, Evolution vinculada, `/contexto` respondiendo) → **activar**.
- Prueba real dirigida: el dueño y 2 conocidos reservan por WhatsApp de verdad.

### Días 5–7 — Acompañamiento

- Primera semana con revisión diaria de conversaciones (15 min/día): ahí aparecen
  las FAQ que faltaron y los huecos de la política. Se cargan en Vibo, no en el
  prompt de n8n.
- Cierre de onboarding: mini-reunión de 20 min, se le muestra el panel con SUS
  primeras reservas reales. Se registran las **horas totales invertidas** (dato para
  `pricing-unit-economics.md` §6).

## 3. Qué incluye el soporte (y qué no)

### Incluido en la mensualidad

- Cambios de configuración del negocio: precios, horarios, canchas, políticas, FAQ,
  tono. (El cliente puede autogestionarlos en su panel; si lo pide, lo hacemos
  nosotros en ≤ 48 hs hábiles.)
- Incidentes del servicio: bot que no responde, reservas que no impactan,
  reposición de número (≤ 1 día hábil).
- Monitoreo, mantenimiento de infraestructura y mejoras generales del producto.
- Un canal único de soporte (WhatsApp de Vibo), horario hábil 9–18. Sin soporte por
  el chat personal de cada socio.

### NO incluido (respuesta estándar: "va al backlog; si es urgente para vos, se cotiza aparte")

- Integraciones nuevas (otro sistema de reservas, MercadoPago del complejo, apps,
  calendarios externos).
- Flujos nuevos del bot (torneos, clases, venta de productos, cobros dentro del
  chat, campañas o mensajes salientes — esto último además es política: rompe el
  perfil anti-ban).
- Cambios en la estructura de la base Airtable del cliente que rompan la convención.
- Reportes a medida fuera del panel.

**Proceso para pedidos fuera de alcance:** se anota en un backlog único con nombre
del cliente y dolor concreto. En la revisión mensual (ver `kpis-ciclo-revision.md`)
se decide: ① lo piden ≥ 2–3 clientes → candidato a producto (lo pagamos nosotros con
roadmap); ② lo pide uno solo → se cotiza como desarrollo aparte o se rechaza con
honestidad. **Nunca se implementa "un ratito" en caliente para un solo cliente**: esa
es la puerta por la que una agencia de producto se convierte en consultora quemada.

## 4. Métricas del proceso

- Horas de onboarding por cliente (objetivo: ≤ 8 hs efectivas al tercer cliente).
- Días calendario de firma → bot activo (objetivo: ≤ 7).
- Tickets de soporte por cliente/mes y % resueltos en ≤ 48 hs.
- Pedidos fuera de alcance por mes (si crece, el discurso de venta está prometiendo
  de más — corregir ahí, no en soporte).
