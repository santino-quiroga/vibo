# Vibo

Plataforma digital Agencia Vibo — panel para que los dueños de complejos deportivos
supervisen sus agentes de IA de ventas por WhatsApp.

Documentación de referencia (leer antes de tocar código):

- [`docs/Vibo-Requerimientos-Plataforma-v1.md`](docs/Vibo-Requerimientos-Plataforma-v1.md) — qué se construye y por qué
- [`docs/Vibo-SDD-v1.md`](docs/Vibo-SDD-v1.md) — cómo se construye

## Stack

Next.js 16 (App Router, TypeScript) · PostgreSQL con Prisma 7 · Tailwind v4 + shadcn/ui ·
NextAuth v5 (Credentials, sin registro público) · Vercel + Neon.

## Arranque local

```bash
npm install
cp .env.example .env      # completar los valores
```

Necesitás un Postgres. La forma más rápida es el que trae Prisma:

```bash
npx prisma dev -n vibo -d          # levanta Postgres local en segundo plano
# copiá la DATABASE_URL que imprime al .env
```

Después:

```bash
npm run db:migrate        # aplica las migraciones
npm run db:seed           # carga los planes en borrador
npm run crear-admin -- admin@vibo.ar 'una-password-larga'
npm run dev
```

No hay registro público (requerimientos, punto 4.1): el primer usuario se crea con
`crear-admin`, y de ahí en adelante las cuentas las da de alta el admin interno.

### Recuperación de contraseña en desarrollo

Sin `RESEND_API_KEY`, el link de recuperación no se envía por mail: se imprime en la
consola del servidor. Alcanza para probar el flujo entero sin dar de alta Resend.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | `prisma migrate deploy` + build de producción |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Crea/aplica migraciones (desarrollo) |
| `npm run db:studio` | Prisma Studio |
| `npm run db:seed` | Carga los planes en borrador |
| `npm run crear-admin` | Crea un usuario `VIBO_ADMIN` |

## Estructura

```
src/
  auth.ts              Configuración de NextAuth (Credentials + JWT)
  proxy.ts             Chequeo optimista de sesión/rol por request
  lib/
    dal.ts             Autorización real: verificarSesion / requerirClienteOwner / requerirViboAdmin
    prisma.ts          Cliente de Prisma (singleton)
    rutas.ts           Rutas por superficie y reglas de acceso por rol
    password.ts        Hashing y verificación
    tokens.ts          Tokens de recuperación (un solo uso)
    email.ts           Envío vía Resend
  app/
    (auth)/            Login, recuperar y restablecer contraseña
    dashboard/         Panel cliente  (sprints 3-4)
    admin/             Panel admin interno (sprint 2)
prisma/schema.prisma   Modelo de datos (SDD sección 3)
```

### Dos capas de protección, a propósito

`src/proxy.ts` solo lee la cookie y redirige rápido — la documentación de Next es
explícita en que no alcanza como autorización. La defensa real es `src/lib/dal.ts`,
que corre lo más cerca posible de la base. Toda página o consulta del panel cliente
tiene que arrancar por `requerirClienteOwner()`, que devuelve el `clienteId` con el
que hay que filtrar (SDD, sección 6.3).

## Estado

Sprint 1 (Fundaciones) terminado. El plan de fases está en la sección 11 del SDD.
