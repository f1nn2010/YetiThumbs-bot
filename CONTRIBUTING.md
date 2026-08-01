# Contributing to the YetiThumbs bot

This repository is intentionally small. Production starts only
`src/yetibot.js`; do not add general-purpose moderation, music, economy,
PostgreSQL, Redis, or Lavalink features.

## Local workflow

1. Use Node.js 22.
2. Run `npm ci`.
3. Copy `.env.example` to `.env` only when live-service checks are needed.
4. Run `npm run verify` before every push.
5. Run `npm run doctor` before a production deployment when credentials are
   available.

Keep secrets out of commits, logs, screenshots, fixtures, and issue reports.
Changes to grants must preserve the service-role-only Supabase functions and
their atomic behavior. Changes to Discord interactions must preserve one-time
acknowledgement and staff authorization.

Every pull request should explain what changed, why, how it was tested, and any
new environment variable or migration requirement.
