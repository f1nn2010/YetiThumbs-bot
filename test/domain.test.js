import test from "node:test";
import assert from "node:assert/strict";
import { addCalendarMonths, nextTicketNumber, ticketTopic, isTicketForUser } from "../src/domain.js";
import { cleanEnv, normalizeSupabaseUrl, parseIdList } from "../src/config.js";

test("environment values are cleaned and URLs are normalized", () => {
  assert.equal(cleanEnv(' "https://demo.supabase.co/rest/v1" '), "https://demo.supabase.co/rest/v1");
  assert.equal(
    normalizeSupabaseUrl("https://demo.supabase.co/rest/v1"),
    "https://demo.supabase.co",
  );
  assert.equal(normalizeSupabaseUrl("not-a-url"), "");
});

test("role ids are deduplicated and invalid values are ignored", () => {
  assert.deepEqual(
    parseIdList("1532481208490131651, 1532481208490131652", "1532481208490131651,bad"),
    ["1532481208490131651", "1532481208490131652"],
  );
});

test("calendar month grants clamp to the final day of the target month", () => {
  assert.equal(
    addCalendarMonths(new Date("2026-01-31T12:00:00Z"), 1).toISOString(),
    "2026-02-28T12:00:00.000Z",
  );
  assert.equal(
    addCalendarMonths(new Date("2024-01-31T12:00:00Z"), 1).toISOString(),
    "2024-02-29T12:00:00.000Z",
  );
});

test("ticket numbers only consider exact ticket-N channels", () => {
  assert.equal(
    nextTicketNumber([
      { name: "ticket-1" },
      { name: "ticket-12" },
      { name: "ticket-old" },
      { name: "support-ticket-99" },
    ]),
    13,
  );
});

test("ticket topics identify the owning user", () => {
  const channel = { topic: ticketTopic("123", "support") };
  assert.equal(isTicketForUser(channel, "123"), true);
  assert.equal(isTicketForUser(channel, "456"), false);
});
