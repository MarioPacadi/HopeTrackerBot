-- 0001_init.sql
-- Initial schema for hope-tracker-bot
-- Defines guilds, users, traits, user_values, and table_members

create table if not exists guilds(
  id text primary key
);

create table if not exists users(
  id serial primary key,
  discord_user_id text not null,
  guild_id text not null references guilds(id) on delete cascade,
  unique(discord_user_id, guild_id)
);

create table if not exists traits(
  id serial primary key,
  guild_id text not null references guilds(id) on delete cascade,
  name text not null,
  emoji text not null,
  system_defined boolean not null default false,
  unique(guild_id, name)
);

create table if not exists user_values(
  user_id integer not null references users(id) on delete cascade,
  trait_id integer not null references traits(id) on delete cascade,
  amount integer not null default 0,
  primary key(user_id, trait_id)
);

create table if not exists table_members(
  user_id integer primary key references users(id) on delete cascade
);