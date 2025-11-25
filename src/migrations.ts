import { pool } from "./db.js";
import { readFileSync } from "fs";
import { resolve } from "path";

async function run(): Promise<void> {
  const file = resolve(__dirname, "../migrations/0001_init.sql");
  const sql = readFileSync(file, "utf8");
  await pool.query(sql);
  process.exit(0);
}

run().catch(() => process.exit(1));
