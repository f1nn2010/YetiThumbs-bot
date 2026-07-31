import { PermissionsBitField } from 'discord.js';
import { logger } from '../../../utils/logger.js';

export default {
    name: 'close_ticket_btn',
    async execute(interaction) {
        try {
            const adminRoleId = process.env.DISCORD_ADMIN_ROLE_ID;
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (
                !member.roles.cache.has(adminRoleId) &&
                !member.roles.cache.has("1532481208490131652") &&
                !member.permissions.has(PermissionsBitField.Flags.Administrator)
            ) {
                return interaction.reply({ content: "Only administrators can close tickets.", ephemeral: true });
            }

            await interaction.reply("Closing ticket in 5 seconds...");
            setTimeout(() => interaction.channel.delete().catch(console.error), 5000);
        } catch (err) {
            logger.error("Error handling close ticket button:", err);
            if (!interaction.replied) {
                await interaction.reply({ content: "Error closing ticket.", ephemeral: true }).catch(() => {});
            }
        }
    }
};
