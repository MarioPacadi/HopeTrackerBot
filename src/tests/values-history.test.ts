import { ensureSchema } from "../db.js";
import { getContainer, resetContainer } from "../di.js";

function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

async function run(): Promise<void> {
  await ensureSchema();
  resetContainer();
  const c = getContainer();
  const guildId = "vh-guild";
  const userId = `u-${Date.now()}`;
  const creatorId = `c-${Date.now()}`;
  const channelId = `ch-${Date.now()}`;
  const messageId = `m-${Date.now()}`;
  const content = "**User** (<@u>)\n- ❤️ HP: 10";
  await c.valuesMessages.add({ guildId, channelId, messageId, discordUserId: userId, creatorUserId: creatorId, commandName: "values", commandParams: { }, content, createdAt: new Date() });
  const list = await c.valuesMessages.listByUser(guildId, userId, 10);
  assert(list.length >= 1, "listByUser empty");
  assert(list[0].content.includes("HP"), "content mismatch");
  // cleanup
  const deleted = await c.valuesMessages.cleanup(0);
  assert(deleted >= 0, "cleanup did not run");
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
