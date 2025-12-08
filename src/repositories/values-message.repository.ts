import { query } from "../db.js";

export interface ValuesMessageRow {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string;
  discordUserId: string;
  creatorUserId: string;
  commandName: string;
  commandParams: unknown;
  content: string;
  createdAt: Date;
}

export class ValuesMessageRepository {
  async add(row: { guildId: string; channelId: string; messageId: string; discordUserId: string; creatorUserId: string; commandName: string; commandParams: unknown; content: string; createdAt: Date }): Promise<void> {
    await query<unknown>(
      "insert into values_messages(guild_id, channel_id, message_id, discord_user_id, creator_user_id, command_name, command_params, content, created_at) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) on conflict(channel_id,message_id) do nothing",
      [row.guildId, row.channelId, row.messageId, row.discordUserId, row.creatorUserId, row.commandName, JSON.stringify(row.commandParams ?? null), row.content, row.createdAt.toISOString()]
    );
  }

  async listByUser(guildId: string, discordUserId: string, limit: number = 100): Promise<ValuesMessageRow[]> {
    const res = await query<ValuesMessageRow>(
      "select id, guild_id as \"guildId\", channel_id as \"channelId\", message_id as \"messageId\", discord_user_id as \"discordUserId\", creator_user_id as \"creatorUserId\", command_name as \"commandName\", command_params as \"commandParams\", content, created_at as \"createdAt\" from values_messages where guild_id=$1 and discord_user_id=$2 order by created_at desc limit $3",
      [guildId, discordUserId, limit]
    );
    return res.rows;
  }

  async listForGuild(guildId: string, limit: number = 50): Promise<ValuesMessageRow[]> {
    const res = await query<ValuesMessageRow>(
      "select id, guild_id as \"guildId\", channel_id as \"channelId\", message_id as \"messageId\", discord_user_id as \"discordUserId\", creator_user_id as \"creatorUserId\", command_name as \"commandName\", command_params as \"commandParams\", content, created_at as \"createdAt\" from values_messages where guild_id=$1 order by created_at desc limit $2",
      [guildId, limit]
    );
    return res.rows;
  }

  async listAll(limit: number = 50): Promise<ValuesMessageRow[]> {
    const res = await query<ValuesMessageRow>(
      "select id, guild_id as \"guildId\", channel_id as \"channelId\", message_id as \"messageId\", discord_user_id as \"discordUserId\", creator_user_id as \"creatorUserId\", command_name as \"commandName\", command_params as \"commandParams\", content, created_at as \"createdAt\" from values_messages order by created_at desc limit $1",
      [limit]
    );
    return res.rows;
  }

  async cleanup(retentionDays: number): Promise<number> {
    const res = await query<{ count: string }>(
      "delete from values_messages where created_at < now() - ($1::int || ' days')::interval returning '1' as count",
      [retentionDays]
    );
    return res.rows.length;
  }
}

