import { Client, TextChannel } from "discord.js";
import { getContainer } from "./di.js";

export function formatValues(userLabel: string, values: Array<{ emoji: string; name: string; amount: number }>): string {
  const order = ["Health", "Stress", "Armor", "Hope"];
  const normalizeLabel = (name: string): string => (name.toLowerCase() === "health" ? "HP" : name);
  const byOrder = new Map(order.map((n, i) => [n.toLowerCase(), i] as const));
  const sorted = [...values].sort((a, b) => {
    const ai = byOrder.get(a.name.toLowerCase());
    const bi = byOrder.get(b.name.toLowerCase());
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return a.name.localeCompare(b.name);
  });
  const header = `${userLabel}:`;
  const lines = sorted.map(v => `${v.emoji} ${normalizeLabel(v.name)}: ${v.amount}`);
  return `${header}\n${lines.join("\n")}`;
}

export class TraitDisplayManager {
  private userMessages: Map<string, Map<string, Array<{ channelId: string; messageId: string }>>> = new Map();
  private tableMessages: Map<string, Array<{ channelId: string; messageId: string }>> = new Map();
  registerUserMessage(guildId: string, userId: string, channelId: string, messageId: string): void {
    if (!this.userMessages.has(guildId)) this.userMessages.set(guildId, new Map());
    const m = this.userMessages.get(guildId)!;
    const arr = m.get(userId) ?? [];
    arr.push({ channelId, messageId });
    m.set(userId, arr);
  }
  registerTableMessage(guildId: string, channelId: string, messageId: string): void {
    const arr = this.tableMessages.get(guildId) ?? [];
    arr.push({ channelId, messageId });
    this.tableMessages.set(guildId, arr);
  }
  async refreshUser(client: Client, guildId: string, userId: string): Promise<void> {
    const refs = this.userMessages.get(guildId)?.get(userId);
    if (!refs || refs.length === 0) return;
    try {
      const { userService } = getContainer();
      const vals = await userService.read(userId, guildId);
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId).catch(() => null);
      const label = member?.displayName ?? (await client.users.fetch(userId)).username;
      const text = formatValues(label, vals);
      for (const r of refs) {
        const channel = (await client.channels.fetch(r.channelId)) as TextChannel;
        const msg = await channel.messages.fetch(r.messageId).catch(() => null);
        if (msg) await msg.edit(text).catch(() => {});
      }
    } catch (err) {
      console.error("refreshUser error", { guildId, userId, err });
    }
  }
  async refreshTable(client: Client, guildId: string): Promise<void> {
    const refs = this.tableMessages.get(guildId);
    if (!refs || refs.length === 0) return;
    try {
      const { tableService } = getContainer();
      const rows = await tableService.table(guildId);
      const guild = await client.guilds.fetch(guildId);
      const lines: string[] = [];
      for (const r of rows) {
        const member = await guild.members.fetch(r.discordUserId).catch(() => null);
        const label = member?.displayName ?? (await client.users.fetch(r.discordUserId)).username;
        lines.push(formatValues(label, r.values));
      }
      const text = lines.join("\n");
      for (const r of refs) {
        const channel = (await client.channels.fetch(r.channelId)) as TextChannel;
        const msg = await channel.messages.fetch(r.messageId).catch(() => null);
        if (msg) await msg.edit(text).catch(() => {});
      }
    } catch (err) {
      console.error("refreshTable error", { guildId, err });
    }
  }
  async triggerUpdate(client: Client, guildId: string, userId: string): Promise<void> {
    await Promise.all([
      this.refreshUser(client, guildId, userId),
      this.refreshTable(client, guildId)
    ]);
  }
}

export const traitDisplayManager = new TraitDisplayManager();
