import { Message } from "discord.js";
import { env } from "../config.js";
import { traitDisplayManager, formatValues } from "../trait-display-manager.js";
import { getContainer } from "../di.js";
import { getSharedCommandNames, validateTextParity } from "../command-registry.js";
import { isAdmin, parseAmount, services } from "./utils.js";
import { RateLimiter } from "../rate-limit.js";
import { Logger } from "../logger.js";

const limiter = new RateLimiter(20, 60000);

/** Handles text-based commands for guild messages */
export class TextCommandRouter {
  private message: Message;
  constructor(message: Message) { this.message = message; }
  handlers(): Record<string, (parts: string[]) => Promise<void>> {
    const { userService, traitService, tableService } = services();
    return {
      register: async () => {
        await userService.register(this.message.author.id, this.message.guild!.id);
        const vals = await userService.read(this.message.author.id, this.message.guild!.id);
        const label = this.message.member?.displayName ?? this.message.author.username;
        const text = formatValues(label, vals);
        const sent = await this.message.reply(text);
        traitDisplayManager.registerUserMessage(this.message.guild!.id, this.message.author.id, sent.channel.id, sent.id, text, this.message.author.id, { command: "values" });
      },
      unregister: async () => {
        const ok = await userService.unregister(this.message.author.id, this.message.guild!.id);
        await this.message.reply(ok ? "unregistered" : "not registered");
      },
      showvalues: async () => {
        const rows = await tableService.table(this.message.guild!.id);
        if (rows.length === 0) { await this.message.reply("no users in table"); return; }
        const guild = await this.message.guild!.fetch();
        const lines: string[] = [];
        const userIds: string[] = [];
        for (const r of rows) {
          const member = await guild.members.fetch(r.discordUserId).catch(() => null);
          const label = member?.displayName ?? (await this.message.client.users.fetch(r.discordUserId)).username;
          const uRow = await getContainer().users.getByDiscordId(r.discordUserId, this.message.guild!.id);
          lines.push(formatValues(label, r.values, r.discordUserId, uRow?.emoji1 ?? null, uRow?.emoji2 ?? null));
          userIds.push(r.discordUserId);
        }
        const sent = await this.message.reply(lines.join("\n"));
        traitDisplayManager.registerTableMessage(this.message.guild!.id, sent.channel.id, sent.id, userIds);
      },
      addusertable: async () => {
        if (!isAdmin(this.message)) { await this.message.reply("permission denied"); return; }
        const target = this.message.mentions.users.first();
        if (!target) { await this.message.reply("mention a user"); return; }
        await tableService.add(target.id, this.message.guild!.id);
        await this.message.reply("added");
      },
      removeusertable: async () => {
        if (!isAdmin(this.message)) { await this.message.reply("permission denied"); return; }
        const target = this.message.mentions.users.first();
        if (!target) { await this.message.reply("mention a user"); return; }
        await tableService.remove(target.id, this.message.guild!.id);
        await this.message.reply("removed");
      },
      createtype: async (parts: string[]) => {
        if (!isAdmin(this.message)) { await this.message.reply("permission denied"); return; }
        const name = parts[1];
        const emoji = parts[2];
        if (!name || !emoji) { await this.message.reply("usage: !createtype <name> <emoji>"); return; }
        if (name.length > 32) { await this.message.reply("name too long (max 32)"); return; }
        if (emoji.length > 32) { await this.message.reply("emoji too long"); return; }
        await traitService.create(this.message.guild!.id, name, emoji);
        await this.message.reply("created");
        await traitDisplayManager.triggerUpdate(this.message.client, this.message.guild!.id, this.message.author.id);
      },
      deletetype: async (parts: string[]) => {
        if (!isAdmin(this.message)) { await this.message.reply("permission denied"); return; }
        const name = parts[1];
        if (!name) { await this.message.reply("usage: !deletetype <name>"); return; }
        const ok = await traitService.delete(this.message.guild!.id, name);
        await this.message.reply(ok ? "deleted" : "not found");
      },
      gain: async (parts: string[]) => {
        const p = parseAmount(parts, 1);
        const amount = p.amount;
        const traitName = parts[p.nextIndex];
        if (!traitName) { await this.message.reply("usage: !gain <amount> <trait>"); return; }
        const res = await userService.modify(this.message.author.id, this.message.guild!.id, amount, traitName);
        if (!res) { await this.message.reply("trait not found"); return; }
        const label = this.message.member?.displayName ?? this.message.author.username;
        await this.message.reply(`${label} | ${res.emoji} ${res.name}: ${res.amount}`);
        await traitDisplayManager.triggerUpdate(this.message.client, this.message.guild!.id, this.message.author.id);
      },
      clear: async (parts: string[]) => {
        const p = parseAmount(parts, 1);
        const amount = p.amount;
        const traitName = parts[p.nextIndex];
        if (!traitName) { await this.message.reply("usage: !clear <amount> <trait>"); return; }
        const res = await userService.modify(this.message.author.id, this.message.guild!.id, amount, traitName);
        if (!res) { await this.message.reply("trait not found"); return; }
        const label = this.message.member?.displayName ?? this.message.author.username;
        await this.message.reply(`${label} | ${res.emoji} ${res.name}: ${res.amount}`);
        await traitDisplayManager.triggerUpdate(this.message.client, this.message.guild!.id, this.message.author.id);
      },
      spend: async (parts: string[]) => {
        const p = parseAmount(parts, 1);
        const amount = p.amount;
        const traitName = parts[p.nextIndex];
        if (!traitName) { await this.message.reply("usage: !spend <amount> <trait>"); return; }
        const res = await userService.modify(this.message.author.id, this.message.guild!.id, -amount, traitName);
        if (!res) { await this.message.reply("trait not found"); return; }
        const label = this.message.member?.displayName ?? this.message.author.username;
        await this.message.reply(`${label} | ${res.emoji} ${res.name}: ${res.amount}`);
        await traitDisplayManager.triggerUpdate(this.message.client, this.message.guild!.id, this.message.author.id);
      },
      mark: async (parts: string[]) => {
        const p = parseAmount(parts, 1);
        const amount = p.amount;
        const traitName = parts[p.nextIndex];
        if (!traitName) { await this.message.reply("usage: !mark <amount> <trait>"); return; }
        const res = await userService.modify(this.message.author.id, this.message.guild!.id, -amount, traitName);
        if (!res) { await this.message.reply("trait not found"); return; }
        const label = this.message.member?.displayName ?? this.message.author.username;
        await this.message.reply(`${label} | ${res.emoji} ${res.name}: ${res.amount}`);
        await traitDisplayManager.triggerUpdate(this.message.client, this.message.guild!.id, this.message.author.id);
      },
      values: async () => {
        const vals = await userService.read(this.message.author.id, this.message.guild!.id);
        const label = this.message.member?.displayName ?? this.message.author.username;
        const text = formatValues(label, vals);
        const sent = await this.message.reply(text);
        traitDisplayManager.registerUserMessage(this.message.guild!.id, this.message.author.id, sent.channel.id, sent.id, text, this.message.author.id, { command: "register" });
      },
      setuseremoji: async (parts: string[]) => {
        const posStr = parts[1];
        const emoji = parts[2] ?? "";
        const position = Number(posStr);
        if (!position || (position !== 1 && position !== 2)) { await this.message.reply("usage: !setuseremoji <1|2> <emoji>"); return; }
        const target = this.message.mentions.users.first();
        const targetId = target?.id ?? this.message.author.id;
        if (target && !isAdmin(this.message)) { await this.message.reply("permission denied"); return; }
        try {
          const updated = await services().userService.addUserEmoji(targetId, this.message.guild!.id, emoji || null, position as 1 | 2);
          if (!updated) { await this.message.reply("user not found"); return; }
          await this.message.reply("emoji updated");
          await traitDisplayManager.triggerUpdate(this.message.client, this.message.guild!.id, targetId);
        } catch {
          await this.message.reply("invalid emoji");
        }
      }
    };
  }
}

/** Entry point for text command handling */
export async function handleMessage(message: Message): Promise<void> {
  if (!message.guild) return;
  if (message.author.bot) return;
  const { defaults } = services();
  const content = message.content.trim();
  if (!content.startsWith(env.COMMAND_PREFIX)) return;
  await defaults.ensureDefaults(message.guild.id);
  const cmdline = content.slice(env.COMMAND_PREFIX.length).trim();
  const parts = cmdline.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  if (!cmd) return;
  
  if (!limiter.check(message.author.id)) {
    // silently ignore or react to avoid spam loops
    return; 
  }

  const router = new TextCommandRouter(message);
  const map = router.handlers();
  const shared = new Set(getSharedCommandNames());
  const parity = validateTextParity(Object.keys(map));
  if (parity.missingInText.length || parity.missingTextHandlers.length) {
    Logger.warn("command parity mismatch", parity);
  }
  if (!shared.has(cmd)) return;
  const fn = map[cmd];
  if (!fn) return;
  try {
    await fn(parts);
  } catch (err) {
    Logger.error("text command error", err);
    await message.reply("error processing command");
  }
}
