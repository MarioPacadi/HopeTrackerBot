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
    const existsGuildsRes = await pool.query("select exists(select 1 from information_schema.tables where table_schema='public' and table_name=$1) as exists", ["guilds"]);
    const existsAuditRes = await pool.query("select exists(select 1 from information_schema.tables where table_schema='public' and table_name=$1) as exists", ["audit_logs"]);
    const existsLastTableRes = await pool.query("select exists(select 1 from information_schema.tables where table_schema='public' and table_name=$1) as exists", ["last_table_messages"]);
    const existsUserEmoji1 = await pool.query("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name=$1) as exists", ["emoji1"]);
    const existsUserEmoji2 = await pool.query("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name=$1) as exists", ["emoji2"]);
    const guildsExist = (existsGuildsRes.rows[0] as unknown as { exists: boolean }).exists;
    const auditExist = (existsAuditRes.rows[0] as unknown as { exists: boolean }).exists;
    const lastTableExist = (existsLastTableRes.rows[0] as unknown as { exists: boolean }).exists;
    const userEmoji1Exist = (existsUserEmoji1.rows[0] as unknown as { exists: boolean }).exists;
    const userEmoji2Exist = (existsUserEmoji2.rows[0] as unknown as { exists: boolean }).exists;
    if (guildsExist && auditExist && lastTableExist && userEmoji1Exist && userEmoji2Exist) return;
    const { readFileSync } = await import("fs");
    const { resolve, dirname } = await import("path");
    const { fileURLToPath } = await import("url");
    const file = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations/0001_init.sql");
    const sql = readFileSync(file, "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      if (!guildsExist) {
        await client.query(sql);
      }
      if (!auditExist) {
        const file2 = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations/0002_audit.sql");
        const sql2 = readFileSync(file2, "utf8");
        await client.query(sql2);
      }
      if (!lastTableExist) {
        const file3 = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations/0003_last_table_messages.sql");
        const sql3 = readFileSync(file3, "utf8");
        await client.query(sql3);
      }
      if (!userEmoji1Exist || !userEmoji2Exist) {
        const file4 = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations/0004_user_emojis.sql");
        const sql4 = readFileSync(file4, "utf8");
        await client.query(sql4);
      }
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
