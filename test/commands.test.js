import test from "node:test";
import assert from "node:assert/strict";
import { commands } from "../src/commands.js";

test("the bot publishes only the three intended guild commands", () => {
  assert.deepEqual(
    commands.map((command) => command.name).sort(),
    ["grant-credits", "grant-premium", "setup-tickets"],
  );
});

test("configured staff roles are not blocked by Administrator-only command defaults", () => {
  for (const command of commands) {
    assert.equal(command.default_member_permissions, undefined);
    assert.match(command.description, /^Staff:/);
  }
});
