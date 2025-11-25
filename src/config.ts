import dotenv from "dotenv";

dotenv.config();

export interface Env {
  DISCORD_TOKEN: string;
  DATABASE_URL: string;
  COMMAND_PREFIX: string;
}

const DISCORD_TOKEN: string = process.env.DISCORD_TOKEN ?? "";
const DATABASE_URL: string = process.env.DATABASE_URL ?? "";
const COMMAND_PREFIX: string = process.env.COMMAND_PREFIX ?? "!";

export const env: Env = { DISCORD_TOKEN, DATABASE_URL, COMMAND_PREFIX };
