import { ChatInputCommandInteraction } from "discord.js";
import { traitDisplayManager, formatValues, formatShowValues } from "../trait-display-manager.js";
import { getContainer } from "../di.js";
import { services, isAdminOrGMInteraction } from "./utils.js";

/** Handles slash command interactions */
export class SlashCommandRouter {
  private interaction: ChatInputCommandInteraction;
  constructor(interaction: ChatInputCommandInteraction) { this.interaction = interaction; }
  async handlers(): Promise<Record<string, () => Promise<void>>> {
    const { defaults, userService, traitService, tableService, audits } = services();
    const guildId = this.interaction.guildId!;
    const userId = this.interaction.user.id;
    const amount = this.interaction.options.getInteger("amount") ?? 1;
    const traitName = this.interaction.options.getString("trait") ?? "";
    return {
      register: async () => {
        const target = this.interaction.options.getUser("user");
        const targetId = target?.id ?? userId;
        if (target && !(await isAdminOrGMInteraction(this.interaction))) { await this.interaction.reply("permission denied"); return; }
        await defaults.ensureDefaults(guildId);
        await userService.register(targetId, guildId);
        const vals = await userService.read(targetId, guildId);
        const member = await this.interaction.guild!.members.fetch(targetId).catch(() => null);
        const label = member?.displayName ?? (target ? target.username : this.interaction.user.username);
        const uRow = await getContainer().users.getByDiscordId(targetId, guildId);
        const text = formatValues(label, vals, targetId, uRow?.emoji1 ?? null, uRow?.emoji2 ?? null);
        await this.interaction.reply({ content: text });
        const replyMsg = await this.interaction.fetchReply();
        traitDisplayManager.registerUserMessage(guildId, targetId, replyMsg.channel.id, replyMsg.id);
        await audits.log(guildId, userId, targetId, "register");
      },
      unregister: async () => {
        const target = this.interaction.options.getUser("user");
        const targetId = target?.id ?? userId;
        if (target && !(await isAdminOrGMInteraction(this.interaction))) { await this.interaction.reply("permission denied"); return; }
        const ok = await userService.unregister(targetId, guildId);
        await this.interaction.reply(ok ? "unregistered" : "not registered");
        if (ok) await audits.log(guildId, userId, targetId, "unregister");
      },
      values: async () => {
        const vals = await userService.read(userId, guildId);
        const member = await this.interaction.guild!.members.fetch(userId).catch(() => null);
        const label = member?.displayName ?? this.interaction.user.username;
        const uSelf = await getContainer().users.getByDiscordId(userId, guildId);
        const text = formatValues(label, vals, userId, uSelf?.emoji1 ?? null, uSelf?.emoji2 ?? null);
        await this.interaction.reply({ content: text });
        const replyMsg = await this.interaction.fetchReply();
        traitDisplayManager.registerUserMessage(guildId, userId, replyMsg.channel.id, replyMsg.id);
      },
      showvalues: async () => {
        const rows = await tableService.table(guildId);
        if (rows.length === 0) { await this.interaction.reply("no users in table"); return; }
        const guild = await this.interaction.guild!.fetch();
        const entries: Array<{ userLabel: string; discordUserId: string; emoji1?: string | null; emoji2?: string | null; values: Array<{ emoji: string; name: string; amount: number }> }> = [];
        const userIds: string[] = [];
        for (const r of rows) {
          const member = await guild.members.fetch(r.discordUserId).catch(() => null);
          const label = member?.displayName ?? (await this.interaction.client.users.fetch(r.discordUserId)).username;
          const uRow = await getContainer().users.getByDiscordId(r.discordUserId, guildId);
          entries.push({ userLabel: label, discordUserId: r.discordUserId, emoji1: uRow?.emoji1 ?? null, emoji2: uRow?.emoji2 ?? null, values: r.values });
          userIds.push(r.discordUserId);
        }
        const text = formatShowValues(entries);
        await this.interaction.reply({ content: text || "no users in table" });
        const replyMsg = await this.interaction.fetchReply();
        traitDisplayManager.registerTableMessage(guildId, replyMsg.channel.id, replyMsg.id, userIds);
      },
      addusertable: async () => {
        const target = this.interaction.options.getUser("user", true);
        await tableService.add(target.id, guildId);
        await this.interaction.reply("added");
      },
      removeusertable: async () => {
        const target = this.interaction.options.getUser("user", true);
        await tableService.remove(target.id, guildId);
        await this.interaction.reply("removed");
      },
      createtype: async () => {
        const n = this.interaction.options.getString("name", true);
        const e = this.interaction.options.getString("emoji", true);
        await traitService.create(guildId, n, e);
        await this.interaction.reply("created");
      },
      deletetype: async () => {
        const n = this.interaction.options.getString("name", true);
        const ok = await traitService.delete(guildId, n);
        await this.interaction.reply(ok ? "deleted" : "not found");
      },
      gain: async () => {
        if (!traitName) { await this.interaction.reply("usage: /gain trait amount"); return; }
        const res = await userService.modify(userId, guildId, amount, traitName);
        if (!res) { await this.interaction.reply("trait not found"); return; }
        const member = await this.interaction.guild!.members.fetch(userId).catch(() => null);
        const label = member?.displayName ?? this.interaction.user.username;
        await this.interaction.reply(`${label} | ${res.emoji} ${res.name}: ${res.amount}`);
        await traitDisplayManager.triggerUpdate(this.interaction.client, guildId, userId);
        await audits.log(guildId, userId, userId, "gain", res.name, amount);
      },
      clear: async () => {
        if (!traitName) { await this.interaction.reply("usage: /clear trait amount"); return; }
        const res = await userService.modify(userId, guildId, amount, traitName);
        if (!res) { await this.interaction.reply("trait not found"); return; }
        const member = await this.interaction.guild!.members.fetch(userId).catch(() => null);
        const label = member?.displayName ?? this.interaction.user.username;
        await this.interaction.reply(`${label} | ${res.emoji} ${res.name}: ${res.amount}`);
        await traitDisplayManager.triggerUpdate(this.interaction.client, guildId, userId);
      },
      spend: async () => {
        if (!traitName) { await this.interaction.reply("usage: /spend trait amount"); return; }
        const res = await userService.modify(userId, guildId, -amount, traitName);
        if (!res) { await this.interaction.reply("trait not found"); return; }
        const member = await this.interaction.guild!.members.fetch(userId).catch(() => null);
        const label = member?.displayName ?? this.interaction.user.username;
        await this.interaction.reply(`${label} | ${res.emoji} ${res.name}: ${res.amount}`);
        await traitDisplayManager.triggerUpdate(this.interaction.client, guildId, userId);
        await audits.log(guildId, userId, userId, "spend", res.name, amount);
      },
      mark: async () => {
        if (!traitName) { await this.interaction.reply("usage: /mark trait amount"); return; }
        const res = await userService.modify(userId, guildId, -amount, traitName);
        if (!res) { await this.interaction.reply("trait not found"); return; }
        const member = await this.interaction.guild!.members.fetch(userId).catch(() => null);
        const label = member?.displayName ?? this.interaction.user.username;
        await this.interaction.reply(`${label} | ${res.emoji} ${res.name}: ${res.amount}`);
        await traitDisplayManager.triggerUpdate(this.interaction.client, guildId, userId);
      },
      update_trait: async () => {
        if (!traitName) { await this.interaction.reply("usage: /update_trait trait amount"); return; }
        const target = this.interaction.options.getUser("user");
        const targetId = target?.id ?? userId;
        if (target && !(await isAdminOrGMInteraction(this.interaction))) { await this.interaction.reply("permission denied"); return; }
        if (target) {
          const u = await getContainer().users.getByDiscordId(targetId, guildId);
          if (!u) { await this.interaction.reply("user not registered"); return; }
        }
        const trait = await traitService.get(guildId, traitName);
        if (!trait) { await this.interaction.reply("trait not found"); return; }
        const res = await userService.setExact(targetId, guildId, traitName, amount);
        if (!res) { await this.interaction.reply("trait not found"); return; }
        const member = await this.interaction.guild!.members.fetch(targetId).catch(() => null);
        const label = member?.displayName ?? (target ? target.username : this.interaction.user.username);
        await this.interaction.reply(`${label} | ${res.emoji} ${res.name}: ${res.amount}`);
        await traitDisplayManager.triggerUpdate(this.interaction.client, guildId, targetId);
        await audits.log(guildId, userId, targetId, "update_trait", res.name, amount);
      },
      remove_trait: async () => {
        const target = this.interaction.options.getUser("user", true);
        const targetId = target.id;
        if (!(await isAdminOrGMInteraction(this.interaction))) { await this.interaction.reply("permission denied"); return; }
        const u = await getContainer().users.getByDiscordId(targetId, guildId);
        if (!u) { await this.interaction.reply("user not registered"); return; }
        const tname = this.interaction.options.getString("trait", true);
        const t = await traitService.get(guildId, tname);
        if (!t) { await this.interaction.reply("trait not found"); return; }
        const ok = await userService.removeTraitValue(targetId, guildId, tname);
        if (!ok) { await this.interaction.reply("trait value not found"); return; }
        const member = await this.interaction.guild!.members.fetch(targetId).catch(() => null);
        const label = member?.displayName ?? target.username;
        await this.interaction.reply(`removed ${t.name} for ${label}`);
        await traitDisplayManager.triggerUpdate(this.interaction.client, guildId, targetId);
        await audits.log(guildId, userId, targetId, "remove_trait", t.name);
      },
      setuseremoji: async () => {
        const emoji = this.interaction.options.getString("emoji", true);
        const pos = this.interaction.options.getInteger("position", true);
        const target = this.interaction.options.getUser("user") ?? this.interaction.user;
        const targetId = target.id;
        if (targetId !== this.interaction.user.id && !(await isAdminOrGMInteraction(this.interaction))) { await this.interaction.reply("permission denied"); return; }
        if (pos !== 1 && pos !== 2) { await this.interaction.reply("position must be 1 or 2"); return; }
        try {
          const updated = await services().userService.addUserEmoji(targetId, guildId, emoji, pos as 1 | 2);
          if (!updated) { await this.interaction.reply("user not registered"); return; }
          await this.interaction.reply("emoji updated");
          await traitDisplayManager.triggerUpdate(this.interaction.client, guildId, targetId);
        } catch {
          await this.interaction.reply("invalid emoji");
        }
      }
    };
  }
}

/** Entry point for slash command handling */
export async function handleSlashInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;
  const guildId = interaction.guildId;
  if (!guildId) return;
  const name = interaction.commandName;
  const { defaults } = services();
  try {
    await defaults.ensureDefaults(guildId);
    const router = new SlashCommandRouter(interaction);
    const map = await router.handlers();
    const fn = map[name];
    if (!fn) return;
    await fn();
  } catch (err) {
    try { console.error("slash command error", { command: name, err }); } catch {}
    try { await interaction.reply("error"); } catch {}
  }
}
