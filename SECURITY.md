# YetiThumbs bot security policy

Report vulnerabilities privately through this repository's GitHub Security
Advisories page. Do not open a public issue containing tokens, customer data,
private ticket contents, exploit details, or Supabase credentials.

## Operational rules

- Store `DISCORD_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` only in Railway or a
  local ignored `.env` file.
- Never expose the Supabase service-role credential to a browser.
- Grant the Discord bot only the permissions listed in `README.md`.
- Keep the Railway service private; no public domain is required.
- Rotate a credential immediately if it appears in a commit, chat, screenshot,
  or public log.
- Run `npm audit`, `npm run verify`, and `npm run doctor` before production
  changes.

Only test systems and Discord servers you own or have explicit permission to
test. Include sanitized reproduction steps, the affected commit, and expected
versus actual behavior in a private report.
