import { createClient } from "@supabase/supabase-js";
import {
  addCalendarMonths,
  isMissingColumn,
  isMissingRpc,
  normalizeEmail,
} from "./domain.js";

function fail(message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
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
  const now = options.now ?? (() => new Date());

  async function findUserByEmail(email) {
    const target = normalizeEmail(email);
    if (!target) throw fail("Email is required.");

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

    throw fail(
      `No YetiThumbs account exists for ${target}. The customer must sign up first.`,
    );
  }

  async function grantCredits(email, amount) {
    const user = await findUserByEmail(email);
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "grant_yetithumbs_credits",
      { p_user_id: user.id, p_amount: amount },
    );

    if (!rpcError) {
      const credits = Array.isArray(rpcData)
        ? rpcData[0]?.credits ?? rpcData[0]
        : rpcData?.credits ?? rpcData;
      return { user, credits: Number(credits) };
    }
    if (!isMissingRpc(rpcError)) {
      throw fail(`Credit grant failed: ${rpcError.message}`, rpcError);
    }

    const { data: profile, error: readError } = await supabase
      .from("yetithumbs_profiles")
      .select("credits")
      .eq("id", user.id)
      .maybeSingle();
    if (readError) throw fail(`Profile lookup failed: ${readError.message}`, readError);

    const credits = (profile?.credits ?? 0) + amount;
    const { error: writeError } = await supabase
      .from("yetithumbs_profiles")
      .upsert(
        {
          id: user.id,
          email: user.email,
          credits,
          updated_at: now().toISOString(),
        },
        { onConflict: "id" },
      );
    if (writeError) throw fail(`Credit grant failed: ${writeError.message}`, writeError);
    return { user, credits, usedFallback: true };
  }

  async function grantPremium(email, months) {
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

    if (!rpcError) {
      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      return {
        user,
        credits: Number(row?.credits ?? config.premiumCredits),
        expiresAt: new Date(row?.expires_at),
        expiryPersisted: true,
      };
    }
    if (!isMissingRpc(rpcError)) {
      throw fail(`Premium grant failed: ${rpcError.message}`, rpcError);
    }

    const expiresAt = addCalendarMonths(now(), months);
    const baseProfile = {
      id: user.id,
      email: user.email,
      plan: config.premiumPlan,
      credits: config.premiumCredits,
      updated_at: now().toISOString(),
    };
    let { error: writeError } = await supabase
      .from("yetithumbs_profiles")
      .upsert(
        {
          ...baseProfile,
          plan_source: "robux",
          manual_plan_expires_at: expiresAt.toISOString(),
        },
        { onConflict: "id" },
      );

    let expiryPersisted = true;
    if (isMissingColumn(writeError)) {
      expiryPersisted = false;
      ({ error: writeError } = await supabase
        .from("yetithumbs_profiles")
        .upsert(baseProfile, { onConflict: "id" }));
    }
    if (writeError) throw fail(`Premium grant failed: ${writeError.message}`, writeError);

    return {
      user,
      credits: config.premiumCredits,
      expiresAt,
      expiryPersisted,
      usedFallback: true,
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

    return {
      ok: !profileError,
      entitlementSchemaReady: !profileError,
      schemaError: profileError?.message,
    };
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
