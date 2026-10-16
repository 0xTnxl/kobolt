import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const g = globalThis as unknown as { _sql?: ReturnType<typeof postgres> };
export const sql = g._sql ?? postgres(process.env.DATABASE_URL ?? "postgres://invalid", { max: 5 });
if (process.env.NODE_ENV !== "production") g._sql = sql;

export const db = drizzle(sql, { schema });
export { schema };
