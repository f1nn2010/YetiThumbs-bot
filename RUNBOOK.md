# YetiThumbs bot operator runbook

## Normal healthy state

Railway should show one **Active** deployment. Startup logs should include all
of these lines:

```text
Discord connected as YetiThumbs#4720
Registered 3 commands in guild ...
ONLINE: 3 commands, 1 guild(s)
```

`/ready` must return HTTP 200. GitHub's **CI** and **Docker Publish** workflows
must both be green for the deployed commit.

## Safe deployment

1. Make the change on `main`.
2. Run `npm ci` and `npm run verify`.
3. Run `npm run doctor` with production-like credentials.
4. Push to GitHub.
5. Wait for GitHub CI and Docker Publish to pass.
6. Confirm Railway deploys the same commit and reaches **Active**.
7. Read the new deployment logs and confirm the three healthy-state lines above.

Railway auto-deploy should stay enabled for the `main` branch. Its deployment
preflight and health check prevent a broken revision from replacing the current
healthy bot. Railway's health check is deployment-time only; use Discord's
online indicator or an external monitor for continuous availability checks.

## Common failures

| Symptom | What to do |
| --- | --- |
| Railway health check fails | Open Deploy Logs. Confirm Node.js 22 and that the health server is listening on Railway's `PORT`. |
| `CLIENT_ID does not match` | Copy the Application ID from the same Discord application that owns `DISCORD_TOKEN`. |
| Missing guild permissions | Reinvite or update the bot with the permissions in `README.md`. |
| Ticket category error | Copy the category ID with Discord Developer Mode; do not use a channel ID. |
| Supabase schema error | Apply all website migrations, then rerun `npm run doctor`. |
| Commands look stale | Restart/redeploy once; startup replaces the guild commands and clears global commands. |
| Robux prices or links are missing | Tickets still work. Staff confirms the price or provides the link until its Railway variable is added. |

## Rollback

Use Railway's deployment history to redeploy the most recent known-good commit.
Do not delete the service or its variables. After rollback, run `npm run doctor`
locally and inspect the Railway startup logs.

## Secret incident

If a token or service credential is exposed, rotate it at Discord or Supabase,
replace the Railway variable, redeploy, and verify the healthy-state logs. Git
history is not a safe place for secrets even after a later deletion.
