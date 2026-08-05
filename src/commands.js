import { SlashCommandBuilder } from "discord.js";

// Commands are intentionally visible to guild members. Discord cannot express
// this bot's configurable staff-role allowlist in default_member_permissions,
// so every privileged handler performs its own fail-closed isStaff check.
export const commands = [
  new SlashCommandBuilder()
    .setName("setup-tickets")
    .setDescription("Staff: post the YetiThumbs support and Robux ticket panel"),
  new SlashCommandBuilder()
    .setName("grant-credits")
    .setDescription("Staff: grant credits to a YetiThumbs account by email")
    .addStringOption((option) =>
      option
        .setName("email")
        .setDescription("Customer's full YetiThumbs email address")
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(254),
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Whole number of credits to add (1-100000)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100000),
    ),
  new SlashCommandBuilder()
    .setName("grant-premium")
    .setDescription("Staff: grant a premium plan to an account by email")
    .addStringOption((option) =>
      option
        .setName("email")
        .setDescription("Customer's full YetiThumbs email address")
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(254),
    )
    .addStringOption((option) =>
      option
        .setName("plan")
        .setDescription("Premium level purchased by the customer")
        .setRequired(true)
        .addChoices(
          { name: "Starter (40 credits/month)", value: "starter" },
          { name: "Developer (90 credits/month)", value: "developer" },
          { name: "Enterprise (350 credits/month)", value: "enterprise" },
        ),
    )
    .addIntegerOption((option) =>
      option
        .setName("months")
        .setDescription("Whole number of premium months (1-36)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(36),
    ),
  new SlashCommandBuilder()
    .setName("create-link")
    .setDescription("Staff: create a credit promo link")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("What the link grants")
        .setRequired(true)
        .addChoices({ name: "Credits", value: "credits" }),
    )
    .addIntegerOption((option) =>
      option
        .setName("credits")
        .setDescription("Credits granted by a credit link (1-100000)")
        .setMinValue(1)
        .setMaxValue(100000),
    )
    .addIntegerOption((option) =>
      option
        .setName("max_uses")
        .setDescription("Maximum redemptions; leave empty for unlimited")
        .setMinValue(1)
        .setMaxValue(1000000),
    ),
  new SlashCommandBuilder()
    .setName("create-partnership")
    .setDescription("Staff: create a partner discount deal and private sales channel")
    .addStringOption((option) =>
      option
        .setName("code")
        .setDescription("Discount code customers enter at signup")
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(32),
    )
    .addIntegerOption((option) =>
      option
        .setName("percent")
        .setDescription("Percentage discount (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    )
    .addUserOption((option) =>
      option
        .setName("partner")
        .setDescription("Partner who can see the private sales channel")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("months")
        .setDescription("Subscription months receiving the discount (1-36)")
        .setMinValue(1)
        .setMaxValue(36),
    ),
].map((command) => command.toJSON());
