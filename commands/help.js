
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags} = require('discord.js');

const guideSections = {
  what_bot_does: {
    label: '📋 What the Bot Does',
    content: `As an admin (someone with Administrator permissions), you’ll use this bot to:

* **Set up the server**: Configure roles, channels, and gamemodes so players can join testing queues.
* **Send the queue form**: Use /sent to let players apply and join the queue.
* **Manage the queue**: Open or close the queue, view who’s waiting, and create tickets with players using /queue.
* **Support cool gamemodes**: Let players test in modes like Crystal PvP, Pot, UHC, and more, with optional region-specific queues (like Asia, Europe, or North America).`
  },
  setup_roles: {
    label: '🛠️ Setup Roles',
    content: `Run /setup roles:
- **Tester Role** (required): people who test others
- **Admin Role** (optional): bot managers
- **Cooldown Role** (optional): players temporarily blocked from queue

The bot saves your selections and confirms with an embed.`
  },
  setup_channels: {
    label: '🛠️ Setup Channels',
    content: `Run /setup channels:
- **Default Category** (required): where tickets will be created
- **Queue Channel** (required): where players queue
- **Gamemode Categories** (optional): like category_crystal_pvp, category_pot
- **Region Queues** (optional): like region_as_queue, region_eu_queue

After saving, the bot confirms and shows a summary.`
  },
  setup_server: {
    label: '🛠️ Setup Server Info',
    content: `Run /setup server:
- Set your server name
- (Optional) Add a logo URL (ending in .jpg, .png, .webp, .gif)

The bot will use this info to customize embeds and queue messages.`
  },
  setup_gamemode: {
    label: '🛠️ Setup Gamemodes',
    content: `Run /setup gamemode:
- Select gamemode (e.g. Crystal PvP)
- Select region (Asia, EU, NA, Default)
- Choose a queue channel (or it uses the current one)

Make sure to configure gamemode categories using /setup channels first!`
  },
  setup_view: {
    label: '🛠️ View/Reset Setup',
    content: `Run /setup view to check your current setup.
- Shows roles, channels, gamemodes, server name/icon
- If anything is missing, it will list what’s incomplete

You can also click the red **Reset All Settings** button to wipe everything and start over.`
  },
  sent: {
    label: '📨 /sent Form',
    content: `Run /sent in a text channel to send the queue application embed:
- ✅ Verify Account Details → players submit IGN, kit, and server IP
- 📥 Join Waitlist → joins appropriate queue

If no gamemodes are set up, players will skip selection and join the **default queue**.`
  },
  queue_open_close: {
    label: '📋 Open/Close Queue',
    content: `Run /openqueue in a queue channel:
- Deletes any existing queue message
- Posts a new embed with Join/Leave buttons

Run /closequeue in same channel:
- Deletes the queue message
- Sends "Queue Closed" embed
- Clears internal queue list

If no gamemodes are set up, this becomes the default queue.`
  },
  queue_view_ticket: {
    label: '📋 View Queue + Create Ticket',
    content: `Run /queue in an open queue channel:
- If you're a **tester**, you get a dropdown of users → selecting creates a ticket channel
- If you're a **player**, you see your status in queue (or cooldown)

Tickets are created in the correct category with the tester + player added.
The user is removed from the queue automatically.`
  },
  ticket: {
    label: '🎫 Ticket Behavior',
    content: `When a ticket is created:
- A private channel is created (e.g. #ticket-user)
- Player + testers have access
- Includes a red "Close Ticket" button
- Optionally use /closeticket to remove early

Auto-deletes the channel after closing.`
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Full admin guide with interactive sections'),

  async execute(interaction) {
    const rows = [new ActionRowBuilder()];
    for (const [key, section] of Object.entries(guideSections)) {
      if (rows[rows.length - 1].components.length === 5) rows.push(new ActionRowBuilder());
      rows[rows.length - 1].addComponents(
        new ButtonBuilder()
          .setCustomId(`guide_${key}`)
          .setLabel(section.label)
          .setStyle(ButtonStyle.Primary)
      );
    }

    const embed = new EmbedBuilder()
      .setTitle('📘 Minecraft Testing Bot – Admin Guide')
      .setDescription('Click a button below to view part of the guide. Each message is ephemeral.')
      .setColor('Blurple');

    await interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
  },

  async buttonHandler(interaction) {
    if (!interaction.isButton()) return;
    const key = interaction.customId.replace('guide_', '');
    const section = guideSections[key];
    if (!section) return;

    const embed = new EmbedBuilder()
      .setTitle(section.label)
      .setDescription(section.content)
      .setColor('Blurple');

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};