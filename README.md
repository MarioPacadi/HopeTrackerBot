# Hope Tracker Bot

Discord bot for Daggerheart-style trait tracking. Written in Node.js + TypeScript and deployed as a Render Web Service.

## Features
- Registers users and tracks trait values per guild.
- Default traits per guild: Hope 🪙, Fear 🔴, Health ❤️, Armor 🛡️, Stress 🧠.
- Admin-only trait management and table membership helpers.
- HTTP health endpoint at `/healthz` that checks database connectivity.

## Prerequisites
- Discord application and bot token with Message Content intent enabled.
- PostgreSQL database reachable from the bot.

## Environment Variables
- `DISCORD_TOKEN` (required): Discord bot token.
- `DATABASE_URL` (required): Postgres connection string.
- `COMMAND_PREFIX` (optional): Command prefix. Defaults to `!`.
- `PORT` (web service only): Injected by Render; used for health server.

## Local Development
1. Create `.env` with required variables:
   ```
   DISCORD_TOKEN=your-token
   DATABASE_URL=postgresql://user:pass@host:port/db
   COMMAND_PREFIX=!
   ```
2. Install and build:
   ```
   npm install
   npm run build
   npm start
   ```
3. Run migrations to create tables:
   ```
   npm run migrate
   ```

Notes:
- The health server listens on `PORT` or `8080` by default.
- If avatar setting fails at startup, it’s ignored. To enable, copy `src/assets/Hope.png` to `dist/assets/Hope.png` (512×512 PNG, <8MB).

## Deployment (Render Web Service)
This repository includes a multi-stage `Dockerfile` and is suited for Render’s Docker runtime.

- Build happens in a builder stage (installs dev deps, runs TypeScript compile).
- Runtime image installs only production deps and runs `node dist/index.js`.

Render configuration:
- Service type: Web Service (Docker).
- Environment variables: set `DISCORD_TOKEN`, `DATABASE_URL`, optional `COMMAND_PREFIX`.
- Health check: `GET /healthz` (expects `200 ok` when DB is reachable).

Database migrations:
- Option 1: Run locally against the Render Postgres using `npm run migrate` with `DATABASE_URL` set to Render’s URL.
- Option 2: Use a one-off job or temporary service to run `npm run migrate` in the same image.

## Inviting the Bot to Discord
1. Discord Developer Portal → Applications → your app.
2. Bot → Add Bot, copy token, enable Message Content intent.
3. OAuth2 → URL Generator → Scopes: `bot`; Permissions: `View Channels`, `Read Message History`, `Send Messages` (add more as needed).
4. Open the generated URL, select your server, authorize.

## Commands
Prefix is configurable via `COMMAND_PREFIX` (defaults to `!`). Examples below use `!`.

- `!register` — Register yourself and initialize trait values.
- `!unregister` — Unregister yourself (removes your user and values).
- `!values` — Show your current trait values.
- `!showvalues` — Show table members and their values.
- `!addusertable @User` — Admin only. Add a user to the values table.
- `!removeusertable @User` — Admin only. Remove a user from the values table.
- `!createtype <name> <emoji>` — Admin only. Create a new trait type.
- `!deletetype <name>` — Admin only. Delete an existing trait type.
- `!gain <amount> <trait>` — Increase your trait value.
- `!clear <amount> <trait>` — Increase your trait value (same behavior as `gain`).
- `!spend <amount> <trait>` — Decrease your trait value.
- `!mark <amount> <trait>` — Decrease your trait value (same behavior as `spend`).

Admin permissions:
- Command checks require the user to have `Manage Server` or `Administrator` in the guild.

## Health Endpoint
- `GET /healthz` returns `200 ok` if the database is reachable, `500 db error` otherwise.

## Troubleshooting
- Bot not responding:
  - Ensure the Message Content intent is enabled in the Developer Portal.
  - Verify bot has `View Channels`, `Send Messages`, and `Read Message History` in the channel.
  - Confirm your command prefix matches `COMMAND_PREFIX`.
- Missing environment variables:
  - The app exits if `DISCORD_TOKEN` or `DATABASE_URL` are unset.
- Render deploy issues:
  - Check deploy logs for errors. Common causes include missing env vars, invalid commands, or version mismatches.
  - Ensure your Node version matches expectations; Dockerfile pins `node:20-alpine`.
  - If you switch module systems, align `package.json` and `tsconfig.json` accordingly.

## Security
- Do not commit secrets. Keep `DISCORD_TOKEN` and database credentials in environment variables (Render dashboard).
- Avoid echoing tokens in logs or responses.

