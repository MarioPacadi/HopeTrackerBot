import { Client, GatewayIntentBits, Partials } from "discord.js";
import { env } from "./config.js";
import { handleMessage } from "./commands.js";
import { traitDisplayManager } from "./trait-display-manager.js";
import { handleSlashInteraction } from "./commands.js";
import { buildSlashCommands } from "./command-registry.js";
import { ensureDbConnected, ensureSchema } from "./db.js";
import { startHealthServer } from "./health.js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { imageSize } from "image-size";
import { PingService, makeDefaultPingConfigFromEnv } from "./ping.js";

/**
 * Discord client setup and lifecycle orchestration.
 */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember],
});

/**
 * Registers slash commands and sets avatar on client ready.
 */
/* Command registration happens within the``client.on("clientReady", ...)`` event. This uses a loop to iterate through guilds and calls``guild.commands.set(commandDefs)`` . This means that existing guild commands get completely replaced each bot startup. */
client.once("ready", async () => {
  console.log(`logged in as ${client.user?.tag}`);
  try {
    const filePath = resolve(__dirname, "./assets/Hope.png");
    const data = readFileSync(filePath);
    const dim = imageSize(data);
    if (!dim.width || !dim.height || dim.type !== "png") throw new Error("invalid image");
    if (dim.width !== 512 || dim.height !== 512) throw new Error("image must be 512x512");
    if (data.byteLength > 8 * 1024 * 1024) throw new Error("image too large");
    await client.user?.setAvatar(data);
  } catch {}
  const commandDefs = buildSlashCommands().map(c => c.toJSON());
  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.commands.set(commandDefs);
    } catch {
      console.log(`failed to set commands for guild ${guild.id}`);
    }
  }
});

client.on("error", err => {
  try { console.error("client error", err); } catch {}
});

process.on("unhandledRejection", err => {
  try { console.error("unhandled rejection", err); } catch {}
});

/**
 * Routes text commands to the shared command handler.
 */
client.on("messageCreate", async message => {
  try {
    await handleMessage(message);
  } catch (err) {
    try { console.error("message handler error", err); } catch {}
  }
});

/**
 * Delegates slash command interactions to the shared handler.
 */
client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashInteraction(interaction);
    }
  } catch (err) {
    try { console.error("slash command error", { command: interaction.isChatInputCommand() ? interaction.commandName : undefined, err }); } catch {}
  }
});

/**
 * Initializes health server, database connectivity, schema, cache, and logs in the client.
 */
async function start(): Promise<void> {
  if (!env.DISCORD_TOKEN || !env.DATABASE_URL) {
    throw new Error("missing env");
  }
  startHealthServer(Number(process.env.PORT ?? "8080"));
  const cfg = makeDefaultPingConfigFromEnv();
  if (cfg) {
    const service = new PingService(cfg);
    service.start();
  }
  let connected = false;
  for (let i = 0; i < 10; i++) {
    try {
      await ensureDbConnected();
      await ensureSchema();
      connected = true;
      break;
    } catch {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  if (!connected) {
    console.error("startup db initialization failed");
  }
  await traitDisplayManager.loadFromStorage();
  await client.login(env.DISCORD_TOKEN);
}

start().catch(err => {
  console.error("startup error", err);
});
