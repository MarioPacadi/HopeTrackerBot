create table if not exists values_messages (
  id bigserial primary key,
  guild_id text not null,
  channel_id text not null,
  message_id text not null,
  discord_user_id text not null,
  creator_user_id text not null,
  command_name text not null,
  command_params jsonb,
  content text not null,
  created_at timestamp not null default now()
);

create unique index if not exists values_messages_channel_message_unique on values_messages(channel_id, message_id);
create index if not exists values_messages_user_created_at_idx on values_messages(guild_id, discord_user_id, created_at desc);
create index if not exists values_messages_guild_created_at_idx on values_messages(guild_id, created_at desc);

