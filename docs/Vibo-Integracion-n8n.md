# Integración n8n ↔ Vibo — contrato de los endpoints

Este documento define cómo el workflow de n8n de cada agente le habla a Vibo.
Es el contrato que hace que "pausar un agente", "el límite del plan" y la
sección Conversaciones tengan efecto real. Sin estos llamados, Vibo marca el
estado en su base pero el bot sigue respondiendo en WhatsApp igual (SDD §4.3).

> **Regla de oro:** Vibo es el plano de control (estado, límites, historial);
> n8n es el plano de ejecución (la IA que responde). n8n consulta a Vibo antes
> de responder y le reporta cada mensaje.

---

## Autenticación

Todas las rutas viven bajo `/api/integracion/*` y **no usan sesión de usuario**.
Cada llamado manda el **token de integración del agente** en el header:

```
Authorization: Bearer <token-del-agente>
```

- El token se genera en el admin de Vibo al crear el agente y **se muestra una
  sola vez**. Si se perdió, se regenera desde el detalle del agente (el anterior
  deja de servir al instante).
- Es único por agente: un token filtrado de un cliente no sirve para otro.
- En n8n, cargalo como **credencial/variable del workflow**, no hardcodeado.

**Base URL:** `https://<tu-dominio-vibo>` (en desarrollo, `http://localhost:3000`).

**Rate limiting:** por IP y por token (~120 req/min por token). Con los 3
llamados por mensaje que se describen abajo, no te vas a acercar al tope.

---

## Endpoint 1 — Contexto del agente ⭐ (SDD v2 §1)

```
GET /api/integracion/agentes/{agenteId}/contexto?telefono={telefono}
```

**Este endpoint reemplaza a `/puede-responder`** (que sigue funcionando, ver más
abajo). Devuelve, en un solo llamado, el permiso para responder **y todo lo que
hace falta para armar el system prompt**: prompt base, tono, reglas, canchas con
precios y datos del negocio.

**Por qué existe.** En v1, n8n preguntaba sólo "¿puedo responder?" y tenía el
prompt, los precios y las reglas **pegados adentro del workflow**. Consecuencia:
el dueño cambiaba un precio en Vibo y el bot seguía cotizando el viejo. Vibo era
la fuente de verdad del *estado*, pero no del *comportamiento*. Con este
endpoint, un cambio hecho en la sección Agentes tiene efecto en la próxima
respuesta, sin tocar el workflow.

**Respuesta `200`:**

```json
{
  "puedeResponder": true,
  "motivo": null,
  "promptBase": "Sos el asistente de …",
  "tono": "Cercano y breve",
  "negocio": {
    "nombre": "Club Padel AI",
    "deporte": "Pádel",
    "direccion": "Av. Siempre Viva 123",
    "telefono": "11 5555-5555"
  },
  "reglas": {
    "anticipacionMinimaMin": 180,
    "politicaCancelacion": "Se puede cancelar hasta 2 horas antes sin cargo.",
    "senia": { "requiere": true, "detalle": "Se pide una seña del 50%." }
  },
  "faq": "Estacionamiento gratis. Se alquilan paletas.",
  "canchas": [
    { "numero": 1, "precio": 48000, "duracionTurnoMin": 90,
      "horarioApertura": "08:00", "horarioCierre": "23:00" }
  ]
}
```

**Cómo usarlo en n8n:** armá el system prompt del AI Agent concatenando
`promptBase` + `tono` + `reglas` + `canchas` + `faq`, en vez de tenerlos
escritos en el nodo. Si `puedeResponder` es `false`, cortá antes de llamar al
LLM (misma lógica que en v1).

**Notas del contrato — leer antes de armar el prompt:**

| Campo | Detalle |
|---|---|
| `motivo` | Siempre presente. `null` cuando `puedeResponder` es `true`. Mismos valores que la tabla del endpoint de abajo. |
| `reglas.anticipacionMinimaMin` | En **minutos**. Puede ser `null` si el dueño no la configuró — en ese caso no inventes una regla, omitila del prompt. |
| `reglas.senia` | Es `{ requiere, detalle }`, **no** `{ requiere, monto }` como decía el borrador del SDD v2. `requiere: true` significa "hay una política de seña cargada", **no** "cobrá tanto": el monto o porcentaje está en `detalle`, en texto. No deduzcas un número de ahí. |
| `tono`, `faq`, `negocio` | No estaban en el borrador del SDD v2. Se agregaron porque el cliente ya los edita en la sección Agentes (requerimientos §7) y sin esto no tendrían ningún efecto, que es justo el problema que este endpoint resuelve. |
| Campos de texto | Vienen `null` cuando están vacíos, nunca `""`. |
| Agente pausado | Aunque `puedeResponder` sea `false`, el resto del contexto viene igual, para que n8n lo pueda cachear para cuando se reactive. |

**Errores:** `401` (token ausente o inválido), `403` (el token no corresponde a
ese `agenteId`), `404` (el agente ya no existe), `429` (demasiadas solicitudes).

---

## Endpoint 1-bis — ¿Puede responder el bot? *(reemplazado por `/contexto`)*

```
GET /api/integracion/agentes/{agenteId}/puede-responder?telefono={telefono}
```

> **Sigue funcionando y no se va a romper**, pero para workflows nuevos usá
> `/contexto`, que da esto mismo más el prompt y los precios en un solo llamado.
> El workflow ya cableado de Padel AI usa este endpoint; migrarlo es cambiar la
> URL del nodo y leer el prompt de la respuesta.

Se llama **antes de generar la respuesta de la IA**. Si devuelve
`puedeResponder: false`, el workflow **corta ahí**: no llama al LLM ni responde.

- `{agenteId}` en la URL tiene que ser el mismo agente al que pertenece el token
  (si no, `403`).
- `telefono` (query, opcional pero recomendado): el número del contacto, para
  también chequear si **esa conversación puntual** está en manual (el dueño tomó
  el control de ese chat). Sin `telefono`, solo se evalúa el estado del agente
  entero.

**Respuesta `200`:**

```json
{ "puedeResponder": true }
```

```json
{ "puedeResponder": false, "motivo": "agente_pausado_limite" }
```

`motivo` (solo cuando `puedeResponder` es `false`):

| motivo | Qué pasó |
|---|---|
| `agente_pausado_manual` | El dueño pausó el agente entero. |
| `agente_pausado_limite` | Se agotó el pozo de conversaciones del plan. |
| `conversacion_en_manual` | El dueño tomó el control de ESE chat puntual. |

**Errores:** `401` (token ausente o inválido), `403` (el token no corresponde a
ese `agenteId`), `429` (demasiadas solicitudes).

---

## Endpoint 2 — Registrar un mensaje

```
POST /api/integracion/mensajes
Content-Type: application/json
```

Loguea un mensaje. Se llama **dos veces por interacción**: una con el mensaje
entrante del contacto, otra con la respuesta de la IA.

**Cuerpo:**

```json
{
  "agenteId": "cmxxxx…",
  "telefono": "5491144440001",
  "remitente": "CONTACTO",
  "contenido": "Hola, ¿tenés cancha el sábado a las 20?",
  "contactoNombre": "Martina Gómez",
  "evolutionMsgId": "wamid.xxxxx"
}
```

| Campo | Obligatorio | Notas |
|---|---|---|
| `agenteId` | sí | Tiene que coincidir con el agente del token (si no, `403`). |
| `telefono` | sí | Número del contacto. Identifica la conversación. |
| `remitente` | sí | `"CONTACTO"` (mensaje entrante) o `"IA"` (respuesta del bot). **`HUMANO` no se acepta acá** — ese lo crea el panel cuando el dueño escribe a mano. |
| `contenido` | sí | El texto del mensaje. |
| `contactoNombre` | no | Nombre del contacto, si lo tenés. Solo se usa la primera vez. |
| `evolutionMsgId` | no | Id del mensaje en Evolution, para trazabilidad. |

**Respuesta `201`:**

```json
{
  "ok": true,
  "conversacionId": "cmyyyy…",
  "estado": "IA_RESPONDIENDO",
  "uso": { "usadas": 143, "limite": 200, "bloqueado": false }
}
```

- `estado`: en qué quedó la conversación (`ABIERTA`, `IA_RESPONDIENDO`,
  `REQUIERE_ATENCION_HUMANA`).
- `uso`: **solo aparece para `remitente: "CONTACTO"`**. Es el estado del pozo del
  plan del cliente. Si `bloqueado` es `true`, este mensaje agotó el pozo y las
  sedes del cliente quedaron pausadas — la próxima consulta a `/puede-responder`
  va a devolver `false`.

**Errores:** `400` (cuerpo no JSON o inválido), `401`, `403`, `429`.

> **Importante sobre el conteo:** el pozo se cuenta **una vez por conversación
> nueva en el ciclo**, no por mensaje. Podés postear todos los mensajes de un
> mismo contacto sin miedo a contar de más: Vibo deduplica por conversación y
> ciclo.

---

## Cómo se ordenan en el workflow

Sobre el workflow madre actual (Webhook → Code/If → AI Agent → HTTP Request a
Evolution), los 3 llamados se insertan así:

```
Webhook (entra el mensaje)
  → Code / If / Transcribe / Edit Fields   (ya normalizás teléfono + texto)
  → [1] POST /mensajes  { remitente: "CONTACTO" }      ← loguea y cuenta uso
  → [2] GET  /contexto?telefono=…                      ← ¿sigue? + prompt + precios
  → If:
       false → FIN (no se responde; ya quedó logueado para atención humana)
       true  → AI Agent1  ← system prompt armado con lo que devolvió [2]
             → HTTP Request  (envía la respuesta por Evolution)
             → [3] POST /mensajes  { remitente: "IA" } ← loguea la respuesta
```

En el workflow ya cableado, `[2]` es `/puede-responder`. Migrar a `/contexto` es
cambiar la URL de ese nodo y pasar a leer el prompt de su respuesta en vez de
tenerlo escrito en el AI Agent.

**Por qué [1] va antes de [2]:** el log del mensaje entrante es el que cuenta el
uso y puede disparar el bloqueo. Poniéndolo antes del chequeo, el mensaje que
llega al tope del plan es el que activa la pausa, y el bot ya no le contesta.

**El log [1] se hace siempre**, aunque después `/puede-responder` diga `false`:
así el dueño ve en Conversaciones el mensaje que entró mientras el bot estaba
pausado, y lo puede responder a mano.

---

## Fail-open (no bloquear la venta por una falla nuestra)

Si Vibo no responde (caído, lento, timeout), el bot **sigue respondiendo**. Es
preferible una conversación de más que cortarle la venta al cliente por un
problema de infraestructura de Vibo (SDD §4.4).

En n8n:
- Configurá el HTTP Request de `/contexto` como **"Continue On Fail"**.
- El nodo **If** que sigue tiene que caer en la rama de **responder** cuando la
  respuesta viene vacía o con error (no solo cuando `puedeResponder === true`).

**Fail-open con cache (SDD v2 §1).** Con `/contexto` el fail-open se extiende:
ahora el llamado no trae sólo el permiso sino también el prompt y los precios,
así que si Vibo no responde, el bot no sólo tiene que seguir — tiene que seguir
**con la última respuesta válida que cacheó**, no sin prompt.

Concretamente, en n8n: guardá el último contexto bueno (Workflow Static Data o
un nodo de cache) y usalo cuando el HTTP Request falle. Sin esto, un timeout de
Vibo degrada al bot a responder sin instrucciones ni precios, que es **peor**
que no responder — cotizaría cualquier cosa.

> Vibo nunca devuelve un `puedeResponder: true` inventado cuando algo falla de
> su lado: devuelve un error honesto (500). La decisión de seguir es de n8n, que
> es el único que sabe qué tenía cacheado.

Ejemplo de condición del If (responder si NO está explícitamente bloqueado):

```
{{ $json.puedeResponder !== false }}
```

Así, `true` responde, y `undefined`/error (fail-open) también.

---

## Ejemplo con curl

```bash
TOKEN="el-token-del-agente"
BASE="https://<tu-dominio-vibo>"
AGENTE="cmxxxx…"

# 1. Loguear el mensaje entrante (y contar uso)
curl -sX POST "$BASE/api/integracion/mensajes" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"agenteId":"'"$AGENTE"'","telefono":"5491144440001","remitente":"CONTACTO","contenido":"Hola"}'

# 2. Contexto: ¿puede responder? + prompt + reglas + precios
curl -s "$BASE/api/integracion/agentes/$AGENTE/contexto?telefono=5491144440001" \
  -H "Authorization: Bearer $TOKEN"

# 3. Loguear la respuesta de la IA (después de enviarla por Evolution)
curl -sX POST "$BASE/api/integracion/mensajes" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"agenteId":"'"$AGENTE"'","telefono":"5491144440001","remitente":"IA","contenido":"¡Hola! Sí, tengo la Cancha 2 a las 20."}'
```

---

## Migrar un workflow ya cableado a `/contexto`

Los nodos listos para pegar están en **`docs/n8n-nodos-vibo-v2.json`** (formato
portapapeles de n8n: se copia el contenido y se pega en el canvas).

> **Por qué se pega a mano y no se actualiza por API.** El SDK de n8n sólo
> permite reescribir el workflow **entero**, y al hacerlo **descarta las
> credenciales ya vinculadas** (comprobado: un HTTP Request con `httpHeaderAuth`
> vuelve sin credencial, y la API avisa *"credentials must be configured
> manually"*). En este workflow eso dejaría sin credencial a los 3 nodos de
> Vibo, OpenAI, Transcribe y los 3 de Airtable. Como los nodos de Vibo van con
> `onError: continueRegularOutput`, fallarían **en silencio**. Pegar sólo los
> nodos que cambian no toca nada de lo demás.

### Los 3 cambios

**1. Reemplazar `Vibo - Puede responder` por `Vibo - Contexto`**

- Misma credencial Header Auth, mismo `Continue On Fail`, mismo timeout.
- Cambia la URL: `/puede-responder` → `/contexto` (mismo query `?telefono=`).
- **Poné la URL real de Vibo**: el JSON trae `REEMPLAZAR-POR-LA-URL-DE-VIBO`.

**2. Insertar `Vibo - Contexto cache` (Code) entre el contexto y el If**

```
Vibo - Log contacto → Vibo - Contexto → Vibo - Contexto cache → Vibo - ¿Responder? → AI Agent1
```

Es el que implementa el **fail-open con cache**: guarda el último contexto bueno
y lo reusa si Vibo no responde. Sin él, un timeout deja al bot contestando sin
prompt ni precios. Además arma `bloqueVibo`, el texto ya formateado que se
inyecta en el system prompt.

El nodo `Vibo - ¿Responder?` **no se toca**: sigue leyendo
`{{ $json.puedeResponder !== false }}`, que el nodo de cache también devuelve.

> El static data de n8n sólo persiste entre ejecuciones de **producción**. En una
> ejecución manual de prueba el cache arranca vacío y la salida dice
> `sinContexto: true`. No es un bug.

**3. En `AI Agent1`, reemplazar el final del system prompt**

Borrar estas dos secciones hardcodeadas:

```
## POLÍTICA DE CANCELACIÓN
- De cancelar 3 horas antes del turno se deberá abonar $12.000

## SEÑA
- La cancha no tiene seña
```

y poner en su lugar:

```
{{ $('Vibo - Contexto cache').first().json.bloqueVibo }}
```

Eso inyecta negocio, tono, canchas con precios, reglas y FAQ desde Vibo. De ahí
en más, editar un precio o la política en la sección Agentes cambia lo que
responde el bot, sin tocar el workflow.

> Usar `.first()`, **no** `.item`: el resto del workflow usa `.first()`, y con
> `.item` el nodo de transcripción puede cortar el rastreo de ítems.

### Antes de migrar: revisar que el dato de Vibo sea el correcto

Al migrar, **el bot empieza a decir lo que dice Vibo**. Si ahí hay algo mal
cargado, se lo va a decir a clientes reales. Al 2026-07-19 hay una
contradicción detectada entre las dos fuentes:

| Fuente | Política de cancelación |
|---|---|
| Prompt actual del workflow | "De cancelar 3 horas antes del turno se deberá **abonar $12.000**" |
| Vibo (lo que pasaría a decir) | "Se puede cancelar hasta 3 horas antes **sin cargo**" |

Hay que definir cuál es la real y dejarla en Vibo (sección Agentes → Reglas de
reserva) **antes** de hacer el cambio 3.

### Verificar que quedó bien

Que la ejecución dé verde no alcanza (ver troubleshooting abajo). Confirmá:

1. En la salida del nodo `Vibo - Contexto cache`: `desdeCache: false` y
   `bloqueVibo` con los precios. Si dice `sinContexto: true`, la URL o el token
   están mal.
2. Cambiá un precio en Vibo (Agentes → Canchas), mandá un mensaje y fijate que
   el bot cotice el nuevo.
3. Pausá el agente en Vibo y confirmá que **no** responde.

---

## Troubleshooting: "la ejecución dio verde pero el panel está vacío"

Este es **el** síntoma a reconocer. Salió dos veces al cablear el primer agente
real (2026-07-18) y en ninguna de las dos n8n mostró un error.

La causa es que hay dos formas de que no pase nada sin que nada falle:

1. **El fail-open tapa los errores de los nodos de Vibo.** Los 3 nodos van con
   `onError: continueRegularOutput` a propósito (§4.4 del SDD): si Vibo está
   caído, el bot tiene que seguir respondiendo. El efecto colateral es que un
   401 por token mal cargado, un 403 por `agenteId` cruzado o una URL inalcanzable
   se ven **exactamente igual que el camino feliz**: nodo en verde, ejecución
   exitosa, panel vacío.

2. **Un `return []` no es un error, es un flujo vacío.** El nodo `Code` del
   workflow madre corta con `return []` cuando el mensaje es propio
   (`fromMe`), cuando el teléfono es el del bot (`BOT_NUMBER`), o cuando no hay
   ni texto ni audio. Con un array vacío, **todos** los nodos siguientes se
   saltean y la ejecución igual termina en verde.

**Cómo diagnosticarlo, en este orden:**

| Paso | Qué mirar | Qué significa |
|---|---|---|
| 1 | El nodo `Code` en la ejecución | Si dice **0 items**, cortó ahí y nada de lo de abajo corrió. Revisar `fromMe` y `BOT_NUMBER` en el payload. |
| 2 | Los logs de Vibo (`/api/integracion`) | Si no hay ningún request, n8n nunca llamó: es red o el flujo ni llegó. Si hay 401/403, es el token o el `agenteId`. |
| 3 | El detalle de cada nodo de Vibo | Con fail-open hay que abrirlos uno por uno: el status de la respuesta no sube al resultado de la ejecución. |

No alcanza con mirar si la ejecución fue exitosa. **La verificación real es del
lado de Vibo**: que aparezca la conversación y que el contador del plan suba.
