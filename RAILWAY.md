# Railway deployment checklist

Use one Railway **persistent service** connected to the GitHub repository
`f1nn2010/YetiThumbs-bot`. Do not create a database, volume, cron job, or public
domain for this bot.

## 1. Create the service

1. In Railway, choose **New Project** > **Deploy from GitHub repo**.
2. Select `f1nn2010/YetiThumbs-bot` and branch `main`.
3. Leave the root directory as `/`.
4. Do not deploy until the required variables below are saved.

Railway automatically reads the root `railway.json` and `Dockerfile`. Do not add
a custom build command, start command, health path, or port in the dashboard;
the repository already defines them.

## 2. Add variables

Open the service's **Variables** tab and add these required values:

```dotenv
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=
DISCORD_STAFF_ROLE_IDS=
DISCORD_TICKET_CATEGORY_ID=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NODE_ENV=production
```

Optional variables:

```dotenv
OWNER_IDS=
ROBUX_LINK_10C=
ROBUX_LINK_40C=
ROBUX_LINK_90C=
ROBUX_LINK_1M=
ROBUX_LINK_3M=
ROBUX_LINK_6M=
```

Use comma-separated Discord IDs for multiple staff roles or owners. Leave the
six Robux links unset until the real HTTPS `roblox.com` game-pass URLs exist;
the ticket flow remains safe and asks staff for the correct link.

Do not create `PORT` or `WEB_HOST` variables. Railway injects `PORT`, and the bot
already listens on `0.0.0.0`.

## 3. Deploy and verify

1. Click **Deploy** after saving all variables.
2. The pre-deploy log must finish with `Preflight complete`.
3. The deploy log must contain:

```text
Discord connected as YetiThumbs#4720
Registered 3 commands in guild ...
ONLINE: 3 commands, 1 guild(s)
```

4. Railway must show the deployment as **Active**, which proves `/ready`
   returned HTTP 200.
5. In Discord, confirm the bot is online and run `/setup-tickets` once in the
   channel where the permanent ticket panel belongs.
6. Open one Support test ticket, verify only the customer and staff can see it,
   then close it with the button.

No card charge, Stripe action, or Supabase data grant is required for this
deployment check. Test `/grant-credits` only with an account and amount that the
owner explicitly authorizes.

## 4. Normal updates

Pushing a verified commit to `main` triggers another Railway deployment. Keep a
single replica: multiple Discord gateway replicas would both handle the same
interaction and can create duplicate replies.

If a deployment fails, do not delete the service or variables. Read the first
error in the pre-deploy/deploy logs, correct it, or redeploy the last known-good
commit from deployment history. See [RUNBOOK.md](RUNBOOK.md) for recovery.
