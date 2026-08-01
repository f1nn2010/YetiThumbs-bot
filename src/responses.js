import { MessageFlags } from "discord.js";

const ACKNOWLEDGEMENT_ERRORS = new Set([40060, 10062]);

export function publicErrorMessage(error) {
  return typeof error?.publicMessage === "string" && error.publicMessage.trim()
    ? error.publicMessage.trim()
    : null;
}

export async function deferEphemeral(interaction) {
  if (interaction.deferred || interaction.replied) return false;
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return true;
  } catch (error) {
    if (ACKNOWLEDGEMENT_ERRORS.has(error?.code)) return false;
    throw error;
  }
}

export async function respondEphemeral(interaction, content) {
  const payload = typeof content === "string" ? { content } : content;
  if (interaction.deferred) return interaction.editReply(payload);
  if (interaction.replied) {
    return interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
  }
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}
