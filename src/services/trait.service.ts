import { TraitRepository } from "../repositories/trait.repository.js";
import { Trait } from "../models.js";

export class TraitService {
  private repo: TraitRepository;
  constructor(repo: TraitRepository) {
    this.repo = repo;
  }
  async create(guildId: string, name: string, emoji: string): Promise<Trait> {
    return this.repo.create(guildId, name, emoji, false);
  }
  async delete(guildId: string, name: string): Promise<boolean> {
    return this.repo.delete(guildId, name);
  }
  async get(guildId: string, name: string): Promise<Trait | null> {
    return this.repo.getByName(guildId, name);
  }
  async list(guildId: string): Promise<Trait[]> {
    return this.repo.list(guildId);
  }
}
