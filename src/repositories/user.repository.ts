import { query } from "../db.js";
import { User } from "../models.js";

export class UserRepository {
  async findOrCreate(discordUserId: string, guildId: string): Promise<User> {
    const existing = await query<User>(
      "select id, discord_user_id as \"discordUserId\", guild_id as \"guildId\", emoji1, emoji2 from users where discord_user_id=$1 and guild_id=$2",
      [discordUserId, guildId]
    );
    if (existing.rows.length > 0) return existing.rows[0];
    const inserted = await query<User>(
      "insert into users(discord_user_id, guild_id) values($1,$2) returning id, discord_user_id as \"discordUserId\", guild_id as \"guildId\", emoji1, emoji2",
      [discordUserId, guildId]
    );
    return inserted.rows[0];
  }

  async getByDiscordId(discordUserId: string, guildId: string): Promise<User | null> {
    const res = await query<User>(
      "select id, discord_user_id as \"discordUserId\", guild_id as \"guildId\", emoji1, emoji2 from users where discord_user_id=$1 and guild_id=$2",
      [discordUserId, guildId]
    );
    return res.rows[0] ?? null;
  }

  async setEmoji(userId: number, position: 1 | 2, emoji: string | null): Promise<User> {
    const col = position === 1 ? "emoji1" : "emoji2";
    const res = await query<User>(
      `update users set ${col}=$2 where id=$1 returning id, discord_user_id as "discordUserId", guild_id as "guildId", emoji1, emoji2`,
      [userId, emoji]
    );
    return res.rows[0];
  }
}
