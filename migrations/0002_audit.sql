create table if not exists audit_logs (
  id serial primary key,
  guild_id text not null,
  executor_user_id text not null,
  target_user_id text not null,
  action text not null,
  trait_name text,
  amount integer,
  created_at timestamptz not null default now()
);
