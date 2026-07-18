import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { RUTA_LOGIN, rutaInicialPorRol } from "@/lib/rutas";

// La raíz no tiene contenido propio: no hay landing pública, solo login
// (requerimientos punto 4.1, sin registro público).
export default async function Home() {
  const sesion = await auth();

  if (!sesion?.user) redirect(RUTA_LOGIN);
  redirect(rutaInicialPorRol(sesion.user.rol));
}
