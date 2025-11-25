import { GuildRepository } from "./repositories/guild.repository";
import { UserRepository } from "./repositories/user.repository";
import { TraitRepository } from "./repositories/trait.repository";
import { UserValueRepository } from "./repositories/user-value.repository";
import { TableRepository } from "./repositories/table.repository";
import { DefaultTraitsService } from "./services/default-traits.service";
import { UserService } from "./services/user.service";
import { TraitService } from "./services/trait.service";
import { TableService } from "./services/table.service";

class Container {
  readonly guilds = new GuildRepository();
  readonly users = new UserRepository();
  readonly traits = new TraitRepository();
  readonly userValues = new UserValueRepository();
  readonly tables = new TableRepository();

  readonly defaults = new DefaultTraitsService(this.traits, this.guilds);
  readonly userService = new UserService(this.users, this.userValues, this.traits);
  readonly traitService = new TraitService(this.traits);
  readonly tableService = new TableService(this.tables, this.users, this.userValues, this.traits);
}

let container: Container | null = null;

export function getContainer(): Container {
  if (!container) container = new Container();
  return container;
}

export function resetContainer(): void {
  container = null;
}