import { Client, GatewayIntentBits } from "discord.js";
import { env } from "./config";
import { handleMessage } from "./commands";
import { ensureDbConnected } from "./db";
import { startHealthServer } from "./health";
import { readFileSync } from "fs";
import { resolve } from "path";
import { imageSize } from "image-size";

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.on("ready", async () => {
  try {
    const filePath = resolve(__dirname, "./assets/Hope.png");
    const data = readFileSync(filePath);
    const dim = imageSize(data);
    if (!dim.width || !dim.height || dim.type !== "png") throw new Error("invalid image");
    if (dim.width !== 512 || dim.height !== 512) throw new Error("image must be 512x512");
    if (data.byteLength > 8 * 1024 * 1024) throw new Error("image too large");
    await client.user?.setAvatar(data);
  } catch {}
});

client.on("messageCreate", async message => {
  try {
    await handleMessage(message);
  } catch {
  }
});

async function start(): Promise<void> {
  if (!env.DISCORD_TOKEN || !env.DATABASE_URL) {
    throw new Error("missing env");
  }
  await ensureDbConnected();
  startHealthServer(Number(process.env.PORT ?? "8080"));
  await client.login(env.DISCORD_TOKEN);
}

start().catch(() => process.exit(1));
