import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";

export const PREMIUM_DURATIONS = Object.freeze([1, 3, 6]);

export function formatRobux(price) {
  return Number.isSafeInteger(price)
    ? `${price.toLocaleString("en-GB")} Robux`
    : "price confirmed by staff";
}

export function formatMonthlyRobux(price) {
  return Number.isSafeInteger(price)
    ? `${formatRobux(price)}/month`
    : "price confirmed by staff";
}

export function premiumPurchase(config, planId, months) {
  const plan = config.premiumPlans[planId];
  const duration = Number(months);
  if (!plan || !PREMIUM_DURATIONS.includes(duration)) return null;
  return {
    planId,
    ...plan,
    months: duration,
    price: Number.isSafeInteger(plan.monthlyRobuxPrice)
      ? plan.monthlyRobuxPrice * duration
      : null,
    link: plan.links[duration] ?? "",
  };
}

export function robuxLinkCoverage(config) {
  const links = [
    ...Object.values(config.creditPackages).map((item) => item.link),
    ...Object.values(config.premiumPlans).flatMap((plan) =>
      PREMIUM_DURATIONS.map((months) => plan.links[months]),
    ),
  ];
  return { configured: links.filter(Boolean).length, total: links.length };
}

export function purchaseTypeMenu() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("purchase_type_select")
    .setPlaceholder("What would you like to buy?")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Credits")
        .setDescription("Buy a one-time credits package")
        .setEmoji("🎨")
        .setValue("credits"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Premium")
        .setDescription("Choose Starter, Developer, or Enterprise")
        .setEmoji("⭐")
        .setValue("premium"),
    );
  return new ActionRowBuilder().addComponents(menu);
}

export function creditPackageMenu(config) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("credit_package_select")
    .setPlaceholder("Choose a credits package");
  for (const [value, item] of Object.entries(config.creditPackages)) {
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(`${item.label} (${item.price.toLocaleString("en-GB")} R$)`)
        .setValue(value),
    );
  }
  return new ActionRowBuilder().addComponents(menu);
}

export function premiumTierMenu(config) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("premium_tier_select")
    .setPlaceholder("Choose your premium level");
  for (const [value, plan] of Object.entries(config.premiumPlans)) {
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(`${plan.label} Premium`)
        .setDescription(
          `${plan.credits} credits/month · ${formatMonthlyRobux(plan.monthlyRobuxPrice)}`,
        )
        .setValue(value),
    );
  }
  return new ActionRowBuilder().addComponents(menu);
}

export function premiumDurationMenu(config, planId) {
  const plan = config.premiumPlans[planId];
  if (!plan) throw new Error("Unknown premium plan");
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`premium_duration_select:${planId}`)
    .setPlaceholder(`Choose ${plan.label} duration`);
  for (const months of PREMIUM_DURATIONS) {
    const purchase = premiumPurchase(config, planId, months);
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(`${months} Month${months === 1 ? "" : "s"}`)
        .setDescription(formatRobux(purchase.price))
        .setValue(String(months)),
    );
  }
  return new ActionRowBuilder().addComponents(menu);
}
