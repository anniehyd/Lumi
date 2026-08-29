import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
}

// Fail a stalled connect fast instead of hanging the caller, and don't let a
// checkout wait forever on a pool whose sockets the Fly proxy already dropped.
// Set here rather than in the DATABASE_URL secret so every environment picks
// them up without re-plumbing secrets.
function urlWithTimeouts(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "10");
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
    return url.toString();
  } catch {
    return raw; // not a parseable URL; let Prisma report it
  }
}

function createPrisma(): PrismaClient | null {
  // In demo mode (no generated client / no DATABASE_URL) construction can
  // throw; return null so callers' try/catch falls back to mock data instead
  // of the whole route module failing to import.
  try {
    const url = urlWithTimeouts();
    return new PrismaClient({ log: ["error"], ...(url ? { datasourceUrl: url } : {}) });
  } catch {
    return null;
  }
}

export const prisma = (globalThis.__prisma ?? createPrisma()) as PrismaClient;

if (process.env.NODE_ENV !== "production") globalThis.__prisma = prisma;
