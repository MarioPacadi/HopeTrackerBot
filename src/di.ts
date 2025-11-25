import { GuildRepository } from "./repositories/guild.repository.js";
import { UserRepository } from "./repositories/user.repository.js";
import { TraitRepository } from "./repositories/trait.repository.js";
import { UserValueRepository } from "./repositories/user-value.repository.js";
import { TableRepository } from "./repositories/table.repository.js";
import { DefaultTraitsService } from "./services/default-traits.service.js";
import { UserService } from "./services/user.service.js";
import { TraitService } from "./services/trait.service.js";
import { TableService } from "./services/table.service.js";

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
