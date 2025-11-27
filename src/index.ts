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
    new SlashCommandBuilder().setName("register").setDescription("Register user").addUserOption(o => o.setName("user").setDescription("Target user").setRequired(false)),
    new SlashCommandBuilder().setName("unregister").setDescription("Unregister user").addUserOption(o => o.setName("user").setDescription("Target user").setRequired(false)),
    new SlashCommandBuilder().setName("values").setDescription("Show your values"),
    new SlashCommandBuilder().setName("showvalues").setDescription("Show table users and values"),
    new SlashCommandBuilder()
      .setName("update_trait").setDescription("Update a trait")
      .addStringOption(o => o.setName("trait").setDescription("Trait name").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true))
      .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(false)),
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
    , new SlashCommandBuilder()
      .setName("remove_trait").setDescription("Remove a user's trait value")
      .addStringOption(o => o.setName("trait").setDescription("Trait name").setRequired(true))
      .addUserOption(o => o.setName("user").setDescription("Target user").setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
  const { defaults, userService, traitService, tableService, audits } = getContainer();
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  if (!guildId) return;
  const isAdminOrGM = async (): Promise<boolean> => {
    const member = interaction.member;
    if (!member || !("permissions" in member)) return false;
    const perms = (member as any).permissions;
    const hasAdmin = perms.has(PermissionFlagsBits.ManageGuild) || perms.has(PermissionFlagsBits.Administrator);
    const gmRole = interaction.guild?.roles.cache.find(r => r.name.toLowerCase() === "game master");
    const hasGM = gmRole ? (interaction.member as any).roles?.cache?.has(gmRole.id) : false;
    return !!hasAdmin || !!hasGM;
  };
  try {
    await defaults.ensureDefaults(guildId);
    const name = interaction.commandName;
    const amount = interaction.options.getInteger("amount") ?? 1;
    const traitName = interaction.options.getString("trait") ?? "";
    if (name === "register") {
      const target = interaction.options.getUser("user");
      const targetId = target?.id ?? userId;
      if (target && !(await isAdminOrGM())) { await interaction.reply("permission denied"); return; }
      await defaults.ensureDefaults(guildId);
      await userService.register(targetId, guildId);
      const vals = await userService.read(targetId, guildId);
      const member = await interaction.guild!.members.fetch(targetId).catch(() => null);
      const label = member?.displayName ?? (target ? target.username : interaction.user.username);
      const text = formatValues(label, vals, targetId);
      await interaction.reply({ content: text });
      const replyMsg = await interaction.fetchReply();
      traitDisplayManager.registerUserMessage(guildId, targetId, replyMsg.channel.id, replyMsg.id);
      await audits.log(guildId, userId, targetId, "register");
      return;
    }
    if (name === "unregister") {
      const target = interaction.options.getUser("user");
      const targetId = target?.id ?? userId;
      if (target && !(await isAdminOrGM())) { await interaction.reply("permission denied"); return; }
      const ok = await userService.unregister(targetId, guildId);
      await interaction.reply(ok ? "unregistered" : "not registered");
      if (ok) await audits.log(guildId, userId, targetId, "unregister");
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
      const guild = await interaction.guild!.fetch();
      const lines: string[] = [];
      const userIds: string[] = [];
      for (const r of rows) {
        const member = await guild.members.fetch(r.discordUserId).catch(() => null);
        const label = member?.displayName ?? (await interaction.client.users.fetch(r.discordUserId)).username;
        lines.push(formatValues(label, r.values, r.discordUserId));
        userIds.push(r.discordUserId);
      }
      await interaction.reply({ content: lines.join("\n") });
      const replyMsg = await interaction.fetchReply();
      traitDisplayManager.registerTableMessage(guildId, replyMsg.channel.id, replyMsg.id, userIds);
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
      await audits.log(guildId, userId, userId, "gain", res.name, amount);
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
      await audits.log(guildId, userId, userId, "spend", res.name, amount);
      return;
    }
    if (name === "update_trait") {
      if (!traitName) { await interaction.reply("usage: /update_trait trait amount"); return; }
      const target = interaction.options.getUser("user");
      const targetId = target?.id ?? userId;
      if (target && !(await isAdminOrGM())) { await interaction.reply("permission denied"); return; }
      if (target) {
        const u = await getContainer().users.getByDiscordId(targetId, guildId);
        if (!u) { await interaction.reply("user not registered"); return; }
      }
      const trait = await traitService.get(guildId, traitName);
      if (!trait) { await interaction.reply("trait not found"); return; }
      const res = target ? await userService.setExact(targetId, guildId, traitName, amount) : await userService.modify(targetId, guildId, amount, traitName);
      if (!res) { await interaction.reply("trait not found"); return; }
      const member = await interaction.guild!.members.fetch(targetId).catch(() => null);
      const label = member?.displayName ?? (target ? target.username : interaction.user.username);
      await interaction.reply(`${label} | ${res.emoji} ${res.name}: ${res.amount}`);
      await traitDisplayManager.triggerUpdate(interaction.client, guildId, targetId);
      await audits.log(guildId, userId, targetId, "update_trait", res.name, amount);
      return;
    }
    if (name === "remove_trait") {
      const target = interaction.options.getUser("user", true);
      const targetId = target.id;
      if (!isAdminOrGM()) { await interaction.reply("permission denied"); return; }
      const u = await getContainer().users.getByDiscordId(targetId, guildId);
      if (!u) { await interaction.reply("user not registered"); return; }
      const tname = interaction.options.getString("trait", true);
      const t = await traitService.get(guildId, tname);
      if (!t) { await interaction.reply("trait not found"); return; }
      const ok = await userService.removeTraitValue(targetId, guildId, tname);
      if (!ok) { await interaction.reply("trait value not found"); return; }
      const member = await interaction.guild!.members.fetch(targetId).catch(() => null);
      const label = member?.displayName ?? target.username;
      await interaction.reply(`removed ${t.name} for ${label}`);
      await traitDisplayManager.triggerUpdate(interaction.client, guildId, targetId);
      await audits.log(guildId, userId, targetId, "remove_trait", t.name);
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
  await traitDisplayManager.loadFromStorage();
  await client.login(env.DISCORD_TOKEN);
}

start().catch(err => {
  console.error("startup error", err);
});
