import { SlashCommandBuilder, PermissionsBitField } from "discord.js";
import {
  getSupabaseAdmin,
  findAuthUserByEmail,
  ensureEphemeralDeferred,
  replyEphemeral,
} from "../../utils/supabaseAdmin.js";

export default {
  data: new SlashCommandBuilder()
    .setName("grant-credits")
    .setDescription("Grant credits to a YetiThumbs user via email (Admin Only)")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption((option) =>
      option.setName("email").setDescription("User's email").setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount of credits")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100000)
    ),

  async execute(interaction) {
    await ensureEphemeralDeferred(interaction);

    try {
      const supabase = getSupabaseAdmin();
      const email = interaction.options.getString("email", true).trim();
      const amount = interaction.options.getInteger("amount", true);

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

      // Primary table used by the website
      const { data: profile, error: profileError } = await supabase
        .from("yetithumbs_profiles")
        .select("credits")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError && profileError.code !== "PGRST116") {
        // Fallback to legacy `users` table if profiles missing
        const { data: legacy, error: legacyFetchError } = await supabase
          .from("users")
          .select("credits")
          .eq("id", user.id)
          .maybeSingle();

        if (legacyFetchError && legacyFetchError.code !== "PGRST116") {
          return replyEphemeral(
            interaction,
            `Error reading profile: ${profileError.message}`
          );
        }

        const current = legacy?.credits ?? 0;
        const { error: legacyUpdateError } = await supabase
          .from("users")
          .upsert({ id: user.id, credits: current + amount });

        if (legacyUpdateError) {
          return replyEphemeral(
            interaction,
            `Error granting credits: ${legacyUpdateError.message}`
          );
        }
      } else {
        const current = profile?.credits ?? 0;
        const { error: updateError } = await supabase
          .from("yetithumbs_profiles")
          .upsert(
            {
              id: user.id,
              email: user.email,
              credits: current + amount,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );

        if (updateError) {
          return replyEphemeral(
            interaction,
            `Error granting credits: ${updateError.message}`
          );
        }
      }

      return replyEphemeral(
        interaction,
        `Granted **${amount} credits** to **${email}**.`
      );
    } catch (error) {
      console.error("Error in grant-credits command:", error);
      return replyEphemeral(
        interaction,
        error?.code === "SUPABASE_CONFIG"
          ? error.message
          : `Unexpected error granting credits: ${error.message}`
      );
    }
  },
};
