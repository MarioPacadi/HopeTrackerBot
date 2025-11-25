import { query } from "../db";
import { User } from "../models";

export class TableRepository {
  async add(userId: number): Promise<void> {
    await query<unknown>("insert into table_members(user_id) values($1) on conflict do nothing", [userId]);
  }
  async remove(userId: number): Promise<void> {
    await query<unknown>("delete from table_members where user_id=$1", [userId]);
  }
  async list(guildId: string): Promise<User[]> {
    const res = await query<User>(
      "select u.id, u.discord_user_id as \"discordUserId\", u.guild_id as \"guildId\" from table_members tm join users u on tm.user_id=u.id where u.guild_id=$1 order by u.discord_user_id",
      [guildId]
    );
    return res.rows;
  }
}