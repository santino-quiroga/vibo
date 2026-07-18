# Vibo — SDD (Software Design Document) v1

**Basado en:** Vibo-Requerimientos-Plataforma-v1.md

---

## 1. Resumen y alcance

Aplicación web (Next.js, un solo repo) desplegada en Vercel, con dos superficies:

- **Panel cliente**: Inicio, Agentes, Turnos, Conversaciones (ver documento de requerimientos)
- **Panel admin interno de Vibo**: alta de clientes, agentes, planes, instancias de Evolution API y bases de Airtable (mismo repo, rutas protegidas por rol)

El sistema orquesta datos de tres fuentes externas que **ya existen y no se tocan**:
- **n8n** (única instancia, un workflow por cliente/agente) — orquesta la lógica del agente
- **Airtable** (una base por cliente) — fuente de verdad de turnos (Reservas + Slots)
- **Evolution API** (una instancia por cliente/número) — envío/recepción de WhatsApp

Vibo no reemplaza ninguna de estas piezas. Actúa como una **capa de lectura/escritura y presentación** sobre ellas, más su propia base de datos para todo lo que es específico de la plataforma (cuentas, planes, límites, configuración de canchas/precios, historial de conversaciones).

---

## 2. Arquitectura general

```
                         ┌─────────────────────────────┐
                         │        Vercel (Next.js)      │
                         │  ─ Panel cliente              │
                         │  ─ Panel admin interno         │
                         │  ─ API routes / server actions │
                         └───────────┬─────────────────┘
                                     │
                 ┌───────────────────┼───────────────────┐
                 │                   │                   │
        ┌────────▼────────┐  ┌───────▼────────┐  ┌───────▼─────────┐
        │ Postgres (Neon)  │  │  Airtable API   │  │ Evolution API    │
        │ Vercel Postgres  │  │  (1 base/cliente)│  │ (1 instancia/    │
        │ - clientes       │  │  - Reservas      │  │  cliente, VPS/   │
        │ - usuarios       │  │  - Slots         │  │  Docker externo) │
        │ - agentes        │  └─────────────────┘  └───────┬──────────┘
        │ - planes/uso     │                               │ webhooks
        │ - canchas/precio │                               │ (in/out)
        │ - conversaciones │◄──────────────────────────────┘
        │ - mensajes       │
        └──────────────────┘
                 ▲
                 │ workflows (uno por cliente/agente)
        ┌────────┴────────┐
        │   n8n (externo, │
        │  instancia única│
        │  ya existente)  │
        └─────────────────┘
```

### Componentes y dónde viven

| Componente | Dónde corre | Rol |
|---|---|---|
| Next.js (frontend + backend) | Vercel | Todo lo que el cliente y el admin de Vibo ven y usan |
| Postgres | Vercel Postgres (Neon) | Fuente de verdad de todo lo propio de Vibo: cuentas, agentes, planes, uso, canchas/precios, conversaciones y mensajes |
| Airtable | Externo (una base por cliente) | Fuente de verdad de turnos (ver punto 8 del doc de requerimientos) |
| Evolution API | Externo, self-hosted, una instancia por cliente | Envío/recepción real de mensajes de WhatsApp |
| n8n | Externo, self-hosted, una instancia única | Orquesta la lógica del agente (un workflow por cliente/agente) |

### Por qué Postgres y no todo en Airtable/Evolution API

- Airtable es de turnos, no de todo lo demás — no tiene sentido forzarlo a guardar cuentas, planes o mensajes.
- Evolution API es transporte de mensajes, no necesariamente historial confiable (punto sin confirmar, ver sección 4).
- Vercel Postgres se elige por integración nativa con Vercel (cero configuración de conexión, variables de entorno automáticas) y porque no hay necesidad de features extra de Supabase (auth propio, storage) dado que la autenticación es simple y no hay registro público.

### Regla de oro de toda la arquitectura

**El frontend nunca habla directo con Airtable ni con Evolution API.** Todo pasa por API routes/server actions de Next.js que usan las credenciales (guardadas como variables de entorno / secretos en la tabla de Agente) del lado del servidor. Esto es válido tanto para lectura (mostrar turnos, mostrar conversaciones) como para escritura (cancelar un turno, enviar un mensaje manual).

---

## 3. Modelo de datos (Postgres / Prisma)

Todo lo que sigue vive en la base propia de Vibo. Ninguno de estos modelos duplica lo que ya está en Airtable (turnos) — son las entidades que Airtable y Evolution API no tienen: cuentas, planes, precios y conversaciones.

```prisma
enum RolUsuario {
  CLIENTE_OWNER   // dueño del complejo, login del panel cliente
  VIBO_ADMIN      // equipo de Vibo, panel admin interno
}

enum EstadoAgente {
  ACTIVO
  PAUSADO_MANUAL   // lo pausó el dueño desde la plataforma
  PAUSADO_LIMITE   // se pausó solo por llegar al límite de conversaciones del plan
}

enum EstadoConversacion {
  ABIERTA
  IA_RESPONDIENDO
  REQUIERE_ATENCION_HUMANA
  CERRADA
}

enum RemitenteMensaje {
  CONTACTO   // el cliente final (quien escribe al WhatsApp)
  IA
  HUMANO     // el dueño, cuando tomó control manual
}

model Cliente {
  id          String   @id @default(cuid())
  nombre      String
  planId      String
  plan        Plan     @relation(fields: [planId], references: [id])
  usuarios    Usuario[]
  agentes     Agente[]
  createdAt   DateTime @default(now())
}

model Usuario {
  id            String     @id @default(cuid())
  email         String     @unique
  passwordHash  String
  rol           RolUsuario
  clienteId     String?    // null si es VIBO_ADMIN
  cliente       Cliente?   @relation(fields: [clienteId], references: [id])
  createdAt     DateTime   @default(now())
}

model Plan {
  id                     String   @id @default(cuid())
  nombre                 String   // "Starter", "Profesional", "Multi-sede" (borrador, ver doc de requerimientos punto 4.2)
  maxAgentes             Int
  maxConversacionesMes   Int
  clientes               Cliente[]
}

model Agente {
  id                  String        @id @default(cuid())
  clienteId           String
  cliente             Cliente       @relation(fields: [clienteId], references: [id])
  nombre              String        // nombre del agente/sede, ej. "Club Chinda Fútbol 5"
  deporte             String
  estado              EstadoAgente  @default(ACTIVO)
  promptBase           String       @db.Text

  // credenciales de integraciones — encriptadas en reposo (ver sección 7, Seguridad)
  airtableBaseId       String
  airtableApiKeyEnc    String       @db.Text
  evolutionInstanceId  String
  evolutionApiUrlEnc   String       @db.Text
  evolutionApiKeyEnc   String       @db.Text
  n8nWorkflowId        String?      // referencia informativa, n8n se administra fuera de Vibo

  canchas              Cancha[]
  conversaciones       Conversacion[]
  usoMensual           UsoMensual[]
  createdAt            DateTime     @default(now())
}

model Cancha {
  id                String   @id @default(cuid())
  agenteId          String
  agente            Agente   @relation(fields: [agenteId], references: [id])
  numero            Int      // 1, 2, 3... — el backend arma "Cancha {numero}" para cruzar con Airtable
  precio            Decimal
  duracionTurnoMin  Int
  horarioApertura   String   // "08:00"
  horarioCierre     String   // "23:00"

  @@unique([agenteId, numero])
}

model UsoMensual {
  id                      String   @id @default(cuid())
  agenteId                String
  agente                  Agente   @relation(fields: [agenteId], references: [id])
  cicloInicio             DateTime
  cicloFin                DateTime
  conversacionesCount     Int      @default(0)
  limiteAlcanzadoEn       DateTime?

  @@unique([agenteId, cicloInicio])
}

model Conversacion {
  id                String              @id @default(cuid())
  agenteId          String
  agente            Agente              @relation(fields: [agenteId], references: [id])
  contactoTelefono  String
  contactoNombre    String?
  estado            EstadoConversacion  @default(ABIERTA)
  pausadaManual     Boolean             @default(false) // la IA no responde en ESTE chat puntual
  ultimoMensajeAt   DateTime
  mensajes          Mensaje[]

  @@index([agenteId, contactoTelefono])
}

model Mensaje {
  id                String            @id @default(cuid())
  conversacionId    String
  conversacion      Conversacion      @relation(fields: [conversacionId], references: [id])
  remitente         RemitenteMensaje
  contenido         String            @db.Text
  evolutionMsgId    String?           // id del mensaje en Evolution API, para trazabilidad
  createdAt         DateTime          @default(now())

  @@index([conversacionId, createdAt])
}
```

### Notas importantes de este modelo

- **Convención obligatoria de nombres de cancha en Airtable:** para poder cruzar `Cancha.numero` de Postgres con el campo "Cancha" de Airtable sin ambigüedad, **toda base nueva de Airtable debe nombrar las canchas exactamente como "Cancha 1", "Cancha 2", etc.** (con ese formato exacto: "Cancha" + espacio + número). El backend arma el string (`"Cancha " + numero`) para hacer el join — nunca se tipea a mano. Esto es una regla de alta de cliente, no de código: hay que documentarla en el proceso de onboarding para que quien configure el Airtable de un cliente nuevo no use otro formato (ej. "Cancha Techada", "Cancha A"). Si algún cliente futuro realmente necesita nombres no numéricos, ese caso puntual requeriría volver a un campo de texto libre — pero para la vertical actual (canchas numeradas) esta convención alcanza y es más simple de mantener.
- **Pre-requisito de alta detectado en integración real:** el campo `Cancha` de la tabla `Reservas` debe ser Selección única (ya lo es en la base de Padel AI). El riesgo real observado es otro: si el nodo que escribe en Airtable (n8n) tiene activado el **typecast automático**, un valor que no coincide exacto con una opción existente ("Cancha 1", "Cancha 2") puede crear una opción nueva en vez de fallar — eso genera opciones "inventadas" y reservas mal asignadas. Antes de dar de alta un agente nuevo, conviene revisar que el nodo de Airtable en el workflow tenga el typecast desactivado, para que un valor mal formado tire error en vez de ensuciar la tabla silenciosamente.
- **Las credenciales por agente van encriptadas en la tabla, no en variables de entorno de Vercel.** Vercel maneja variables de entorno a nivel de deployment, no por cliente — como cada agente tiene su propia base de Airtable y su propia instancia de Evolution API, esas credenciales tienen que vivir en la fila del `Agente`, cifradas (ver sección 7).
- **`UsoMensual` es la tabla que sostiene el límite duro de conversaciones** (punto 4.2 del doc de requerimientos): se incrementa en tiempo real cuando llega un webhook de mensaje nuevo, y si `conversacionesCount` alcanza `maxConversacionesMes` del plan, el `Agente.estado` pasa a `PAUSADO_LIMITE` automáticamente.
- **`Mensaje` es la fuente de verdad del historial de conversaciones** (no Evolution API), por lo discutido: no está confirmado que Evolution API guarde historial confiable, así que Vibo lo persiste él mismo vía webhook, tanto para mensajes entrantes como salientes (incluidos los que escribe el dueño al tomar control manual).
- No hay un modelo `Turno` en Postgres — eso sigue viviendo en Airtable (Reservas + Slots), tal como se resolvió en el documento de requerimientos.

---

## 4. Capa de integraciones

### 4.1 Airtable (Turnos)

- Cliente HTTP server-side que usa `Agente.airtableBaseId` + `airtableApiKeyEnc` (desencriptado en memoria, nunca en logs)
- **Lectura**: listar `Reservas` (filtros por fecha/cancha/estado) y `Slots`, para armar tanto la sección Turnos como los KPIs de Inicio
- **Escritura**: cancelar un turno (`Estado → Cancelada`) o reprogramarlo (`Fecha` / `Hora inicio`) desde la sección Turnos
- **Rate limiting**: la API de Airtable limita a ~5 requests/seg por base. Con varios agentes activos, hay que encolar/throttlear las llamadas por base (ej. una librería tipo Bottleneck), no golpear Airtable en paralelo sin control
- **Cache corta para KPIs**: calcular "Ocupación" e "Ingresos" en Inicio con datos frescos en cada carga sería lento y quema rate limit rápido, sobre todo con "Todas las sedes" agregando varios agentes. Se cachean esos cálculos ~1-2 minutos (revalidación de Next.js o una tabla de cache simple), mientras que la vista Turnos puede pedir datos más al momento
- **Mapeo de campos centralizado**: como todas las bases comparten el mismo esquema (ver doc de requerimientos, punto 8.1), los nombres de campo se definen una sola vez en el código (constantes), no por cliente

### 4.2 Evolution API (envío de mensajes)

- Se usa solo para **enviar** mensajes cuando el dueño toma control manual de una conversación (la IA ya envía los suyos directo, sin pasar por Vibo)
- Backend de Vibo llama al endpoint de envío de Evolution API con `evolutionApiUrlEnc` + `evolutionApiKeyEnc` + `evolutionInstanceId` del agente correspondiente

### 4.3 Punto crítico: cómo el n8n existente respeta las pausas y límites de Vibo

Esto es una dependencia real que hay que resolver, no solo un detalle de backend: **la IA que responde vive en n8n, no en Vibo.** Para que "pausar un agente" o "llegar al límite del plan" tengan efecto real (que el bot deje de contestar), el workflow de n8n tiene que consultarle a Vibo antes de responder — si no, Vibo puede marcar el estado como pausado en su base, pero el bot va a seguir respondiendo en WhatsApp igual.

**Solución propuesta:** agregar 2-3 nodos HTTP al workflow de n8n de cada agente (esto sí implica tocar los workflows existentes, no solo código de Vibo):

1. **Al recibir un mensaje entrante**, antes de generar la respuesta de la IA:
   `GET /api/integracion/agentes/:agenteId/puede-responder` → `{ puedeResponder: boolean, motivo? }`
   Si `puedeResponder = false` (agente pausado, manual o por límite; o esa conversación puntual pausada), el workflow corta ahí — no llama al LLM ni responde.
2. **Loguear el mensaje entrante:**
   `POST /api/integracion/mensajes` `{ agenteId, telefono, remitente: "CONTACTO", contenido }`
   Este mismo llamado es el que incrementa `UsoMensual.conversacionesCount` del lado de Vibo (una vez por conversación nueva en el ciclo, no por cada mensaje) y dispara el pasaje a `PAUSADO_LIMITE` si corresponde.
3. **Loguear la respuesta de la IA**, después de que n8n la envía por Evolution API:
   `POST /api/integracion/mensajes` `{ agenteId, telefono, remitente: "IA", contenido, evolutionMsgId }`

Este enfoque reemplaza la idea original de depender de un webhook de Evolution API para el historial (punto sin confirmar de la sección anterior): como n8n ya procesa cada mensaje para generar la respuesta, es más simple y confiable que sea **n8n quien reporte a Vibo**, en vez de depender de que Evolution API tenga webhooks configurados para ambos sentidos.

**Ventaja de timing:** como el workflow madre de n8n todavía está en construcción (en paralelo al desarrollo de la plataforma), estos 3 llamados se pueden incorporar directamente a esa construcción en vez de ser un retrofit posterior sobre un workflow ya cerrado. Conviene coordinar para que la API de Vibo (sección de integración) y el workflow madre avancen con esta interfaz en mente desde ahora — define un contrato claro entre las dos partes que se están construyendo al mismo tiempo.

### 4.4 Manejo de errores

- Si Airtable no responde (timeout, 429, error de auth): reintentar con backoff exponencial (2-3 intentos), y si sigue fallando, mostrar un estado degradado visible en la UI ("No se pudieron cargar los turnos, reintentando...") en vez de romper la pantalla — nunca fallar en silencio, porque es el dato más importante del negocio del cliente
- Si Evolution API no responde al enviar un mensaje manual: mostrar el error en el chat ("No se pudo enviar, reintentar") sin perder el mensaje escrito
- Si `n8n` no logra consultar `/puede-responder` (Vibo caído o lento): **fail-open, no fail-closed** — el bot sigue respondiendo en vez de cortarse por un problema de infraestructura de Vibo. Es preferible el riesgo de una conversación de más que cortarle la venta al cliente por una falla nuestra

---

## 6. Autenticación y autorización

Hay **dos tipos de acceso completamente distintos** al sistema, y conviene no mezclarlos:

### 6.1 Login de usuarios (panel cliente + panel admin interno)

- **NextAuth con Credentials provider** (email + contraseña). Sin registro público — coherente con el punto 4.1 del doc de requerimientos, las cuentas las crea Vibo desde el admin interno.
- Sesión vía JWT en cookie `httpOnly` (no localStorage, evita exposición a XSS).
- **Recuperación de contraseña:** flujo de "olvidé mi contraseña" con link de un solo uso por email (usando un proveedor tipo Resend) — esto sí conviene mantenerlo aunque no haya registro, para no depender de que vos resetees contraseñas a mano.
- **Cambio de contraseña self-service — agregado tras revisión de MVP:** además del flujo de "olvidé mi contraseña", el usuario logueado necesita poder cambiar su propia contraseña desde el menú de usuario (la que el admin interno le generó al darlo de alta). Sin esto, el cliente queda dependiendo de vos para siempre, incluso teniendo sesión activa. Se agrega como una opción más en el dropdown de usuario (sección 5 del doc de requerimientos: "Plan / Cuenta / Cerrar sesión" → sumar "Cambiar contraseña").
- **Roles** (`Usuario.rol`, ver modelo de datos):
  - `CLIENTE_OWNER` → accede solo a `/dashboard/*`, con todas las consultas filtradas server-side por su propio `clienteId` (nunca confiar en un `clienteId` que venga del cliente/frontend)
  - `VIBO_ADMIN` → accede a `/admin/*` (alta de clientes, agentes, planes, credenciales de integraciones)
- Middleware de Next.js valida el rol en cada request a rutas protegidas, no solo en el render inicial — evita que alguien acceda a una API route de admin conociendo la URL.

### 6.2 Autenticación de las llamadas de n8n (server-to-server, no es un usuario)

Las rutas de integración de la sección 4.3 (`/api/integracion/*`) **no usan sesión de usuario** — las llama n8n, no una persona logueada. Se protegen distinto:

- Cada `Agente` tiene un **token de integración propio** (secreto largo, generado al crear el agente, guardado igual que las demás credenciales — cifrado en la fila de `Agente`)
- n8n manda ese token en el header `Authorization: Bearer <token>` en cada llamado
- El backend de Vibo valida el token y resuelve a qué `agenteId` corresponde — esto evita que un token filtrado de un cliente sirva para otro, y evita también depender de IP allow-listing (n8n corre en una sola instancia, pero más simple no atarse a IPs fijas)
- Estas rutas quedan fuera del middleware de sesión de usuarios; tienen su propia validación

### 6.3 Multi-tenancy a nivel de datos

Regla dura para todo el código de acceso a datos: **ninguna consulta a Postgres para el panel cliente debe construirse sin pasar el `clienteId` de la sesión como filtro**, ni siquiera en queries que "total no deberían cruzar datos" — es el control principal contra que un cliente vea datos de otro.

---

## 7. Seguridad

### 7.1 Cifrado de credenciales de integración

Cada `Agente` guarda 4 secretos sensibles: `airtableApiKeyEnc`, `evolutionApiUrlEnc`, `evolutionApiKeyEnc`, y el token de integración de la sección 6.2. Ninguno se guarda en texto plano:

- Cifrado simétrico (ej. AES-256-GCM) antes de escribir en Postgres, con una **clave maestra única** guardada como variable de entorno de Vercel (`ENCRYPTION_KEY`) — esa sí es una variable de entorno global, porque es la clave que descifra todo lo demás, no un secreto por cliente
- Se descifra solo en memoria, del lado del servidor, en el momento exacto de hacer la llamada a Airtable/Evolution API — nunca se manda al frontend, ni siquiera al admin interno se le muestra el valor completo (se puede mostrar enmascarado, ej. últimos 4 caracteres, para confirmar cuál es cuál)
- Rotar la `ENCRYPTION_KEY` implica re-cifrar todas las filas — no es trivial, así que conviene generarla una sola vez con cuidado (ej. 32 bytes random) y guardarla también fuera de Vercel (un password manager del equipo) por si hay que reconstruir el entorno

### 7.2 Transporte

- HTTPS en todo (Vercel lo da por defecto)
- Cookies de sesión: `httpOnly`, `secure`, `sameSite=lax`
- Headers de seguridad básicos (CSP, X-Frame-Options, etc.) vía configuración de Next.js — previene que el panel se embeba en un iframe de otro sitio

### 7.3 Rutas de integración (`/api/integracion/*`)

- Rate limiting propio (ej. por IP + por token) para evitar abuso si un token se filtra — no es tan crítico como en una API pública porque solo n8n lo llama, pero es barato de agregar y evita sorpresas
- Los tokens de integración no expiran automáticamente en v1 (se regeneran manualmente desde el admin interno si hay sospecha de filtración) — una expiración/rotación automática es una mejora razonable para v2, no bloqueante ahora

### 7.4 Datos de clientes finales (los que reservan turnos)

- Los teléfonos y nombres de los contactos que llegan por WhatsApp son datos personales de terceros (no de tu cliente directo, sino de los clientes de tu cliente). No hace falta un tratamiento especial más allá de lo ya cubierto (cifrado en tránsito, acceso solo autenticado, filtrado por `clienteId`), pero vale la pena tenerlo presente si en algún momento se define una política de privacidad pública de Vibo

### 7.5 Separación admin interno / panel cliente

Ya cubierto en la sección 6, pero vale remarcarlo acá: el panel admin interno maneja las credenciales de **todos** los clientes. Es la superficie más sensible de todo el sistema — conviene, como mínimo, que los usuarios `VIBO_ADMIN` tengan contraseñas fuertes y, si es viable más adelante, 2FA (no bloqueante para v1, pero anotado como mejora prioritaria de v2 dado lo que ese panel puede hacer).

---

## 9. Despliegue

### 9.1 Alcance de red — confirmado

Tanto n8n (HTTPS, dominio propio) como Evolution API (IP pública `187.127.6.174:8080`) son alcanzables desde internet, así que **no hace falta VPN ni túnel** para que las funciones serverless de Vercel les hablen directo.

**Acción de seguridad pendiente, no bloqueante para el desarrollo pero sí para ir a producción:** Evolution API responde por HTTP plano, no HTTPS. Eso significa que el token de esa instancia viaja sin cifrar en cada request desde Vibo — contradice el principio de cifrado en tránsito de la sección 7.2. Antes de manejar clientes reales, conviene ponerle TLS delante (ej. un reverse proxy con Caddy, que gestiona el certificado automático, o un Cloudflare Tunnel) para que quede accesible por HTTPS. Es un cambio de infraestructura sobre el VPS existente, no de código de Vibo.

### 9.2 Estructura del repo y entornos

- Un solo repo Next.js, desplegado en Vercel con los entornos estándar: **Production** (rama principal) y **Preview** (por PR/rama)
- Variables de entorno **globales** (mismas en todos los ambientes salvo el valor): `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ENCRYPTION_KEY`, credenciales del proveedor de email para recuperación de contraseña (ej. `RESEND_API_KEY`)
- Las credenciales de cada agente (Airtable, Evolution API, token de integración) **no son variables de entorno** — viven cifradas en Postgres, como ya se definió (sección 3 y 7.1)

### 9.3 Base de datos (Vercel Postgres / Neon)

- Migraciones con Prisma (`prisma migrate deploy`) como parte del build de Vercel, para que cada deploy a Production quede con el schema al día
- Neon permite branching de la base para Preview deployments (una copia aislada por rama) — es cómodo, pero hay que tener cuidado: **los Preview deployments no deberían disparar llamadas reales a Airtable/Evolution API de clientes reales**. Recomendación: en Preview, las integraciones externas quedan mockeadas o apuntan a un agente de prueba dedicado, nunca a credenciales de un cliente real
- Backups: Neon tiene point-in-time recovery incluido, alcanza para v1 sin configurar nada adicional

### 9.4 Dominios

- Un solo dominio para toda la plataforma (ej. `app.vibo.ar`), con `/admin` como sección protegida por rol — no hace falta un subdominio aparte para el admin interno en v1, ya que la separación real la da el middleware de roles (sección 6.1), no la URL

### 9.5 Tareas programadas (Vercel Cron)

- Un Cron Job diario (Vercel Cron, vía `vercel.json`) que:
  - Cierra el `UsoMensual` del ciclo que termina y abre el siguiente por cada agente
  - Reactiva automáticamente los agentes en `PAUSADO_LIMITE` al abrir el ciclo nuevo (salvo que además estén en `PAUSADO_MANUAL`, que no se toca)
- No hay más automatizaciones programadas en v1 (no hay notificaciones proactivas, ver requisitos no funcionales del doc de requerimientos)

### 9.6 Logs y monitoreo

- Logs de funciones vía el dashboard de Vercel alcanza para v1
- Recomendado (no bloqueante): sumar un servicio de error tracking tipo Sentry, sobre todo para los fallos de integración con Airtable/Evolution API descritos en la sección 4.4 — son los que más impactan al negocio del cliente si pasan desapercibidos

---

## 11. Plan de desarrollo por fases

### MVP (lo mínimo para operar con clientes reales)

Orden pensado para minimizar retrabajo — cada sprint deja algo usable, no piezas sueltas:

| Sprint | Qué se construye | Por qué en ese orden |
|---|---|---|
| **1. Fundaciones** | Repo Next.js, schema de Prisma completo + migraciones, deploy inicial en Vercel + Postgres (Neon), autenticación (NextAuth, roles, recuperación de contraseña) | Sin esto no hay dónde parar el resto — y probar auth temprano evita sorpresas de último momento |
| **2. Admin interno básico** | Alta de cliente, alta de agente (credenciales cifradas de Airtable/Evolution API/token de integración), asignación de plan | Te deja crear datos de prueba reales (y hasta el primer cliente real) antes de tener todo el panel cliente terminado |
| **3. Turnos + Inicio** | Integración de lectura con Airtable, sección Turnos (lista + acciones básicas), KPIs de Inicio con las fórmulas ya definidas (sección 6.1 del doc de requerimientos) | Es el valor central del negocio (gestión de turnos) — conviene validarlo antes de sumar chat |
| **4. Conversaciones + n8n** | Endpoints de integración (`puede-responder`, log de mensajes), sección Conversaciones, envío manual vía Evolution API, coordinado con el avance del workflow madre | Depende de que el workflow madre ya pueda llamar a estos endpoints — se construyen en paralelo, como ya charlamos |
| **5. Planes y límites** | Conteo en tiempo real de `UsoMensual`, bloqueo duro de agentes, reactivación manual desde admin, Cron de cierre/apertura de ciclo | Necesita que sprint 4 ya esté logueando mensajes, porque de ahí sale el conteo |
| **6. Cierre** | Seguridad (cifrado revisado, HTTPS de punta a punta incluyendo el fix de Evolution API), QA general, ajuste de la tabla de planes con números reales (doc de requerimientos, punto 4.2) | Último filtro antes de dar de alta clientes reales en serio |

### Cierre de MVP pendiente (detectado en revisión post-Sprint, no es v2)

Al probar el MVP salieron dos huecos reales del alcance original, no mejoras nuevas:

1. **Sección Agentes sin implementar** — estaba en el alcance desde el punto 7 del doc de requerimientos (listado + detalle: info del negocio, canchas/precios, prompt, reglas, bot activo/pausado). Hay que completarla antes de considerar el MVP cerrado.
2. **Turnos solo muestra reservas, no gestiona horarios disponibles** — ver punto 8.0 del doc de requerimientos (agregado tras esta revisión). Se suma como parte de la misma sección Turnos, mismo patrón de integración con Airtable que ya existe para Reservas.

Ninguno de los dos requiere nuevas decisiones de arquitectura — ambos usan la capa de integración con Airtable ya definida (sección 4.1) y el modelo de datos ya existente (`Cancha`, `Agente`). Es trabajo de UI + endpoints faltantes, no diseño nuevo.

### Fuera del MVP (v2, no bloqueante)

- Notificaciones proactivas (aviso de límite de plan, turno nuevo)
- Cobro de excedente automático como alternativa al bloqueo duro
- Tabla propia de turnos en Postgres, si Airtable se queda corto en volumen
- 2FA para usuarios `VIBO_ADMIN`
- Rotación automática de tokens de integración
- Dark mode
- Monitoreo avanzado (Sentry u otro)

---

## 12. Cierre

Con esto quedan cerrados los dos documentos:

- **Vibo-Requerimientos-Plataforma-v1.md** — qué construye la plataforma y por qué (negocio, secciones, decisiones de producto)
- **Vibo-SDD-v1.md** — cómo se construye (arquitectura, modelo de datos, integraciones, seguridad, despliegue, plan de fases)

Ambos están listos para pasarle el contexto a Claude Code y arrancar el desarrollo siguiendo el orden del punto 11.
