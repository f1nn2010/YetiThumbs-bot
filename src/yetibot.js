import { createServer } from "node:http";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { loadConfig } from "./config.js";
import {
  isTicketForUser,
  nextTicketNumber,
  ticketTopic,
} from "./domain.js";
import { deferEphemeral, respondEphemeral } from "./responses.js";
import { createYetiService } from "./yetiService.js";

const config = loadConfig();
const yeti = createYetiService(config);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const ticketLocks = new Map();
let ready = false;

const commands = [
  new SlashCommandBuilder()
    .setName("setup-tickets")
    .setDescription("Post the YetiThumbs support and Robux ticket panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("grant-credits")
    .setDescription("Grant credits to a YetiThumbs account by email")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option.setName("email").setDescription("Account email").setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Credits to add")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100000),
    ),
  new SlashCommandBuilder()
    .setName("grant-premium")
    .setDescription("Grant the Developer plan to an account by email")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option.setName("email").setDescription("Account email").setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("months")
        .setDescription("Premium duration in months")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(36),
    ),
].map((command) => command.toJSON());

function isStaff(member) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  if (config.ownerIds.includes(member.id)) return true;
  return config.staffRoleIds.some((id) => member.roles?.cache?.has?.(id));
}

function staffMention() {
  return config.staffRoleIds.length
    ? config.staffRoleIds.map((id) => `<@&${id}>`).join(" ")
    : "Staff";
}

async function withTicketLock(guildId, operation) {
  const previous = ticketLocks.get(guildId) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  ticketLocks.set(guildId, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (ticketLocks.get(guildId) === current) ticketLocks.delete(guildId);
  }
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(config.token);
  if (config.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands },
    );
    // Remove stale TitanBot global commands. Guild commands appear immediately.
    await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
    console.log(`Registered ${commands.length} commands in guild ${config.guildId}`);
    return;
  }

  await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
  console.log(`Registered ${commands.length} global commands`);
}

async function setupTickets(interaction) {
  if (!isStaff(interaction.member)) {
    return respondEphemeral(interaction, "Only configured staff can post the ticket panel.");
  }
  if (!interaction.channel?.isTextBased?.()) {
    return respondEphemeral(interaction, "Run this command in a text channel.");
  }

  const panel = new EmbedBuilder()
    .setColor(0x39dcff)
    .setTitle("YetiThumbs Support & Robux Purchases")
    .setDescription(
      [
        "Need account help, found a bug, or want to pay with Robux?",
        "",
        "Choose a category below. The bot creates a private channel for you and the YetiThumbs team.",
      ].join("\n"),
    )
    .setFooter({ text: "Never post passwords, tokens, or payment details." });

  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("Choose a ticket type")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Support")
        .setEmoji("🛠️")
        .setDescription("Account help, bugs, and questions")
        .setValue("support"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Buy with Robux")
        .setEmoji("💎")
        .setDescription("Credits or Developer premium")
        .setValue("robux"),
    );

  await interaction.channel.send({
    embeds: [panel],
    components: [new ActionRowBuilder().addComponents(select)],
  });
  return respondEphemeral(interaction, "Ticket panel posted successfully.");
}

function closeButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("close_ticket_btn")
      .setLabel("Close ticket")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger),
  );
}

function robuxMenu() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("robux_package_select")
    .setPlaceholder("Choose a credits or premium package");

  for (const [value, item] of Object.entries(config.robuxPackages)) {
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(`${item.label} (${item.price.toLocaleString("en-GB")} R$)`)
        .setValue(value),
    );
  }
  return new ActionRowBuilder().addComponents(menu);
}

async function createTicket(interaction) {
  const kind = interaction.values[0];
  if (!interaction.guild || !["support", "robux"].includes(kind)) {
    return respondEphemeral(interaction, "That ticket type is not available.");
  }
  await deferEphemeral(interaction);

  return withTicketLock(interaction.guild.id, async () => {
    const channels = await interaction.guild.channels.fetch();
    const existing = channels.find((channel) =>
      isTicketForUser(channel, interaction.user.id),
    );
    if (existing) {
      return respondEphemeral(
        interaction,
        `You already have an open ticket: ${existing}`,
      );
    }

    const permissionOverwrites = [
      {
        id: interaction.guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
        ],
      },
      ...config.staffRoleIds.map((id) => ({
        id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
        ],
      })),
    ];

    const parent = channels.get(config.ticketCategoryId);
    const channel = await interaction.guild.channels.create({
      name: `ticket-${nextTicketNumber(channels.values())}`,
      type: ChannelType.GuildText,
      parent: parent?.type === ChannelType.GuildCategory ? parent.id : undefined,
      topic: ticketTopic(interaction.user.id, kind),
      permissionOverwrites,
      reason: `YetiThumbs ${kind} ticket opened by ${interaction.user.tag}`,
    });

    await respondEphemeral(interaction, `Your private ticket is ready: ${channel}`);

    if (kind === "support") {
      await channel.send({
        content: [
          `${interaction.user} ${staffMention()}`,
          "",
          "Please describe the problem and include the email on your YetiThumbs account.",
          "Do not send passwords, tokens, or full payment details.",
        ].join("\n"),
        components: [closeButton()],
      });
      return;
    }

    const prices = Object.values(config.robuxPackages)
      .map((item) => `• ${item.label} — ${item.price.toLocaleString("en-GB")} R$`)
      .join("\n");
    await channel.send({
      content: `${interaction.user} ${staffMention()}`,
      embeds: [
        new EmbedBuilder()
          .setColor(0x64f2b6)
          .setTitle("Buy YetiThumbs with Robux")
          .setDescription(
            [
              "Choose a package below, then send your YetiThumbs email, Roblox username, and purchase screenshot.",
              "",
              prices,
              "",
              "Card or PayPal: https://yetithumbs.com/pricing",
            ].join("\n"),
          ),
      ],
      components: [robuxMenu(), closeButton()],
    });
  });
}

async function selectRobuxPackage(interaction) {
  const item = config.robuxPackages[interaction.values[0]];
  if (!item) return respondEphemeral(interaction, "That package is not available.");

  await interaction.update({ components: [closeButton()] });
  const purchaseLine = item.link
    ? `Purchase link: ${item.link}`
    : "A staff member will provide the purchase link in this ticket.";
  return interaction.channel.send({
    content: [
      `${interaction.user} selected **${item.label}** for **${item.price.toLocaleString("en-GB")} Robux**.`,
      "",
      "1. Send the email on your YetiThumbs account.",
      "2. Send your Roblox username.",
      `3. ${purchaseLine}`,
      "4. Upload a screenshot showing the completed purchase.",
      "",
      `${staffMention()} will verify it, then use the matching grant command.`,
    ].join("\n"),
  });
}

async function grantCredits(interaction) {
  if (!isStaff(interaction.member)) {
    return respondEphemeral(interaction, "Only configured staff can grant credits.");
  }
  await deferEphemeral(interaction);
  const email = interaction.options.getString("email", true);
  const amount = interaction.options.getInteger("amount", true);
  const result = await yeti.grantCredits(email, amount);
  return respondEphemeral(
    interaction,
    `Granted **${amount} credits** to **${result.user.email}**. New balance: **${result.credits}**.`,
  );
}

async function grantPremium(interaction) {
  if (!isStaff(interaction.member)) {
    return respondEphemeral(interaction, "Only configured staff can grant premium.");
  }
  await deferEphemeral(interaction);
  const email = interaction.options.getString("email", true);
  const months = interaction.options.getInteger("months", true);
  const result = await yeti.grantPremium(email, months);
  const expiryNote = result.expiryPersisted
    ? `Expires: **${result.expiresAt.toUTCString()}**.`
    : "The plan was granted, but the website entitlement migration must be deployed before automatic expiry works.";
  return respondEphemeral(
    interaction,
    `Granted **Developer** premium and **${result.credits} credits** to **${result.user.email}** for **${months} month(s)**. ${expiryNote}`,
  );
}

async function closeTicket(interaction) {
  if (!isStaff(interaction.member)) {
    return respondEphemeral(interaction, "Only configured staff can close tickets.");
  }
  if (!interaction.channel?.name?.match(/^ticket-\d+$/)) {
    return respondEphemeral(interaction, "This button is not in a YetiThumbs ticket.");
  }

  await interaction.reply({
    content: "Ticket closed by staff. This channel will be deleted in 5 seconds.",
    flags: MessageFlags.Ephemeral,
  });
  setTimeout(() => {
    interaction.channel.delete("YetiThumbs ticket closed by staff").catch(console.error);
  }, 5000);
}

async function reportInteractionError(interaction, error) {
  console.error("Interaction failed", error);
  await yeti
    .logError("interaction", error, {
      interaction_id: interaction.id,
      guild_id: interaction.guildId,
      user_id: interaction.user?.id,
      command: interaction.commandName,
      custom_id: interaction.customId,
    })
    .catch((loggingError) => console.error("Error logging failed", loggingError));

  try {
    await respondEphemeral(
      interaction,
      `Something went wrong while handling that request. Staff can use interaction ID \`${interaction.id}\` to find the error log.`,
    );
  } catch (replyError) {
    if (![40060, 10062].includes(replyError?.code)) console.error(replyError);
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Discord connected as ${readyClient.user.tag}`);
  try {
    await registerCommands();
    const health = await yeti.healthCheck();
    if (!health.entitlementSchemaReady) {
      console.warn(`Supabase entitlement migration pending: ${health.schemaError}`);
    }
    ready = true;
    console.log(`ONLINE: ${commands.length} commands, ${readyClient.guilds.cache.size} guild(s)`);
  } catch (error) {
    ready = false;
    console.error("Startup validation failed", error);
    await yeti.logError("startup", error).catch(() => {});
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "setup-tickets") return await setupTickets(interaction);
      if (interaction.commandName === "grant-credits") return await grantCredits(interaction);
      if (interaction.commandName === "grant-premium") return await grantPremium(interaction);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "ticket_select") return await createTicket(interaction);
      if (interaction.customId === "robux_package_select") {
        return await selectRobuxPackage(interaction);
      }
      return;
    }
    if (interaction.isButton() && interaction.customId === "close_ticket_btn") {
      return await closeTicket(interaction);
    }
  } catch (error) {
    await reportInteractionError(interaction, error);
  }
});

const server = createServer((request, response) => {
  response.setHeader("content-type", "application/json; charset=utf-8");
  if (request.url === "/health") {
    response.writeHead(200);
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (request.url === "/ready") {
    response.writeHead(ready ? 200 : 503);
    response.end(JSON.stringify({ status: ready ? "ready" : "starting" }));
    return;
  }
  response.writeHead(404);
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(config.port, config.host, () => {
  console.log(`Health server listening on ${config.host}:${config.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  ready = false;
  server.close();
  client.destroy();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

console.log("Starting YetiThumbs bot");
await client.login(config.token);
