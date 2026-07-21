# Auditoría técnica y de riesgo — Evolution API en producción

**Objetivo:** dejar por escrito la viabilidad real de operar sobre Evolution API con un
cliente pagando, el plan de contingencia ante un ban o una caída, y la arquitectura
mínima para sostener el piloto sin caerse.

**Responsable:** Santino (técnico).
**Fechas:** hardening en Semana 1 (mar 21 – dom 26 jul) y Semana 2 (lun 27 jul – dom 2 ago).
Este documento se revisa al cerrar cada cliente nuevo.

---

## 1. Estado real del sistema (auditado el 21/07/2026)

Lo que está **funcionando y verificado end-to-end en producción**:

- Plataforma Vibo desplegada en Vercel + Neon (`vibo-drab.vercel.app`), multi-tenant,
  con planes/límites, facturación MP (código completo), 75 tests.
- Un agente real (Padel AI) atendiendo WhatsApp real: Evolution → n8n → contexto de
  negocio desde Vibo (`/api/integracion/agentes/:id/contexto`) → reservas en Airtable.
- Reservas por cancha correctas: sin sobreventa, disponibilidad y creación coinciden,
  el LLM ya no elige cancha (la asigna un nodo Code determinístico). Verificado
  reservando de verdad, no mirando ejecuciones verdes.
- Fail-open con cache en n8n: si Vibo no responde, el bot usa el último contexto
  válido; si tampoco hay cache, un prompt de emergencia **prohíbe inventar precios**.

Conclusión de la auditoría: **el piloto técnico ya existe**. Padel AI es, en los
hechos, un piloto en producción con número propio. Lo que falta no es construir, es
endurecer y estandarizar.

## 2. Viabilidad de Evolution API: veredicto

**Viable para el piloto y la primera etapa comercial**, por el perfil de tráfico:

- El bot es **100% reactivo**: responde a personas que escriben primero para reservar.
  Los bans de WhatsApp sobre APIs no oficiales se concentran en el patrón opuesto
  (campañas salientes masivas, contactos que no te tienen agendado, número nuevo con
  volumen repentino, reportes de spam). Vibo **no ofrece campañas salientes** — y esa
  restricción es política de producto, no una limitación: nos mantiene en el perfil
  de riesgo bajo.
- Cada cliente tiene **su propia instancia y su propio número**: un ban no arrastra a
  otro cliente. El radio de daño es por sede.
- Riesgo residual que NO se puede eliminar: Meta puede suspender un número sin aviso
  ni apelación efectiva. No se promete SLA del canal WhatsApp a ningún cliente; se
  promete el plan de recuperación (sección 4).

**Cuándo se revisa este veredicto:** si un número se banea con tráfico puramente
reactivo, o al llegar a ~5 clientes activos, se re-evalúa migrar a Meta Cloud API
(oficial). Hoy migrarían en contra: verificación de negocio de Meta por cada cliente
y el número deja de funcionar en la app de WhatsApp del dueño.

## 3. Deudas que bloquean el primer cliente real (Semana 1–2)

Están anotadas en el proyecto porque Padel AI era cliente de prueba. Con un cliente
pagando dejan de ser tolerables:

| # | Deuda | Acción | Cuándo |
|---|-------|--------|--------|
| 1 | Token de integración de Vibo en texto plano en los 3 nodos de n8n (y expuesto en sesiones de trabajo) | Rotar el token y migrar los 3 nodos a credencial Header Auth — **un cambio a la vez, verificando del lado de Vibo** (la ejecución verde no prueba nada: los nodos van fail-open) | Semana 1 |
| 2 | API key de Evolution hardcodeada en el nodo HTTP Request, viajando por **HTTP sin TLS** | Poner Evolution detrás de TLS (Caddy o nginx + Let's Encrypt en el mismo VPS), rotar la key, pasarla a credencial de n8n | Semana 1 |
| 3 | `OPENAI_API_KEY` expuesta en transcript de sesión | Rotar | Semana 1 |
| 4 | `TOTAL_CANCHAS` hardcodeado en los subworkflows de reservas | Aplicar el Paso 5 ya documentado en `docs/arreglo-canchas-subworkflow.md` (canchas salen de `/contexto`, constantes quedan como red de fail-open) | Semana 2 |
| 5 | Sin alerting: los nodos fail-open tapan errores y nadie se entera de una caída | Monitor de uptime externo (UptimeRobot o similar, gratis) sobre: la URL de Evolution, el webhook de n8n y `/api/integracion/.../contexto`. Alerta por mail/Telegram | Semana 1 |
| 6 | `ENCRYPTION_KEY` de producción existe en un solo lugar recuperable (`.env.produccion.local`) | Copiarla al gestor de contraseñas del equipo (los dos socios). Si se pierde, ninguna credencial de agente se vuelve a descifrar | Semana 1 (30 min) |

## 4. Plan de contingencia ante ban o caída

### 4.1 Ban del número de un cliente

Preparación (antes de que pase):
- **Número de respaldo pre-calentado por cliente activo**: chip prepago, WhatsApp
  dado de alta, 1–2 semanas de uso liviano (mensajes con conocidos, foto de perfil,
  nombre del complejo). Costo: un chip + 15 min/semana.
- El QR de la instancia y las credenciales viven en Vibo cifradas; reponer instancia
  no toca el código.

Runbook de reposición (objetivo: **bot operativo de nuevo en < 4 horas hábiles**):
1. Crear instancia nueva en Evolution con el número de respaldo, escanear QR.
2. Actualizar la credencial Evolution del agente en Vibo (admin → editar agente; los
   secretos vacíos conservan los actuales, así que se cargan solo los que cambian).
3. Verificar con un mensaje real de ida y vuelta (no con "PENDING" de Evolution, que
   acepta JIDs inexistentes).
4. Avisar al cliente con el mensaje pre-redactado: qué pasó, número nuevo, pedirle
   que lo comunique en el mostrador/Instagram.
5. Comprar y empezar a calentar el próximo chip de respaldo.

Compromiso contractual con el cliente (va en el acuerdo del piloto): "WhatsApp puede
suspender números que operan con automatización; si pasa, reponemos el servicio en
otro número en menos de 1 día hábil. Por esto no garantizamos continuidad del número,
sí del servicio."

### 4.2 Caída del VPS (Evolution + n8n)

Hoy es el **punto único de falla**: si el VPS de USD 25 se cae, se caen todos los
bots. Para 1–3 clientes es aceptable con detección temprana (monitor de la deuda #5).
Mitigación mínima adicional:
- Export semanal de los workflows de n8n a `docs/` del repo (ya se versionan los JSON;
  convertirlo en rutina). La API de n8n descarta credenciales al reescribir, así que
  el backup sirve para reconstruir a mano, no para restore automático.
- Snapshot del VPS habilitado en Hostinger.
- La base de reservas es Airtable del cliente y la base de negocio es Neon (con PITR):
  **una caída del VPS no pierde datos**, pierde disponibilidad del bot.

Escalar a VPS redundante o gestionado recién con >5 clientes (va al roadmap, no al
piloto).

### 4.3 Caída de Vibo (Vercel/Neon)

Ya mitigada por diseño: el fail-open con cache de n8n mantiene al bot respondiendo
con el último contexto válido. Riesgo residual: precios desactualizados durante la
caída. Aceptable.

## 5. Arquitectura mínima para el piloto (resumen)

```
WhatsApp cliente final
   │ (número dedicado o del complejo, a elección del dueño)
Evolution API  ──[TLS, key rotada]──  VPS Hostinger (+ snapshot + monitor)
   │ webhook
n8n (workflow por cliente + 2 subworkflows de reservas)
   │ credenciales Header Auth, fail-open con cache
Vibo (Vercel + Neon)  ── contexto, logs, límites, facturación
   │
Airtable del cliente  ── reservas (fuente de verdad operativa)
```

Reglas que sostienen esto y no hay que romper:
- **Un campo vacío en Vibo nunca genera texto** en el prompt (un vacío que se afirma
  es una mentira al cliente final — ya pasó dos veces).
- Verificar siempre del lado de Vibo/Airtable, nunca por la ejecución verde de n8n.
- No actualizar workflows por API/SDK de n8n (descarta credenciales): los cambios se
  entregan como JSON para pegar y se aplican a mano con checklist.
