import test from "node:test";
import assert from "node:assert/strict";
import { createYetiService } from "../src/yetiService.js";

const config = {
  premiumPlans: {
    starter: { label: "Starter", credits: 40 },
    developer: { label: "Developer", credits: 90 },
    enterprise: { label: "Enterprise", credits: 350 },
  },
  supabaseUrl: "https://example.supabase.co",
  supabaseKey: "test-key",
};

function serviceWithRpc(rpcResult) {
  const calls = [];
  const supabase = {
    auth: {
      admin: {
        async listUsers() {
          return {
            data: { users: [{ id: "user-1", email: "Creator@Example.com" }] },
            error: null,
          };
        },
      },
    },
    async rpc(name, args) {
      calls.push([name, args]);
      return { data: rpcResult, error: null };
    },
  };
  return { service: createYetiService(config, { supabase }), calls };
}

test("grantCredits uses the atomic Supabase function", async () => {
  const { service, calls } = serviceWithRpc([{ credits: 52 }]);
  const result = await service.grantCredits(" creator@example.com ", 12);

  assert.equal(result.credits, 52);
  assert.deepEqual(calls, [
    ["grant_yetithumbs_credits", { p_user_id: "user-1", p_amount: 12 }],
  ]);
});

test("grantPremium persists the selected premium level and its monthly credits", async () => {
  const expiresAt = "2026-11-01T12:00:00.000Z";
  const { service, calls } = serviceWithRpc([{ credits: 350, expires_at: expiresAt }]);
  const result = await service.grantPremium("creator@example.com", "enterprise", 3);

  assert.equal(result.expiryPersisted, true);
  assert.equal(result.planId, "enterprise");
  assert.equal(result.planLabel, "Enterprise");
  assert.equal(result.monthlyCredits, 350);
  assert.equal(result.credits, 350);
  assert.equal(result.expiresAt.toISOString(), expiresAt);
  assert.deepEqual(calls, [
    [
      "grant_yetithumbs_manual_plan",
      {
        p_user_id: "user-1",
        p_email: "Creator@Example.com",
        p_plan: "enterprise",
        p_credits: 350,
        p_months: 3,
      },
    ],
  ]);
});

test("grant operations fail closed when the atomic database function is missing", async () => {
  const supabase = {
    auth: {
      admin: {
        async listUsers() {
          return {
            data: { users: [{ id: "user-1", email: "creator@example.com" }] },
            error: null,
          };
        },
      },
    },
    async rpc() {
      return {
        data: null,
        error: { code: "PGRST202", message: "Function not found" },
      };
    },
  };
  const service = createYetiService(config, { supabase });

  await assert.rejects(
    service.grantCredits("creator@example.com", 10),
    (error) =>
      /Credit grant failed: Function not found/.test(error.message) &&
      error.publicMessage === undefined,
  );
  await assert.rejects(
    service.grantPremium("creator@example.com", "developer", 1),
    (error) =>
      /Premium grant failed: Function not found/.test(error.message) &&
      error.publicMessage === undefined,
  );
});

test("grant operations validate bounds before querying customer accounts", async () => {
  const { service, calls } = serviceWithRpc([]);

  await assert.rejects(
    service.grantCredits("creator@example.com", 0),
    /between 1 and 100000/,
  );
  await assert.rejects(
    service.grantPremium("creator@example.com", "developer", 37),
    /between 1 and 36/,
  );
  await assert.rejects(
    service.grantPremium("creator@example.com", "ultra", 1),
    /Starter, Developer, or Enterprise/,
  );
  assert.deepEqual(calls, []);
});

test("account lookup rejects a malformed email before calling Supabase Auth", async () => {
  let authCalls = 0;
  const supabase = {
    auth: {
      admin: {
        async listUsers() {
          authCalls += 1;
          return { data: { users: [] }, error: null };
        },
      },
    },
  };
  const service = createYetiService(config, { supabase });

  await assert.rejects(
    service.findUserByEmail("2"),
    (error) =>
      /full YetiThumbs email address/.test(error.message) &&
      error.publicMessage === error.message,
  );
  assert.equal(authCalls, 0);
});

test("partnership codes reject characters Stripe checkout cannot accept", async () => {
  let databaseCalls = 0;
  const service = createYetiService(config, {
    supabase: {
      from() {
        databaseCalls += 1;
        throw new Error("database should not be called");
      },
    },
  });

  await assert.rejects(
    service.createPartnershipDeal({
      code: "PARTNER_20",
      percentOff: 20,
      durationMonths: 1,
      partnerId: null,
      guildId: "guild-1",
      channelId: "channel-1",
      webhookUrl: "https://discord.test/webhook",
      createdBy: "staff-1",
    }),
    (error) => /so Stripe can accept it/.test(error.message),
  );
  assert.equal(databaseCalls, 0);
});

test("ending a partnership disables future redemptions but keeps its tracked sales total", async () => {
  const calls = [];
  const existing = {
    id: "promo-1",
    code: "PARTNER20",
    partner_discord_id: "partner-1",
    partner_channel_id: "channel-1",
    total_spent_cents: 12345,
    expires_at: null,
  };
  const ended = { ...existing, expires_at: "2026-08-07T12:00:00.000Z" };
  const supabase = {
    from(table) {
      assert.equal(table, "yetithumbs_promo_links");
      return {
        select(columns) {
          calls.push(["select", columns]);
          return {
            eq(column, value) {
              calls.push(["eq", column, value]);
              return this;
            },
            not(column, operator, value) {
              calls.push(["not", column, operator, value]);
              return this;
            },
            async maybeSingle() {
              return { data: existing, error: null };
            },
          };
        },
        update(values) {
          calls.push(["update", values]);
          return {
            eq(column, value) {
              calls.push(["updateEq", column, value]);
              return {
                select(columns) {
                  calls.push(["updateSelect", columns]);
                  return {
                    async single() {
                      return { data: ended, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  const service = createYetiService(config, { supabase });

  const result = await service.endPartnershipDeal(" partner20 ");

  assert.equal(result.code, "PARTNER20");
  assert.equal(result.total_spent_cents, 12345);
  assert.deepEqual(calls.slice(0, 3), [
    ["select", "id, code, partner_discord_id, partner_channel_id, total_spent_cents, expires_at"],
    ["eq", "code", "PARTNER20"],
    ["eq", "kind", "discount"],
  ]);
  assert.equal(calls[3][0], "update");
  assert.deepEqual(calls.slice(4), [
    ["updateEq", "id", "promo-1"],
    ["updateSelect", "code, partner_discord_id, partner_channel_id, total_spent_cents, expires_at"],
  ]);
});

function serviceForHealth(probeResponses, onProfileSelect) {
  const responses = [...probeResponses];
  const supabase = {
    auth: {
      admin: {
        async listUsers() {
          return { data: { users: [] }, error: null };
        },
      },
    },
    from() {
      return {
        select(columns) {
          onProfileSelect?.(columns);
          return {
            async limit() {
              return { data: [], error: null };
            },
          };
        },
      };
    },
    async rpc() {
      return responses.shift();
    },
  };
  return createYetiService(config, { supabase });
}

test("health check proves both grant functions reject non-mutating probes", async () => {
  const service = serviceForHealth([
    { data: null, error: { code: "P0001", message: "Credit amount must be between 1 and 100000" } },
    { data: null, error: { code: "P0001", message: "Unsupported plan" } },
    { data: false, error: null },
  ]);

  assert.deepEqual(await service.healthCheck(), {
    ok: true,
    entitlementSchemaReady: true,
  });
});

test("health check is not ready when a grant function is missing", async () => {
  const service = serviceForHealth([
    { data: null, error: { code: "PGRST202", message: "Function not found" } },
  ]);
  const health = await service.healthCheck();

  assert.equal(health.ok, false);
  assert.equal(health.entitlementSchemaReady, false);
  assert.match(health.schemaError, /grant_yetithumbs_credits/);
});

test("health check requires the full manual-entitlement schema and 12-credit reservation support", async () => {
  let profileColumns = "";
  const service = serviceForHealth(
    [
      { data: null, error: { code: "P0001", message: "Credit amount must be between 1 and 100000" } },
      { data: null, error: { code: "P0001", message: "Unsupported plan" } },
      { data: false, error: null },
    ],
    (columns) => {
      profileColumns = columns;
    },
  );

  assert.equal((await service.healthCheck()).ok, true);
  assert.match(profileColumns, /manual_plan/);
  assert.match(profileColumns, /manual_plan_source/);
  assert.match(profileColumns, /credits_reset_at/);
});

test("health check rejects the obsolete four-credit reservation function", async () => {
  const service = serviceForHealth([
    { data: null, error: { code: "P0001", message: "Credit amount must be between 1 and 100000" } },
    { data: null, error: { code: "P0001", message: "Unsupported plan" } },
    { data: null, error: { code: "P0001", message: "Thumbnail count must be between 1 and 4" } },
  ]);

  const health = await service.healthCheck();
  assert.equal(health.ok, false);
  assert.match(health.schemaError, /consume_yetithumbs_credits/);
});
