import { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { env } from "./config.js";
import { handleMessage } from "./commands.js";
import { traitDisplayManager, formatValues } from "./trait-display-manager.js";
import { ensureDbConnected, ensureSchema } from "./db.js";
import { startHealthServer } from "./health.js";
import { getContainer } from "./di.js";
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
  const commandDefs = [
    new SlashCommandBuilder().setName("register").setDescription("Register yourself"),
    new SlashCommandBuilder().setName("unregister").setDescription("Unregister yourself"),
    new SlashCommandBuilder().setName("values").setDescription("Show your values"),
    new SlashCommandBuilder().setName("showvalues").setDescription("Show table users and values"),
    new SlashCommandBuilder()
      .setName("addusertable").setDescription("Add user to table")
      .addUserOption(o => o.setName("user").setDescription("User to add").setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
      .setName("removeusertable").setDescription("Remove user from table")
      .addUserOption(o => o.setName("user").setDescription("User to remove").setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
      .setName("createtype").setDescription("Create a trait type")
      .addStringOption(o => o.setName("name").setDescription("Trait name").setRequired(true))
      .addStringOption(o => o.setName("emoji").setDescription("Emoji").setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
      .setName("deletetype").setDescription("Delete a trait type")
      .addStringOption(o => o.setName("name").setDescription("Trait name").setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
      .setName("gain").setDescription("Increase a trait")
      .addStringOption(o => o.setName("trait").setDescription("Trait name").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(false)),
    new SlashCommandBuilder()
      .setName("spend").setDescription("Decrease a trait")
      .addStringOption(o => o.setName("trait").setDescription("Trait name").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(false)),
    new SlashCommandBuilder()
      .setName("mark").setDescription("Decrease a trait")
      .addStringOption(o => o.setName("trait").setDescription("Trait name").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(false)),
    new SlashCommandBuilder()
      .setName("clear").setDescription("Increase a trait")
      .addStringOption(o => o.setName("trait").setDescription("Trait name").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(false))
  ].map(c => c.toJSON());
  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.commands.set(commandDefs);
    } catch {
      console.log(`failed to set commands for guild ${guild.id}`);
    }
  }
});

client.on("messageCreate", async message => {
  try {
    await handleMessage(message);
  } catch (err) {
    try { console.error("message handler error", err); } catch {}
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { defaults, userService, traitService, tableService } = getContainer();
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  if (!guildId) return;
  try {
    await defaults.ensureDefaults(guildId);
    const name = interaction.commandName;
    const amount = interaction.options.getInteger("amount") ?? 1;
    const traitName = interaction.options.getString("trait") ?? "";
    if (name === "register") {
      await defaults.ensureDefaults(guildId);
      await userService.register(userId, guildId);
      const vals = await userService.read(userId, guildId);
      const member = await interaction.guild!.members.fetch(userId).catch(() => null);
      const label = member?.displayName ?? interaction.user.username;
      const text = formatValues(label, vals);
      await interaction.reply({ content: text });
      const replyMsg = await interaction.fetchReply();
      traitDisplayManager.registerUserMessage(guildId, userId, replyMsg.channel.id, replyMsg.id);
      return;
    }
    if (name === "unregister") {
      const ok = await userService.unregister(userId, guildId);
      await interaction.reply(ok ? "unregistered" : "not registered");
      return;
    }
    if (name === "values") {
      const vals = await userService.read(userId, guildId);
      const member = await interaction.guild!.members.fetch(userId).catch(() => null);
      const label = member?.displayName ?? interaction.user.username;
      const text = formatValues(label, vals);
      await interaction.reply({ content: text });
      const replyMsg = await interaction.fetchReply();
      traitDisplayManager.registerUserMessage(guildId, userId, replyMsg.channel.id, replyMsg.id);
      return;
    }
    if (name === "showvalues") {
      const rows = await tableService.table(guildId);
      if (rows.length === 0) {
        await interaction.reply("no users in table");
        return;
      }
      const lines = rows.map(r => `<@${r.discordUserId}> | ${r.values.map(v => `${v.emoji} ${v.name}: ${v.amount}`).join(" | ")}`);
      await interaction.reply({ content: lines.join("\n") });
      const replyMsg = await interaction.fetchReply();
      traitDisplayManager.registerTableMessage(guildId, replyMsg.channel.id, replyMsg.id);
      return;
    }
    if (name === "addusertable") {
      const target = interaction.options.getUser("user", true);
      await tableService.add(target.id, guildId);
      await interaction.reply("added");
      return;
    }
    if (name === "removeusertable") {
      const target = interaction.options.getUser("user", true);
      await tableService.remove(target.id, guildId);
      await interaction.reply("removed");
      return;
    }
    if (name === "createtype") {
      const n = interaction.options.getString("name", true);
      const e = interaction.options.getString("emoji", true);
      await traitService.create(guildId, n, e);
      await interaction.reply("created");
      return;
    }
    if (name === "deletetype") {
      const n = interaction.options.getString("name", true);
      const ok = await traitService.delete(guildId, n);
      await interaction.reply(ok ? "deleted" : "not found");
      return;
    }
    if (name === "gain" || name === "clear") {
      if (!traitName) { await interaction.reply("usage: /gain trait amount"); return; }
      const res = await userService.modify(userId, guildId, amount, traitName);
      if (!res) { await interaction.reply("trait not found"); return; }
      const member = await interaction.guild!.members.fetch(userId).catch(() => null);
      const label = member?.displayName ?? interaction.user.username;
      await interaction.reply(`${label} | ${res.emoji} ${res.name}: ${res.amount}`);
      await traitDisplayManager.triggerUpdate(interaction.client, guildId, userId);
      return;
    }
    if (name === "spend" || name === "mark") {
      if (!traitName) { await interaction.reply("usage: /spend trait amount"); return; }
      const res = await userService.modify(userId, guildId, -amount, traitName);
      if (!res) { await interaction.reply("trait not found"); return; }
      const member = await interaction.guild!.members.fetch(userId).catch(() => null);
      const label = member?.displayName ?? interaction.user.username;
      await interaction.reply(`${label} | ${res.emoji} ${res.name}: ${res.amount}`);
      await traitDisplayManager.triggerUpdate(interaction.client, guildId, userId);
      return;
    }
  } catch (err) {
    try { console.error("slash command error", { command: interaction.commandName, err }); } catch {}
    try { await interaction.reply("error"); } catch {}
  }
});

async function start(): Promise<void> {
  if (!env.DISCORD_TOKEN || !env.DATABASE_URL) {
    throw new Error("missing env");
  }
  startHealthServer(Number(process.env.PORT ?? "8080"));
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
  await client.login(env.DISCORD_TOKEN);
}

start().catch(err => {
  console.error("startup error", err);
});
