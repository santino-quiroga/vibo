import { armarCsv } from "@/lib/admin/csv";
import { riesgosPorCliente } from "@/lib/admin/panel";
import { requerirViboAdmin } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fecha = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * GET /api/admin/clientes-csv — export de clientes (SDD v2 §8).
 *
 * Para uso contable: plan, precio, estado de pago y uso del ciclo. Un botón, sin
 * motor de reportes.
 *
 * **No incluye las notas internas** aunque estén en la misma tabla: un CSV que
 * se manda al contador no es lugar para "paga siempre tarde". El §8 pide plan,
 * estado de pago y uso — eso es lo que va.
 *
 * La ruta está bajo /api/admin, así que el proxy ya le exige sesión; igual se
 * revalida el rol acá, que es donde tiene que estar el control real.
 */
export async function GET() {
  await requerirViboAdmin();

  const [clientes, riesgos] = await Promise.all([
    prisma.cliente.findMany({
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        createdAt: true,
        archivadoAt: true,
        estadoPago: true,
        fechaProximoCobro: true,
        plan: { select: { nombre: true, precio: true } },
        _count: { select: { agentes: true } },
        usuarios: {
          where: { rol: "CLIENTE_OWNER" },
          select: { email: true, ultimoAccesoAt: true },
          take: 1,
        },
      },
    }),
    riesgosPorCliente(),
  ]);

  const encabezados = [
    "Cliente",
    "Email",
    "Plan",
    "Precio mensual",
    "Estado de pago",
    "Proximo cobro",
    "Sedes",
    "Conversaciones del ciclo",
    "Limite del ciclo",
    "Ultimo acceso",
    "Alta",
    "Archivado",
  ];

  const filas = clientes.map((c) => {
    const riesgo = riesgos.get(c.id);
    const owner = c.usuarios[0];
    return [
      c.nombre,
      owner?.email ?? "",
      c.plan.nombre,
      Number(c.plan.precio),
      c.estadoPago,
      c.fechaProximoCobro ? fecha.format(c.fechaProximoCobro) : "",
      c._count.agentes,
      riesgo?.usadas ?? 0,
      riesgo?.limite ?? 0,
      owner?.ultimoAccesoAt ? fecha.format(owner.ultimoAccesoAt) : "nunca",
      fecha.format(c.createdAt),
      c.archivadoAt ? "si" : "no",
    ];
  });

  const csv = armarCsv(encabezados, filas);
  const hoy = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vibo-clientes-${hoy}.csv"`,
      // Es un export puntual con datos que cambian: nunca cacheado.
      "Cache-Control": "no-store",
    },
  });
}
