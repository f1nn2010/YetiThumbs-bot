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
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { commands } from "./commands.js";
import { loadConfig } from "./config.js";
import {
  isTicketForUser,
  nextTicketNumber,
  ticketTopic,
} from "./domain.js";
import {
  deferEphemeral,
  publicErrorMessage,
  respondEphemeral,
} from "./responses.js";
import {
  creditPackageMenu,
  formatMonthlyRobux,
  formatRobux,
  premiumDurationMenu,
  premiumPurchase,
  premiumTierMenu,
  purchaseTypeMenu,
  robuxLinkCoverage,
} from "./purchaseFlow.js";
import { createYetiService } from "./yetiService.js";

const config = loadConfig();
const yeti = createYetiService(config);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const ticketLocks = new Map();
const inMemoryTicketCounters = new Map();
let ready = false;
let startupValidated = false;
let shuttingDown = false;

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

function formatUsdCents(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Math.max(0, Number(cents) || 0) / 100);
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

// Allocate ticket numbers monotonically for the lifetime of this bot process.
// Existing channel names seed the counter so an upgrade never starts at 1.
// The per-guild lock above makes allocation safe when users open tickets at
// the same time; keeping the counter separate from channels prevents reuse
// after a ticket is deleted during the same deployment.
function allocateTicketNumber(guildId, channels) {
  const highestExisting = nextTicketNumber(channels) - 1;
  const next = Math.max(
    highestExisting + 1,
    (inMemoryTicketCounters.get(guildId) ?? 0) + 1,
  );
  inMemoryTicketCounters.set(guildId, next);
  return next;
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(config.token);
  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commands },
  );
  // Guild commands appear immediately; clear any stale global commands.
  await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
  console.log(
    `Registered ${commands.length} commands in guild ${config.guildId}: ${commands
      .map((command) => `/${command.name}`)
      .join(", ")}`,
  );
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
        .setDescription("Credits or Starter, Developer, and Enterprise premium")
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

function purchaseEmbed(title, lines) {
  return new EmbedBuilder()
    .setColor(0x64f2b6)
    .setTitle(title)
    .setDescription([...lines, "", "Card or PayPal: https://yetithumbs.com/pricing"].join("\n"))
    .setFooter({ text: "Never send passwords, tokens, or payment card details." });
}

async function requireTicketCustomer(interaction) {
  const topic = String(interaction.channel?.topic ?? "");
  if (
    !isTicketForUser(interaction.channel, interaction.user.id) ||
    !topic.includes("kind=robux")
  ) {
    await respondEphemeral(
      interaction,
      "Only the customer who opened this Robux ticket can make its purchase selections.",
    );
    return false;
  }
  return true;
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
    const ticketNumber = allocateTicketNumber(
      interaction.guild.id,
      channels.values(),
    );
    const channel = await interaction.guild.channels.create({
      name: `ticket-${ticketNumber}`,
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

    await channel.send({
      content: `${interaction.user} ${staffMention()}`,
      embeds: [
        purchaseEmbed("Buy YetiThumbs with Robux", [
          "Choose whether you want one-time credits or a premium plan.",
          "Premium includes Starter, Developer, and Enterprise levels.",
        ]),
      ],
      components: [purchaseTypeMenu(), closeButton()],
    });
  });
}

async function selectPurchaseType(interaction) {
  if (!(await requireTicketCustomer(interaction))) return;
  const type = interaction.values[0];
  if (type === "credits") {
    const prices = Object.values(config.creditPackages).map(
      (item) => `• **${item.label}:** ${formatRobux(item.price)}`,
    );
    return interaction.update({
      embeds: [
        purchaseEmbed("Choose a Credits Package", [
          "Credits are added once after staff verifies the Roblox purchase.",
          "",
          ...prices,
        ]),
      ],
      components: [creditPackageMenu(config), closeButton()],
    });
  }
  if (type === "premium") {
    const levels = Object.values(config.premiumPlans).map(
      (plan) =>
        `• **${plan.label}:** ${plan.credits} credits/month · ${formatMonthlyRobux(plan.monthlyRobuxPrice)}`,
    );
    return interaction.update({
      embeds: [
        purchaseEmbed("Choose a Premium Level", [
          "Premium credits refresh monthly while the grant is active.",
          "",
          ...levels,
        ]),
      ],
      components: [premiumTierMenu(config), closeButton()],
    });
  }
  return respondEphemeral(interaction, "That purchase type is not available.");
}

async function selectCreditPackage(interaction) {
  if (!(await requireTicketCustomer(interaction))) return;
  const item = config.creditPackages[interaction.values[0]];
  if (!item) return respondEphemeral(interaction, "That package is not available.");

  await interaction.update({
    embeds: [
      purchaseEmbed("Credits Package Selected", [
        `You selected **${item.label}** for **${formatRobux(item.price)}**.`,
        "Follow the instructions posted below.",
      ]),
    ],
    components: [closeButton()],
  });
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
      `${staffMention()} will verify it, then use '/grant-credits' for **${item.credits} credits**.`,
    ].join("\n"),
  });
}

async function selectPremiumTier(interaction) {
  if (!(await requireTicketCustomer(interaction))) return;
  const planId = interaction.values[0];
  const plan = config.premiumPlans[planId];
  if (!plan) return respondEphemeral(interaction, "That premium level is not available.");

  return interaction.update({
    embeds: [
      purchaseEmbed(`Choose ${plan.label} Duration`, [
        `**${plan.label} Premium** includes **${plan.credits} credits every month**.`,
        `Monthly Robux price: **${formatMonthlyRobux(plan.monthlyRobuxPrice)}**.`,
      ]),
    ],
    components: [premiumDurationMenu(config, planId), closeButton()],
  });
}

async function selectPremiumDuration(interaction) {
  if (!(await requireTicketCustomer(interaction))) return;
  const planId = interaction.customId.split(":")[1];
  const purchase = premiumPurchase(config, planId, interaction.values[0]);
  if (!purchase) return respondEphemeral(interaction, "That premium option is not available.");

  await interaction.update({
    embeds: [
      purchaseEmbed("Premium Package Selected", [
        `You selected **${purchase.label} Premium** for **${purchase.months} month(s)**.`,
        `Includes **${purchase.credits} credits every month**.`,
        `Robux price: **${formatRobux(purchase.price)}**.`,
        "Follow the instructions posted below.",
      ]),
    ],
    components: [closeButton()],
  });

  const priceLine = Number.isSafeInteger(purchase.price)
    ? `Price: **${formatRobux(purchase.price)}**.`
    : "A staff member will confirm the Robux price before you purchase.";
  const purchaseLine = purchase.link
    ? `Purchase link: ${purchase.link}`
    : "A staff member will provide the matching purchase link in this ticket.";
  return interaction.channel.send({
    content: [
      `${interaction.user} selected **${purchase.label} Premium** for **${purchase.months} month(s)**.`,
      `Entitlement: **${purchase.credits} credits every month**. ${priceLine}`,
      "",
      "1. Send the email on your YetiThumbs account.",
      "2. Send your Roblox username.",
      `3. ${purchaseLine}`,
      "4. Upload a screenshot showing the completed purchase.",
      "",
      `${staffMention()} will verify it, then use '/grant-premium' with plan **${purchase.label}** and **${purchase.months} month(s)**.`,
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
  const planId = interaction.options.getString("plan", true);
  const months = interaction.options.getInteger("months", true);
  const result = await yeti.grantPremium(email, planId, months);
  const expiryNote = result.expiryPersisted
    ? `Expires: **${result.expiresAt.toUTCString()}**.`
    : "The plan was granted, but the website entitlement migration must be deployed before automatic expiry works.";
  return respondEphemeral(
    interaction,
    `Granted **${result.planLabel}** premium (**${result.monthlyCredits} credits/month**) to **${result.user.email}** for **${months} month(s)**. Current balance: **${result.credits}**. ${expiryNote}`,
  );
}

async function createPromoLink(interaction) {
  if (!isStaff(interaction.member)) {
    return respondEphemeral(interaction, "Only configured staff can create promo links.");
  }
  await deferEphemeral(interaction);
  const kind = interaction.options.getString("type", true);
  const result = await yeti.createPromoLink({
    kind,
    percent: interaction.options.getInteger("percent"),
    months: interaction.options.getInteger("months"),
    credits: interaction.options.getInteger("credits"),
    maxUses: interaction.options.getInteger("max_uses"),
    createdBy: interaction.user.id,
  });
    const details = `${result.credits} credits`;
    const limit = result.max_uses ? ` Maximum uses: ${result.max_uses}.` : " Unlimited uses.";
    const embed = new EmbedBuilder()
      .setColor(0x64f2b6)
      .setTitle("YetiThumbs credit link")
      .setURL(result.url)
      .setDescription(
        `Redeem **${result.credits} credits** on a YetiThumbs account.`,
      )
      .addFields(
        { name: "How it works", value: "Open the link, create or sign in to your account, and the benefit is applied automatically. Each account can redeem this link once.", inline: false },
        { name: "Availability", value: result.max_uses ? `${result.max_uses} total redemption(s)` : "No redemption limit", inline: true },
      )
      .setFooter({ text: "YetiThumbs • once per account" });
    return respondEphemeral(
      interaction,
      {
        content: `Created **${details}** promo link.${limit}`,
        embeds: [embed],
        components: [
          {
            type: 1,
            components: [{ type: 2, style: 5, label: "Open YetiThumbs", url: result.url }],
          },
        ],
      },
    );
}

async function createPartnership(interaction) {
  if (!isStaff(interaction.member)) {
    return respondEphemeral(interaction, "Only configured staff can create partnership deals.");
  }
  if (!interaction.guild) {
    return respondEphemeral(interaction, "This command must be used inside the configured server.");
  }
  await deferEphemeral(interaction);

  const code = interaction.options.getString("code", true).trim().toUpperCase();
  const percentOff = interaction.options.getInteger("percent", true);
  const partner = interaction.options.getUser("partner", true);
  const durationMonths = interaction.options.getInteger("months") ?? 1;
  const safeCode = code.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 70);
  const channelName = `partnership-${safeCode}`;
  let partnershipCategory = config.partnershipCategoryId
    ? interaction.guild.channels.cache.get(config.partnershipCategoryId)
    : interaction.guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildCategory &&
          channel.name.toLowerCase() === "yetithumbs partnerships",
      );

  if (partnershipCategory && partnershipCategory.type !== ChannelType.GuildCategory) {
    return respondEphemeral(
      interaction,
      "The configured partnership category is not a Discord category. Set DISCORD_PARTNERSHIP_CATEGORY_ID to a category ID and try again.",
    );
  }

  const permissionOverwrites = [
    {
      id: interaction.guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: partner.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    {
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageWebhooks,
      ],
    },
    ...config.staffRoleIds.map((id) => ({
      id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageWebhooks,
      ],
    })),
  ];

  let channel;
  try {
    if (!partnershipCategory) {
      partnershipCategory = await interaction.guild.channels.create({
        name: "YetiThumbs Partnerships",
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ManageChannels,
            ],
          },
          ...config.staffRoleIds.map((id) => ({
            id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ManageChannels,
            ],
          })),
        ],
        reason: "YetiThumbs partnership category setup",
      });
    }

    channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: partnershipCategory.id,
      topic: `YetiThumbs partnership ${code} for ${partner.id}`,
      permissionOverwrites,
      reason: `Partnership deal ${code} created by ${interaction.user.tag}`,
    });
    const webhook = await channel.createWebhook({ name: "YetiThumbs Partnership" });
    const deal = await yeti.createPartnershipDeal({
      code,
      percentOff,
      durationMonths,
      partnerId: partner.id,
      guildId: interaction.guild.id,
      channelId: channel.id,
      webhookUrl: webhook.url,
      createdBy: interaction.user.id,
    });

    await channel.send({
      content: `${partner} ${staffMention()}`,
      embeds: [
        new EmbedBuilder()
          .setColor(0x64f2b6)
          .setTitle("YetiThumbs partnership deal")
          .setDescription("This private channel tracks every paid subscription using the partner code.")
          .addFields(
            { name: "Code", value: `\`${deal.code}\``, inline: true },
            { name: "Discount", value: `${deal.percent_off}% off`, inline: true },
            { name: "Duration", value: `${deal.duration_months} month(s)`, inline: true },
            { name: "Sales total", value: "$0.00 USD", inline: true },
          )
          .setFooter({ text: "Only configured staff and the partner can view this channel." }),
      ],
    });

    return respondEphemeral(
      interaction,
      `Created partnership **${deal.code}** (${deal.percent_off}% off for ${deal.duration_months} month(s)) in ${channel}.`,
    );
  } catch (error) {
    if (channel) await channel.delete("Partnership setup failed").catch(() => {});
    if (
      /relation .* does not exist|column .* does not exist|schema cache/i.test(
        String(error?.message ?? ""),
      )
    ) {
      return respondEphemeral(
        interaction,
        "Partnerships are not enabled on the website database yet. Deploy the latest Supabase migration, then try again.",
      );
    }
    throw error;
  }
}

async function endPartnership(interaction) {
  if (!isStaff(interaction.member)) {
    return respondEphemeral(interaction, "Only configured staff can end partnership deals.");
  }
  await deferEphemeral(interaction);

  const code = interaction.options.getString("code", true).trim().toUpperCase();
  const deal = await yeti.endPartnershipDeal(code);
  const total = formatUsdCents(deal.total_spent_cents);
  let auditMessage = "The private partnership channel could not be found, so no channel update was posted.";

  if (interaction.guild && deal.partner_channel_id) {
    const channel = await interaction.guild.channels.fetch(deal.partner_channel_id).catch(() => null);
    if (channel?.isTextBased()) {
      await channel.send({
        content: `${staffMention()}`,
        embeds: [
          new EmbedBuilder()
            .setColor(0xef4444)
            .setTitle("YetiThumbs partnership ended")
            .setDescription("This partnership code is now disabled for future signups. The channel remains available as a sales record.")
            .addFields(
              { name: "Code", value: `\`${deal.code}\``, inline: true },
              { name: "Final sales total", value: `${total} USD`, inline: true },
            ),
        ],
      });
      auditMessage = `A final sales update was posted in ${channel}.`;
    }
  }

  return respondEphemeral(
    interaction,
    `Ended partnership **${deal.code}**. New redemptions are disabled. Final tracked sales total: **${total} USD**. ${auditMessage}`,
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
  const safeMessage = publicErrorMessage(error);
  if (safeMessage) {
    console.warn(`Interaction ${interaction.id} rejected by validation`);
    try {
      await respondEphemeral(interaction, safeMessage);
    } catch (replyError) {
      if (![40060, 10062].includes(replyError?.code)) console.error(replyError);
    }
    return;
  }

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
    if (!health.entitlementSchemaReady) throw new Error(health.schemaError);
    startupValidated = true;
    ready = true;
    console.log(`ONLINE: ${commands.length} commands, ${readyClient.guilds.cache.size} guild(s)`);
  } catch (error) {
    ready = false;
    console.error("Startup validation failed", error);
    await yeti.logError("startup", error).catch(() => {});
    await shutdown("startup validation failure", 1);
  }
});

client.on(Events.ShardDisconnect, (event, shardId) => {
  ready = false;
  console.warn(`Discord shard ${shardId} disconnected (${event.code})`);
});

client.on(Events.ShardReady, (shardId) => {
  if (startupValidated && !shuttingDown) {
    ready = true;
    console.log(`Discord shard ${shardId} reconnected`);
  }
});

client.once(Events.Invalidated, () => {
  ready = false;
  void shutdown("Discord session invalidated", 1);
});

client.on(Events.Error, (error) => {
  console.error("Discord client error", error);
  yeti.logError("discord_client", error).catch(() => {});
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "setup-tickets") return await setupTickets(interaction);
      if (interaction.commandName === "grant-credits") return await grantCredits(interaction);
      if (interaction.commandName === "grant-premium") return await grantPremium(interaction);
      if (interaction.commandName === "create-link") return await createPromoLink(interaction);
      if (interaction.commandName === "create-partnership") return await createPartnership(interaction);
      if (interaction.commandName === "end-partnership") return await endPartnership(interaction);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "ticket_select") return await createTicket(interaction);
      if (interaction.customId === "purchase_type_select") {
        return await selectPurchaseType(interaction);
      }
      if (interaction.customId === "credit_package_select") {
        return await selectCreditPackage(interaction);
      }
      if (interaction.customId === "premium_tier_select") {
        return await selectPremiumTier(interaction);
      }
      if (interaction.customId.startsWith("premium_duration_select:")) {
        return await selectPremiumDuration(interaction);
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
  const runtime = {
    uptime_seconds: Math.floor(process.uptime()),
    revision: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  };
  if (request.url === "/health") {
    response.writeHead(200);
    response.end(JSON.stringify({ status: "ok", ...runtime }));
    return;
  }
  if (request.url === "/ready") {
    response.writeHead(ready ? 200 : 503);
    response.end(
      JSON.stringify({
        status: ready ? "ready" : shuttingDown ? "stopping" : "starting",
        discord: ready ? "connected" : "not_ready",
        guilds: client.guilds.cache.size,
        ...runtime,
      }),
    );
    return;
  }
  response.writeHead(404);
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(config.port, config.host, () => {
  console.log(`Health server listening on ${config.host}:${config.port}`);
});

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; shutting down`);
  ready = false;
  client.destroy();
  await new Promise((resolve) => server.close(resolve));
  process.exitCode = exitCode;
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

console.log("Starting YetiThumbs bot");
const linkCoverage = robuxLinkCoverage(config);
console.log(
  `Configuration: guild ${config.guildId}; ${config.staffRoleIds.length} staff role(s); ` +
    `ticket category ${config.ticketCategoryId || "server root"}; ` +
    `${linkCoverage.configured}/${linkCoverage.total} Robux link(s)`,
);
await client.login(config.token);
