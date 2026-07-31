import { PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { logger } from '../../../utils/logger.js';

export default {
    name: 'ticket_select',
    async execute(interaction) {
        try {
            const selection = interaction.values[0];
            const adminRoleId = process.env.DISCORD_ADMIN_ROLE_ID;

            const existingTickets = interaction.guild.channels.cache
                .filter(c => c.name.startsWith("ticket-"))
                .map(c => parseInt(c.name.replace("ticket-", "")) || 0);
            const nextTicketId = existingTickets.length > 0 ? Math.max(...existingTickets) + 1 : 1;

            const channel = await interaction.guild.channels.create({
                name: `ticket-${nextTicketId}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: [PermissionsBitField.Flags.ViewChannel],
                    },
                    {
                        id: interaction.user.id,
                        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                    },
                    {
                        id: adminRoleId,
                        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                    },
                ],
            });

            const closeButton = new ButtonBuilder()
                .setCustomId("close_ticket_btn")
                .setLabel("Close Ticket")
                .setStyle(ButtonStyle.Danger);
            const closeRow = new ActionRowBuilder().addComponents(closeButton);

            await interaction.reply({
                content: `Your ticket has been created: ${channel}`,
                ephemeral: true,
            });

            if (selection === "support") {
                await channel.send({
                    content: `Welcome ${interaction.user}! <@&${adminRoleId}> will be with you shortly.\n\nPlease describe your issue in detail.`,
                    components: [closeRow]
                });
            } else if (selection === "robux") {
                const robuxEmbed = new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle("Buy Credits/Premium")
                    .setDescription(
                        "**Want to pay with Real Money (Card/PayPal)?**\n" +
                        "Head over to our website: https://yetithumbs.com/pricing\n\n" +
                        "**Want to pay with Robux?**\n" +
                        "Please select the package you wish to purchase below.\n" +
                        "*(Prices are calculated based on Roblox DevEx rates after the 30% marketplace fee)*\n\n" +
                        "**Robux Pricing:**\n" +
                        "• 10 Credits: 1,100 Robux\n" +
                        "• 40 Credits (Starter): 4,100 Robux\n" +
                        "• 90 Credits (Developer): 9,200 Robux\n" +
                        "• 1 Month Premium: 1,200 Robux\n" +
                        "• 3 Months Premium: 3,600 Robux\n" +
                        "• 6 Months Premium: 7,200 Robux"
                    );

                const robuxSelect = new StringSelectMenuBuilder()
                    .setCustomId("robux_package_select")
                    .setPlaceholder("Select a package...")
                    .addOptions(
                        new StringSelectMenuOptionBuilder().setLabel("10 Credits (1,100 R$)").setValue("pkg_10c"),
                        new StringSelectMenuOptionBuilder().setLabel("40 Credits (4,100 R$)").setValue("pkg_40c"),
                        new StringSelectMenuOptionBuilder().setLabel("90 Credits (9,200 R$)").setValue("pkg_90c"),
                        new StringSelectMenuOptionBuilder().setLabel("1 Month Premium (1,200 R$)").setValue("pkg_1m"),
                        new StringSelectMenuOptionBuilder().setLabel("3 Months Premium (3,600 R$)").setValue("pkg_3m"),
                        new StringSelectMenuOptionBuilder().setLabel("6 Months Premium (7,200 R$)").setValue("pkg_6m")
                    );

                const robuxRow = new ActionRowBuilder().addComponents(robuxSelect);
                await channel.send({ content: `${interaction.user} | <@&${adminRoleId}>`, embeds: [robuxEmbed], components: [robuxRow, closeRow] });
            }
        } catch (err) {
            logger.error("Error creating ticket channel:", err);
            if (!interaction.replied) {
                await interaction.reply({ content: "There was an error creating your ticket.", ephemeral: true }).catch(() => {});
            }
        }
    }
};
