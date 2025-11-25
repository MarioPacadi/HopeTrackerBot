import { TraitRepository } from "../repositories/trait.repository";
import { GuildRepository } from "../repositories/guild.repository";

export class DefaultTraitsService {
  private traits: TraitRepository;
  private guilds: GuildRepository;
  constructor(traits: TraitRepository, guilds: GuildRepository) {
    this.traits = traits;
    this.guilds = guilds;
  }
  async ensureDefaults(guildId: string): Promise<void> {
    await this.guilds.ensureGuild(guildId);
    const existing = await this.traits.list(guildId);
    if (existing.length > 0) return;
    const defaults: ReadonlyArray<{ name: string; emoji: string }> = [
      { name: "Hope", emoji: "🪙" },
      { name: "Fear", emoji: "🔴" },
      { name: "Health", emoji: "❤️" },
      { name: "Armor", emoji: "🛡️" },
      { name: "Stress", emoji: "🧠" }
    ];
    for (const d of defaults) {
      await this.traits.create(guildId, d.name, d.emoji, true);
    }
  }
}