import type { PrismaClient } from "../generated/prisma/client";

// Repositories accept either a full PrismaClient or a Prisma.TransactionClient.
// Services own transactions and pass the tx client down; repositories never start
// their own transactions.
export type DbClient =
  | PrismaClient
  | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
