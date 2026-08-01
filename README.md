# YetiThumbs Discord Bot

Production Discord bot for YetiThumbs support, Robux purchases, and account grants.
It deliberately exposes exactly three guild commands:

- `/setup-tickets` posts the Support / Buy with Robux ticket panel.
- `/grant-credits email amount` atomically adds credits to a YetiThumbs account.
- `/grant-premium email months` grants the Developer plan with a persisted expiry.

The bot creates sequential private ticket channels, prevents duplicate tickets,
restricts account grants and channel closing to staff, and stores operational
errors in Supabase.

## Safest setup path

1. Install Node.js 22.
2. Copy `.env.example` to `.env`.
3. Fill every required value listed below.
4. Apply all migrations from the website repository's `supabase/migrations/`
   directory to the production Supabase project.
5. Run the local verification and read-only live checks:

```powershell
npm ci
npm run verify
npm run doctor
```

6. Start the bot with `npm start`, or push `main` and let Railway deploy it.

`npm run doctor` never registers commands or opens a Discord gateway connection.
It validates credentials, the guild, staff roles, bot permissions, the optional
ticket category, the current Discord command set, and the Supabase entitlement
schema.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DISCORD_TOKEN` | Yes | Discord bot token. Keep secret. |
| `CLIENT_ID` | Yes | Discord application ID. |
| `GUILD_ID` | Yes | The one guild where the three commands are registered. |
| `DISCORD_STAFF_ROLE_IDS` | Recommended | Comma-separated staff role IDs. |
| `OWNER_IDS` | Optional | Comma-separated user IDs that should count as staff. |
| `DISCORD_TICKET_CATEGORY_ID` | Recommended | Category for new private tickets. |
| `SUPABASE_URL` | Yes | YetiThumbs Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only Supabase service credential. Keep secret. |
| `ROBUX_LINK_*` | Optional | Six HTTPS Roblox game-pass links from `.env.example`. |
| `PORT` | Railway sets it | Health server port; defaults to `3000`. |

Invalid Discord IDs and non-HTTPS/non-Roblox purchase links stop startup before
the bot can publish a broken or unsafe workflow.

## Discord application permissions

- OAuth scopes: `bot`, `applications.commands`.
- Permissions: View Channels, Send Messages, Embed Links, Attach Files, Read
  Message History, and Manage Channels.
- Privileged Message Content and Guild Members intents are not required.

On startup, the bot replaces the configured guild's application-command list
with exactly the three YetiThumbs commands and clears stale global commands.

## Health and deployment

- `GET /health` means the process is alive.
- `GET /ready` returns HTTP 200 only after Discord login, command registration,
  and Supabase validation succeed.

`railway.json` selects the Dockerfile, uses `/ready` as the deployment health
check, and enables restart-on-failure. Railway can keep the service private;
Discord gateway traffic is outbound, so a public domain is unnecessary.

For deployment checks, recovery steps, and common errors, see [RUNBOOK.md](RUNBOOK.md).

## Robux links

Tickets remain usable before the six game-pass URLs exist. When a link is unset,
the selected package tells the customer that staff will provide the correct link
inside the private ticket. Add the links as Railway variables later; never paste
them into source code.
