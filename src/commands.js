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
    .setDescription("Staff: grant the Developer plan to an account by email")
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
        .setName("months")
        .setDescription("Whole number of premium months (1-36)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(36),
    ),
].map((command) => command.toJSON());
