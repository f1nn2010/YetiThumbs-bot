import { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setup-tickets')
        .setDescription('Deploy the ticket creation menu (Admin Only)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    async execute(interaction) {
        try {
            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle("YetiThumbs Support & Robux Purchases")
                .setDescription(
                  "Need help or want to buy credits/premium with Robux?\n\nSelect an option below to open a private ticket!"
                );

            const select = new StringSelectMenuBuilder()
                .setCustomId("ticket_select")
                .setPlaceholder("Select a category...")
                .addOptions(
                  new StringSelectMenuOptionBuilder()
                    .setLabel("🛠️ Support")
                    .setDescription("Get help with bugs or general questions")
                    .setValue("support"),
                  new StringSelectMenuOptionBuilder()
                    .setLabel("💎 Buy Credits/Premium with Robux")
                    .setDescription("Manual purchase via Robux gamepass")
                    .setValue("robux")
                );

            const row = new ActionRowBuilder().addComponents(select);

            await interaction.reply({ content: "Setting up tickets...", ephemeral: true });
            await interaction.channel.send({ embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error in setup-tickets command:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while setting up tickets.', ephemeral: true });
            }
        }
    }
};
