import { query } from "../db.js";
import { Trait } from "../models.js";

export class TraitRepository {
  async list(guildId: string): Promise<Trait[]> {
    const res = await query<Trait>(
      "select id, guild_id as \"guildId\", name, emoji, system_defined as \"systemDefined\" from traits where guild_id=$1 order by name",
      [guildId]
    );
    return res.rows;
  }

  async getByName(guildId: string, name: string): Promise<Trait | null> {
    const res = await query<Trait>(
      "select id, guild_id as \"guildId\", name, emoji, system_defined as \"systemDefined\" from traits where guild_id=$1 and lower(name)=lower($2)",
      [guildId, name]
    );
    return res.rows[0] ?? null;
  }

  async create(guildId: string, name: string, emoji: string, systemDefined: boolean): Promise<Trait> {
    const res = await query<Trait>(
      "insert into traits(guild_id,name,emoji,system_defined) values($1,$2,$3,$4) returning id, guild_id as \"guildId\", name, emoji, system_defined as \"systemDefined\"",
      [guildId, name, emoji, systemDefined]
    );
    return res.rows[0];
  }

  async delete(guildId: string, name: string): Promise<boolean> {
    const res = await query<{ count: string }>("delete from traits where guild_id=$1 and lower(name)=lower($2) returning '1' as count", [guildId, name]);
    return res.rows.length > 0;
  }
}
