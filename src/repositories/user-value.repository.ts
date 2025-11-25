import { query } from "../db.js";
import { UserValue } from "../models.js";

export class UserValueRepository {
  async get(userId: number, traitId: number): Promise<UserValue | null> {
    const res = await query<UserValue>(
      "select user_id as \"userId\", trait_id as \"traitId\", amount from user_values where user_id=$1 and trait_id=$2",
      [userId, traitId]
    );
    return res.rows[0] ?? null;
  }

  async set(userId: number, traitId: number, amount: number): Promise<UserValue> {
    const res = await query<UserValue>(
      "insert into user_values(user_id,trait_id,amount) values($1,$2,$3) on conflict(user_id,trait_id) do update set amount=excluded.amount returning user_id as \"userId\", trait_id as \"traitId\", amount",
      [userId, traitId, amount]
    );
    return res.rows[0];
  }

  async modify(userId: number, traitId: number, delta: number): Promise<UserValue> {
    const res = await query<UserValue>(
      "insert into user_values(user_id,trait_id,amount) values($1,$2,$3) on conflict(user_id,trait_id) do update set amount=user_values.amount+excluded.amount returning user_id as \"userId\", trait_id as \"traitId\", amount",
      [userId, traitId, delta]
    );
    return res.rows[0];
  }

  async listForUser(userId: number): Promise<UserValue[]> {
    const res = await query<UserValue>(
      "select user_id as \"userId\", trait_id as \"traitId\", amount from user_values where user_id=$1",
      [userId]
    );
    return res.rows;
  }
}
