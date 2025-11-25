import { Pool } from "pg";
import { env } from "./config.js";

export const pool: Pool = new Pool({ connectionString: env.DATABASE_URL, ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined });

export async function query<T>(text: string, params: ReadonlyArray<unknown>): Promise<{ rows: T[] }> {
  try {
    const res = await pool.query(text, params as unknown[]);
    return { rows: res.rows as T[] };
  } catch (err) {
    console.error("db query error", { text, err });
    throw err;
  }
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
  try {
    const existsRes = await pool.query("select exists(select 1 from information_schema.tables where table_schema='public' and table_name=$1) as exists", ["guilds"]);
    const exists = (existsRes.rows[0] as unknown as { exists: boolean }).exists;
    if (exists) return;
    const { readFileSync } = await import("fs");
    const { resolve, dirname } = await import("path");
    const { fileURLToPath } = await import("url");
    const file = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations/0001_init.sql");
    const sql = readFileSync(file, "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("commit");
      console.log("schema initialized");
    } catch (err) {
      try { await client.query("rollback"); } catch {}
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("schema initialization error", err);
    throw err;
  }
}
