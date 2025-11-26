import { query } from "../db.js";

export class AuditRepository {
  async log(guildId: string, executorUserId: string, targetUserId: string, action: string, traitName?: string, amount?: number): Promise<void> {
    await query<unknown>(
      "insert into audit_logs(guild_id, executor_user_id, target_user_id, action, trait_name, amount) values($1,$2,$3,$4,$5,$6)",
      [guildId, executorUserId, targetUserId, action, traitName ?? null, amount ?? null]
    );
  }
}
