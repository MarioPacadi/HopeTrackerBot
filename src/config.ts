import dotenv from "dotenv";

dotenv.config();

export interface Env {
  DISCORD_TOKEN: string;
  DATABASE_URL: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  COMMAND_PREFIX: string;
}

const DISCORD_TOKEN: string = process.env.DISCORD_TOKEN ?? "";
const DATABASE_URL: string = process.env.DATABASE_URL ?? "";
const DB_HOST: string = process.env.DB_HOST ?? "";
const DB_PORT: number = Number(process.env.DB_PORT ?? "5432");
const DB_USER: string = process.env.DB_USER ?? "";
const DB_PASSWORD: string = process.env.DB_PASSWORD ?? "";
const DB_NAME: string = process.env.DB_NAME ?? "";
const COMMAND_PREFIX: string = process.env.COMMAND_PREFIX ?? "!";

export const env: Env = { DISCORD_TOKEN, DATABASE_URL, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, COMMAND_PREFIX };