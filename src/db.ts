import { Pool } from "pg";
import { env } from "./config";

function buildConnectionString(): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.DB_HOST && env.DB_USER && env.DB_NAME) {
    const auth = env.DB_PASSWORD ? `${env.DB_USER}:${env.DB_PASSWORD}` : env.DB_USER;
    return `postgresql://${auth}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;
  }
  throw new Error("missing database configuration");
}

export const pool: Pool = new Pool({ connectionString: buildConnectionString() });

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