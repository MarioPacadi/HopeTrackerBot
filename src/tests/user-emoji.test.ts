import { ensureSchema } from "../db.js";
import { getContainer, resetContainer } from "../di.js";

function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

async function run(): Promise<void> {
  await ensureSchema();
  resetContainer();
  const { defaults, userService, users } = getContainer();
  const guildId = "emoji-guild";
  const discordUserId = `u-emoji-${Date.now()}`;
  await defaults.ensureDefaults(guildId);
  await userService.register(discordUserId, guildId);
  let u = await users.getByDiscordId(discordUserId, guildId);
  assert(!!u, "user missing");
  console.log("Initial user", u);
  assert(u!.emoji1 == null && u!.emoji2 == null, "initial emojis not null");
  // add to empty positions
  await userService.addUserEmoji(discordUserId, guildId, "🙂", 1);
  await userService.addUserEmoji(discordUserId, guildId, "🐱", 2);
  u = await users.getByDiscordId(discordUserId, guildId);
  assert(u!.emoji1 === "🙂" && u!.emoji2 === "🐱", "add to empty failed");
  // replace existing
  await userService.addUserEmoji(discordUserId, guildId, "😀", 1);
  await userService.addUserEmoji(discordUserId, guildId, "🐶", 2);
  u = await users.getByDiscordId(discordUserId, guildId);
  assert(u!.emoji1 === "😀" && u!.emoji2 === "🐶", "replace failed");
  // remove emojis
  await userService.addUserEmoji(discordUserId, guildId, null, 1);
  await userService.addUserEmoji(discordUserId, guildId, null, 2);
  u = await users.getByDiscordId(discordUserId, guildId);
  assert(u!.emoji1 == null && u!.emoji2 == null, "remove failed");
  // invalid emoji input
  let invalid = false;
  try { await userService.addUserEmoji(discordUserId, guildId, "abc", 1); } catch { invalid = true; }
  assert(invalid, "invalid emoji not rejected");
  // persistence across sessions
  await userService.addUserEmoji(discordUserId, guildId, "🙂", 1);
  resetContainer();
  const u2 = await getContainer().users.getByDiscordId(discordUserId, guildId);
  assert(u2?.emoji1 === "🙂", "persistence failed");
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
