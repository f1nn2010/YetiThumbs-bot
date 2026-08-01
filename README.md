# YetiThumbs Discord Bot

Dedicated Discord bot for YetiThumbs. It intentionally runs only the three product commands requested for the YetiThumbs server:

- `/setup-tickets` posts the Support / Buy with Robux panel.
- `/grant-credits email amount` atomically adds credits to a website account.
- `/grant-premium email months` grants the Developer plan with a persisted expiry.

The bot creates private sequential `ticket-1`, `ticket-2`, … channels, prevents duplicate open tickets, gives access to the customer and configured staff roles, collects the customer's YetiThumbs email and Roblox username, and provides a staff-only close button.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in Discord and Supabase values.
3. Deploy `YetiThumbs/supabase/migrations/20260801023000_add_manual_entitlements.sql` to the website's Supabase project.
4. Run:

```powershell
npm ci
npm test
npm run preflight
npm start
```

The preflight is read-only: it validates the bot token, application ID, guild membership, configured staff roles, Supabase service credentials, and entitlement schema without registering commands or opening a Discord gateway connection.

## Required Discord setup

- Bot scopes: `bot`, `applications.commands`.
- Bot permissions: View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Manage Channels.
- No privileged Message Content or Guild Members intent is required.
- Set `GUILD_ID` for immediate command registration. On startup, the bot replaces that guild's command list with exactly the three YetiThumbs commands and clears stale global TitanBot commands.

## Railway / Docker

The process exposes:

- `GET /health` — process is alive.
- `GET /ready` — Discord login, command registration, and Supabase validation succeeded.

Set Railway's health check to `/ready`. The bot does not require PostgreSQL, Redis, Lavalink, TitanBot, or a separate web service.

## Robux links

Add the six `ROBUX_LINK_*` values when the Roblox game passes exist. Until then, tickets remain usable and tell customers that staff will provide the purchase link manually.
