import { loadConfig } from "../src/config.js";
import { robuxLinkCoverage } from "../src/purchaseFlow.js";
import { createYetiService } from "../src/yetiService.js";

const config = loadConfig();

async function discord(path) {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { authorization: `Bot ${config.token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Discord ${path} failed (${response.status}): ${data.message ?? "unknown error"}`);
  }
  return data;
}

console.log("Checking Discord credentials...");
const [botUser, application] = await Promise.all([
  discord("/users/@me"),
  discord("/oauth2/applications/@me"),
]);
if (application.id !== config.clientId) {
  throw new Error("CLIENT_ID does not match the application associated with DISCORD_TOKEN");
}
console.log(`Discord OK: ${botUser.username}#${botUser.discriminator}`);

if (config.guildId) {
  const [guild, roles, member, channels] = await Promise.all([
    discord(`/guilds/${config.guildId}`),
    discord(`/guilds/${config.guildId}/roles`),
    discord(`/guilds/${config.guildId}/members/${botUser.id}`),
    discord(`/guilds/${config.guildId}/channels`),
  ]);
  const roleIds = new Set(roles.map((role) => role.id));
  const missingRoles = config.staffRoleIds.filter((id) => !roleIds.has(id));
  if (missingRoles.length) {
    console.warn(`Warning: ${missingRoles.length} configured staff role(s) are not in ${guild.name}`);
  }
  const effectiveRoleIds = new Set([guild.id, ...member.roles]);
  const permissions = roles
    .filter((role) => effectiveRoleIds.has(role.id))
    .reduce((value, role) => value | BigInt(role.permissions), 0n);
  const administrator = 1n << 3n;
  const required = [
    ["Manage Channels", 1n << 4n],
    ["View Channels", 1n << 10n],
    ["Send Messages", 1n << 11n],
    ["Embed Links", 1n << 14n],
    ["Attach Files", 1n << 15n],
    ["Read Message History", 1n << 16n],
  ];
  const missingPermissions = required
    .filter(([, bit]) => !(permissions & administrator) && !(permissions & bit))
    .map(([name]) => name);
  if (missingPermissions.length) {
    throw new Error(`Bot is missing guild permissions: ${missingPermissions.join(", ")}`);
  }
  console.log(`Guild OK: ${guild.name}; bot member roles: ${member.roles.length}`);

  if (config.ticketCategoryId) {
    const category = channels.find((channel) => channel.id === config.ticketCategoryId);
    if (!category) {
      throw new Error("DISCORD_TICKET_CATEGORY_ID does not exist in the configured guild");
    }
    if (category.type !== 4) {
      throw new Error("DISCORD_TICKET_CATEGORY_ID is not a Discord category");
    }
    console.log(`Ticket category OK: ${category.name}`);
  } else {
    console.warn("Warning: DISCORD_TICKET_CATEGORY_ID is unset; tickets will be created at the server root.");
  }

  const [guildCommands, globalCommands] = await Promise.all([
    discord(`/applications/${config.clientId}/guilds/${config.guildId}/commands`),
    discord(`/applications/${config.clientId}/commands`),
  ]);
  const expected = ["grant-credits", "grant-premium", "setup-tickets"].sort();
  const current = guildCommands.map((command) => command.name).sort();
  if (JSON.stringify(current) !== JSON.stringify(expected) || globalCommands.length) {
    console.warn(
      `Warning: Discord currently has guild commands [${current.join(", ")}] and ${globalCommands.length} global command(s). Startup will replace them.`,
    );
  }
}

console.log("Checking Supabase service credentials...");
const health = await createYetiService(config).healthCheck();
if (!health.entitlementSchemaReady) throw new Error(health.schemaError);
console.log("Supabase entitlement schema and grant functions OK");

const linkCoverage = robuxLinkCoverage(config);
const missingLinkCount = linkCoverage.total - linkCoverage.configured;
if (missingLinkCount) {
  console.warn(
    `Warning: ${missingLinkCount} Robux links are unset; tickets will ask staff to provide a link.`,
  );
}
const missingPremiumPrices = Object.values(config.premiumPlans).filter(
  (plan) => !Number.isSafeInteger(plan.monthlyRobuxPrice),
);
if (missingPremiumPrices.length) {
  console.warn(
    `Warning: ${missingPremiumPrices.length} premium Robux price(s) are unset; tickets will ask staff to confirm the price.`,
  );
}
console.log(
  `Robux purchase links: ${linkCoverage.configured}/${linkCoverage.total} configured`,
);
console.log("Preflight complete");
