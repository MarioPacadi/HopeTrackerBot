export interface Trait {
  id: number;
  guildId: string;
  name: string;
  emoji: string;
  systemDefined: boolean;
}

export interface User {
  id: number;
  discordUserId: string;
  guildId: string;
  emoji1?: string | null;
  emoji2?: string | null;
}

export interface UserValue {
  userId: number;
  traitId: number;
  amount: number;
}

export class TraitEntity implements Trait {
  id: number;
  guildId: string;
  name: string;
  emoji: string;
  systemDefined: boolean;
  constructor(id: number, guildId: string, name: string, emoji: string, systemDefined: boolean) {
    this.id = id;
    this.guildId = guildId;
    this.name = name;
    this.emoji = emoji;
    this.systemDefined = systemDefined;
  }
}

export class UserEntity implements User {
  id: number;
  discordUserId: string;
  guildId: string;
  emoji1?: string | null;
  emoji2?: string | null;
  constructor(id: number, discordUserId: string, guildId: string, emoji1?: string | null, emoji2?: string | null) {
    this.id = id;
    this.discordUserId = discordUserId;
    this.guildId = guildId;
    this.emoji1 = emoji1 ?? null;
    this.emoji2 = emoji2 ?? null;
  }
}

export class UserValueEntity implements UserValue {
  userId: number;
  traitId: number;
  amount: number;
  constructor(userId: number, traitId: number, amount: number) {
    this.userId = userId;
    this.traitId = traitId;
    this.amount = amount;
  }
}
