import test from "node:test";
import assert from "node:assert/strict";
import { deferEphemeral, respondEphemeral } from "../src/responses.js";

test("deferEphemeral acknowledges an interaction once", async () => {
  let calls = 0;
  const interaction = {
    deferred: false,
    replied: false,
    async deferReply() {
      calls += 1;
      this.deferred = true;
    },
  };
  assert.equal(await deferEphemeral(interaction), true);
  assert.equal(await deferEphemeral(interaction), false);
  assert.equal(calls, 1);
});

test("respondEphemeral edits a deferred interaction instead of replying twice", async () => {
  const calls = [];
  const interaction = {
    deferred: true,
    replied: false,
    editReply: async (payload) => calls.push(["edit", payload]),
    reply: async (payload) => calls.push(["reply", payload]),
    followUp: async (payload) => calls.push(["follow", payload]),
  };
  await respondEphemeral(interaction, "done");
  assert.deepEqual(calls, [["edit", { content: "done" }]]);
});

test("deferEphemeral safely absorbs Discord's already-acknowledged error", async () => {
  const interaction = {
    deferred: false,
    replied: false,
    async deferReply() {
      const error = new Error("Interaction has already been acknowledged");
      error.code = 40060;
      throw error;
    },
  };

  assert.equal(await deferEphemeral(interaction), false);
});
