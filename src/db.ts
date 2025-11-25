import { Pool } from "pg";
import { env } from "./config.js";

export const pool: Pool = new Pool({ connectionString: env.DATABASE_URL });

export async function query<T>(text: string, params: ReadonlyArray<unknown>): Promise<{ rows: T[] }> {
  const q = pool.query as unknown as (queryText: string, values: unknown[]) => Promise<{ rows: unknown[] }>;
  const res = await q(text, params as unknown[]);
  return { rows: res.rows as T[] };
}

export async function ensureDbConnected(retries: number = 5, delayMs: number = 1000): Promise<void> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const client = await pool.connect();
      client.release();
      return;
    } catch {
      await new Promise(r => setTimeout(r, delayMs));
      attempt++;
    }
  }
  throw new Error("database connection failed");
}

export async function ensureSchema(): Promise<void> {
  const existsRes = await pool.query("select exists(select 1 from information_schema.tables where table_schema='public' and table_name=$1) as exists", ["guilds"]);
  const exists = (existsRes.rows[0] as unknown as { exists: boolean }).exists;
  if (exists) return;
  const { readFileSync } = await import("fs");
  const { resolve } = await import("path");
  const file = resolve(__dirname, "../migrations/0001_init.sql");
  const sql = readFileSync(file, "utf8");
  await pool.query(sql);
}
