require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField,
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { createClient } = require("@supabase/supabase-js");

// Environment Variables
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminRoleId = process.env.DISCORD_ADMIN_ROLE_ID;

if (!token || !clientId || !guildId || !supabaseUrl || !supabaseServiceKey || !adminRoleId) {
  console.error("Missing required environment variables. Please check your .env file.");
  process.exit(1);
}

// Initialize Supabase
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize Discord Client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// Slash Commands Definition
const commands = [
  new SlashCommandBuilder()
    .setName("setup-tickets")
    .setDescription("Deploy the ticket creation menu (Admin Only)")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder()
    .setName("grant-credits")
    .setDescription("Grant credits to a YetiThumbs user via email (Admin Only)")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption((option) =>
      option.setName("email").setDescription("User's email").setRequired(true)
    )
    .addIntegerOption((option) =>
      option.setName("amount").setDescription("Amount of credits").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("grant-premium")
    .setDescription("Grant premium to a YetiThumbs user via email (Admin Only)")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption((option) =>
      option.setName("email").setDescription("User's email").setRequired(true)
    )
    .addIntegerOption((option) =>
      option.setName("months").setDescription("Duration in months").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("close-ticket")
    .setDescription("Close and delete the current ticket channel (Admin Only)")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
];

// Register Slash Commands
const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });
    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();

// Ticket Counter (in-memory for simple ticket naming)
let ticketCounter = 1;

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("interactionCreate", async (interaction) => {
  // Slash Commands
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === "setup-tickets") {
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
    }

    if (commandName === "grant-credits") {
      const email = interaction.options.getString("email");
      const amount = interaction.options.getInteger("amount");
      await interaction.deferReply({ ephemeral: true });

      const { data: users, error: userError } = await supabase.auth.admin.listUsers();
      if (userError) {
         return interaction.editReply(`Error listing users: ${userError.message}`);
      }
      
      const user = users.users.find(u => u.email === email);
      if (!user) {
        return interaction.editReply(`Could not find a user with the email **${email}**.`);
      }

      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('credits')
        .eq('id', user.id)
        .single();
        
      let currentCredits = userData?.credits ?? 0;
      if (fetchError && fetchError.code !== 'PGRST116') {
        return interaction.editReply(`Error fetching user data: ${fetchError.message}`);
      }

      const { error: updateError } = await supabase
        .from('users')
        .upsert({ id: user.id, credits: currentCredits + amount });

      if (updateError) {
        return interaction.editReply(`Error granting credits: ${updateError.message}`);
      }

      await interaction.editReply(`Successfully granted **${amount} credits** to **${email}**.`);
    }

    if (commandName === "grant-premium") {
      const email = interaction.options.getString("email");
      const months = interaction.options.getInteger("months");
      await interaction.deferReply({ ephemeral: true });

      const { data: users, error: userError } = await supabase.auth.admin.listUsers();
      if (userError) return interaction.editReply(`Error listing users: ${userError.message}`);
      
      const user = users.users.find(u => u.email === email);
      if (!user) return interaction.editReply(`Could not find a user with the email **${email}**.`);

      const { error: updateError } = await supabase
        .from('users')
        .upsert({ id: user.id, tier: 'pro' });

      if (updateError) return interaction.editReply(`Error granting premium: ${updateError.message}`);

      await interaction.editReply(`Successfully granted **Premium** to **${email}** for ${months} months.`);
    }

    if (commandName === "close-ticket") {
      if (!interaction.channel.name.startsWith("ticket-")) {
        return interaction.reply({ content: "This command can only be used in a ticket channel.", ephemeral: true });
      }
      await interaction.reply("Closing ticket in 5 seconds...");
      setTimeout(() => interaction.channel.delete().catch(console.error), 5000);
    }
  }

  // String Select Menus (Dropdowns)
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "ticket_select") {
      const selection = interaction.values[0];
      const categoryName = selection === "support" ? "Support" : "Robux Purchase";

      try {
        // Calculate the next ticket number dynamically
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
              deny: [PermissionsBitField.Flags.ViewChannel], // Deny everyone
            },
            {
              id: interaction.user.id,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages], // Allow creator
            },
            {
              id: adminRoleId,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages], // Allow admins
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
            content: `Welcome ${interaction.user}! <@&1532481208490131651> or <@&1532481208490131652> will be with you shortly.\n\nPlease describe your issue in detail.`,
            components: [closeRow]
          });
        } else if (selection === "robux") {
          const robuxEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle("Buy Credits/Premium with Robux")
            .setDescription(
              "Thank you for your interest! Please select the package you wish to purchase below.\n\n" +
              "*(Prices are calculated based on Roblox DevEx rates after the 30% marketplace fee)*\n\n" +
              "**Pricing:**\n" +
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
          await channel.send({ content: `${interaction.user} | <@&1532481208490131651> <@&1532481208490131652>`, embeds: [robuxEmbed], components: [robuxRow, closeRow] });
        }
      } catch (err) {
        console.error("Error creating ticket channel:", err);
        await interaction.reply({ content: "There was an error creating your ticket.", ephemeral: true });
      }
    }

    if (interaction.customId === "robux_package_select") {
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
        `\nOnce you've done that, <@&1532481208490131651> or <@&1532481208490131652> will verify the purchase and manually grant your account the items!`
      );
    }
  }

  // Buttons
  if (interaction.isButton()) {
    if (interaction.customId === "close_ticket_btn") {
      // Check if user has admin role
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (
        !member.roles.cache.has("1532481208490131651") &&
        !member.roles.cache.has("1532481208490131652") &&
        !member.permissions.has(PermissionsBitField.Flags.Administrator)
      ) {
        return interaction.reply({ content: "Only administrators can close tickets.", ephemeral: true });
      }

      await interaction.reply("Closing ticket in 5 seconds...");
      setTimeout(() => interaction.channel.delete().catch(console.error), 5000);
    }
  }
});

client.login(token);
