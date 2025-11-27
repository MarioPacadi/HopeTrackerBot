import { query } from "../db.js";

export interface LastTableMessageRow {
  guildId: string;
  channelId: string;
  messageId: string;
  userIds: string[];
}

export class LastTableMessageRepository {
  async set(guildId: string, channelId: string, messageId: string, userIds: ReadonlyArray<string>): Promise<void> {
    await query<unknown>(
      "insert into last_table_messages(guild_id, channel_id, message_id, user_ids) values($1,$2,$3,$4) on conflict(guild_id) do update set channel_id=excluded.channel_id, message_id=excluded.message_id, user_ids=excluded.user_ids, updated_at=now()",
      [guildId, channelId, messageId, JSON.stringify(userIds)]
    );
  }
  async get(guildId: string): Promise<LastTableMessageRow | null> {
    const res = await query<{ guildId: string; channelId: string; messageId: string; userIds: string }>(
      "select guild_id as \"guildId\", channel_id as \"channelId\", message_id as \"messageId\", user_ids::text as \"userIds\" from last_table_messages where guild_id=$1",
      [guildId]
    );
    const row = res.rows[0];
    if (!row) return null;
    const ids = JSON.parse(row.userIds) as string[];
    return { guildId: row.guildId, channelId: row.channelId, messageId: row.messageId, userIds: ids };
  }
  async listAll(): Promise<LastTableMessageRow[]> {
    const res = await query<{ guildId: string; channelId: string; messageId: string; userIds: string }>(
      "select guild_id as \"guildId\", channel_id as \"channelId\", message_id as \"messageId\", user_ids::text as \"userIds\" from last_table_messages",
      []
    );
    return res.rows.map(r => ({ guildId: r.guildId, channelId: r.channelId, messageId: r.messageId, userIds: JSON.parse(r.userIds) as string[] }));
  }
}
