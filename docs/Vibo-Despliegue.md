# Despliegue a producción — runbook

Estado al 2026-07-18: el código está listo (build de producción verde, migraciones
en el build, `prisma.config.ts` ya separa pooler de conexión directa). Lo que falta
son servicios y credenciales, que dependen de cuentas.

Los secretos frescos ya están generados en **`.env.produccion.local`** (ignorado por
git). Borralo cuando termines de cargarlos en Vercel.

---

## 0. Antes de empezar: commitear

Vercel despliega desde un repo git. Hoy **todo el proyecto está sin commitear**
sobre el commit inicial. Hay que commitear y pushear a GitHub antes de nada.

Verificá que `.env` y `.env.produccion.local` **no** entren (los cubre `.gitignore`
con `.env*`, pero conviene mirar el `git status` antes del push).

---

## 1. Base de datos

Neon (o Vercel Postgres, que es Neon por debajo). Se necesitan **dos** URLs:

| Variable | Cuál | Para qué |
|---|---|---|
| `DATABASE_URL` | la **pooled** (`...-pooler...`) | la app en runtime |
| `DIRECT_URL` | la **directa** | `prisma migrate deploy` en el build |

No se pueden intercambiar: migrar a través del pooler falla porque Prisma toma un
advisory lock que PgBouncer en modo transaction no sostiene.

---

## 2. Variables de entorno en Vercel

Scope **Production** (y Preview si vas a usarlo, con valores distintos).

| Variable | De dónde sale |
|---|---|
| `DATABASE_URL` | Neon, pooled |
| `DIRECT_URL` | Neon, directa |
| `AUTH_SECRET` | `.env.produccion.local` |
| `ENCRYPTION_KEY` | `.env.produccion.local` — **además al gestor de contraseñas del equipo** |
| `CRON_SECRET` | `.env.produccion.local` |
| `AUTH_URL` | `https://<tu-dominio>` — sin esto no se pueden armar links de recuperación |
| `RESEND_API_KEY` | Resend |
| `EMAIL_FROM` | remitente verificado en Resend |

**`ENCRYPTION_KEY` es la que no se puede perder.** Si se pierde, ninguna credencial
de agente se puede volver a descifrar y hay que recargarlas todas a mano (SDD §7.1).
Rotarla implica re-cifrar todas las filas.

`CRON_SECRET` no es opcional: sin él, `/api/cron/ciclo` **rechaza todo en producción**
(falla cerrado a propósito). Vercel manda `Authorization: Bearer <CRON_SECRET>`
automáticamente en los crons cuando la variable está seteada. El schedule ya está
en `vercel.json` (04:15 UTC diario).

---

## 3. Deploy y arranque en frío

1. Importar el repo en Vercel. El build command sale de `package.json`
   (`prisma migrate deploy && next build`) — no hace falta configurarlo.
2. Deploy. Las migraciones corren solas.
3. Sembrar planes y crear el primer admin, **apuntando a la base de producción**
   (con `DATABASE_URL` de prod en el entorno local, o desde la consola de Neon):

   ```bash
   npm run db:seed
   npm run crear-admin -- <email> '<password-larga>'
   ```

   No hay registro público: sin este paso no hay forma de entrar.

---

## 4. Recargar el agente en producción

La base de prod arranca vacía: los datos de dev **no** se migran (y no deberían —
las credenciales están cifradas con otra `ENCRYPTION_KEY`).

Desde el admin de producción, repetir el alta: cliente → agente → canchas.
Esta vez, a diferencia de dev:

- **Airtable:** base `appP5qWjfuoz1lj0g` y el PAT real (los mismos de dev).
- **Evolution:** ahora sí la instancia **real** del cliente, no el simulador.
  Antes de cargarla, ver el punto 6.
- Cargar las **2 canchas** con sus precios ($48.000 cada una), si no
  "Ingresos estimados" da 0.

Anotar el `agenteId` nuevo: **no es el mismo que en dev** y hay que ponerlo en los
nodos de n8n.

---

## 5. Cablear el workflow en vivo

Recién acá. Los 5 nodos están en `docs/n8n-nodos-vibo.json`; el procedimiento
completo (dónde va cada uno, las 4 conexiones, el campo *Text* del `AI Agent1`)
está en `Vibo-Integracion-n8n.md`.

Al pegarlos en el workflow `PadelAI` en vivo hay que cambiar, en los 3 nodos HTTP:

- el dominio del túnel por **`https://<tu-dominio>`**
- el `agenteId` por el **nuevo de producción**

Y crear la credencial Header Auth con el token del agente de producción.

**Verificar del lado de Vibo, no de n8n:** que la conversación aparezca en el panel
y que el contador del plan suba. La sección de troubleshooting de
`Vibo-Integracion-n8n.md` explica por qué una ejecución en verde no prueba nada.

---

## 6. Pendientes de seguridad (bloquean producción)

1. **Rotar la API key de Evolution.** Está hardcodeada en texto plano en el nodo
   `HTTP Request` del workflow (y en cada duplicado), y quedó expuesta al leer el
   workflow por MCP el 2026-07-18. Rotarla y cargarla como **credencial de n8n**,
   no como valor en el nodo.
2. **Evolution detrás de TLS.** Hoy es `http://187.127.6.174:8080`: la API key y el
   texto de cada mensaje viajan sin cifrar por internet.

## 7. Residuales (no bloquean)

- El rate limiting es in-memory por instancia: con varias instancias serverless el
  tope real es más alto que el configurado. Un tope duro necesitaría Redis.
- Sentry y 2FA de admin: el SDD ya los marca como v2.
