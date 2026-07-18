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

## Endpoint 1 — ¿Puede responder el bot?

```
GET /api/integracion/agentes/{agenteId}/puede-responder?telefono={telefono}
```

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
  → [2] GET  /puede-responder?telefono=…               ← ¿sigue?
  → If:
       false → FIN (no se responde; ya quedó logueado para atención humana)
       true  → AI Agent1 (OpenAI + tools de Airtable)
             → HTTP Request  (envía la respuesta por Evolution)
             → [3] POST /mensajes  { remitente: "IA" } ← loguea la respuesta
```

**Por qué [1] va antes de [2]:** el log del mensaje entrante es el que cuenta el
uso y puede disparar el bloqueo. Poniéndolo antes del chequeo, el mensaje que
llega al tope del plan es el que activa la pausa, y el bot ya no le contesta.

**El log [1] se hace siempre**, aunque después `/puede-responder` diga `false`:
así el dueño ve en Conversaciones el mensaje que entró mientras el bot estaba
pausado, y lo puede responder a mano.

---

## Fail-open (no bloquear la venta por una falla nuestra)

Si Vibo no responde `/puede-responder` (caído, lento, timeout), el bot **sigue
respondiendo**. Es preferible una conversación de más que cortarle la venta al
cliente por un problema de infraestructura de Vibo (SDD §4.4).

En n8n:
- Configurá el HTTP Request de `/puede-responder` como **"Continue On Fail"**.
- El nodo **If** que sigue tiene que caer en la rama de **responder** cuando la
  respuesta viene vacía o con error (no solo cuando `puedeResponder === true`).

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

# 2. ¿Puede responder?
curl -s "$BASE/api/integracion/agentes/$AGENTE/puede-responder?telefono=5491144440001" \
  -H "Authorization: Bearer $TOKEN"

# 3. Loguear la respuesta de la IA (después de enviarla por Evolution)
curl -sX POST "$BASE/api/integracion/mensajes" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"agenteId":"'"$AGENTE"'","telefono":"5491144440001","remitente":"IA","contenido":"¡Hola! Sí, tengo la Cancha 2 a las 20."}'
```
