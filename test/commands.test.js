import test from "node:test";
import assert from "node:assert/strict";
import { commands } from "../src/commands.js";

test("the bot publishes the intended guild commands", () => {
  assert.deepEqual(
    commands.map((command) => command.name).sort(),
    [
      "create-link",
      "create-partnership",
      "end-partnership",
      "grant-credits",
      "grant-premium",
      "setup-tickets",
    ],
  );
});

test("end-partnership requires the code being ended", () => {
  const command = commands.find((item) => item.name === "end-partnership");
  assert.deepEqual(command.options.map((option) => option.name), ["code"]);
  assert.equal(command.options[0].required, true);
});

test("create-link exposes credit controls only", () => {
  const command = commands.find((item) => item.name === "create-link");
  assert.deepEqual(
    command.options.map((option) => option.name),
    ["type", "credits", "max_uses"],
  );
  assert.deepEqual(
    command.options[0].choices.map((choice) => choice.value),
    ["credits"],
  );
});

test("create-partnership requires a code, discount, partner, and duration", () => {
  const command = commands.find((item) => item.name === "create-partnership");
  assert.deepEqual(
    command.options.map((option) => option.name),
    ["code", "percent", "partner", "months"],
  );
  assert.equal(command.options.find((option) => option.name === "code").required, true);
  assert.equal(command.options.find((option) => option.name === "percent").required, true);
  assert.equal(command.options.find((option) => option.name === "partner").required, true);
});

test("configured staff roles are not blocked by Administrator-only command defaults", () => {
  for (const command of commands) {
    assert.equal(command.default_member_permissions, undefined);
    assert.match(command.description, /^Staff:/);
  }
});

test("grant-premium requires a supported premium level", () => {
  const command = commands.find((item) => item.name === "grant-premium");
  const plan = command.options.find((option) => option.name === "plan");
  assert.equal(plan.required, true);
  assert.deepEqual(
    plan.choices.map((choice) => choice.value),
    ["starter", "developer", "enterprise"],
  );
});
