import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import { createClient } from '@supabase/supabase-js';

export default {
    data: new SlashCommandBuilder()
        .setName('grant-premium')
        .setDescription('Grant premium to a YetiThumbs user via email (Admin Only)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addStringOption((option) =>
            option.setName('email').setDescription("User's email").setRequired(true)
        )
        .addIntegerOption((option) =>
            option.setName('months').setDescription("Duration in months").setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const rawUrl = process.env.SUPABASE_URL?.trim();
            const supabaseUrl = rawUrl ? new URL(rawUrl).origin : undefined;
            const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
            const email = interaction.options.getString('email');
            const months = interaction.options.getInteger('months');

            const { data: users, error: userError } = await supabase.auth.admin.listUsers();
            if (userError) return interaction.editReply(`Error listing users (v2): ${userError.message}`);
            
            const user = users.users.find(u => u.email === email);
            if (!user) return interaction.editReply(`Could not find a user with the email **${email}** (v2).`);

            const { error: updateError } = await supabase
                .from('yetithumbs_profiles')
                .update({ plan: 'developer' })
                .eq('id', user.id);

            if (updateError) {
                const { error: oldUpdateError } = await supabase
                    .from('users')
                    .upsert({ id: user.id, tier: 'pro' });
                
                if (oldUpdateError) {
                    return interaction.editReply(`Error granting premium: ${oldUpdateError.message}`);
                }
            }

            await interaction.editReply(`Successfully granted **Premium** to **${email}** for ${months} months.`);
        } catch (error) {
            console.error('Error in grant-premium command:', error);
            await interaction.editReply('An unexpected error occurred while granting premium.');
        }
    }
};
