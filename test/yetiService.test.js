import test from "node:test";
import assert from "node:assert/strict";
import { createYetiService } from "../src/yetiService.js";

const config = {
  premiumPlan: "developer",
  premiumCredits: 90,
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

test("grantPremium returns the persisted expiry from Supabase", async () => {
  const expiresAt = "2026-11-01T12:00:00.000Z";
  const { service, calls } = serviceWithRpc([{ credits: 90, expires_at: expiresAt }]);
  const result = await service.grantPremium("creator@example.com", 3);

  assert.equal(result.expiryPersisted, true);
  assert.equal(result.expiresAt.toISOString(), expiresAt);
  assert.deepEqual(calls, [
    [
      "grant_yetithumbs_manual_plan",
      {
        p_user_id: "user-1",
        p_email: "Creator@Example.com",
        p_plan: "developer",
        p_credits: 90,
        p_months: 3,
      },
    ],
  ]);
});

