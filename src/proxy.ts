import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  RUTA_LOGIN,
  esRutaPublica,
  rolPuedeAcceder,
  rutaInicialPorRol,
} from "@/lib/rutas";

/**
 * Proxy (lo que hasta Next 15 se llamaba middleware).
 *
 * Hace dos cosas por request:
 *  1. Chequeo optimista de sesión y rol, para redirigir rápido. NO es la
 *     autorización real —esa vive en el DAL (src/lib/dal.ts)—, solo un atajo.
 *  2. Genera el nonce del Content-Security-Policy (sprint 6, endurecimiento).
 *
 * Sobre el CSP: se endurece `script-src` con un nonce por request y
 * `strict-dynamic`, que saca el `'unsafe-inline'` de scripts —el vector real de
 * XSS— en el panel más sensible del sistema (maneja credenciales de todos los
 * clientes, SDD 7.5). `style-src` conserva `'unsafe-inline'` a propósito: se
 * usan estilos inline de React (style={{...}}), que renderizan como atributo
 * `style=""`, y un atributo no se puede cubrir con nonce; además, inyectar CSS
 * es mucho menos peligroso que inyectar JS. Los demás headers estáticos siguen
 * en next.config.ts.
 */

function construirCSP(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    // 'strict-dynamic' hace que los browsers modernos confíen en lo que cargue
    // un script con nonce e ignoren 'self'/host para scripts. En dev se suma
    // 'unsafe-eval', que React necesita para reconstruir stacks de error.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Se mantiene 'unsafe-inline' en estilos: ver el comentario de arriba.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // ws: en dev para el hot reload; no todos los browsers lo cubren con 'self'.
    dev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Sube a HTTPS cualquier subrecurso pedido en claro.
    "upgrade-insecure-requests",
  ].join("; ");
}

export const proxy = auth((req) => {
  const { pathname, search } = req.nextUrl;
  const sesion = req.auth;
  const publica = esRutaPublica(pathname);
  const esApi = pathname.startsWith("/api");

  // Nonce nuevo por request: tiene que ser impredecible y único, si no no sirve.
  const nonce = crypto.randomUUID();
  const csp = construirCSP(nonce);

  // Deja pasar el request al render con el nonce disponible, y sella la
  // respuesta con el CSP. Next lee el nonce del header y se lo pone solo a sus
  // scripts (runtime de React, bundles, <Script>), sin que haya que tocarlos.
  const permitir = () => {
    const headers = new Headers(req.headers);
    headers.set("x-nonce", nonce);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  const conCSP = (res: NextResponse) => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  if (!sesion?.user) {
    if (publica) return permitir();

    // En una API un redirect a HTML no sirve: el llamador espera JSON.
    if (esApi) {
      return conCSP(NextResponse.json({ error: "No autenticado" }, { status: 401 }));
    }

    const url = new URL(RUTA_LOGIN, req.nextUrl.origin);
    url.searchParams.set("callbackUrl", `${pathname}${search}`);
    return conCSP(NextResponse.redirect(url));
  }

  const rol = sesion.user.rol;

  // Ya logueado: no tiene sentido dejarlo ver el login otra vez.
  if (publica) {
    return conCSP(
      NextResponse.redirect(new URL(rutaInicialPorRol(rol), req.nextUrl.origin)),
    );
  }

  if (!rolPuedeAcceder(rol, pathname)) {
    if (esApi) {
      return conCSP(NextResponse.json({ error: "Sin permiso" }, { status: 403 }));
    }
    return conCSP(
      NextResponse.redirect(new URL(rutaInicialPorRol(rol), req.nextUrl.origin)),
    );
  }

  return permitir();
});

export const config = {
  // Dos patrones y no uno, porque las APIs y las páginas necesitan reglas
  // distintas. Un solo patrón que excluya "lo que parece un archivo" por la
  // extensión también excluiría /api/admin/usuarios/juan@mail.com, que termina
  // en ".com" y es una ruta legítima que hay que proteger.
  matcher: [
    // Todas las APIs salvo tres, que no las llama un usuario logueado: las de
    // NextAuth (tienen que ser alcanzables sin sesión para poder loguearse), las
    // de integración de n8n (se autentican con el token por agente del SDD 6.2)
    // y el cron de Vercel (se autentica con CRON_SECRET, SDD 9.5).
    "/api/((?!auth|integracion|cron).*)",
    // Las páginas: acá sí se excluyen los assets de Next y los archivos
    // estáticos de /public, donde la extensión es una heurística válida.
    "/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.[\\w]+$).*)",
  ],
};
