/**
 * PrismaClient singleton. Cached on globalThis so Next.js hot reloads don't open a new SQLite
 * connection on every change. DATABASE_URL is read by Prisma from the environment, so tests can
 * point at a separate database.
 */
import { type Prisma, PrismaClient } from "@prisma/client";

export { HOUSEHOLD_ID } from "./defaults";

const globalForPrisma = globalThis as unknown as { __tradedeskPrisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.__tradedeskPrisma ?? new PrismaClient();

globalForPrisma.__tradedeskPrisma = db;

/** The singleton or an interactive-transaction client; repositories accept either. */
export type DbClient = Prisma.TransactionClient;
