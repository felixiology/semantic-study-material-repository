import { Pool } from "pg";

// One shared connection pool (reused across hot reloads in dev).
// The connection string comes from .env.local, never hard-coded.
const g = globalThis as unknown as { pgPool?: Pool };

export const pool: Pool =
  g.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

if (process.env.NODE_ENV !== "production") g.pgPool = pool;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function query<T = any>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
