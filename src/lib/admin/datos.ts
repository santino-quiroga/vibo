import "server-only";

import { cache } from "react";

import { leerCupoAgentes } from "@/lib/admin/limite-agentes";
import { prisma } from "@/lib/prisma";

/**
 * Lecturas del panel admin interno.
 *
 * A diferencia del panel cliente, acá NO se filtra por clienteId: el equipo de
 * Vibo ve a todos los clientes. Lo que protege esto es el rol — todas las
 * páginas que usan estas funciones pasan antes por requerirViboAdmin().
 *
 * Ninguna de estas funciones devuelve credenciales descifradas. El campo cifrado
 * se descifra solo en el momento de usarlo contra Airtable/Evolution API
 * (sprints 3 y 4), nunca para mostrarlo.
 */

export const listarClientes = cache(async () => {
  return prisma.cliente.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      nombre: true,
      createdAt: true,
      plan: { select: { id: true, nombre: true, maxAgentes: true } },
      _count: { select: { agentes: true, usuarios: true } },
    },
  });
});

export const obtenerCliente = cache(async (id: string) => {
  return prisma.cliente.findUnique({
    where: { id },
    select: {
      id: true,
      nombre: true,
      createdAt: true,
      plan: {
        select: {
          id: true,
          nombre: true,
          maxAgentes: true,
          maxConversacionesMes: true,
        },
      },
      usuarios: {
        select: { id: true, email: true, rol: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      agentes: {
        select: {
          id: true,
          nombre: true,
          deporte: true,
          estado: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
});

/**
 * Qué agentes de un cliente todavía no tienen token de integración.
 *
 * Devuelve un Set de ids y no los tokens: la UI solo necesita saber si falta,
 * y mover el ciphertext de cada agente hasta acá para evaluar un booleano sería
 * pasear secretos sin motivo.
 */
export const agentesSinToken = cache(async (clienteId: string) => {
  const filas = await prisma.agente.findMany({
    where: { clienteId, tokenIntegracionEnc: null },
    select: { id: true },
  });
  return new Set(filas.map((f) => f.id));
});

export const obtenerAgente = cache(async (id: string) => {
  return prisma.agente.findUnique({
    where: { id },
    select: {
      id: true,
      nombre: true,
      deporte: true,
      estado: true,
      promptBase: true,
      airtableBaseId: true,
      evolutionInstanceId: true,
      n8nWorkflowId: true,
      createdAt: true,
      // Los *Enc se traen para poder mostrarlos enmascarados (SDD 7.1): el
      // descifrado ocurre server-side y al browser solo llegan 4 caracteres.
      airtableApiKeyEnc: true,
      evolutionApiUrlEnc: true,
      evolutionApiKeyEnc: true,
      tokenIntegracionEnc: true,
      cliente: { select: { id: true, nombre: true } },
      canchas: {
        select: {
          numero: true,
          precio: true,
          duracionTurnoMin: true,
          horarioApertura: true,
          horarioCierre: true,
        },
        orderBy: { numero: "asc" },
      },
    },
  });
});

export const listarPlanes = cache(async () => {
  return prisma.plan.findMany({
    orderBy: { maxAgentes: "asc" },
    select: {
      id: true,
      nombre: true,
      maxAgentes: true,
      maxConversacionesMes: true,
    },
  });
});

/**
 * Cuántos agentes tiene el cliente y cuántos le permite su plan.
 *
 * Usa la misma función que la transacción del alta, para que la UI no pueda
 * decir una cosa y el backend hacer otra.
 */
export const estadoLimiteAgentes = cache(async (clienteId: string) => {
  return leerCupoAgentes(prisma, clienteId);
});
