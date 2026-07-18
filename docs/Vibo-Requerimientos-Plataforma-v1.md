# Vibo — Requerimientos de la Plataforma de Gestión de Agentes IA (v1)

**Vertical inicial:** complejos deportivos (canchas de pádel, fútbol 5) — gestión de turnos vía WhatsApp/Instagram con IA.

---

## 1. Objetivo

Plataforma donde los clientes de Vibo (dueños de complejos deportivos) supervisan y ajustan el/los agente(s) de IA que Vibo les configuró, sin exponer nada de lo que Vibo gestiona por detrás (conexión de canal, integraciones, infraestructura). Es una capa de **visibilidad y control liviano**, no un CRM completo.

---

## 2. Modelo de datos (conceptos clave)

```
Cliente (empresa)
 └── Sede / Agente (1:N)  → una sede o servicio = un agente con su propio número
      ├── Configuración del agente (prompt, horarios, precios, reglas)
      ├── Canal conectado (WhatsApp vía Evolution API) — gestionado por Vibo
      ├── Conversaciones (N)
      │    └── Contacto asociado
      └── Turnos generados (vía integración con Airtable, ver punto 10)
```

Un cliente **no gestiona la conexión del canal**: la vincula Vibo con Evolution API al dar de alta el agente. En la plataforma esto se ve únicamente como un estado (🟢 Conectado / 🔴 Desconectado), nunca como una acción que el cliente deba tomar.

---

## 3. Usuarios y roles (v1)

- Un único login por cliente (dueño/encargado del negocio).
- No hay roles ni "seller seats" en v1 — eso queda deliberadamente fuera (ver punto 11).

---

## 4. Alta de clientes y planes

### 4.1 Alta de cliente (onboarding)

**Resuelto: alta 100% manual, sin self-service.**

- No hay pantalla de "Registrarse" ni wizard tipo Agentsapp (Ustedes → Negocio → Uso → Listo). Ese flujo no aplica porque **vos configurás el agente vos mismo** para cada cliente (venta, prompt, Airtable, conexión con Evolution API).
- El login del cliente tiene solo: **Iniciar sesión** + recuperar contraseña. Nada de registro público.
- La creación de la cuenta, la carga inicial del agente y sus credenciales de acceso las genera un **panel admin interno de Vibo** (ver punto 14), y el acceso ya armado se le entrega al cliente (email + contraseña, o magic link inicial).
- Implicancia de diseño: la app cliente **no necesita** formularios de alta de negocio — esos datos (nombre de empresa, rubro, horarios, etc.) se cargan desde el admin interno, y el cliente los ve/edita después desde la sección Agentes, pero no los completa la primera vez.

### 4.2 Planes y límites

**Resuelto: planes diferenciados desde el arranque, con límite duro.**

Variables que cambian según el plan:

| Variable | Comportamiento al llegar al límite |
|---|---|
| **Cantidad de agentes/sedes** | Límite duro: no se puede crear un agente nuevo desde la plataforma (ni vos desde el admin, salvo upgrade de plan). Igual que el banner "Límite de agentes alcanzado" de la referencia. |
| **Conversaciones por mes** | Límite duro: al llegar al tope, **el bot deja de responder** hasta el próximo ciclo o hasta que vos lo reactivés manualmente desde el admin interno (no hay cobro de excedente automático en v1). |

Estructura de planes (borrador para que ajustes los números reales):

| Plan | Agentes/sedes | Conversaciones/mes | Notas |
|---|---|---|---|
| Starter | 1 | ~100–200 | Un complejo, un canal |
| Profesional | 2–3 | ~500 | Multi-sede chico |
| Multi-sede | A definir / a medida | A definir / a medida | Cadenas con varias sedes |

**Resuelto:** al llegar al límite de conversaciones, el bot se pausa automáticamente (deja de responder en WhatsApp) hasta el próximo ciclo de facturación o hasta que vos lo reactivés manualmente desde el admin interno — por ejemplo, si el cliente hace upgrade de plan a mitad de mes.

Implicancias de esto para el desarrollo:

- **Conteo en tiempo real:** el backend necesita contar conversaciones del ciclo actual y evaluar el límite en cada mensaje entrante, no en un job periódico — si no, el bot podría seguir respondiendo pasado el límite hasta el próximo chequeo.
- **Estado visible y distinto del pausado manual:** en Agentes e Inicio, un agente pausado por límite de plan debe verse distinto de uno pausado a mano por el cliente (ej. "Pausado — límite de plan alcanzado" vs. "Pausado por vos"), para que no se confundan.
- **Aviso preventivo:** conviene notificar cuando el uso llega a un umbral (ej. 80-90%) antes de llegar al bloqueo total, para que el cliente no se entere recién cuando el bot ya dejó de responder — esto es más una recomendación de producto que un requisito cerrado, pero vale la pena contemplarlo en el diseño.
- **Reactivación manual:** el admin interno de Vibo necesita una acción explícita para reactivar un agente pausado por límite (ej. tras un upgrade de plan a mitad de mes).

---

## 5. Arquitectura de información (navegación)

```
Sidebar
 ├── Inicio
 ├── Agentes
 ├── Turnos          ← ver punto 8
 └── Conversaciones

Header
 └── Selector de sede/agente ("Todas las sedes" | sede específica)

Menú de usuario (dropdown, no sección propia)
 └── Plan / Cuenta / Cambiar contraseña / Cerrar sesión
```

Cuatro secciones principales. El selector de sede es transversal (aplica a Inicio, Turnos y Conversaciones) porque un cliente puede tener más de un agente.

---

## 6. Sección: Inicio (Dashboard)

### Selector de alcance
"Todas las sedes" (agregado) o una sede/agente puntual.

### KPIs principales (los 4 que priorizaste)

| KPI | Descripción | Notas |
|---|---|---|
| **Turnos reservados** | Cantidad confirmada por el agente, con corte hoy / ciclo actual / mes, y variación vs. período anterior | Alimentado por la integración con Airtable (punto 10) |
| **Tasa de conversión** | % de conversaciones que terminan en turno confirmado | Conversaciones totales vs. turnos confirmados |
| **Ocupación de canchas / horarios pico** | Gráfico por franja horaria y día (heatmap o barras), para ver cuándo se llena y cuándo hay hueco | Útil para que el cliente ajuste precios/promos en horarios flojos |
| **Ingresos estimados** | Turnos confirmados × precio configurado por tipo de cancha | Estimado, no reemplaza facturación real |

### 6.1 Fórmulas exactas (según esquema real de Airtable, punto 8.1)

- **Turnos reservados** = registros de `Reservas` en el período con `Estado` ∈ {Confirmada, Pendiente de seña} (se excluyen Canceladas)
- **Tasa de conversión** = turnos con `Estado = Confirmada` en el período ÷ conversaciones totales del mismo período (fuente: conteo de conversaciones de la plataforma, no de Airtable)
- **Ocupación** = turnos confirmados en una franja/día ÷ slots activos definidos en `Slots` para esa cancha en esa franja/día (cruce entre `Reservas.Cancha` + `Reservas.Hora inicio` contra `Slots.Cancha` + `Slots.Hora inicio` + `Slots.Dias Activos`)
- **Horarios pico** = agrupar turnos confirmados por `Hora inicio` y día de la semana (derivado de `Fecha`), y comparar contra la ocupación de cada franja
- **Ingresos estimados** = Σ (turnos con `Estado = Confirmada` agrupados por `Cancha`) × precio de esa cancha, **tomado de la configuración del agente en Vibo**, no de Airtable (ver punto 8.1 — el precio no vive en Airtable hoy)

### Widgets secundarios (heredados del panel de referencia, con sentido igual acá)
- Conversaciones totales / respuestas de la IA / actividad últimas 24h
- Estado del plan (uso de conversaciones del mes, límite de agentes, aviso preventivo antes del bloqueo — ver punto 4.2)
- Resumen de agentes activos y canales conectados
- Gráfico de actividad del ciclo (conversaciones por día)

---

## 7. Sección: Agentes

### Listado (grid de cards)
Uno por sede/servicio. Cada card muestra:
- Nombre del agente/sede + deporte
- Estado: activo / pausado (toggle). Si está pausado por haber llegado al límite de conversaciones del plan, se distingue claramente del pausado manual (ver punto 4.2) — ej. "Pausado — límite de plan" vs. "Pausado por vos"
- Estado de conexión (solo indicador, sin acción)
- Métricas rápidas: turnos del mes, conversaciones del mes

Si el cliente llega al límite de agentes de su plan, se muestra un banner de "Límite alcanzado" con opción de upgrade (igual a la referencia), y se deshabilita la creación de nuevos agentes.

### Detalle de un agente (al hacer click)
- **Info del negocio**: nombre, dirección de la sede, teléfono de contacto
- **Configuración de canchas**: tipos de cancha, cantidad, duración de turno, precio, horario de apertura/cierre
- **Personalidad del agente**: tono, prompt base (editable o guiado por opciones, no todo en texto libre para evitar que rompan el prompt)
- **Reglas de reserva**: anticipación mínima, política de cancelación, seña/adelanto si aplica
- **Preguntas frecuentes / base de conocimiento** puntual del negocio
- **Bot activo/pausado** (toggle, para días de mantenimiento o cuando el dueño quiere atender manual)

Explícitamente **no incluye**: nada de conectar canal, ni integraciones — eso es interno de Vibo.

---

## 8. Sección: Turnos

Vista unificada de las reservas generadas por el agente, para que el cliente no tenga que abrir Airtable por su cuenta.

- **Vista lista y vista calendario** (día/semana), filtrable por sede/agente y por cancha
- Cada turno muestra: contacto, cancha, fecha/hora, estado (confirmado / cancelado / pendiente de seña), precio
- Acciones básicas v1: cancelar o reprogramar un turno manualmente (esto escribe de vuelta en Airtable, no en una tabla propia)
- Este dato alimenta directamente los KPIs de Inicio (turnos reservados, ocupación, ingresos estimados) — misma fuente, dos vistas distintas

### 8.0 Gestión de horarios disponibles (Slots) — agregado tras revisión de MVP

La sección Turnos no puede ser solo de lectura de `Reservas`: el dueño necesita poder **crear, editar y desactivar los horarios disponibles** de cada cancha (tabla `Slots` de Airtable — hora de inicio, duración, días activos, cancha), no solo ver lo ya reservado. Sin esto, cualquier cambio de horario del complejo (agregar un turno nuevo, sacar el de las 21:30 un día feriado) obliga a entrar a Airtable directamente, lo cual contradice el objetivo de la plataforma (punto 1).

Propuesta: dentro de la sección Turnos, una sub-vista "Horarios disponibles" (además de la vista de Reservas ya definida) con:
- Listado de slots por cancha, agrupados por franja horaria
- Alta de un slot nuevo (hora, duración, días activos, cancha)
- Activar/desactivar un slot existente (equivalente al campo `Activo` de Airtable)
- Mismo patrón de arquitectura que Reservas: lectura/escritura contra Airtable vía la capa intermedia del backend (sección 4.1 del SDD), nunca desde el frontend directo

**Nota de arquitectura:** esta sección no habla directo con Airtable desde el frontend. Hay una capa intermedia (backend de Vibo) que consulta/escribe en Airtable con el API key guardado del lado del servidor. Esto es clave por seguridad y porque permite migrar la fuente de datos (a una tabla propia, por ejemplo) sin rediseñar esta pantalla.

**Requisito para que esta sección sea genérica entre clientes:** todas las bases de Airtable de los clientes deben compartir el mismo esquema de campos (fecha, hora, cancha, contacto, estado, precio, etc.), aunque cada cliente tenga su propia base.

### 8.1 Esquema real de Airtable (relevado, no un borrador)

**Tabla "Reservas"** (turnos):

| Campo | Tipo | Notas |
|---|---|---|
| ID Reserva | Autonumber | |
| Nombre | Texto | Nombre del contacto |
| Teléfono | Teléfono | |
| Fecha | Fecha | |
| Hora inicio | Hora | |
| Cancha | Single select (ej. "Cancha 1", "Cancha 2") | No es un link a registro, es texto con opciones fijas |
| Estado | Single select: **Confirmada / Cancelada / Pendiente de seña** | Enum cerrado |
| Monto seña | Moneda | Solo la seña, **no** el precio total del turno |
| Notas | Texto largo | |
| Creada por bot | Checkbox | Distingue reservas hechas por el agente de las cargadas a mano |
| Ultima_Actualizacion | Fecha y hora (last modified) | |

**Tabla "Slots"** (horarios disponibles, no es una tabla de "Canchas" con precio):

| Campo | Tipo | Notas |
|---|---|---|
| Nombre Slot | Texto | |
| Hora inicio | Hora | |
| Duracion | Número (minutos) | Ej. 90 |
| Dias Activos | Multi-select (Lunes...Domingo) | Define en qué días corre ese slot |
| Activo | Checkbox | |
| Cancha | Multi-select (ej. "Cancha 1", "Cancha 2") | A qué cancha(s) aplica ese slot |

**Importante — el precio no está en Airtable:** hoy el precio de cada cancha está **hardcodeado en el prompt del agente**, no en una tabla. Se resuelve así (ver punto 6): el precio vive en la **configuración del agente dentro de Vibo** (sección Agentes → configuración de canchas, ya prevista en el punto 7), no se agrega como campo nuevo en Airtable. El cálculo de ingresos cruza dos fuentes: turnos confirmados (Airtable) × precio por cancha (config de Vibo). Esto evita tocar el esquema de Airtable que ya usás en producción con n8n.

---

## 9. Sección: Conversaciones

- Bandeja tipo chat (similar a WhatsApp Web)
- **Filtro por agente/sede** (clave, porque hay varios agentes por cliente)
- Filtro por estado: todas / no leídas / IA respondiendo / requiere atención humana
- Buscador por contacto o teléfono
- Panel lateral con detalle del contacto: datos, historial, turno asociado si existe
- Botón para que el dueño **tome el control manual** de una conversación puntual (pausar la IA en ese chat) — importante en negocios de turnos, donde a veces hay que intervenir a mano (ej. un cliente conflictivo, una excepción de precio)

---

## 10. Decisión tomada: ¿dónde vive el dato del turno?

**Resuelto: arquitectura híbrida (Opción A+).**

- **Hoy:** los agentes ya escriben los turnos en Airtable, orquestados por n8n. Esto no cambia — Vibo no reemplaza ese flujo.
- **Novedad:** en vez de que el dato quede solo en Airtable, la plataforma agrega una capa propia que **lee y escribe contra Airtable a través de su API**, y con eso arma tanto la sección Turnos (punto 8) como los KPIs de Inicio.
- El cliente nunca ve Airtable ni sabe que existe — para él es una sección más de Vibo.
- Esta capa intermedia vive en el backend de Vibo (nunca en el frontend), lo que logra dos cosas:
  1. El API key de Airtable no queda expuesto al cliente.
  2. El día que Airtable se quede corto (por volumen o por límites de la API), se puede migrar a una tabla propia (Postgres/Supabase) **cambiando solo esa capa**, sin tocar la UI ni el flujo de n8n de un día para el otro.
- **Requisito no negociable para que esto escale:** todas las bases de Airtable de los clientes deben respetar el mismo esquema de campos. Sin esto, cada cliente necesitaría su propio código de integración.
- **Techo a vigilar:** límites de rate y de registros de la API de Airtable según el plan contratado. No es un problema con la cantidad de clientes actual, pero conviene monitorearlo a medida que la base de clientes crezca.

---

## 12. Requisitos no funcionales

- **Responsive / mobile:** es una plataforma web (no app nativa), pero se espera uso real desde el celular por parte de algunos dueños de complejo. El diseño tiene que ser responsive de verdad (no solo "no se rompe"), sobre todo en Inicio, Turnos y Conversaciones — no alcanza con pensar mobile como algo secundario.
- **Tema:** solo modo claro en v1. No hace falta dark mode (se descarta de la referencia).
- **Notificaciones proactivas:** no hay en v1 (ni WhatsApp, ni email, ni push). Toda la información se ve al entrar al dashboard — esto simplifica bastante el desarrollo inicial, aunque vale la pena tenerlo en mente como mejora natural de v2 (sobre todo el aviso preventivo de límite de plan del punto 4.2).
- **Idioma:** español (Argentina), sin necesidad de internacionalización en v1.

---

## 13. Fuera de alcance v1 (confirmado con vos)

- Pipeline / CRM tipo kanban
- Integraciones visibles al cliente (Google Calendar, WooCommerce, Tiendanube, etc.)
- Sección "Conexiones" — el canal lo conecta Vibo con Evolution API
- Seller seats / multi-usuario por cliente
- Campañas
- Registro / wizard de onboarding self-service (alta manual, ver punto 4.1)
- Notificaciones proactivas (aviso por WhatsApp/email/push) — se revisa en v2
- Dark mode

---

## 14. Consideraciones técnicas a resolver antes de codear

- Autenticación: email/password simple, ¿o magic link también? (la referencia lo tiene, no es imprescindible en v1)
- Modelo multi-tenant: cliente → sedes/agentes → conversaciones → turnos (vía capa de integración con Airtable, punto 10)
- Modelo de planes y límites: dónde se guarda el límite de cada cliente, cómo se evalúa en tiempo real (sobre todo el de conversaciones, que corta un flujo activo de WhatsApp)
- Capa de integración con Airtable: definir el mapeo de campos estándar y el esquema que todo cliente nuevo debe respetar al crear su base
- Panel admin **interno** de Vibo (separado del panel del cliente) para dar de alta clientes, instancias de Evolution API, bases de Airtable, planes asignados, y monitorear uso

---

## 15. Estado del documento

**Documento de requerimientos v1 cerrado.** El único dato que queda sin definir es a propósito: los números exactos de la tabla de planes (punto 4.2) quedan como borrador (Starter / Profesional / Multi-sede) hasta que definas precios y límites reales — esto no bloquea el diseño técnico, porque el mecanismo de límites (conteo, bloqueo, reactivación) ya está resuelto independientemente de los números finales.

---

## 16. Próximos pasos sugeridos

1. Wireframes de las 4 secciones (Inicio, Agentes, Turnos, Conversaciones) + selector de sede
2. Modelo de datos definitivo (incluyendo planes/límites y la capa de integración con Airtable)
3. Pasar a la Fase 2: armar el SDD (documento de diseño técnico) para desarrollo — completar la tabla de planes cuando la tengas, sin que eso frene el arranque del SDD
