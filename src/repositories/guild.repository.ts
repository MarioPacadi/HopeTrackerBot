import { pool } from "../db.js";

export class GuildRepository {
  async ensureGuild(guildId: string): Promise<void> {
    await pool.query("insert into guilds(id) values($1) on conflict do nothing", [guildId]);
  }
}
