import { logger } from '../../../utils/logger.js';

export default {
    name: 'robux_package_select',
    async execute(interaction) {
        try {
            const pkg = interaction.values[0];
            const packageMap = {
                pkg_10c: { name: "10 Credits for 1,100 Robux", link: "YOUR_GAMEPASS_LINK_HERE_10C" },
                pkg_40c: { name: "40 Credits for 4,100 Robux", link: "YOUR_GAMEPASS_LINK_HERE_40C" },
                pkg_90c: { name: "90 Credits for 9,200 Robux", link: "YOUR_GAMEPASS_LINK_HERE_90C" },
                pkg_1m: { name: "1 Month Premium for 1,200 Robux", link: "YOUR_GAMEPASS_LINK_HERE_1M" },
                pkg_3m: { name: "3 Months Premium for 3,600 Robux", link: "YOUR_GAMEPASS_LINK_HERE_3M" },
                pkg_6m: { name: "6 Months Premium for 7,200 Robux", link: "YOUR_GAMEPASS_LINK_HERE_6M" },
            };

            const selected = packageMap[pkg];

            await interaction.update({ components: [] }); // Remove the dropdown
            await interaction.followUp(
                `Great! You have selected **${selected.name}**.\n\n` +
                `**Step 1:** Please reply with the **Email Address** linked to your YetiThumbs account, AND your **Roblox Username**.\n` +
                `**Step 2:** Purchase the item here: ${selected.link}\n` +
                `**Step 3:** Send a **screenshot of your completed purchase** here in this channel.\n` +
                `\nOnce you've done that, <@&${process.env.DISCORD_ADMIN_ROLE_ID}> will verify the purchase and manually grant your account the items!`
            );
        } catch (err) {
            logger.error("Error handling robux package select:", err);
        }
    }
};
