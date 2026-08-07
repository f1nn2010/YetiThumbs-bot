# YetiThumbs Discord Bot

Production Discord bot for YetiThumbs support, Robux purchases, and account grants.
It deliberately exposes exactly three guild commands:

- `/setup-tickets` posts the Support / Buy with Robux ticket panel.
- `/grant-credits email amount` atomically adds credits to a YetiThumbs account.
- `/grant-premium email plan months` grants Starter, Developer, or Enterprise
  with the matching monthly credits and a persisted expiry.

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

6. Start the bot with `npm start`, or follow the exact Railway checklist in
   [RAILWAY.md](RAILWAY.md).

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
| `DISCORD_PARTNERSHIP_CATEGORY_ID` | Optional | Existing category for partnership channels; otherwise the bot creates a private YetiThumbs Partnerships category. |
| `SUPABASE_URL` | Yes | YetiThumbs Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only Supabase service credential. Keep secret. |
| `ROBUX_PRICE_*_MONTHLY` | Recommended | Monthly Robux price for each premium level. |
| `ROBUX_LINK_*` | Optional | HTTPS Roblox game-pass links from `.env.example`. |
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
The commands are visible to guild members so configured staff roles can use
them; every privileged action is still rejected server-side unless the caller
is an Administrator, configured staff role member, or configured owner.

## Health and deployment

- `GET /health` means the process is alive.
- `GET /ready` returns HTTP 200 only after Discord login, command registration,
  and Supabase validation succeed.

`railway.json` selects the Dockerfile, runs the real read-only preflight before
each release, uses `/ready` as the deployment health check, and enables
restart-on-failure. Railway can keep the service private; Discord gateway
traffic is outbound, so a public domain is unnecessary.

For deployment checks, recovery steps, and common errors, see [RUNBOOK.md](RUNBOOK.md).

## Robux purchase flow

Customers first choose **Credits** or **Premium**. Credits then shows the three
one-time packages. Premium asks for Starter, Developer, or Enterprise and then a
1, 3, or 6 month duration. The matching level is also required by
`/grant-premium`, preventing staff from accidentally granting Developer for a
Starter or Enterprise purchase.

Developer retains the recovered price of 1,200 Robux per month. Starter and
Enterprise prices are deliberately unset until their real amounts are added as
Railway variables. Tickets remain usable: when a price or link is unset, the bot
clearly asks staff to confirm or provide it. Never paste purchase URLs or secrets
into source code.
