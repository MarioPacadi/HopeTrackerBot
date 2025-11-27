create table if not exists last_table_messages (
  guild_id text primary key,
  channel_id text not null,
  message_id text not null,
  user_ids jsonb not null,
  updated_at timestamptz not null default now()
);
