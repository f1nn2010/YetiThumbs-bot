import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
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

  async function grantPremium(email, planId, months) {
    if (!Number.isInteger(months) || months < 1 || months > 36) {
      throw userError(
        "Premium duration must be a whole number between 1 and 36 months.",
      );
    }
    const plan = config.premiumPlans[planId];
    if (!plan) {
      throw userError("Choose Starter, Developer, or Enterprise premium.");
    }
    const user = await findUserByEmail(email);
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "grant_yetithumbs_manual_plan",
      {
        p_user_id: user.id,
        p_email: user.email,
        p_plan: planId,
        p_credits: plan.credits,
        p_months: months,
      },
    );

    if (rpcError) {
      // Older production projects may have the profile columns but not the
      // latest RPC yet. Repair the entitlement directly with the service role
      // rather than reporting a misleading success or leaving the account on
      // Free.
      if (isMissingRpc(rpcError) && typeof supabase.from === "function") {
        const { data: current, error: currentError } = await supabase
          .from("yetithumbs_profiles")
          .select("plan_source, manual_plan_expires_at, credits")
          .eq("id", user.id)
          .maybeSingle();
        if (currentError) throw fail(`Premium grant failed: ${currentError.message}`, currentError);
        const base = current?.manual_plan_expires_at && new Date(current.manual_plan_expires_at) > new Date()
          ? new Date(current.manual_plan_expires_at)
          : new Date();
        base.setUTCMonth(base.getUTCMonth() + months);
        const { data: repaired, error: repairError } = await supabase
          .from("yetithumbs_profiles")
          .update({
            plan: current?.plan_source === "stripe" ? undefined : planId,
            plan_source: current?.plan_source === "stripe" ? "stripe" : "robux",
            manual_plan: planId,
            manual_plan_source: "robux",
            manual_plan_expires_at: base.toISOString(),
            credits: Math.max(Number(current?.credits ?? 0), plan.credits),
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id)
          .select("credits, manual_plan_expires_at")
          .single();
        if (repairError) throw fail(`Premium grant failed: ${repairError.message}`, repairError);
        return {
          user, planId, planLabel: plan.label, monthlyCredits: plan.credits,
          credits: Number(repaired.credits), expiresAt: new Date(repaired.manual_plan_expires_at),
          expiryPersisted: true,
        };
      }
      throw fail(`Premium grant failed: ${rpcError.message}`, rpcError);
    }

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    let credits = Number(row?.credits);
    const expiresAt = new Date(row?.expires_at);
    if (
      !Number.isSafeInteger(credits) ||
      credits < 0 ||
      Number.isNaN(expiresAt.getTime())
    ) {
      throw fail("Premium grant returned an invalid entitlement.");
    }

    // Read back the canonical profile row. This catches stale/older RPC
    // definitions that returned a balance without actually persisting the
    // manual entitlement fields.
    if (typeof supabase.from === "function") {
      const { data: profile, error: profileError } = await supabase
        .from("yetithumbs_profiles")
        .select("plan, plan_source, manual_plan, manual_plan_source, manual_plan_expires_at, credits")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw fail(`Premium entitlement verification failed: ${profileError.message}`, profileError);
      const entitlementMatches =
        profile?.manual_plan === planId &&
        profile?.manual_plan_source === "robux" &&
        profile?.manual_plan_expires_at &&
        new Date(profile.manual_plan_expires_at) > new Date();
      if (!entitlementMatches) {
        const { data: repaired, error: repairError } = await supabase
          .from("yetithumbs_profiles")
          .update({
            plan: profile?.plan_source === "stripe" ? profile.plan : planId,
            plan_source: profile?.plan_source === "stripe" ? "stripe" : "robux",
            manual_plan: planId,
            manual_plan_source: "robux",
            manual_plan_expires_at: expiresAt.toISOString(),
            credits: Math.max(Number(profile?.credits ?? 0), credits),
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id)
          .select("credits, manual_plan_expires_at")
          .single();
        if (repairError) throw fail(`Premium entitlement repair failed: ${repairError.message}`, repairError);
        credits = Number(repaired.credits);
      }
    }
    return {
      user,
      planId,
      planLabel: plan.label,
      monthlyCredits: plan.credits,
      credits,
      expiresAt,
      expiryPersisted: true,
    };
  }

  async function createPromoLink({ kind, percent, months, credits, maxUses, createdBy }) {
    if (kind !== "credits") {
      throw userError("Only credit links are available.");
    }
    if (!Number.isInteger(credits) || credits < 1 || credits > 100000) {
      throw userError("Credits must be a whole number between 1 and 100000.");
    }
    percent = null;
    months = null;
    if (maxUses != null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000000)) {
      throw userError("Maximum uses must be a whole number between 1 and 1000000.");
    }
    const code = `YETI-${randomBytes(7).toString("hex").toUpperCase()}`;
    const { data, error } = await supabase
      .from("yetithumbs_promo_links")
      .insert({
        code,
        kind,
        percent_off: percent,
        duration_months: months,
        credits,
        max_uses: maxUses ?? null,
        created_by_discord_id: String(createdBy),
      })
      .select("code, kind, percent_off, duration_months, credits, max_uses, expires_at")
      .single();
    if (error) throw fail(`Promo link creation failed: ${error.message}`, error);
    return { ...data, url: `${config.publicAppUrl}/signup?promo=${encodeURIComponent(data.code)}` };
  }

  async function createPartnershipDeal({
    code,
    percentOff,
    durationMonths,
    partnerId,
    guildId,
    channelId,
    webhookUrl,
    createdBy,
  }) {
    const normalizedCode = String(code ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(normalizedCode)) {
      throw userError("Code must be 3-32 characters and use only letters, numbers, hyphens, or underscores.");
    }
    if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 100) {
      throw userError("Discount must be a whole percentage between 1 and 100.");
    }
    if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 36) {
      throw userError("Discount duration must be between 1 and 36 months.");
    }
    const { data, error } = await supabase
      .from("yetithumbs_promo_links")
      .insert({
        code: normalizedCode,
        kind: "discount",
        percent_off: percentOff,
        duration_months: durationMonths,
        credits: null,
        created_by_discord_id: String(createdBy),
        partner_discord_id: String(partnerId),
        partner_guild_id: String(guildId),
        partner_channel_id: String(channelId),
        discord_webhook_url: String(webhookUrl),
      })
      .select("id, code, percent_off, duration_months, total_spent_cents")
      .single();
    if (error) {
      if (error.code === "23505") throw userError("That partnership code already exists.");
      throw fail(`Partnership deal creation failed: ${error.message}`, error);
    }
    return data;
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

  return {
    createPromoLink,
    createPartnershipDeal,
    findUserByEmail,
    grantCredits,
    grantPremium,
    healthCheck,
    logError,
  };
}
