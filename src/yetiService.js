import { createClient } from "@supabase/supabase-js";
import { isMissingRpc, normalizeEmail } from "./domain.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function fail(message, cause) {
  return new Error(message, cause ? { cause } : undefined);
}

function userError(message) {
  const error = new Error(message);
  error.publicMessage = message;
  return error;
}

export function createYetiService(config, options = {}) {
  const supabase =
    options.supabase ??
    createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  async function findUserByEmail(email) {
    const target = normalizeEmail(email);
    if (!target || target.length > 254 || !EMAIL_PATTERN.test(target)) {
      throw userError(
        "Enter the customer's full YetiThumbs email address, such as name@example.com.",
      );
    }

    for (let page = 1; page <= 50; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw fail(`Account lookup failed: ${error.message}`, error);
      const users = data?.users ?? [];
      const match = users.find((user) => normalizeEmail(user.email) === target);
      if (match) return match;
      if (users.length < 200) break;
    }

    throw userError(
      `No YetiThumbs account exists for ${target}. The customer must sign up first.`,
    );
  }

  async function grantCredits(email, amount) {
    if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
      throw userError("Credits must be a whole number between 1 and 100000.");
    }
    const user = await findUserByEmail(email);
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "grant_yetithumbs_credits",
      { p_user_id: user.id, p_amount: amount },
    );

    if (rpcError) throw fail(`Credit grant failed: ${rpcError.message}`, rpcError);

    const credits = Array.isArray(rpcData)
      ? rpcData[0]?.credits ?? rpcData[0]
      : rpcData?.credits ?? rpcData;
    const numericCredits = Number(credits);
    if (!Number.isSafeInteger(numericCredits) || numericCredits < 0) {
      throw fail("Credit grant returned an invalid balance.");
    }
    return { user, credits: numericCredits };
  }

  async function grantPremium(email, months) {
    if (!Number.isInteger(months) || months < 1 || months > 36) {
      throw userError(
        "Premium duration must be a whole number between 1 and 36 months.",
      );
    }
    const user = await findUserByEmail(email);
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "grant_yetithumbs_manual_plan",
      {
        p_user_id: user.id,
        p_email: user.email,
        p_plan: config.premiumPlan,
        p_credits: config.premiumCredits,
        p_months: months,
      },
    );

    if (rpcError) throw fail(`Premium grant failed: ${rpcError.message}`, rpcError);

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    const credits = Number(row?.credits);
    const expiresAt = new Date(row?.expires_at);
    if (
      !Number.isSafeInteger(credits) ||
      credits < 0 ||
      Number.isNaN(expiresAt.getTime())
    ) {
      throw fail("Premium grant returned an invalid entitlement.");
    }
    return {
      user,
      credits,
      expiresAt,
      expiryPersisted: true,
    };
  }

  async function healthCheck() {
    const { error: authError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    if (authError) throw fail(`Supabase auth check failed: ${authError.message}`);

    const { error: profileError } = await supabase
      .from("yetithumbs_profiles")
      .select("id, plan_source, manual_plan_expires_at")
      .limit(1);

    if (profileError) {
      return {
        ok: false,
        entitlementSchemaReady: false,
        schemaError: `Profile schema check failed: ${profileError.message}`,
      };
    }

    const rpcProbes = [
      {
        name: "grant_yetithumbs_credits",
        args: {
          p_user_id: "00000000-0000-0000-0000-000000000000",
          p_amount: 0,
        },
        expected: "Credit amount must be between",
      },
      {
        name: "grant_yetithumbs_manual_plan",
        args: {
          p_user_id: "00000000-0000-0000-0000-000000000000",
          p_email: "probe@invalid.local",
          p_plan: "invalid",
          p_credits: 0,
          p_months: 0,
        },
        expected: "Unsupported plan",
      },
    ];

    for (const probe of rpcProbes) {
      const { error } = await supabase.rpc(probe.name, probe.args);
      const expectedRejection =
        error && !isMissingRpc(error) && error.message?.includes(probe.expected);
      if (!expectedRejection) {
        return {
          ok: false,
          entitlementSchemaReady: false,
          schemaError: `${probe.name} is missing, inaccessible, or failed its safety probe`,
        };
      }
    }

    return { ok: true, entitlementSchemaReady: true };
  }

  async function logError(context, error, metadata = {}) {
    const safeMetadata = Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => value != null),
    );
    await supabase.from("yetithumbs_error_logs").insert({
      context: `discord_bot:${context}`,
      message: String(error?.message ?? error).slice(0, 2000),
      metadata: safeMetadata,
    });
  }

  return { findUserByEmail, grantCredits, grantPremium, healthCheck, logError };
}
