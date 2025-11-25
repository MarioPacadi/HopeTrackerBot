import { Message, PermissionFlagsBits } from "discord.js";
import { env } from "./config.js";
import { getContainer } from "./di.js";

const { defaults, userService, traitService, tableService } = getContainer();

/**
 * Parses an optional numeric amount from the given parts starting at startIndex.
 * Defaults to 1 when not provided or invalid.
 */
function parseAmount(parts: string[], startIndex: number): { amount: number; nextIndex: number } {
  if (parts.length <= startIndex) return { amount: 1, nextIndex: startIndex };
  const parsed = Number(parts[startIndex]);
  if (Number.isNaN(parsed)) return { amount: 1, nextIndex: startIndex };
  return { amount: parsed, nextIndex: startIndex + 1 };
}

/** Checks guild permissions for administrative actions. */
function isAdmin(message: Message): boolean {
  const member = message.member;
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.ManageGuild) || member.permissions.has(PermissionFlagsBits.Administrator);
}

/** Formats trait values as "[emoji] Name: amount" segments separated by pipes. */
function formatValues(values: Array<{ emoji: string; name: string; amount: number }>): string {
  return values.map(v => `${v.emoji} ${v.name}: ${v.amount}`).join(" | ");
}

export async function handleMessage(message: Message): Promise<void> {
  if (!message.guild) return;
  if (message.author.bot) return;
  const content = message.content.trim();
  if (!content.startsWith(env.COMMAND_PREFIX)) return;
  await defaults.ensureDefaults(message.guild.id);
  const cmdline = content.slice(env.COMMAND_PREFIX.length).trim();
  const parts = cmdline.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  if (!cmd) return;
  const handlers: Record<string, (message: Message, parts: string[]) => Promise<void>> = {
    async register(message) {
      await userService.register(message.author.id, message.guild!.id);
      const vals = await userService.read(message.author.id, message.guild!.id);
      await message.reply(formatValues(vals));
    },
    async unregister(message) {
      const ok = await userService.unregister(message.author.id, message.guild!.id);
      await message.reply(ok ? "unregistered" : "not registered");
    },
    async showvalues(message) {
      const rows = await tableService.table(message.guild!.id);
      if (rows.length === 0) {
        await message.reply("no users in table");
        return;
      }
      const lines: string[] = [];
      for (const r of rows) {
        const mention = `<@${r.discordUserId}>`;
        const line = `${mention} | ${formatValues(r.values)}`;
        lines.push(line);
      }
      await message.reply(lines.join("\n"));
    },
    async addusertable(message) {
      if (!isAdmin(message)) {
        await message.reply("permission denied");
        return;
      }
      const target = message.mentions.users.first();
      if (!target) {
        await message.reply("mention a user");
        return;
      }
      await tableService.add(target.id, message.guild!.id);
      await message.reply("added");
    },
    async removeusertable(message) {
      if (!isAdmin(message)) {
        await message.reply("permission denied");
        return;
      }
      const target = message.mentions.users.first();
      if (!target) {
        await message.reply("mention a user");
        return;
      }
      await tableService.remove(target.id, message.guild!.id);
      await message.reply("removed");
    },
    async createtype(message, parts) {
      if (!isAdmin(message)) {
        await message.reply("permission denied");
        return;
      }
      const name = parts[1];
      const emoji = parts[2];
      if (!name || !emoji) {
        await message.reply("usage: !createtype <name> <emoji>");
        return;
      }
      await traitService.create(message.guild!.id, name, emoji);
      await message.reply("created");
    },
    async deletetype(message, parts) {
      if (!isAdmin(message)) {
        await message.reply("permission denied");
        return;
      }
      const name = parts[1];
      if (!name) {
        await message.reply("usage: !deletetype <name>");
        return;
      }
      const ok = await traitService.delete(message.guild!.id, name);
      await message.reply(ok ? "deleted" : "not found");
    },
    async gain(message, parts) {
      const p = parseAmount(parts, 1);
      const amount = p.amount;
      const traitName = parts[p.nextIndex];
      if (!traitName) {
        await message.reply("usage: !gain <amount> <trait>");
        return;
      }
      const res = await userService.modify(message.author.id, message.guild!.id, amount, traitName);
      if (!res) {
        await message.reply("trait not found");
        return;
      }
      await message.reply(`${res.emoji} ${res.name}: ${res.amount}`);
    },
    async clear(message, parts) {
      const p = parseAmount(parts, 1);
      const amount = p.amount;
      const traitName = parts[p.nextIndex];
      if (!traitName) {
        await message.reply("usage: !clear <amount> <trait>");
        return;
      }
      const res = await userService.modify(message.author.id, message.guild!.id, amount, traitName);
      if (!res) {
        await message.reply("trait not found");
        return;
      }
      await message.reply(`${res.emoji} ${res.name}: ${res.amount}`);
    },
    async spend(message, parts) {
      const p = parseAmount(parts, 1);
      const amount = p.amount;
      const traitName = parts[p.nextIndex];
      if (!traitName) {
        await message.reply("usage: !spend <amount> <trait>");
        return;
      }
      const res = await userService.modify(message.author.id, message.guild!.id, -amount, traitName);
      if (!res) {
        await message.reply("trait not found");
        return;
      }
      await message.reply(`${res.emoji} ${res.name}: ${res.amount}`);
    },
    async mark(message, parts) {
      const p = parseAmount(parts, 1);
      const amount = p.amount;
      const traitName = parts[p.nextIndex];
      if (!traitName) {
        await message.reply("usage: !mark <amount> <trait>");
        return;
      }
      const res = await userService.modify(message.author.id, message.guild!.id, -amount, traitName);
      if (!res) {
        await message.reply("trait not found");
        return;
      }
      await message.reply(`${res.emoji} ${res.name}: ${res.amount}`);
    },
    async values(message) {
      const vals = await userService.read(message.author.id, message.guild!.id);
      await message.reply(formatValues(vals));
    }
  };

  const handler = handlers[cmd];
  if (!handler) return;
  try {
    await handler(message, parts);
  } catch {
    await message.reply("error processing command");
  }
}
