import { PrismaClient } from '@prisma/client';

/**
 * PrismaClient singleton.
 *
 * Next.js dev mode hot-reloads modules, which would otherwise open a new pool
 * on every edit until SQLite refuses connections. Stash the instance on
 * globalThis so reloads reuse it. In production a plain module-level instance
 * is enough.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
