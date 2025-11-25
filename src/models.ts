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
  constructor(id: number, discordUserId: string, guildId: string) {
    this.id = id;
    this.discordUserId = discordUserId;
    this.guildId = guildId;
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