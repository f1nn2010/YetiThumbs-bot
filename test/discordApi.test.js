import assert from "node:assert/strict";
import test from "node:test";

import { discordApiRequest } from "../src/discordApi.js";

function response(status, body = {}, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    async json() {
      return body;
    },
  };
}

test("Discord API retries temporary server failures", async () => {
  const statuses = [503, 502, 200];
  const delays = [];
  const result = await discordApiRequest({
    token: "token",
    path: "/users/@me",
    fetchImpl: async () => response(statuses.shift(), { username: "Yeti" }),
    sleep: async (delay) => delays.push(delay),
  });

  assert.equal(result.username, "Yeti");
  assert.deepEqual(delays, [500, 1000]);
});

test("Discord API fails immediately for invalid credentials", async () => {
  let attempts = 0;
  await assert.rejects(
    discordApiRequest({
      token: "bad-token",
      path: "/users/@me",
      fetchImpl: async () => {
        attempts += 1;
        return response(401, { message: "401: Unauthorized" });
      },
      sleep: async () => {},
    }),
    /401: Unauthorized/,
  );
  assert.equal(attempts, 1);
});
