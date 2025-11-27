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
      const userIds: string[] = [];
      type UserRow = { id: string; label: string; values: Map<string, number> };
      const users: UserRow[] = [];
      for (const r of rows) {
        const member = await guild.members.fetch(r.discordUserId).catch(() => null);
        const label = member?.displayName ?? (await interaction.client.users.fetch(r.discordUserId)).username;
        const values = new Map<string, number>();
        for (const v of r.values) values.set(v.name, v.amount);
        users.push({ id: r.discordUserId, label, values });
        userIds.push(r.discordUserId);
      }

      const traitOrder = ["Health", "Stress", "Armor", "Hope"];
      const orderIndex = new Map<string, number>(traitOrder.map((t, i) => [t.toLowerCase(), i]));
      const normalizeTrait = (name: string): string => (name.toLowerCase() === "health" ? "HP" : name);

      function activeTraits(u: UserRow): string[] {
        const names: string[] = [];
        for (const [name, amount] of u.values.entries()) if (amount > 0) names.push(name);
        names.sort((a, b) => {
          const ai = orderIndex.get(a.toLowerCase());
          const bi = orderIndex.get(b.toLowerCase());
          if (ai != null && bi != null) return ai - bi;
          if (ai != null) return -1; if (bi != null) return 1;
          return a.localeCompare(b);
        });
        return names;
      }

      const groups = new Map<string, { traits: string[]; members: UserRow[] }>();
      for (const u of users) {
        const traits = activeTraits(u);
        const key = traits.join("|") || "__none__";
        const g = groups.get(key) ?? { traits, members: [] };
        g.members.push(u);
        groups.set(key, g);
      }

      const sortedGroups = Array.from(groups.values()).sort((a, b) => a.members.length - b.members.length);

      function formatGroup(g: { traits: string[]; members: UserRow[] }, titleIdx: number): string {
        const traits = g.traits.length > 0 ? g.traits : Array.from(new Set(users.flatMap(u => Array.from(u.values.keys()))));
        traits.sort((a, b) => {
          const ai = orderIndex.get(a.toLowerCase());
          const bi = orderIndex.get(b.toLowerCase());
          if (ai != null && bi != null) return ai - bi;
          if (ai != null) return -1; if (bi != null) return 1;
          return a.localeCompare(b);
        });
        const members = [...g.members];
        members.sort((a, b) => {
          const aSim = activeTraits(a).length;
          const bSim = activeTraits(b).length;
          if (aSim !== bSim) return bSim - aSim;
          return a.label.localeCompare(b.label);
        });
        const headers = ["Trait", ...members.map(m => m.label)];
        const rowsOut: string[][] = [];
        for (const t of traits) {
          const row: string[] = [normalizeTrait(t)];
          for (const m of members) {
            const val = m.values.get(t) ?? 0;
            row.push(String(val));
          }
          rowsOut.push(row);
        }
        const colWidths = headers.map((h, i) => Math.max(h.length, ...rowsOut.map(r => r[i].length)));
        const pad = (s: string, w: number): string => s + " ".repeat(w - s.length);
        const linesTbl: string[] = [];
        linesTbl.push(headers.map((h, i) => pad(h, colWidths[i])).join(" | "));
        linesTbl.push(colWidths.map(w => "-".repeat(w)).join("-|-"));
        for (const r of rowsOut) linesTbl.push(r.map((c, i) => pad(c, colWidths[i])).join(" | "));
        const usersMentions = members.map(m => `<@${m.id}>`).join(", ");
        const title = g.traits.length > 0 ? `Group ${titleIdx} — Traits: ${g.traits.join(", ")}` : `Group ${titleIdx} — Traits: none`;
        return [`${title}`, `Users: ${usersMentions}`, "```", ...linesTbl, "```"].join("\n");
      }

      const blocks: string[] = [];
      let idx = 1;
      for (const g of sortedGroups) blocks.push(formatGroup(g, idx++));

      const MAX_LEN = 1800;
      let text = "";
      const sendContents: string[] = [];
      for (const b of blocks) {
        if ((text + b + "\n\n").length > MAX_LEN) {
          if (text.length > 0) { sendContents.push(text.trim()); text = ""; }
        }
        text += b + "\n\n";
      }
      if (text.length > 0) sendContents.push(text.trim());

      let lastMsg: import("discord.js").Message<boolean> | null = null;
      if (sendContents.length > 0) {
        await interaction.reply({ content: sendContents[0] });
        lastMsg = await interaction.fetchReply();
        for (let i = 1; i < sendContents.length; i++) {
          const m = await interaction.followUp({ content: sendContents[i] });
          lastMsg = m;
        }
      }
      if (lastMsg) traitDisplayManager.registerTableMessage(guildId, lastMsg.channel.id, lastMsg.id, userIds);
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
      const res = await userService.setExact(targetId, guildId, traitName, amount);
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
