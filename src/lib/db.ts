import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
}

function createPrisma(): PrismaClient | null {
  // In demo mode (no generated client / no DATABASE_URL) construction can
  // throw; return null so callers' try/catch falls back to mock data instead
  // of the whole route module failing to import.
  try {
    return new PrismaClient({ log: ["error"] });
  } catch {
    return null;
  }
}

export const prisma = (globalThis.__prisma ?? createPrisma()) as PrismaClient;

if (process.env.NODE_ENV !== "production") globalThis.__prisma = prisma;
