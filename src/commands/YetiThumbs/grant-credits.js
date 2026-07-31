import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default {
    data: new SlashCommandBuilder()
        .setName('grant-credits')
        .setDescription('Grant credits to a YetiThumbs user via email (Admin Only)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addStringOption((option) =>
            option.setName('email').setDescription("User's email").setRequired(true)
        )
        .addIntegerOption((option) =>
            option.setName('amount').setDescription("Amount of credits").setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const email = interaction.options.getString('email');
            const amount = interaction.options.getInteger('amount');

            const { data: users, error: userError } = await supabase.auth.admin.listUsers();
            if (userError) {
                return interaction.editReply(`Error listing users: ${userError.message}`);
            }

            const user = users.users.find((u) => u.email === email);
            if (!user) {
                return interaction.editReply(`Could not find a user with the email **${email}**.`);
            }

            // Using yetithumbs_profiles per recent updates we made in the web app, but old index.js used 'users' and 'credits'
            // The old bot code used 'users' table, wait. The yetithumbs web app uses 'yetithumbs_profiles'.
            // Let's use yetithumbs_profiles for consistency.
            const { data: userData, error: fetchError } = await supabase
                .from('yetithumbs_profiles')
                .select('credits')
                .eq('id', user.id)
                .single();

            let currentCredits = userData?.credits ?? 0;
            if (fetchError && fetchError.code !== 'PGRST116') {
                // If it fails for something other than not found, we use 'users' table as fallback just in case
                const { data: oldUserData, error: oldFetchError } = await supabase
                    .from('users')
                    .select('credits')
                    .eq('id', user.id)
                    .single();
                currentCredits = oldUserData?.credits ?? 0;
                
                if (oldFetchError && oldFetchError.code !== 'PGRST116') {
                    return interaction.editReply(`Error fetching user data: ${oldFetchError.message}`);
                }
                
                const { error: updateError } = await supabase
                    .from('users')
                    .upsert({ id: user.id, credits: currentCredits + amount });

                if (updateError) {
                    return interaction.editReply(`Error granting credits: ${updateError.message}`);
                }
            } else {
                const { error: updateError } = await supabase
                    .from('yetithumbs_profiles')
                    .update({ credits: currentCredits + amount })
                    .eq('id', user.id);

                if (updateError) {
                    return interaction.editReply(`Error granting credits: ${updateError.message}`);
                }
            }

            await interaction.editReply(`Successfully granted **${amount} credits** to **${email}**.`);
        } catch (error) {
            console.error('Error in grant-credits command:', error);
            await interaction.editReply('An unexpected error occurred while granting credits.');
        }
    }
};
