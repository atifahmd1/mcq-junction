import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  // DATABASE_URL is the Supabase transaction pooler (port 6543).
  // `pgbouncer=true` plus unnamed prepared statements avoids
  // prepared-statement errors on shared pooled connections.
  const adapter = new PrismaPg({
    connectionString,
    allowExitOnIdle: true,
  });

  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
