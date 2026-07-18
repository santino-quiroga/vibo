import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { verificarPassword, verificarPasswordDummy } from "@/lib/password";
import { RUTA_LOGIN } from "@/lib/rutas";

const credencialesSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Sin registro público: las cuentas las crea Vibo desde el admin interno
  // (requerimientos punto 4.1). Por eso Credentials es el único provider.
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credencialesSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const usuario = await prisma.usuario.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (!usuario) {
          // Igualamos el tiempo de respuesta del caso "email inexistente"
          // con el del caso "password incorrecta".
          await verificarPasswordDummy(password);
          return null;
        }

        const passwordOk = await verificarPassword(password, usuario.passwordHash);
        if (!passwordOk) return null;

        return {
          id: usuario.id,
          email: usuario.email,
          rol: usuario.rol,
          clienteId: usuario.clienteId,
        };
      },
    }),
  ],

  // JWT en cookie httpOnly, no sesión en base (SDD sección 6.1).
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },

  // Explícito y no por default, porque el SDD (sección 7.2) lo exige.
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },

  pages: { signIn: RUTA_LOGIN },

  callbacks: {
    async jwt({ token, user }) {
      // `user` solo viene en el login; en los requests siguientes el token ya
      // trae estos campos y no hay que volver a la base para resolverlos.
      if (user?.id) {
        token.id = user.id;
        token.rol = user.rol;
        token.clienteId = user.clienteId;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.rol = token.rol;
      session.user.clienteId = token.clienteId;
      return session;
    },
  },

  trustHost: true,
});
