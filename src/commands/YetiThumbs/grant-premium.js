import { SlashCommandBuilder, PermissionsBitField } from "discord.js";
import {
  getSupabaseAdmin,
  findAuthUserByEmail,
  ensureEphemeralDeferred,
  replyEphemeral,
  PREMIUM_PLAN,
  PREMIUM_CREDITS,
} from "../../utils/supabaseAdmin.js";

export default {
  data: new SlashCommandBuilder()
    .setName("grant-premium")
    .setDescription(
      "Grant premium (Developer plan) to a YetiThumbs user via email (Admin Only)"
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption((option) =>
      option.setName("email").setDescription("User's email").setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("months")
        .setDescription("Duration in months")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(36)
    ),

  async execute(interaction) {
    await ensureEphemeralDeferred(interaction);

    try {
      const supabase = getSupabaseAdmin();
      const email = interaction.options.getString("email", true).trim();
      const months = interaction.options.getInteger("months", true);

      const { user, error: userError } = await findAuthUserByEmail(
        supabase,
        email
      );
      if (userError) {
        return replyEphemeral(
          interaction,
          `Error looking up users: ${userError.message}\n\nCheck that SUPABASE_URL is \`https://YOURPROJECT.supabase.co\` and SUPABASE_SERVICE_ROLE_KEY is the **service_role** key (not the anon/publishable key).`
        );
      }
      if (!user) {
        return replyEphemeral(
          interaction,
          `Could not find a YetiThumbs account with email **${email}**. They must sign up on the website first.`
        );
      }

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + months);
      const expiresIso = expiresAt.toISOString();

      // Match website schema: yetithumbs_profiles.plan + credits
      const { error: updateError } = await supabase
        .from("yetithumbs_profiles")
        .upsert(
          {
            id: user.id,
            email: user.email,
            plan: PREMIUM_PLAN,
            credits: PREMIUM_CREDITS,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );

      if (updateError) {
        // Legacy fallback
        const { error: legacyError } = await supabase.from("users").upsert({
          id: user.id,
          tier: "pro",
          plan: PREMIUM_PLAN,
        });
        if (legacyError) {
          return replyEphemeral(
            interaction,
            `Error granting premium: ${updateError.message}`
          );
        }
      }

      return replyEphemeral(
        interaction,
        `Granted **${PREMIUM_PLAN}** plan (${PREMIUM_CREDITS} credits) to **${email}** for **${months} month(s)**.\nPremium window ends around **${expiresAt.toUTCString()}** (manual Robux grant — cancel later if needed).`
      );
    } catch (error) {
      console.error("Error in grant-premium command:", error);
      return replyEphemeral(
        interaction,
        error?.code === "SUPABASE_CONFIG"
          ? error.message
          : `Unexpected error granting premium: ${error.message}`
      );
    }
  },
};
