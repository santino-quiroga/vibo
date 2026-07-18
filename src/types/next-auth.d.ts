import type { DefaultSession } from "next-auth";

import type { RolUsuario } from "@/generated/prisma/enums";

// El rol y el clienteId viajan en el JWT de sesión: son la base de las dos
// reglas del SDD (roles, sección 6.1; filtrado por clienteId, sección 6.3).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      rol: RolUsuario;
      clienteId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    rol: RolUsuario;
    clienteId: string | null;
  }
}

// Se augmenta "@auth/core/jwt" y no "next-auth/jwt": este último solo re-exporta
// (`export * from "@auth/core/jwt"`), así que augmentarlo no toca la interfaz JWT
// real y token.rol seguiría siendo `unknown`.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    rol: RolUsuario;
    clienteId: string | null;
  }
}
