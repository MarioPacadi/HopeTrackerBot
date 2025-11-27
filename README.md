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
- `!unregister` — Unregister yourself.
- `!values` — Show your trait values.
- `!showvalues` — Show table members and their values.
- `!addusertable @User` — Admin only. Add a user to the values table.
- `!removeusertable @User` — Admin only. Remove a user from the values table.
- `!createtype <name> <emoji>` — Admin only. Create a new trait type.
- `!deletetype <name>` — Admin only. Delete an existing trait type.
- `!gain <amount> <trait>` — Increase your trait value.
- `!clear <amount> <trait>` — Increase your trait value (same behavior as `gain`).
- `!spend <amount> <trait>` — Decrease your trait value.
- `!mark <amount> <trait>` — Decrease your trait value (same behavior as `spend`).

Slash commands:
- `/register [user]` — Registers self; with `user`, requires Admin or Game Master.
- `/unregister [user]` — Unregisters self; with `user`, requires Admin or Game Master.
- `/values` — Shows your values using multi-row format with your name in first column.
- `/showvalues` — Shows table members; each row begins with the user’s name.
- `/update_trait trait:<name> amount:<int> [user]` — Updates a trait; with `user`, requires Admin or Game Master.

Permission notes:
- Admin is `Manage Server` or `Administrator` permission.
- Game Master is a role named exactly `Game Master`.

Audit logging:
- All registration and trait updates are logged to `audit_logs` with executor, target, action, trait, amount, and timestamp.

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
## Shared Command Registry

This project centralizes Discord command definitions in `src/command-registry.ts` to eliminate duplication and ensure parity across the slash command registration (`src/index.ts`) and text command handlers (`src/commands.ts`).

- All commands are defined once as specs and transformed into slash builders for registration.
- Text handlers validate parity against the shared registry at runtime and log discrepancies.
- Unit tests (`src/tests/command-parity.test.ts`) verify command parity and backward compatibility.

Key exports:
- `buildSlashCommands()` returns the canonical list of slash builders.
- `getSharedCommandNames()` lists commands expected to exist in both slash and text handlers.
- `validateTextParity(names)` reports missing or extra text handlers compared to the shared set.

Benefits:
- DRY command definitions
- Consistent names, options, and permissions
- Easier maintenance and testing
- Unit tests (`src/tests/command-parity.test.ts`) verify command parity and backward compatibility.
  - New command: `setUserEmoji` (slash) and `!setuseremoji` (text)
    - Slash: `/setUserEmoji emoji:<char> position:<1|2> [user]`
    - Text: `!setuseremoji <1|2> <emoji> [@user]`
    - Admin required to set for another user; users can set their own.
    - Validates single emoji; stores in persistent `users.emoji1/emoji2`.
## Command Architecture

Files:
- `src/command-registry.ts` — Central specs and builders for slash commands.
- `src/commands/utils.ts` — Shared helpers: DI services, amount parsing, admin checks.
- `src/commands/text-router.ts` — Text command router and entry point `handleMessage(...)`.
- `src/commands/slash-router.ts` — Slash command router and entry point `handleSlashInteraction(...)`.
- `src/commands.ts` — Barrel that re-exports the two entry points to preserve imports.

Tests:
- `src/tests/router-exports.test.ts` — Ensures command entry points remain exported.
- Existing tests continue to run unchanged.

Usage:
- Index wires Discord events and calls `handleMessage` and `handleSlashInteraction`.
- Registry drives slash command definitions; parity checks validate text handlers.
