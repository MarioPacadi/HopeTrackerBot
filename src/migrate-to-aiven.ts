import { Pool } from "pg";
import dotenv from "dotenv";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
/**
 * Aiven Migration Module
 *
 * Location: src/migrate-to-aiven.ts
 * Purpose: Copies data from a source Postgres to the Aiven Postgres target.
 * Default Behavior: Inactive on import. It only runs when executed directly.
 * How to run: Build, then run `npm run migrate:aiven`.
 * Reactivation notes: This module guards execution by checking the current process
 * entrypoint filename; importing it from application code will not trigger the migration.
 */

function makePool(url: string, sslRequired: boolean, caPath?: string): Pool {
  const u = new URL(url);
  const database = (u.pathname || "/").slice(1) || "postgres";
  const useCa = !!caPath && existsSync(caPath);
  const ssl = sslRequired
    ? (useCa
        ? { ca: readFileSync(caPath!), rejectUnauthorized: true }
        : { rejectUnauthorized: false, checkServerIdentity: () => undefined })
    : undefined;
  return new Pool({
    host: u.hostname,
    port: u.port ? Number(u.port) : undefined,
    database,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl
  });
}

async function runSql(pool: Pool, sql: string): Promise<void> {
  const client = await pool.connect();
  try { await client.query(sql); } finally { client.release(); }
}

async function ensureTargetSchema(target: Pool): Promise<void> {
  const base = dirname(fileURLToPath(import.meta.url));
  const files = ["../migrations/0001_init.sql","../migrations/0002_audit.sql","../migrations/0003_last_table_messages.sql","../migrations/0004_user_emojis.sql","../migrations/0005_values_messages.sql"];
  const client = await target.connect();
  try {
    await client.query("begin");
    for (const f of files) {
      const sql = readFileSync(resolve(base, f), "utf8");
      await client.query(sql);
    }
    await client.query("commit");
  } catch (err) {
    try { await client.query("rollback"); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

async function copyData(source: Pool, target: Pool): Promise<void> {
  const s = await source.connect();
  const t = await target.connect();
  try {
    await t.query("begin");
    const guilds = await s.query<{ id: string }>("select id from guilds", []);
    for (const g of guilds.rows) {
      await t.query("insert into guilds(id) values($1) on conflict do nothing", [g.id]);
    }

    const traits = await s.query<{ guildId: string; name: string; emoji: string; systemDefined: boolean }>(
      "select guild_id as \"guildId\", name, emoji, system_defined as \"systemDefined\" from traits",
      []
    );
    for (const tr of traits.rows) {
      await t.query("insert into traits(guild_id,name,emoji,system_defined) values($1,$2,$3,$4) on conflict do nothing", [tr.guildId, tr.name, tr.emoji, tr.systemDefined]);
    }

    const users = await s.query<{ discordUserId: string; guildId: string }>(
      "select discord_user_id as \"discordUserId\", guild_id as \"guildId\" from users",
      []
    );
    for (const u of users.rows) {
      await t.query("insert into users(discord_user_id,guild_id) values($1,$2) on conflict do nothing", [u.discordUserId, u.guildId]);
    }

    const values = await s.query<{ userId: number; traitId: number; amount: number }>(
      "select user_id as \"userId\", trait_id as \"traitId\", amount from user_values",
      []
    );
    for (const v of values.rows) {
      const su = await s.query<{ discordUserId: string; guildId: string }>("select discord_user_id as \"discordUserId\", guild_id as \"guildId\" from users where id=$1", [v.userId]);
      const st = await s.query<{ guildId: string; name: string }>("select guild_id as \"guildId\", name from traits where id=$1", [v.traitId]);
      const userKey = su.rows[0];
      const traitKey = st.rows[0];
      if (!userKey || !traitKey) continue;
      const tu = await t.query<{ id: number }>("select id from users where discord_user_id=$1 and guild_id=$2", [userKey.discordUserId, userKey.guildId]);
      const tt = await t.query<{ id: number }>("select id from traits where guild_id=$1 and lower(name)=lower($2)", [traitKey.guildId, traitKey.name]);
      const newUserId = tu.rows[0]?.id;
      const newTraitId = tt.rows[0]?.id;
      if (!newUserId || !newTraitId) continue;
      await t.query("insert into user_values(user_id,trait_id,amount) values($1,$2,$3) on conflict(user_id,trait_id) do update set amount=excluded.amount", [newUserId, newTraitId, v.amount]);
    }

    const members = await s.query<{ userId: number }>("select user_id as \"userId\" from table_members", []);
    for (const m of members.rows) {
      const su = await s.query<{ discordUserId: string; guildId: string }>("select discord_user_id as \"discordUserId\", guild_id as \"guildId\" from users where id=$1", [m.userId]);
      const userKey = su.rows[0];
      if (!userKey) continue;
      const tu = await t.query<{ id: number }>("select id from users where discord_user_id=$1 and guild_id=$2", [userKey.discordUserId, userKey.guildId]);
      const newUserId = tu.rows[0]?.id;
      if (!newUserId) continue;
      await t.query("insert into table_members(user_id) values($1) on conflict do nothing", [newUserId]);
    }

    const audits = await s.query<{ guildId: string; executorUserId: string; targetUserId: string; action: string; traitName: string | null; amount: number | null }>(
      "select guild_id as \"guildId\", executor_user_id as \"executorUserId\", target_user_id as \"targetUserId\", action, trait_name as \"traitName\", amount from audit_logs",
      []
    );
    for (const a of audits.rows) {
      await t.query("insert into audit_logs(guild_id, executor_user_id, target_user_id, action, trait_name, amount) values($1,$2,$3,$4,$5,$6)", [a.guildId, a.executorUserId, a.targetUserId, a.action, a.traitName, a.amount]);
    }

    const last = await s.query<{ guildId: string; channelId: string; messageId: string; userIds: string }>(
      "select guild_id as \"guildId\", channel_id as \"channelId\", message_id as \"messageId\", user_ids::text as \"userIds\" from last_table_messages",
      []
    );
    for (const r of last.rows) {
      await t.query("insert into last_table_messages(guild_id, channel_id, message_id, user_ids) values($1,$2,$3,$4) on conflict(guild_id) do update set channel_id=excluded.channel_id, message_id=excluded.message_id, user_ids=excluded.user_ids, updated_at=now()", [r.guildId, r.channelId, r.messageId, r.userIds]);
    }

    const vmsgs = await s.query<{ guildId: string; channelId: string; messageId: string; discordUserId: string; creatorUserId: string; commandName: string; commandParams: unknown; content: string; createdAt: Date }>(
      "select guild_id as \"guildId\", channel_id as \"channelId\", message_id as \"messageId\", discord_user_id as \"discordUserId\", creator_user_id as \"creatorUserId\", command_name as \"commandName\", command_params as \"commandParams\", content, created_at as \"createdAt\" from values_messages",
      []
    );
    for (const vm of vmsgs.rows) {
      await t.query("insert into values_messages(guild_id, channel_id, message_id, discord_user_id, creator_user_id, command_name, command_params, content, created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(channel_id,message_id) do nothing", [vm.guildId, vm.channelId, vm.messageId, vm.discordUserId, vm.creatorUserId, vm.commandName, vm.commandParams, vm.content, vm.createdAt]);
    }

    await t.query("commit");
  } catch (err) {
    try { await t.query("rollback"); } catch {}
    throw err;
  } finally {
    s.release();
    t.release();
  }
}

export async function main(): Promise<void> {
  const sourceUrl = process.env.SOURCE_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
  const targetUrl = process.env.TARGET_DATABASE_URL ?? "";
  const rawSsl = (process.env.TARGET_DB_SSL ?? "true").toString().trim().toLowerCase();
  const targetSsl = rawSsl === "true" || rawSsl === "1" || rawSsl === "yes";
  const targetCa = process.env.TARGET_DB_SSL_CA_FILE;
  if (!sourceUrl || !targetUrl) throw new Error("missing source/target url");
  const sourceHost = new URL(sourceUrl).hostname;
  const sourceIsCloud = sourceHost !== "localhost" && sourceHost !== "127.0.0.1";
  const source = makePool(sourceUrl, sourceIsCloud);
  const target = makePool(targetUrl, targetSsl, targetCa);
  await ensureTargetSchema(target);
  await copyData(source, target);
  await source.end();
  await target.end();
  process.exit(0);
}

dotenv.config();
// Run only when executed directly as the entrypoint script
const entry = process.argv[1] ?? "";
if (entry.includes("migrate-to-aiven")) {
  main().catch(err => { console.error("aiven migrate error", err); process.exit(1); });
}
