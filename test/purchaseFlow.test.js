import test from "node:test";
import assert from "node:assert/strict";
import {
  creditPackageMenu,
  premiumDurationMenu,
  premiumPurchase,
  premiumTierMenu,
  purchaseTypeMenu,
  robuxLinkCoverage,
} from "../src/purchaseFlow.js";

const config = {
  creditPackages: {
    pkg_10c: { label: "10 Credits", price: 1100, credits: 10, link: "credit" },
  },
  premiumPlans: {
    starter: {
      label: "Starter",
      credits: 40,
      monthlyRobuxPrice: null,
      links: { 1: "", 3: "", 6: "" },
    },
    developer: {
      label: "Developer",
      credits: 90,
      monthlyRobuxPrice: 1200,
      links: { 1: "dev-1", 3: "", 6: "" },
    },
    enterprise: {
      label: "Enterprise",
      credits: 350,
      monthlyRobuxPrice: 5000,
      links: { 1: "", 3: "", 6: "enterprise-6" },
    },
  },
};

test("purchase flow starts with Credits and Premium choices", () => {
  const menu = purchaseTypeMenu().toJSON().components[0];
  assert.equal(menu.custom_id, "purchase_type_select");
  assert.deepEqual(
    menu.options.map((option) => option.value),
    ["credits", "premium"],
  );
});

test("credit and premium menus expose the expected packages and levels", () => {
  const credits = creditPackageMenu(config).toJSON().components[0];
  const tiers = premiumTierMenu(config).toJSON().components[0];
  assert.deepEqual(credits.options.map((option) => option.value), ["pkg_10c"]);
  assert.deepEqual(
    tiers.options.map((option) => option.value),
    ["starter", "developer", "enterprise"],
  );
});

test("premium duration selection preserves tier, price, credits, and link", () => {
  const menu = premiumDurationMenu(config, "enterprise").toJSON().components[0];
  assert.equal(menu.custom_id, "premium_duration_select:enterprise");
  assert.deepEqual(menu.options.map((option) => option.value), ["1", "3", "6"]);
  assert.deepEqual(premiumPurchase(config, "enterprise", "6"), {
    planId: "enterprise",
    label: "Enterprise",
    credits: 350,
    monthlyRobuxPrice: 5000,
    links: { 1: "", 3: "", 6: "enterprise-6" },
    months: 6,
    price: 30000,
    link: "enterprise-6",
  });
});

test("unset premium pricing remains explicit and link coverage is complete", () => {
  assert.equal(premiumPurchase(config, "starter", 3).price, null);
  assert.deepEqual(robuxLinkCoverage(config), { configured: 3, total: 10 });
});
