import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Always load the bot package .env (not process cwd), so grants work
// no matter where the bot was started from.
const botRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
dotenv.config({ path: path.join(botRoot, ".env") });

function cleanEnv(value) {
  if (value == null) return "";
  return String(value)
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/^["']|["']$/g, "");
}

/**
 * Normalize project URL to `https://xxx.supabase.co` (no /rest/v1, /auth/v1).
 * Bad/missing URLs produce: "Invalid path specified in request URL".
 */
export function resolveSupabaseUrl() {
  const raw = cleanEnv(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!url.protocol.startsWith("http")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveServiceRoleKey() {
  return cleanEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SERVICE_ROLE_KEY
  );
}

export function getSupabaseAdmin() {
  const url = resolveSupabaseUrl();
  const key = resolveServiceRoleKey();

  if (!url || !key) {
    const missing = [];
    if (!url) missing.push("SUPABASE_URL");
    if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    const err = new Error(
      `Missing ${missing.join(" and ")} in yetithumbs-bot/.env. Use the project URL (https://xxxx.supabase.co) and the service_role secret key from Supabase → Project Settings → API.`
    );
    err.code = "SUPABASE_CONFIG";
    throw err;
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Find an auth user by email (case-insensitive). Paginates admin listUsers.
 */
export async function findAuthUserByEmail(supabase, email) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return { user: null, error: new Error("Email is required") };

  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) return { user: null, error };

    const users = data?.users || [];
    const hit = users.find((u) => (u.email || "").toLowerCase() === target);
    if (hit) return { user: hit, error: null };
    if (users.length < 200) break;
  }

  return { user: null, error: null };
}

export async function ensureEphemeralDeferred(interaction) {
  if (interaction.deferred || interaction.replied) return;
  await interaction.deferReply({ ephemeral: true });
}

export async function replyEphemeral(interaction, content) {
  const payload = typeof content === "string" ? { content } : content;
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply({ ...payload, ephemeral: true });
}

/** Plan/credits applied when admin grants premium via Discord. */
export const PREMIUM_PLAN = "developer";
export const PREMIUM_CREDITS = 90;
