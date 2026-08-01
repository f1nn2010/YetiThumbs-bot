/**
 * YetiThumbs Discord bot — simple, reliable entrypoint.
 * Tickets + grant-credits + grant-premium. No TitanBot/Postgres/music stack.
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

function clean(v) {
  return String(v ?? "")
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/^["']|["']$/g, "");
}

function requireEnv(name, ...alts) {
  for (const key of [name, ...alts]) {
    const v = clean(process.env[key]);
    if (v) return v;
  }
  return "";
}

function resolveSupabaseUrl() {
  const raw = requireEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

const TOKEN = requireEnv("DISCORD_TOKEN", "TOKEN");
const CLIENT_ID = requireEnv("CLIENT_ID", "DISCORD_CLIENT_ID");
const GUILD_ID = requireEnv("GUILD_ID", "DISCORD_GUILD_ID");
const ADMIN_ROLE_ID = requireEnv("DISCORD_ADMIN_ROLE_ID");
const OWNER_IDS = clean(process.env.OWNER_IDS)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const SUPABASE_URL = resolveSupabaseUrl();
const SUPABASE_KEY = requireEnv(
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY"
);

const PREMIUM_PLAN = "developer";
const PREMIUM_CREDITS = 90;

const missing = [];
if (!TOKEN) missing.push("DISCORD_TOKEN");
if (!CLIENT_ID) missing.push("CLIENT_ID");
if (!SUPABASE_URL) missing.push("SUPABASE_URL");
if (!SUPABASE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (missing.length) {
  console.error("Missing env:", missing.join(", "));
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel],
});

const commands = [
  new SlashCommandBuilder()
    .setName("setup-tickets")
    .setDescription("Post the YetiThumbs ticket panel (Admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  new SlashCommandBuilder()
    .setName("grant-credits")
    .setDescription("Grant credits to a YetiThumbs user by email (Admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName("email").setDescription("Account email").setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("Credits to add")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100000)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("grant-premium")
    .setDescription("Grant Developer plan to a YetiThumbs user by email (Admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName("email").setDescription("Account email").setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("months")
        .setDescription("Duration in months")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(36)
    )
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log(`Registered ${commands.length} guild commands → ${GUILD_ID}`);
  } else {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log(`Registered ${commands.length} global commands`);
  }
}

async function safeDefer(interaction) {
  if (interaction.deferred || interaction.replied) return;
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch (err) {
    // Already acknowledged by Discord — continue with editReply if possible
    if (err?.code !== 40060 && err?.code !== 10062) throw err;
  }
}

async function safeEdit(interaction, content) {
  const payload =
    typeof content === "string" ? { content } : content;
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(payload);
    }
    return await interaction.reply({
      ...payload,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error("safeEdit failed:", err.message);
  }
}

function isStaff(member) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  if (OWNER_IDS.includes(member.id)) return true;
  if (ADMIN_ROLE_ID && member.roles?.cache?.has?.(ADMIN_ROLE_ID)) return true;
  // Hardcoded second admin role from original setup
  if (member.roles?.cache?.has?.("1532481208490131652")) return true;
  return false;
}

async function findUserByEmail(email) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) return { user: null, error };
    const hit = (data?.users || []).find(
      (u) => (u.email || "").toLowerCase() === target
    );
    if (hit) return { user: hit, error: null };
    if (!data?.users?.length || data.users.length < 200) break;
  }
  return { user: null, error: null };
}

async function grantCredits(email, amount) {
  const { user, error } = await findUserByEmail(email);
  if (error) throw new Error(`Auth lookup failed: ${error.message}`);
  if (!user) throw new Error(`No YetiThumbs account for **${email}**. They must sign up first.`);

  const { data: profile } = await supabase
    .from("yetithumbs_profiles")
    .select("credits")
    .eq("id", user.id)
    .maybeSingle();

  const next = (profile?.credits ?? 0) + amount;
  const { error: up } = await supabase.from("yetithumbs_profiles").upsert(
    {
      id: user.id,
      email: user.email,
      credits: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (up) throw new Error(`Profile update failed: ${up.message}`);
  return { user, credits: next };
}

async function grantPremium(email, months) {
  const { user, error } = await findUserByEmail(email);
  if (error) throw new Error(`Auth lookup failed: ${error.message}`);
  if (!user) throw new Error(`No YetiThumbs account for **${email}**. They must sign up first.`);

  const { error: up } = await supabase.from("yetithumbs_profiles").upsert(
    {
      id: user.id,
      email: user.email,
      plan: PREMIUM_PLAN,
      credits: PREMIUM_CREDITS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (up) throw new Error(`Profile update failed: ${up.message}`);

  const ends = new Date();
  ends.setMonth(ends.getMonth() + months);
  return { user, ends };
}

async function handleSetupTickets(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x33e6ff)
    .setTitle("YetiThumbs Support & Robux")
    .setDescription(
      "Need help or want to buy credits/premium with Robux?\n\nSelect a category below to open a private ticket."
    );

  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("Select a category...")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("🛠️ Support")
        .setDescription("Bugs, account help, questions")
        .setValue("support"),
      new StringSelectMenuOptionBuilder()
        .setLabel("💎 Buy with Robux")
        .setDescription("Credits or premium via Robux")
        .setValue("robux")
    );

  await interaction.reply({
    content: "Ticket panel posted.",
    flags: MessageFlags.Ephemeral,
  });
  await interaction.channel.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

async function handleTicketSelect(interaction) {
  const selection = interaction.values[0];
  const existing = interaction.guild.channels.cache
    .filter((c) => c.name.startsWith("ticket-"))
    .map((c) => parseInt(c.name.replace("ticket-", ""), 10) || 0);
  const nextId = existing.length ? Math.max(...existing) + 1 : 1;

  const overwrites = [
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
  ];
  if (ADMIN_ROLE_ID) {
    overwrites.push({
      id: ADMIN_ROLE_ID,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }

  const channel = await interaction.guild.channels.create({
    name: `ticket-${nextId}`,
    type: ChannelType.GuildText,
    permissionOverwrites: overwrites,
    topic: `YetiThumbs ticket for ${interaction.user.tag} (${selection})`,
  });

  const closeBtn = new ButtonBuilder()
    .setCustomId("close_ticket_btn")
    .setLabel("Close ticket")
    .setStyle(ButtonStyle.Danger);

  await interaction.reply({
    content: `Ticket created: ${channel}`,
    flags: MessageFlags.Ephemeral,
  });

  if (selection === "support") {
    await channel.send({
      content: `Welcome ${interaction.user}! ${
        ADMIN_ROLE_ID ? `<@&${ADMIN_ROLE_ID}>` : "Staff"
      } will help shortly.\n\nPlease describe your issue and include your **YetiThumbs account email**.`,
      components: [new ActionRowBuilder().addComponents(closeBtn)],
    });
    return;
  }

  const robuxEmbed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle("Buy credits / premium")
    .setDescription(
      [
        "**Card / PayPal?** → https://yetithumbs.com/pricing",
        "",
        "**Robux?** Pick a package below.",
        "Prices use DevEx rates after Roblox tax, rounded up.",
        "",
        "• 10 Credits — 1,100 R$",
        "• 40 Credits (Starter) — 4,100 R$",
        "• 90 Credits (Developer) — 9,200 R$",
        "• 1 Month Premium — 1,200 R$",
        "• 3 Months Premium — 3,600 R$",
        "• 6 Months Premium — 7,200 R$",
      ].join("\n")
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId("robux_package_select")
    .setPlaceholder("Select a package...")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("10 Credits (1,100 R$)")
        .setValue("pkg_10c"),
      new StringSelectMenuOptionBuilder()
        .setLabel("40 Credits (4,100 R$)")
        .setValue("pkg_40c"),
      new StringSelectMenuOptionBuilder()
        .setLabel("90 Credits (9,200 R$)")
        .setValue("pkg_90c"),
      new StringSelectMenuOptionBuilder()
        .setLabel("1 Month Premium (1,200 R$)")
        .setValue("pkg_1m"),
      new StringSelectMenuOptionBuilder()
        .setLabel("3 Months Premium (3,600 R$)")
        .setValue("pkg_3m"),
      new StringSelectMenuOptionBuilder()
        .setLabel("6 Months Premium (7,200 R$)")
        .setValue("pkg_6m")
    );

  await channel.send({
    content: `${interaction.user}${ADMIN_ROLE_ID ? ` | <@&${ADMIN_ROLE_ID}>` : ""}`,
    embeds: [robuxEmbed],
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(closeBtn),
    ],
  });
}

async function handleRobuxPackage(interaction) {
  const map = {
    pkg_10c: {
      name: "10 Credits for 1,100 Robux",
      link: process.env.ROBUX_LINK_10C || "(ask staff for gamepass link)",
    },
    pkg_40c: {
      name: "40 Credits for 4,100 Robux",
      link: process.env.ROBUX_LINK_40C || "(ask staff for gamepass link)",
    },
    pkg_90c: {
      name: "90 Credits for 9,200 Robux",
      link: process.env.ROBUX_LINK_90C || "(ask staff for gamepass link)",
    },
    pkg_1m: {
      name: "1 Month Premium for 1,200 Robux",
      link: process.env.ROBUX_LINK_1M || "(ask staff for gamepass link)",
    },
    pkg_3m: {
      name: "3 Months Premium for 3,600 Robux",
      link: process.env.ROBUX_LINK_3M || "(ask staff for gamepass link)",
    },
    pkg_6m: {
      name: "6 Months Premium for 7,200 Robux",
      link: process.env.ROBUX_LINK_6M || "(ask staff for gamepass link)",
    },
  };
  const selected = map[interaction.values[0]];
  if (!selected) {
    return interaction.reply({
      content: "Unknown package.",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.update({ components: [] }).catch(() => {});
  await interaction.followUp({
    content: [
      `You selected **${selected.name}**.`,
      "",
      "**1.** Reply with your **YetiThumbs email** and **Roblox username**.",
      `**2.** Buy here: ${selected.link}`,
      "**3.** Send a **screenshot** of the purchase in this ticket.",
      "",
      `${ADMIN_ROLE_ID ? `<@&${ADMIN_ROLE_ID}>` : "Staff"} will verify and run \`/grant-credits\` or \`/grant-premium\`.`,
    ].join("\n"),
  });
}

async function handleCloseTicket(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({
      content: "Only staff can close tickets.",
      flags: MessageFlags.Ephemeral,
    });
  }
  if (!interaction.channel?.name?.startsWith("ticket-")) {
    return interaction.reply({
      content: "This is not a ticket channel.",
      flags: MessageFlags.Ephemeral,
    });
  }
  await interaction.reply("Closing ticket in 5 seconds...");
  setTimeout(() => {
    interaction.channel.delete().catch(console.error);
  }, 5000);
}

client.once("clientReady", onReady);
client.once("ready", onReady);

let booted = false;
async function onReady() {
  if (booted || !client.user) return;
  booted = true;
  console.log(`ONLINE as ${client.user.tag}`);
  console.log(`Guilds: ${client.guilds.cache.size}`);
  try {
    await registerCommands();
  } catch (e) {
    console.error("Command register failed:", e.message);
  }
}

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      if (name === "setup-tickets") {
        await handleSetupTickets(interaction);
        return;
      }

      if (name === "grant-credits") {
        await safeDefer(interaction);
        const email = interaction.options.getString("email", true);
        const amount = interaction.options.getInteger("amount", true);
        try {
          const { credits } = await grantCredits(email, amount);
          await safeEdit(
            interaction,
            `Granted **${amount}** credits to **${email}**. New balance: **${credits}**.`
          );
        } catch (e) {
          await safeEdit(interaction, `❌ ${e.message}`);
        }
        return;
      }

      if (name === "grant-premium") {
        await safeDefer(interaction);
        const email = interaction.options.getString("email", true);
        const months = interaction.options.getInteger("months", true);
        try {
          const { ends } = await grantPremium(email, months);
          await safeEdit(
            interaction,
            `Granted **${PREMIUM_PLAN}** plan (${PREMIUM_CREDITS} credits) to **${email}** for **${months}** month(s).\nManual window ends ~ **${ends.toUTCString()}**.`
          );
        } catch (e) {
          await safeEdit(interaction, `❌ ${e.message}`);
        }
        return;
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "ticket_select") {
        await handleTicketSelect(interaction);
        return;
      }
      if (interaction.customId === "robux_package_select") {
        await handleRobuxPackage(interaction);
        return;
      }
    }

    if (interaction.isButton() && interaction.customId === "close_ticket_btn") {
      await handleCloseTicket(interaction);
    }
  } catch (err) {
    console.error("interaction error:", err);
    try {
      const msg = { content: `Something went wrong: ${err.message}`, flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) await interaction.followUp(msg);
      else await interaction.reply(msg);
    } catch {
      /* ignore */
    }
  }
});

console.log("Starting YetiThumbs bot...");
console.log("Supabase:", SUPABASE_URL);
client.login(TOKEN);
