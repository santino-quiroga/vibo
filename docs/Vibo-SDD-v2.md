# Vibo — SDD v2 (extensión del SDD v1)

**Este documento no reemplaza a Vibo-SDD-v1.md — lo complementa.** Todo lo que no se menciona acá (arquitectura general, modelo de datos base, autenticación, seguridad, despliegue) sigue vigente tal como está en v1. Acá solo se documentan los agregados discutidos para la v2.

**Orden de implementación recomendado:** la integración real n8n ↔ Vibo (sección 1) va primero, no en paralelo con el resto — el dashboard agregado y las señales de riesgo (secciones 5 y 6) necesitan datos reales de conversaciones para tener sentido, y hoy no existen porque n8n todavía no le reporta nada a Vibo.

---

## 1. Integración real n8n ↔ Vibo (cierre de lo pendiente del SDD v1)

Reemplaza el enfoque de dos llamados separados de la sección 4.3 del SDD v1 (`puede-responder` + prompt hardcodeado en n8n) por **un único endpoint de contexto**, que además resuelve el problema detectado de que Vibo no era la fuente de verdad real del agente:

```
GET /api/integracion/agentes/:id/contexto
Header: Authorization: Bearer <token de integración del agente>

→ 200 OK
{
  "puedeResponder": boolean,
  "motivo": string | null,          // solo si puedeResponder = false
  "promptBase": string,
  "reglas": {
    "anticipacionMinimaMin": number,
    "politicaCancelacion": string,
    "senia": { "requiere": boolean, "monto": number | null }
  },
  "canchas": [
    { "numero": number, "precio": number, "duracionTurnoMin": number,
      "horarioApertura": string, "horarioCierre": string }
  ]
}
```

- El workflow madre de n8n llama a este endpoint **antes de generar cada respuesta** y arma el prompt de sistema con `promptBase` + `reglas` + `canchas`, en vez de tenerlos pegados adentro del workflow. Esto es lo que hace que un cambio de precio o de política hecho en la sección Agentes de Vibo tenga efecto real en la próxima respuesta del bot — hoy no lo tiene, es el hallazgo principal que motivó esta sección.
- Si `puedeResponder = false` (agente pausado por cualquier motivo — manual, límite de conversaciones, o el nuevo `PAUSADO_POR_PAGO` de la sección 4), el workflow corta ahí, igual que en v1.
- **Fail-open con cache:** si Vibo no responde (caído o lento), n8n debe seguir funcionando con la última respuesta válida que cacheó, no cortar el servicio por una falla de infraestructura de Vibo — mismo principio de "fail-open, no fail-closed" del SDD v1 (sección 4.4), extendido ahora también al contexto, no solo al estado.
- Los dos endpoints de logging de mensajes (`POST /api/integracion/mensajes`, entrante y saliente) del SDD v1 se mantienen sin cambios.

---

## 2. Estado nuevo de agente: `EN_CONFIGURACION`

```prisma
enum EstadoAgente {
  EN_CONFIGURACION   // nuevo — el cliente ya configuró el agente, todavía no está conectado a WhatsApp real
  ACTIVO
  PAUSADO_MANUAL
  PAUSADO_LIMITE
  PAUSADO_POR_PAGO   // nuevo — ver sección 4
}
```

- Un agente nuevo se crea en `EN_CONFIGURACION`: el cliente puede cargar prompt, canchas, precios y reglas, y probarlo en el chat de prueba (sección 3) — pero todavía no tiene `airtableApiKeyEnc` / `evolutionApiKeyEnc` cargados, o los tiene pero el admin no confirmó que ya está todo probado.
- El pasaje a `ACTIVO` es una **acción manual del admin interno**, una vez que cargó y verificó las credenciales reales (mismo checklist que se usó con Padel AI: convención de nombres de cancha, typecast desactivado en n8n, etc.)
- Un agente en `EN_CONFIGURACION` **cuenta contra el límite de agentes del plan** — ocupa un lugar igual que uno activo, para evitar que alguien se quede "probando" indefinidamente varios agentes sin que cuenten.

---

## 3. Chat de prueba (sandbox)

Disponible siempre (no solo durante el trial inicial) desde la sección Agentes, para probar tanto un agente nuevo en `EN_CONFIGURACION` como cambios sobre uno ya `ACTIVO` antes de que impacten a clientes reales.

- **Proveedor: OpenAI**, llamado directo desde el backend de Vibo (nueva dependencia — no existía en v1, donde la única IA que respondía a clientes era la de n8n)
- La API key de OpenAI es **global de Vibo** (variable de entorno, no por agente) — el costo de estas pruebas lo absorbe Vibo, no el cliente
- El system prompt de la llamada se arma igual que el endpoint de contexto de la sección 1 (`promptBase` + `reglas` + `canchas`), para que lo que el dueño prueba sea representativo de lo que respondería el agente real
- **Conversación efímera: no se persiste.** No crea `Conversacion` ni `Mensaje`, no cuenta contra `UsoMensual` del plan, se pierde al recargar la página
- **No toca Airtable ni Evolution API reales** — cualquier "reserva" que el chat de prueba simule no se guarda en ningún lado. Se muestra un disclaimer visible ("Esto es una simulación, las reservas acá no son reales")
- **Rate limit diario por agente**, para evitar costo descontrolado de OpenAI:

```prisma
model PruebaAgenteUso {
  id            String   @id @default(cuid())
  agenteId      String
  agente        Agente   @relation(fields: [agenteId], references: [id])
  fecha         DateTime // día (sin hora)
  mensajesCount Int      @default(0)

  @@unique([agenteId, fecha])
}
```

---

## 4. Facturación con Mercado Pago

### 4.1 Flujo

- **El cliente NO se autosuscribe desde el panel.** Vos generás la suscripción en Mercado Pago (un plan de suscripción por tier, con el precio real — esto obliga a cerrar de una vez los números reales de la tabla de planes que en v1 quedaron como borrador, sección 4.2 del doc de requerimientos) y le mandás el link de autorización al cliente por fuera de la plataforma (WhatsApp, el mismo canal de venta)
- Vibo solo **recibe el resultado** vía webhook — nunca maneja datos de tarjeta ni arma el checkout
- Esto es consistente con el patrón ya establecido en toda la plataforma: el cliente es pasivo, vos operás — no se contradice con nada de lo definido en v1

### 4.2 Modelo de datos

```prisma
enum EstadoPago {
  SIN_SUSCRIPCION
  AL_DIA
  EN_GRACIA
  VENCIDO
}

enum EstadoPagoRegistro {
  APROBADO
  RECHAZADO
  PENDIENTE
}

enum OrigenPago {
  MERCADOPAGO
  MANUAL
}

// Agregar a Cliente:
model Cliente {
  // ...campos existentes de v1...
  mercadoPagoSubscriptionId String?
  estadoPago                EstadoPago @default(SIN_SUSCRIPCION)
  fechaProximoCobro         DateTime?
  notasInternas             String?    @db.Text   // ver sección 7
  ultimoAccesoAt            DateTime?              // ver sección 6
  pagos                     Pago[]
}

// Agregar a Plan:
model Plan {
  // ...campos existentes de v1...
  precio             Decimal   // ya no es borrador — Mercado Pago exige un monto real
  mercadoPagoPlanId  String?
}

model Pago {
  id           String              @id @default(cuid())
  clienteId    String
  cliente      Cliente             @relation(fields: [clienteId], references: [id])
  monto        Decimal
  fecha        DateTime
  estado       EstadoPagoRegistro
  origen       OrigenPago
  mpPaymentId  String?             // null si origen = MANUAL
  createdAt    DateTime            @default(now())
}
```

### 4.3 Webhook de Mercado Pago

```
POST /api/webhooks/mercadopago
```

- Valida la firma del webhook (header `x-signature`) antes de procesar cualquier evento — nunca confiar en el payload sin validar origen
- Ante un pago aprobado: crea `Pago` (origen `MERCADOPAGO`), actualiza `Cliente.estadoPago = AL_DIA` y `fechaProximoCobro`
- Ante un pago rechazado o suscripción cancelada: `Cliente.estadoPago = EN_GRACIA`, arranca el período de gracia

### 4.4 Período de gracia y pausa automática

- Al entrar en `EN_GRACIA`, se dispara un **email** al cliente avisando que el pago falló (ver sección 4.5) — sin esto, el cliente se entera cuando el bot ya dejó de responder, que es justo lo que se busca evitar
- Pasados N días de gracia (configurable, no hardcodeado — ej. variable de entorno `GRACE_PERIOD_DIAS`) sin resolverse, `Cliente.estadoPago = VENCIDO` y **todos los agentes del cliente pasan a `PAUSADO_POR_PAGO`** automáticamente (mismo Cron diario de la sección 9.5 del SDD v1, se le suma esta responsabilidad)
- **Excepción manual:** un botón "Marcar como pagado" en el admin interno crea un `Pago` con `origen = MANUAL` y devuelve `Cliente.estadoPago = AL_DIA`, para transferencia, efectivo o cortesía — convive con el flujo automático sin reemplazarlo

### 4.5 Notificaciones por email (excepción puntual, no el sistema general)

Las notificaciones proactivas quedaron fuera de alcance en v1 como sistema general — pero con dinero de por medio, no avisar es un riesgo real de negocio, no solo de producto. Se agregan **3 emails puntuales**, usando el mismo proveedor ya previsto para recuperación de contraseña (sección 6.1 del SDD v1):

1. Empieza el período de gracia (pago fallido)
2. Recordatorio a mitad del período de gracia (si sigue sin resolverse)
3. Servicio pausado por falta de pago (`PAUSADO_POR_PAGO`)

Esto no reabre la discusión de notificaciones generales (turno nuevo, aviso de límite de conversaciones) — sigue fuera de alcance, esto es específico de plata.

### 4.6 Lado cliente

El cliente ve su propio estado de facturación desde el menú de Cuenta (ya existente): próximo cobro, estado (al día / en gracia / vencido), historial simple de pagos. No hay nada nuevo de navegación — se suma contenido a una sección que ya estaba planeada en v1.

---

## 5. Dashboard agregado del admin interno

Un "Inicio" del lado admin (hoy el admin solo tiene el listado de Clientes), con:

- **MRR estimado**: suma de `Plan.precio` de los clientes con `estadoPago = AL_DIA`
- **Clientes activos / en riesgo**: cantidad por `estadoPago` (al día, en gracia, vencido)
- **Agentes pausados**: separados por motivo (`PAUSADO_LIMITE` = oportunidad de upsell, `PAUSADO_POR_PAGO` = cobranza, `PAUSADO_MANUAL` = decisión del cliente)
- **Salud de integraciones**: qué agentes tuvieron errores recientes de Airtable/Evolution API (ver campo nuevo abajo)

```prisma
// Agregar a Agente:
model Agente {
  // ...campos existentes de v1...
  ultimoErrorIntegracionAt   DateTime?
  ultimoErrorIntegracionMsg  String?
}
```

Se actualiza cada vez que la capa de integración (sección 4.4 del SDD v1) agota sus reintentos contra Airtable o Evolution API — así el admin ve proactivamente qué clientes tienen un problema técnico, en vez de enterarse por un reclamo.

---

## 6. Gestión operativa del admin

Todo esto usa modelos ya existentes de v1, es trabajo de UI + endpoints, sin decisiones de arquitectura nuevas:

- **Editar un agente ya creado** (hoy el admin solo puede verlo)
- **Reactivar manualmente** un agente pausado (por límite o por pago), sin esperar al Cron
- **CRUD de planes** desde UI (hoy están hardcodeados) — cobra más importancia todavía porque ahora `Plan.precio` es un dato real que además alimenta Mercado Pago
- **Rotar credenciales de un agente** desde el panel (relevante directamente por lo que pasó al dar de alta Padel AI — generar nuevas y reemplazar sin tener que hacerlo a mano en la base)

Además, para la sección 6 de señales de riesgo:

```prisma
// Agregar a Usuario:
model Usuario {
  // ...campos existentes de v1...
  ultimoAccesoAt  DateTime?  // se actualiza en cada login exitoso
}
```

---

## 7. Señales de riesgo de cliente

- **Uso real vs. plan contratado**: comparar `UsoMensual.conversacionesCount` del ciclo actual contra `Plan.maxConversacionesMes` — uso muy bajo (posible churn) o muy alto (upsell) se puede resaltar en el listado de Clientes del admin, no solo en el detalle
- **Último acceso**: usando `Usuario.ultimoAccesoAt` de la sección 6, mostrar hace cuánto no entra el cliente al panel

---

## 8. Notas internas y exportables

- `Cliente.notasInternas` (ya agregado en la sección 4.2) — un textarea libre en el detalle del cliente en el admin, nunca visible para el cliente
- Export CSV de clientes (con plan, estado de pago, uso) para uso contable — un botón simple en el listado de Clientes, sin necesidad de un motor de reportes

---

## 9. Seguridad adicional de esta versión

- **Validación de firma del webhook de Mercado Pago** (sección 4.3) — sin esto, cualquiera podría simular un pago aprobado
- **API key de OpenAI**: variable de entorno global (no cifrada por agente como Airtable/Evolution API, porque es un costo de Vibo, no una credencial del cliente)
- El chat de prueba (sección 3) no debe poder usarse para extraer el `promptBase` de otro cliente — la autorización sigue las mismas reglas de multi-tenancy de la sección 6.3 del SDD v1 (filtrado server-side por `clienteId` de la sesión)

---

## 10. Plan de desarrollo de la v2

| Orden | Qué se construye | Por qué en ese orden |
|---|---|---|
| **1** | Integración real n8n ↔ Vibo (sección 1) | Todo lo demás de esta lista depende de tener datos reales de conversaciones — sin esto, el dashboard agregado y las señales de riesgo son ceros |
| **2** | Estado `EN_CONFIGURACION` + chat de prueba (secciones 2 y 3) | Habilita el flujo de trial/onboarding sin depender de que el admin termine de cargar credenciales reales primero |
| **3** | Facturación con Mercado Pago (sección 4) | Necesita que ya estén cerrados los precios reales de los planes — es buen momento para definirlos, apalancado en el uso real que ya se ve gracias al paso 1 |
| **4** | Dashboard agregado + gestión operativa + señales de riesgo (secciones 5, 6, 7) | Con datos reales de conversaciones y de facturación ya circulando, estas pantallas se pueden construir y validar con información real, no simulada |
| **5** | Notas internas y exportables (sección 8) | Lo más chico, sin dependencias — se puede sumar en cualquier momento libre dentro de este orden |

---

## 11. Ventana de escucha (agrupación de mensajes entrantes)

**Problema.** Si un contacto manda varios mensajes seguidos ("Hola" … "¿tenés turno hoy a la noche?"), el workflow madre dispara una ejecución por mensaje y el bot responde cada uno por separado, en vez de leerlos juntos y contestar una sola vez.

**Decisión.** Se espera una **ventana fija de ~8–10 segundos** desde cada mensaje entrante; si llegan más mensajes de ese mismo contacto en el lapso, se agrupan y se genera **una sola respuesta**. El valor es **igual para todos los agentes de la plataforma y no configurable por cliente**.

**Dónde vive la lógica: repartida.**

- El *esperar* vive en **n8n** (plano de ejecución): un nodo **Wait** con la constante `VENTANA_ESCUCHA_S` en el template del workflow. Al ser una constante del template compartido, es platform-wide por construcción; Vibo no la almacena ni la impone.
- El *decidir quién responde y con qué texto* vive en **Vibo** (plano de control): es lo único con estado consistente y operaciones atómicas. El static data de n8n no es transaccional y no sirve para coordinar entre ejecuciones.

**Principio.** Cada mensaje sigue disparando su propia ejecución, pero **solo la ejecución del último mensaje del lote responde**, y responde por todos juntos. No hace falta buffer ni cron: el "lote pendiente" ya está definido por los datos que existen.

**Flujo en el workflow madre:**

```
Webhook → Code → Vibo - Log contacto (POST /mensajes, CONTACTO)   ← ya existe; ahora devuelve mensajeId
  → Wait (VENTANA_ESCUCHA_S ≈ 9s)                                  ← nodo nuevo
  → Vibo - Decidir ventana (POST /mensajes/decidir)                ← nodo nuevo
  → If (responder):
       false → FIN (otro mensaje del lote responde, o quedó en manual)
       true  → Vibo - Contexto → ¿Responder? → AI Agent1 → HTTP Request (Evolution) → Vibo - Log IA
```

- `Vibo - Log contacto` queda **antes** del Wait (posición actual): cada ejecución loguea su mensaje enseguida para que las demás lo vean dentro de la ventana.
- El **AI Agent1** deja de leer `{{ $('Vibo - Preparar').first().json.texto }}` y pasa a leer `{{ $('Vibo - Decidir ventana').first().json.textoAgrupado }}` — el texto ya concatenado.

**Endpoints:**

- **Nuevo — `POST /api/integracion/mensajes/decidir`** · Body `{ agenteId, telefono, mensajeId }` → `{ responder, textoAgrupado, motivo }`.
  - Calcula el **lote pendiente** `B` = los mensajes `CONTACTO` posteriores al último `IA`/`HUMANO` de la conversación.
  - Bajo un **orden total determinista** `(createdAt desc, id desc)`, sea `L = max(B)`. Devuelve `responder: true` **solo si `mensajeId === L`**. Si la conversación quedó `pausadaManual` durante la ventana, devuelve `false` con motivo `conversacion_en_manual`.
  - `textoAgrupado` = los contenidos de `B` unidos por `\n`. Con un solo mensaje es idéntico al comportamiento actual (backward-compatible).
- **Modificado — `POST /api/integracion/mensajes`**: agrega `mensajeId` a la respuesta (aditivo). El conteo de uso no cambia: sigue siendo una vez por conversación nueva del ciclo (`contadaEnCiclo`).

**Sin cambios de esquema.** El "cursor" del lote es el último mensaje `IA`/`HUMANO`, que ya existe en la tabla `Mensaje`.

**Condiciones de carrera:**

- *Exactamente uno responde.* Con ventanas de igual duración, los tiempos de decisión respetan el orden de llegada. Un mensaje intermedio, al decidir, ya ve al posterior logueado y se para; el último no ve ninguno posterior y responde por todo `B`. Bajo el orden total hay un único `max(B)`.
- *Que nadie responda.* Solo si muere la ejecución del último mensaje — misma fiabilidad que hoy (una ejecución por mensaje). El lote queda pendiente y lo levanta el próximo mensaje del contacto.
- *Doble respuesta por reintento.* El nodo `Decidir ventana` va **sin retry** (documentado en el contrato). Riesgo residual: un mensaje que entra al filo de la ventana con commit atrasado más que el resto del lapso → dos respuestas. Es raro y no corrompe datos. Endurecerlo pediría un claim atómico en la conversación (`respondidoHasta`); **no se agrega en v1** para no meter esquema donde no hace falta.

---

## 12. Notificación al dueño cuando una conversación requiere atención humana

**Problema.** El estado `REQUIERE_ATENCION_HUMANA` ya existe pero no dispara ninguna notificación: el dueño solo se entera si entra a mirar Conversaciones. Además, **hoy ese estado solo lo produce el propio dueño** (toma control o responde a mano) — no hay ningún camino automático.

**Decisión.** Se agrega un **disparador automático** (el bot deriva cuando no puede resolver) y, la **primera vez** que una conversación entra a `REQUIERE_ATENCION_HUMANA` por esa vía, se le manda un **WhatsApp al dueño**. No se repite mientras sigue en ese estado y llegan más mensajes.

**Modelo de datos (2 campos):**

```prisma
model Cliente {
  // ...
  telefonoWhatsapp String?   // número del dueño para avisos operativos
}

model Conversacion {
  // ...
  atencionHumanaNotificadaAt DateTime?  // se sella al avisar; se limpia al devolver el control a la IA
}
```

- El número vive en **Cliente** (uno por complejo): el "dueño" es uno por cliente, aunque tenga varias sedes.

**Disparador — tool del bot + endpoint nuevo.**

```
POST /api/integracion/agentes/{agenteId}/derivar
Header: Authorization: Bearer <token del agente>
Body: { "telefono": "...", "motivo": "..."? }
```

El `AI Agent1` de n8n gana una **tool `derivar_a_humano(motivo)`** que llama a este endpoint cuando no puede resolver (el cliente pide un humano, pedido fuera de alcance, error). El endpoint, en orden:

1. Marca la conversación `pausadaManual = true` + `estado = REQUIERE_ATENCION_HUMANA`. Poner `pausadaManual` es lo que hace que el bot **deje de responderle** a ese contacto (via `/contexto` → `conversacion_en_manual`) y que los CONTACTO siguientes **mantengan** el estado sin volver a la IA.
2. **Claim atómico del aviso:** `updateMany where atencionHumanaNotificadaAt IS NULL set = now()`. Si gana (afectó 1 fila) sigue; si no, alguien ya avisó y no repite — resuelve dos derivaciones casi simultáneas sin doble WhatsApp.
3. Si ganó el claim, arma el mensaje y lo manda con **`enviarTexto(agenteId, telefonoDueño, msg)`**, reusando el cliente de Evolution existente y la **instancia de la sede que escaló** (no hay instancia global: el aviso sale del WhatsApp de esa sede). Best-effort: si el envío falla, se loguea y no se tumba la derivación.

**Idempotencia — "solo la primera vez".** El aviso se dispara **únicamente desde `/derivar`** y solo si el claim gana. `registrarMensaje` **no** notifica: un CONTACTO que mantiene el estado mientras está en manual no es un episodio nuevo. El flag se **limpia a null** cuando el dueño **devuelve el control a la IA** (`alternarControlAction` con `tomar=false`); ahí termina el episodio y una derivación futura vuelve a avisar. Las transiciones iniciadas por el dueño (tomar control, responder a mano) **no** notifican.

**Contenido del aviso (sede + contacto + link):**

```
🔔 Un chat necesita tu atención

Sede: Club Padel AI
Contacto: Martina Gómez (5491144440001)

Abrilo acá: https://<vibo>/dashboard/conversaciones/<id>
```

Nombre y teléfono del contacto son datos que el dueño ya ve en el panel; no expone nada nuevo. No incluye el texto de la conversación.

**Reusos y entregables.**

- Reusa `enviarTexto`/Evolution, el estado `REQUIERE_ATENCION_HUMANA` y el patrón de **nodos-para-pegar** (`docs/n8n-nodos-vibo-v3.json`) — el workflow no se actualiza por API porque descarta credenciales.
- UI: campo de teléfono del dueño en el alta/edición de Cliente en el admin interno.

---

## 13. Cierre

Con la v2 completa, Vibo pasa de ser un panel de visibilidad sobre un agente que en realidad vive aparte (v1) a ser la **fuente de verdad real** del comportamiento del agente (prompt, reglas, precios) y del negocio de Vibo mismo (facturación, salud de clientes) — no solo del negocio de cada cliente individual. Las secciones 11 y 12 cierran además dos huecos de experiencia del canal real: agrupar los mensajes que un contacto manda de a ráfagas, y avisarle al dueño cuando el bot necesita que intervenga una persona.
