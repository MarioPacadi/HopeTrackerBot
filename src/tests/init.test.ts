import { ensureSchema, pool } from "../db.js";

async function run(): Promise<void> {
  await ensureSchema();
  const check = await pool.query("select count(*)::int as c from information_schema.tables where table_schema='public' and table_name = any($1)", [["guilds","users","traits","user_values","table_members","audit_logs","last_table_messages"]]);
  const count = (check.rows[0] as unknown as { c: number }).c;
  if (count !== 7) {
    throw new Error("schema verification failed");
  }
  process.exit(0);
}

run().catch(() => process.exit(1));
