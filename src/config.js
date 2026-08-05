import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

dotenv.config({ path: path.join(projectRoot, ".env"), quiet: true });

export const DEFAULT_STAFF_ROLE_IDS = [
  "1532481208490131651",
  "1532481208490131652",
];

export function cleanEnv(value) {
  return String(value ?? "")
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/^["']|["']$/g, "");
}

export function parseIdList(...values) {
  return [
    ...new Set(
      values
        .flatMap((value) => cleanEnv(value).split(","))
        .map((value) => value.trim())
        .filter((value) => /^\d{17,20}$/.test(value)),
    ),
  ];
}

export function isDiscordId(value) {
  return /^\d{17,20}$/.test(cleanEnv(value));
}

export function normalizeSupabaseUrl(value) {
  const raw = cleanEnv(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function normalizePublicAppUrl(value) {
  const raw = cleanEnv(value) || "https://yetithumbs.com";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "https://yetithumbs.com";
    return url.origin;
  } catch {
    return "https://yetithumbs.com";
  }
}

export function normalizeRobloxUrl(value) {
  const raw = cleanEnv(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return "";
    if (hostname !== "roblox.com" && !hostname.endsWith(".roblox.com")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function optionalRobloxUrl(value, name) {
  const raw = cleanEnv(value);
  if (!raw) return "";
  const normalized = normalizeRobloxUrl(raw);
  if (!normalized) {
    throw new Error(`${name} must be an HTTPS URL on roblox.com`);
  }
  return normalized;
}

function integer(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(cleanEnv(value), 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function optionalPositiveInteger(value, name) {
  const raw = cleanEnv(value);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10000000) {
    throw new Error(`${name} must be a whole Robux amount between 1 and 10000000`);
  }
  return parsed;
}

export function loadConfig(env = process.env) {
  const config = {
    token: cleanEnv(env.DISCORD_TOKEN || env.TOKEN),
    clientId: cleanEnv(env.CLIENT_ID || env.DISCORD_CLIENT_ID),
    guildId: cleanEnv(env.GUILD_ID || env.DISCORD_GUILD_ID),
    ownerIds: parseIdList(env.OWNER_IDS),
    staffRoleIds: parseIdList(
      env.DISCORD_STAFF_ROLE_IDS,
      env.DISCORD_ADMIN_ROLE_ID,
      DEFAULT_STAFF_ROLE_IDS.join(","),
    ),
    ticketCategoryId: cleanEnv(env.DISCORD_TICKET_CATEGORY_ID),
    supabaseUrl: normalizeSupabaseUrl(
      env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    supabaseKey: cleanEnv(
      env.SUPABASE_SERVICE_ROLE_KEY ||
        env.SUPABASE_SECRET_KEY ||
        env.SERVICE_ROLE_KEY,
    ),
    host: cleanEnv(env.WEB_HOST) || "0.0.0.0",
    port: integer(env.PORT, 3000, { min: 1, max: 65535 }),
    publicAppUrl: normalizePublicAppUrl(env.PUBLIC_APP_URL),
    creditPackages: {
      pkg_10c: {
        label: "10 Credits",
        price: 1100,
        credits: 10,
        link: optionalRobloxUrl(env.ROBUX_LINK_10C, "ROBUX_LINK_10C"),
      },
      pkg_40c: {
        label: "40 Credits (Starter)",
        price: 4100,
        credits: 40,
        link: optionalRobloxUrl(env.ROBUX_LINK_40C, "ROBUX_LINK_40C"),
      },
      pkg_90c: {
        label: "90 Credits (Developer)",
        price: 9200,
        credits: 90,
        link: optionalRobloxUrl(env.ROBUX_LINK_90C, "ROBUX_LINK_90C"),
      },
    },
    premiumPlans: {
      starter: {
        label: "Starter",
        credits: 40,
        monthlyRobuxPrice: optionalPositiveInteger(
          env.ROBUX_PRICE_STARTER_MONTHLY,
          "ROBUX_PRICE_STARTER_MONTHLY",
        ),
        links: {
          1: optionalRobloxUrl(env.ROBUX_LINK_STARTER_1M, "ROBUX_LINK_STARTER_1M"),
          3: optionalRobloxUrl(env.ROBUX_LINK_STARTER_3M, "ROBUX_LINK_STARTER_3M"),
          6: optionalRobloxUrl(env.ROBUX_LINK_STARTER_6M, "ROBUX_LINK_STARTER_6M"),
        },
      },
      developer: {
        label: "Developer",
        credits: 90,
        monthlyRobuxPrice:
          optionalPositiveInteger(
            env.ROBUX_PRICE_DEVELOPER_MONTHLY,
            "ROBUX_PRICE_DEVELOPER_MONTHLY",
          ) ?? 1200,
        links: {
          1: optionalRobloxUrl(
            env.ROBUX_LINK_DEVELOPER_1M || env.ROBUX_LINK_1M,
            env.ROBUX_LINK_DEVELOPER_1M
              ? "ROBUX_LINK_DEVELOPER_1M"
              : "ROBUX_LINK_1M",
          ),
          3: optionalRobloxUrl(
            env.ROBUX_LINK_DEVELOPER_3M || env.ROBUX_LINK_3M,
            env.ROBUX_LINK_DEVELOPER_3M
              ? "ROBUX_LINK_DEVELOPER_3M"
              : "ROBUX_LINK_3M",
          ),
          6: optionalRobloxUrl(
            env.ROBUX_LINK_DEVELOPER_6M || env.ROBUX_LINK_6M,
            env.ROBUX_LINK_DEVELOPER_6M
              ? "ROBUX_LINK_DEVELOPER_6M"
              : "ROBUX_LINK_6M",
          ),
        },
      },
      enterprise: {
        label: "Enterprise",
        credits: 350,
        monthlyRobuxPrice: optionalPositiveInteger(
          env.ROBUX_PRICE_ENTERPRISE_MONTHLY,
          "ROBUX_PRICE_ENTERPRISE_MONTHLY",
        ),
        links: {
          1: optionalRobloxUrl(
            env.ROBUX_LINK_ENTERPRISE_1M,
            "ROBUX_LINK_ENTERPRISE_1M",
          ),
          3: optionalRobloxUrl(
            env.ROBUX_LINK_ENTERPRISE_3M,
            "ROBUX_LINK_ENTERPRISE_3M",
          ),
          6: optionalRobloxUrl(
            env.ROBUX_LINK_ENTERPRISE_6M,
            "ROBUX_LINK_ENTERPRISE_6M",
          ),
        },
      },
    },
  };

  const missing = [];
  if (!config.token) missing.push("DISCORD_TOKEN");
  if (!isDiscordId(config.clientId)) missing.push("CLIENT_ID (Discord ID)");
  if (!isDiscordId(config.guildId)) missing.push("GUILD_ID (Discord ID)");
  if (config.ticketCategoryId && !isDiscordId(config.ticketCategoryId)) {
    missing.push("DISCORD_TICKET_CATEGORY_ID (Discord ID)");
  }
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.supabaseKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length) {
    throw new Error(`Missing or invalid environment variables: ${missing.join(", ")}`);
  }

  return config;
}
