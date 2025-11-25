import { TableRepository } from "../repositories/table.repository.js";
import { UserRepository } from "../repositories/user.repository.js";
import { UserValueRepository } from "../repositories/user-value.repository.js";
import { TraitRepository } from "../repositories/trait.repository.js";
import { Trait } from "../models.js";

export class TableService {
  private tables: TableRepository;
  private users: UserRepository;
  private values: UserValueRepository;
  private traits: TraitRepository;
  constructor(tables: TableRepository, users: UserRepository, values: UserValueRepository, traits: TraitRepository) {
    this.tables = tables;
    this.users = users;
    this.values = values;
    this.traits = traits;
  }
  async add(discordUserId: string, guildId: string): Promise<void> {
    const user = await this.users.findOrCreate(discordUserId, guildId);
    await this.tables.add(user.id);
  }
  async remove(discordUserId: string, guildId: string): Promise<void> {
    const user = await this.users.findOrCreate(discordUserId, guildId);
    await this.tables.remove(user.id);
  }
  async table(guildId: string): Promise<Array<{ discordUserId: string; values: Array<{ emoji: string; name: string; amount: number }> }>> {
    const members = await this.tables.list(guildId);
    const traits = await this.traits.list(guildId);
    const typeMap = new Map<number, Trait>();
    for (const t of traits) typeMap.set(t.id, t);
    const rows: Array<{ discordUserId: string; values: Array<{ emoji: string; name: string; amount: number }> }> = [];
    for (const m of members) {
      const values = await this.values.listForUser(m.id);
      const display: Array<{ emoji: string; name: string; amount: number }> = [];
      for (const v of values) {
        const t = typeMap.get(v.traitId);
        if (t) display.push({ emoji: t.emoji, name: t.name, amount: v.amount });
      }
      rows.push({ discordUserId: m.discordUserId, values: display });
    }
    return rows;
  }
}
