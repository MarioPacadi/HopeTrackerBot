import { ensureSchema } from "../db.js";
import { getContainer, resetContainer } from "../di.js";

function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

async function run(): Promise<void> {
  await ensureSchema();
  resetContainer();
  const { defaults, userService } = getContainer();
  const guildId = "test-guild";
  const userId = "u1";
  await defaults.ensureDefaults(guildId);
  await userService.register(userId, guildId);
  const setRes = await userService.setExact(userId, guildId, "Fear", 5);
  assert(!!setRes && setRes.amount === 5 && setRes.name.toLowerCase() === "fear", "setExact failed");
  const removed = await userService.removeTraitValue(userId, guildId, "Fear");
  assert(removed, "removeTraitValue failed");
  const vals = await userService.read(userId, guildId);
  const names = new Set(vals.map(v => v.name.toLowerCase()));
  assert(!names.has("fear"), "fear still present");
  assert(names.has("hope") && names.has("health"), "other traits missing");
  process.exit(0);
}

run().catch(() => process.exit(1));
