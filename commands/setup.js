const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');

const { guildSettings, saveGuildSettings } = require('./shared-data.js');

const gamemodeChoices = [
  { name: 'Crystal PvP', value: 'crystal_pvp' },
  { name: 'Axe PvP', value: 'axe_pvp' },
  { name: 'Diamond Pot', value: 'diamond_pot' },
  { name: 'Netherite Pot', value: 'netherite_pot' },
  { name: 'UHC', value: 'uhc' },
  { name: 'Vanilla', value: 'vanilla' },
  { name: 'Sword', value: 'sword' },
  { name: 'Pot', value: 'pot' },
  { name: 'SMP', value: 'smp' },
  { name: 'Axe', value: 'axe' }
];

const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configure the bot settings for your server')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(subcommand =>
    subcommand
      .setName('roles')
      .setDescription('Configure the roles used by the bot')
      .addRoleOption(option => 
        option.setName('tester')
          .setDescription('Role for testers who can manage the queue')
          .setRequired(true))
      .addRoleOption(option => 
        option.setName('admin')
          .setDescription('Role for administrators (optional)')
          .setRequired(false))
      .addRoleOption(option => 
        option.setName('cooldown')
          .setDescription('Role for users on cooldown, preventing queue joining (optional)')
          .setRequired(false)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('channels')
      .setDescription('Configure the channels used by the bot')
      .addChannelOption(option => 
        option.setName('category_default')
          .setDescription('Default category for testing channels')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(true))
      .addChannelOption(option => 
        option.setName('queue_channel')
          .setDescription('Default queue channel (used if no region-specific channel is set)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true))
      .addChannelOption(option => 
        option.setName('category_crystal_pvp')
          .setDescription('Category for Crystal PvP testing channels')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(false))
      .addChannelOption(option => 
        option.setName('category_axe_pvp')
          .setDescription('Category for Axe PvP testing channels')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(false))
      .addChannelOption(option => 
        option.setName('category_diamond_pot')
          .setDescription('Category for Diamond Pot testing channels')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(false))
      .addChannelOption(option => 
        option.setName('category_netherite_pot')
          .setDescription('Category for Netherite Pot testing channels')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(false))
      .addChannelOption(option => 
        option.setName('category_uhc')
          .setDescription('Category for UHC testing channels')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(false))
      .addChannelOption(option => 
        option.setName('category_vanilla')
          .setDescription('Category for Vanilla testing channels')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(false))
      .addChannelOption(option => 
        option.setName('category_sword')
          .setDescription('Category for Sword testing channels')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(false))
      .addChannelOption(option => 
        option.setName('category_pot')
          .setDescription('Category for Pot testing channels')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(false))
      .addChannelOption(option => 
        option.setName('category_smp')
          .setDescription('Category for SMP testing channels')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(false))
      .addChannelOption(option => 
        option.setName('category_axe')
          .setDescription('Category for Axe testing channels')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(false))
      .addChannelOption(option => 
        option.setName('region_as_queue')
          .setDescription('Queue channel for Asia region')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false))
      .addChannelOption(option => 
        option.setName('region_eu_queue')
          .setDescription('Queue channel for Europe region')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false))
      .addChannelOption(option => 
        option.setName('region_na_queue')
          .setDescription('Queue channel for North America region')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('server')
      .setDescription('Configure server information')
      .addStringOption(option => 
        option.setName('name')
          .setDescription('Your server name for embeds')
          .setRequired(true))
      .addStringOption(option => 
        option.setName('icon')
          .setDescription('URL to your server icon (must be direct image URL)')
          .setRequired(false)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('gamemode')
      .setDescription('Toggle a channel as a queue channel for a gamemode and region')
      .addStringOption(option =>
        option
          .setName('gamemode')
          .setDescription('The gamemode to toggle the queue channel for')
          .setRequired(true)
          .addChoices(...gamemodeChoices))
      .addStringOption(option =>
        option
          .setName('region')
          .setDescription('The region to toggle the queue channel for')
          .setRequired(true)
          .addChoices(
            { name: 'Asia', value: 'as' },
            { name: 'Europe', value: 'eu' },
            { name: 'North America', value: 'na' },
            { name: 'Default', value: 'default' }
          ))
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('The channel to toggle as a queue channel (defaults to current channel)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('View current configuration'));

async function execute(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ 
      content: 'You need Administrator permission to use this command.', 
      ephemeral: true 
    });
  }

  const guildId = interaction.guild.id;
  
  if (!guildSettings.has(guildId)) {
    guildSettings.set(guildId, {
      roles: {
        tester: null,
        admin: null,
        cooldown: null
      },
      channels: {
        categories: {
          default: null,
          crystal_pvp: null,
          axe_pvp: null,
          diamond_pot: null,
          netherite_pot: null,
          uhc: null,
          vanilla: null,
          sword: null,
          pot: null,
          smp: null,
          axe: null
        },
        waitlist: null,
        regions: {
          as: { queue: null },
          eu: { queue: null },
          na: { queue: null }
        },
        gamemodes: {
          crystal_pvp: { queues: [] },
          axe_pvp: { queues: [] },
          diamond_pot: { queues: [] },
          netherite_pot: { queues: [] },
          uhc: { queues: [] },
          vanilla: { queues: [] },
          sword: { queues: [] },
          pot: { queues: [] },
          smp: { queues: [] },
          axe: { queues: [] }
        }
      },
      server: {
        name: interaction.guild.name,
        icon: interaction.guild.iconURL()
      },
      setupComplete: false
    });
  }

  const settings = guildSettings.get(guildId);
  const subcommand = interaction.options.getSubcommand();

  console.log(`[DEBUG] Command structure for /setup in guild ${guildId}:`, JSON.stringify(data.toJSON(), null, 2));
  console.log(`[DEBUG] data.options: ${JSON.stringify(data.options.map(opt => ({ name: opt.name, type: opt.type })), null, 2)}`);

  switch (subcommand) {
    case 'roles':
      await setupRoles(interaction, settings);
      break;
    case 'channels':
      await setupChannels(interaction, settings);
      break;
    case 'server':
      await setupServer(interaction, settings);
      break;
    case 'gamemode':
      await setupGamemode(interaction, settings);
      break;
    case 'view':
      await viewSettings(interaction, settings);
      break;
    default:
      return interaction.reply({
        content: 'Unknown subcommand. Please use one of: roles, channels, server, gamemode, view.',
        ephemeral: true
      });
  }

  checkSetupComplete(guildId, settings);
  saveGuildSettings();
}

async function setupRoles(interaction, settings) {
  const testerRole = interaction.options.getRole('tester');
  const adminRole = interaction.options.getRole('admin');
  const cooldownRole = interaction.options.getRole('cooldown');

  settings.roles.tester = testerRole.id;
  if (adminRole) {
    settings.roles.admin = adminRole.id;
  }
  if (cooldownRole) {
    settings.roles.cooldown = cooldownRole.id;
  }

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('Role Configuration')
    .setDescription('Roles have been configured successfully!')
    .addFields(
      { name: 'Tester Role', value: `<@&${testerRole.id}>`, inline: true }
    )
    .setTimestamp();

  if (adminRole) {
    embed.addFields({ name: 'Admin Role', value: `<@&${adminRole.id}>`, inline: true });
  }
  if (cooldownRole) {
    embed.addFields({ name: 'Cooldown Role', value: `<@&${cooldownRole.id}>`, inline: true });
  }

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

async function setupChannels(interaction, settings) {
  const categoryDefault = interaction.options.getChannel('category_default');
  const queueChannel = interaction.options.getChannel('queue_channel');
  const categoryCrystalPvp = interaction.options.getChannel('category_crystal_pvp');
  const categoryAxePvp = interaction.options.getChannel('category_axe_pvp');
  const categoryDiamondPot = interaction.options.getChannel('category_diamond_pot');
  const categoryNetheritePot = interaction.options.getChannel('category_netherite_pot');
  const categoryUhc = interaction.options.getChannel('category_uhc');
  const categoryVanilla = interaction.options.getChannel('category_vanilla');
  const categorySword = interaction.options.getChannel('category_sword');
  const categoryPot = interaction.options.getChannel('category_pot');
  const categorySmp = interaction.options.getChannel('category_smp');
  const categoryAxe = interaction.options.getChannel('category_axe');
  const regionAsQueue = interaction.options.getChannel('region_as_queue');
  const regionEuQueue = interaction.options.getChannel('region_eu_queue');
  const regionNaQueue = interaction.options.getChannel('region_na_queue');

  settings.channels.categories.default = categoryDefault.id;
  settings.channels.waitlist = queueChannel.id;
  if (categoryCrystalPvp) settings.channels.categories.crystal_pvp = categoryCrystalPvp.id;
  if (categoryAxePvp) settings.channels.categories.axe_pvp = categoryAxePvp.id;
  if (categoryDiamondPot) settings.channels.categories.diamond_pot = categoryDiamondPot.id;
  if (categoryNetheritePot) settings.channels.categories.netherite_pot = categoryNetheritePot.id;
  if (categoryUhc) settings.channels.categories.uhc = categoryUhc.id;
  if (categoryVanilla) settings.channels.categories.vanilla = categoryVanilla.id;
  if (categorySword) settings.channels.categories.sword = categorySword.id;
  if (categoryPot) settings.channels.categories.pot = categoryPot.id;
  if (categorySmp) settings.channels.categories.smp = categorySmp.id;
  if (categoryAxe) settings.channels.categories.axe = categoryAxe.id;
  if (regionAsQueue) settings.channels.regions.as.queue = regionAsQueue.id;
  if (regionEuQueue) settings.channels.regions.eu.queue = regionEuQueue.id;
  if (regionNaQueue) settings.channels.regions.na.queue = regionNaQueue.id;

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('Channel Configuration')
    .setDescription('Channels have been configured successfully!')
    .addFields(
      { name: 'Default Testing Category', value: `<#${categoryDefault.id}>`, inline: true },
      { name: 'Queue Channel', value: `<#${queueChannel.id}>`, inline: true }
    );

  if (categoryCrystalPvp) embed.addFields({ name: 'Crystal PvP Category', value: `<#${categoryCrystalPvp.id}>`, inline: true });
  if (categoryAxePvp) embed.addFields({ name: 'Axe PvP Category', value: `<#${categoryAxePvp.id}>`, inline: true });
  if (categoryDiamondPot) embed.addFields({ name: 'Diamond Pot Category', value: `<#${categoryDiamondPot.id}>`, inline: true });
  if (categoryNetheritePot) embed.addFields({ name: 'Netherite Pot Category', value: `<#${categoryNetheritePot.id}>`, inline: true });
  if (categoryUhc) embed.addFields({ name: 'UHC Category', value: `<#${categoryUhc.id}>`, inline: true });
  if (categoryVanilla) embed.addFields({ name: 'Vanilla Category', value: `<#${categoryVanilla.id}>`, inline: true });
  if (categorySword) embed.addFields({ name: 'Sword Category', value: `<#${categorySword.id}>`, inline: true });
  if (categoryPot) embed.addFields({ name: 'Pot Category', value: `<#${categoryPot.id}>`, inline: true });
  if (categorySmp) embed.addFields({ name: 'SMP Category', value: `<#${categorySmp.id}>`, inline: true });
  if (categoryAxe) embed.addFields({ name: 'Axe Category', value: `<#${categoryAxe.id}>`, inline: true });
  if (regionAsQueue) embed.addFields({ name: 'Asia Queue Channel', value: `<#${regionAsQueue.id}>`, inline: true });
  if (regionEuQueue) embed.addFields({ name: 'Europe Queue Channel', value: `<#${regionEuQueue.id}>`, inline: true });
  if (regionNaQueue) embed.addFields({ name: 'North America Queue Channel', value: `<#${regionNaQueue.id}>`, inline: true });

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

async function setupServer(interaction, settings) {
  const serverName = interaction.options.getString('name');
  const serverIcon = interaction.options.getString('icon');

  settings.server.name = serverName;
  
  if (serverIcon) {
    if (!serverIcon.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
      return interaction.reply({
        content: 'Please provide a direct image URL that ends with .jpg, .png, .gif, or .webp',
        ephemeral: true
      });
    }
    settings.server.icon = serverIcon;
  }

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('Server Information')
    .setDescription('Server information has been configured successfully!')
    .addFields(
      { name: 'Server Name', value: serverName, inline: true }
    )
    .setTimestamp();

  if (serverIcon) {
    embed.setThumbnail(settings.server.icon);
    embed.addFields({ name: 'Server Icon', value: 'Set (shown as thumbnail)', inline: true });
  }

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

async function setupGamemode(interaction, settings) {
  const gamemode = interaction.options.getString('gamemode');
  const region = interaction.options.getString('region');
  const channel = interaction.options.getChannel('channel') || interaction.channel;

  const validGamemodes = Object.keys(settings.channels.categories)
    .filter(key => settings.channels.categories[key] && key !== 'default');
  if (!validGamemodes.includes(gamemode)) {
    console.log(`[DEBUG] Invalid gamemode '${gamemode}' for guild ${interaction.guild.id}. Available: ${validGamemodes.join(', ') || 'None'}`);
    return interaction.reply({
      content: `Invalid gamemode '${gamemode}'. Available gamemodes: ${validGamemodes.map(g => g.replace(/_/g, ' ').toUpperCase()).join(', ') || 'None'}. Please configure the category for this gamemode using '/setup channels' first.`,
      ephemeral: true
    });
  }

  const validRegions = ['as', 'eu', 'na', 'default'];
  if (!validRegions.includes(region)) {
    console.log(`[DEBUG] Invalid region '${region}' for guild ${interaction.guild.id}. Available: ${validRegions.join(', ')}`);
    return interaction.reply({
      content: `Invalid region '${region}'. Available regions: ${validRegions.map(r => r.toUpperCase()).join(', ')}.`,
      ephemeral: true
    });
  }

  if (!settings.channels.gamemodes[gamemode]) {
    settings.channels.gamemodes[gamemode] = { queues: [] };
  }

  let action = 'added';
  const queueIndex = settings.channels.gamemodes[gamemode].queues.findIndex(q => q.channelId === channel.id && q.region === region);
  if (queueIndex !== -1) {
    settings.channels.gamemodes[gamemode].queues.splice(queueIndex, 1);
    action = 'removed';
  } else {
    settings.channels.gamemodes[gamemode].queues.push({ channelId: channel.id, region });
  }

  console.log(`[DEBUG] ${action} channel ${channel.id} for gamemode ${gamemode} and region ${region} in guild ${interaction.guild.id}`);

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('Gamemode Queue Configuration')
    .setDescription(`Channel <#${channel.id}> has been ${action} as a queue channel for ${gamemode.replace(/_/g, ' ').toUpperCase()} in ${region.toUpperCase()}.`)
    .setTimestamp();

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

async function viewSettings(interaction, settings) {
  const embed = new EmbedBuilder()
    .setColor('#0099FF')
    .setTitle('Current Bot Configuration')
    .setDescription('Here are the current settings for your server:')
    .setTimestamp();

  let rolesText = 'Not configured';
  if (settings.roles.tester) {
    rolesText = `Tester: <@&${settings.roles.tester}>`;
    if (settings.roles.admin) {
      rolesText += `\nAdmin: <@&${settings.roles.admin}>`;
    }
    if (settings.roles.cooldown) {
      rolesText += `\nCooldown: <@&${settings.roles.cooldown}>`;
    }
  }
  embed.addFields({ name: 'Roles', value: rolesText });

  let channelsText = 'Not configured';
  if (settings.channels.categories.default) {
    channelsText = `Default Category: <#${settings.channels.categories.default}>`;
    if (settings.channels.categories.crystal_pvp) channelsText += `\nCrystal PvP Category: <#${settings.channels.categories.crystal_pvp}>`;
    if (settings.channels.categories.axe_pvp) channelsText += `\nAxe PvP Category: <#${settings.channels.categories.axe_pvp}>`;
    if (settings.channels.categories.diamond_pot) channelsText += `\nDiamond Pot Category: <#${settings.channels.categories.diamond_pot}>`;
    if (settings.channels.categories.netherite_pot) channelsText += `\nNetherite Pot Category: <#${settings.channels.categories.netherite_pot}>`;
    if (settings.channels.categories.uhc) channelsText += `\nUHC Category: <#${settings.channels.categories.uhc}>`;
    if (settings.channels.categories.vanilla) channelsText += `\nVanilla Category: <#${settings.channels.categories.vanilla}>`;
    if (settings.channels.categories.sword) channelsText += `\nSword Category: <#${settings.channels.categories.sword}>`;
    if (settings.channels.categories.pot) channelsText += `\nPot Category: <#${settings.channels.categories.pot}>`;
    if (settings.channels.categories.smp) channelsText += `\nSMP Category: <#${settings.channels.categories.smp}>`;
    if (settings.channels.categories.axe) channelsText += `\nAxe Category: <#${settings.channels.categories.axe}>`;
    if (settings.channels.waitlist) channelsText += `\nWaitlist Channel: <#${settings.channels.waitlist}>`;
    if (settings.channels.regions.as.queue) channelsText += `\nAsia Queue Channel: <#${settings.channels.regions.as.queue}>`;
    if (settings.channels.regions.eu.queue) channelsText += `\nEurope Queue Channel: <#${settings.channels.regions.eu.queue}>`;
    if (settings.channels.regions.na.queue) channelsText += `\nNorth America Queue Channel: <#${settings.channels.regions.na.queue}>`;
    Object.keys(settings.channels.gamemodes).forEach(gamemode => {
      if (settings.channels.gamemodes[gamemode]?.queues?.length > 0) {
        channelsText += `\n${gamemode.replace(/_/g, ' ').toUpperCase()} Queue Channels: ${settings.channels.gamemodes[gamemode].queues.map(q => `<#${q.channelId}> (${q.region.toUpperCase()})`).join(', ')}`;
      }
    });
  }
  embed.addFields({ name: 'Channels', value: channelsText });

  let serverText = 'Not configured';
  if (settings.server.name) {
    serverText = `Name: ${settings.server.name}`;
    if (settings.server.icon) {
      serverText += '\nIcon: Set';
      embed.setThumbnail(settings.server.icon);
    }
  }
  embed.addFields({ name: 'Server Info', value: serverText });

  embed.addFields({ 
    name: 'Setup Status', 
    value: settings.setupComplete ? '✅ Complete' : '❌ Incomplete'
  });

  if (!settings.setupComplete) {
    let nextSteps = 'To complete setup, configure the following:';
    if (!settings.roles.tester) nextSteps += '\n- Tester role (`/setup roles`)';
    if (!settings.channels.categories.default) nextSteps += '\n- Default category (`/setup channels`)';
    if (!settings.channels.waitlist) nextSteps += '\n- Waitlist channel (`/setup channels`)';
    if (!settings.server.name) nextSteps += '\n- Server name (`/setup server`)';
    embed.addFields({ name: 'Next Steps', value: nextSteps });
  }

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('reset_settings')
        .setLabel('Reset All Settings')
        .setStyle(ButtonStyle.Danger)
    );

  return interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });
}

function checkSetupComplete(guildId, settings) {
  const isComplete = 
    settings.roles.tester !== null &&
    settings.channels.categories.default !== null &&
    settings.channels.waitlist !== null &&
    settings.server.name !== null;
  
  settings.setupComplete = isComplete;
  guildSettings.set(guildId, settings);
  
  return isComplete;
}

async function buttonHandler(interaction) {
  if (interaction.customId === 'reset_settings') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: 'You need Administrator permission to reset settings.',
        ephemeral: true
      });
    }

    guildSettings.set(interaction.guild.id, {
      roles: {
        tester: null,
        admin: null,
        cooldown: null
      },
      channels: {
        categories: {
          default: null,
          crystal_pvp: null,
          axe_pvp: null,
          diamond_pot: null,
          netherite_pot: null,
          uhc: null,
          vanilla: null,
          sword: null,
          pot: null,
          smp: null,
          axe: null
        },
        waitlist: null,
        regions: {
          as: { queue: null },
          eu: { queue: null },
          na: { queue: null }
        },
        gamemodes: {
          crystal_pvp: { queues: [] },
          axe_pvp: { queues: [] },
          diamond_pot: { queues: [] },
          netherite_pot: { queues: [] },
          uhc: { queues: [] },
          vanilla: { queues: [] },
          sword: { queues: [] },
          pot: { queues: [] },
          smp: { queues: [] },
          axe: { queues: [] }
        }
      },
      server: {
        name: interaction.guild.name,
        icon: interaction.guild.iconURL()
      },
      setupComplete: false
    });
    
    saveGuildSettings();

    return interaction.update({
      content: 'All settings have been reset to default. Use `/setup` commands to reconfigure the bot.',
      embeds: [],
      components: []
    });
  }
}

module.exports = {
  data,
  execute,
  buttonHandler
};