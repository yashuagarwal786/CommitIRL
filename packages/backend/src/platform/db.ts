import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function pingDatabase(): Promise<boolean> {
  await prisma.$queryRaw`SELECT 1`;
  return true;
}
