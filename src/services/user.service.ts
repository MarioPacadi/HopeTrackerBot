import { UserRepository } from "../repositories/user.repository.js";
import { UserValueRepository } from "../repositories/user-value.repository.js";
import { TraitRepository } from "../repositories/trait.repository.js";
import { Trait } from "../models.js";
import { query } from "../db.js";

export class UserService {
  private users: UserRepository;
  private values: UserValueRepository;
  private traits: TraitRepository;
  constructor(users: UserRepository, values: UserValueRepository, traits: TraitRepository) {
    this.users = users;
    this.values = values;
    this.traits = traits;
  }
  async register(discordUserId: string, guildId: string): Promise<void> {
    const user = await this.users.findOrCreate(discordUserId, guildId);
    const traits = await this.traits.list(guildId);
    for (const t of traits) {
      await this.values.set(user.id, t.id, 0);
    }
  }
  async unregister(discordUserId: string, guildId: string): Promise<boolean> {
    const user = await this.users.getByDiscordId(discordUserId, guildId);
    if (!user) return false;
    await query<unknown>("delete from users where id=$1", [user.id]);
    return true;
  }
  async modify(discordUserId: string, guildId: string, amount: number, traitName: string): Promise<{ emoji: string; name: string; amount: number } | null> {
    const user = await this.users.findOrCreate(discordUserId, guildId);
    const trait = await this.traits.getByName(guildId, traitName);
    if (!trait) return null;
    const uv = await this.values.modify(user.id, trait.id, amount);
    return { emoji: trait.emoji, name: trait.name, amount: uv.amount };
  }
  async setExact(discordUserId: string, guildId: string, traitName: string, amount: number): Promise<{ emoji: string; name: string; amount: number } | null> {
    const user = await this.users.findOrCreate(discordUserId, guildId);
    const trait = await this.traits.getByName(guildId, traitName);
    if (!trait) return null;
    const uv = await this.values.set(user.id, trait.id, amount);
    return { emoji: trait.emoji, name: trait.name, amount: uv.amount };
  }
  async removeTraitValue(discordUserId: string, guildId: string, traitName: string): Promise<boolean> {
    const user = await this.users.getByDiscordId(discordUserId, guildId);
    if (!user) return false;
    const trait = await this.traits.getByName(guildId, traitName);
    if (!trait) return false;
    return this.values.delete(user.id, trait.id);
  }
  async read(discordUserId: string, guildId: string): Promise<Array<{ emoji: string; name: string; amount: number }>> {
    const user = await this.users.findOrCreate(discordUserId, guildId);
    const values = await this.values.listForUser(user.id);
    const traits = await this.traits.list(guildId);
    const map = new Map<number, Trait>();
    for (const t of traits) map.set(t.id, t);
    const res: Array<{ emoji: string; name: string; amount: number }> = [];
    for (const v of values) {
      const t = map.get(v.traitId);
      if (t) res.push({ emoji: t.emoji, name: t.name, amount: v.amount });
    }
    return res;
  }
}
