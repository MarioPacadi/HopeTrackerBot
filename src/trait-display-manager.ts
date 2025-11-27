import { Client, TextChannel } from "discord.js";
import { getContainer } from "./di.js";

export function formatValues(userLabel: string, values: Array<{ emoji: string; name: string; amount: number }>, discordUserId?: string): string {
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
  const title = `**${userLabel}**${discordUserId ? ` (<@${discordUserId}>)` : ""}`;
  const lines = sorted.map(v => `- ${v.emoji} ${normalizeLabel(v.name)}: ${v.amount}`);
  return `${title}\n${lines.join("\n")}\n`;
}

/**
 * Formats multiple user entries for the showvalues command into grouped sections.
 * Groups by unique trait-name sets, orders sections by trait count ascending then 
 * lexicographic key, and preserves original entry order within sections.
 */
export interface ShowEntry {
  userLabel: string;
  discordUserId: string;
  values: Array<{ emoji: string; name: string; amount: number }>;
}

export function formatShowValues(entries: ReadonlyArray<ShowEntry>): string {
  if (!entries || entries.length === 0) return "";
  const normName = (n: string): string => (n?.trim() ?? "");
  const makeKey = (vals: ReadonlyArray<{ name: string }>): string => {
    const names = vals.map(v => normName(v.name)).filter(Boolean).map(s => s.toLowerCase());
    return names.join("|");
  };
  type Group = { key: string; traitNames: string[]; entries: ShowEntry[] };
  const groupsMap = new Map<string, Group>();
  for (const e of entries) {
    const key = makeKey(e.values);
    const traitNames = Array.from(new Set(e.values.map(v => normName(v.name)).filter(Boolean)));
    const g = groupsMap.get(key);
    if (!g) {
      groupsMap.set(key, { key, traitNames, entries: [e] });
    } else {
      g.entries.push(e);
    }
  }
  const groups = Array.from(groupsMap.values());

  const sections: string[] = [];
  sections.push("## Traits of all registered Members");
  for (const g of groups) {
    // const header = `Traits: ${g.traitNames.length > 0 ? g.traitNames.join(", ") : "(none)"}`;
    // sections.push(header);
    for (let i = 0; i < g.entries.length; i++) {
      const e = g.entries[i];
      const title = `**${e.userLabel}**${e.discordUserId ? ` (<@${e.discordUserId}>)` : ""}`;
      const bullets = e.values.map(v => {
        const emoji = v.emoji ? `${v.emoji} ` : "";
        const name = normName(v.name) || "Unknown";
        return `- ${emoji} ${name}: ${v.amount}`;
      });
      sections.push(title);
      sections.push(...bullets);
      if (i < g.entries.length - 1) sections.push("");
    }
    sections.push("");
  }
  return sections.join("\n").trim();
}

export class TraitDisplayManager {
  private userMessages: Map<string, Map<string, Array<{ channelId: string; messageId: string }>>> = new Map();
  private tableMessages: Map<string, Array<{ channelId: string; messageId: string }>> = new Map();
  private lastTableMessage: Map<string, { channelId: string; messageId: string; userIds: string[] }> = new Map();
  private updatingTable: Map<string, boolean> = new Map();
  registerUserMessage(guildId: string, userId: string, channelId: string, messageId: string): void {
    if (!this.userMessages.has(guildId)) this.userMessages.set(guildId, new Map());
    const m = this.userMessages.get(guildId)!;
    const arr = m.get(userId) ?? [];
    arr.push({ channelId, messageId });
    m.set(userId, arr);
  }
  registerTableMessage(guildId: string, channelId: string, messageId: string, userIds?: string[]): void {
    const arr = this.tableMessages.get(guildId) ?? [];
    arr.push({ channelId, messageId });
    this.tableMessages.set(guildId, arr);
    if (userIds && userIds.length > 0) {
      this.lastTableMessage.set(guildId, { channelId, messageId, userIds });
      getContainer().lastTable.set(guildId, channelId, messageId, userIds).catch(() => {});
    }
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
      const text = formatValues(label, vals, userId);
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
        lines.push(formatValues(label, r.values, r.discordUserId));
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
  async refreshLastTableForUser(client: Client, guildId: string, userId: string): Promise<void> {
    const last = this.lastTableMessage.get(guildId);
    if (!last) { console.log("skip table update: no last message", { guildId }); return; }
    if (!last.userIds.includes(userId)) { console.log("skip table update: user not referenced", { guildId, userId }); return; }
    if (this.updatingTable.get(guildId)) { console.log("skip table update: concurrent update", { guildId }); return; }
    this.updatingTable.set(guildId, true);
    try {
      const { userService } = getContainer();
      const guild = await client.guilds.fetch(guildId);
      const lines: string[] = [];
      for (const id of last.userIds) {
        const vals = await userService.read(id, guildId);
        const member = await guild.members.fetch(id).catch(() => null);
        const label = member?.displayName ?? (await client.users.fetch(id)).username;
        lines.push(formatValues(label, vals, id));
      }
      const text = lines.join("\n");
      const channel = (await client.channels.fetch(last.channelId)) as TextChannel;
      const msg = await channel.messages.fetch(last.messageId).catch(() => null);
      if (!msg) { console.log("skip table update: message missing", { guildId }); return; }
      await msg.edit(text).catch(err => { console.error("table edit error", { guildId, err }); });
      console.log("table updated", { guildId, count: last.userIds.length });
    } catch (err) {
      console.error("refreshLastTableForUser error", { guildId, userId, err });
    } finally {
      this.updatingTable.delete(guildId);
    }
  }
  async triggerUpdate(client: Client, guildId: string, userId: string): Promise<void> {
    await Promise.all([
      this.refreshUser(client, guildId, userId),
      this.refreshLastTableForUser(client, guildId, userId)
    ]);
  }

  async loadFromStorage(): Promise<void> {
    try {
      const rows = await getContainer().lastTable.listAll();
      for (const r of rows) {
        this.lastTableMessage.set(r.guildId, { channelId: r.channelId, messageId: r.messageId, userIds: r.userIds });
      }
    } catch (err) {
      console.error("load last table message error", err);
    }
  }
}

export const traitDisplayManager = new TraitDisplayManager();
