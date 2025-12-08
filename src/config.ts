import dotenv from "dotenv";

dotenv.config();

export interface Env {
  DISCORD_TOKEN: string;
  DATABASE_URL: string;
  COMMAND_PREFIX: string;
  DB_SSL: boolean;
  DB_SSL_CA_FILE?: string;
}

const DISCORD_TOKEN: string = process.env.DISCORD_TOKEN ?? "";
const DATABASE_URL: string = process.env.DATABASE_URL ?? "";
const COMMAND_PREFIX: string = process.env.COMMAND_PREFIX ?? "!";
let isLocal = false;
try {
  const u = new URL(DATABASE_URL);
  isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
} catch {}
const DB_SSL: boolean = ((process.env.DB_SSL ?? (isLocal ? "false" : "true")) === "true");
const DB_SSL_CA_FILE: string | undefined = process.env.DB_SSL_CA_FILE ?? undefined;

export const env: Env = { DISCORD_TOKEN, DATABASE_URL, COMMAND_PREFIX, DB_SSL, DB_SSL_CA_FILE };
