const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
  StringSelectMenuBuilder
} = require('discord.js');

const { userSubmissions, guildSettings, saveUserSubmissions } = require('./shared-data.js');

const data = new SlashCommandBuilder()
  .setName('sent')
  .setDescription('Creates the testing application form')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ 
      content: 'You need Administrator permission to use this command.', 
      ephemeral: true 
    });
  }

  const guildId = interaction.guild.id;
  const settings = guildSettings.get(guildId);

  if (!settings || !settings.setupComplete) {
    let errorMessage = 'Bot setup is not complete. Please ask an administrator to configure the following using `/setup` commands:';
    if (!settings || !settings.roles.tester) errorMessage += '\n- Tester role (`/setup roles`)';
    if (!settings || !settings.channels.categories.default) errorMessage += '\n- Default category (`/setup channels`)';
    if (!settings || !settings.channels.waitlist) errorMessage += '\n- Waitlist channel (`/setup channels`)';
    if (!settings || !settings.server.name) errorMessage += '\n- Server name (`/setup server`)';
    return interaction.reply({
      content: errorMessage,
      ephemeral: true
    });
  }

  const embed = new EmbedBuilder()
    .setColor('#36393F')
    .setTitle('Tierlist APP')
    .setDescription('Upon applying, you will be added to a gamemode-specific queue channel.\nHere you will be pinged when a tester is available.\n\n• Region should be the region of the server you wish to test on (e.g., AS, EU, NA)\n\n• Username should be the name of the account you will be testing on\n\n• Gamemode should be your preferred testing gamemode (if available)')
    .setTimestamp()
    .setFooter({ text: 'Today at ' + new Date().toLocaleTimeString() });

  if (settings.server.icon) {
    embed.setThumbnail(settings.server.icon);
  }

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('verify_account')
        .setLabel('Verify Account Details')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('join_waitlist')
        .setLabel('Join Waitlist')
        .setStyle(ButtonStyle.Success)
    );

  await interaction.reply({ embeds: [embed], components: [row] });
}

async function buttonHandler(interaction) {
  const guildId = interaction.guild.id;
  const settings = guildSettings.get(guildId);

  if (!settings || !settings.setupComplete) {
    let errorMessage = 'Bot setup is not complete. Please ask an administrator to configure the following using `/setup` commands:';
    if (!settings || !settings.roles.tester) errorMessage += '\n- Tester role (`/setup roles`)';
    if (!settings || !settings.channels.categories.default) errorMessage += '\n- Default category (`/setup channels`)';
    if (!settings || !settings.channels.waitlist) errorMessage += '\n- Waitlist channel (`/setup channels`)';
    if (!settings || !settings.server.name) errorMessage += '\n- Server name (`/setup server`)';
    return interaction.reply({
      content: errorMessage,
      ephemeral: true
    });
  }

  if (interaction.customId === 'verify_account') {
    const modal = new ModalBuilder()
      .setCustomId('verification_modal')
      .setTitle('Account Verification');

    const nameInput = new TextInputBuilder()
      .setCustomId('name')
      .setLabel('Name')
      .setPlaceholder('Enter your Minecraft username')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    
    const kitsInput = new TextInputBuilder()
      .setCustomId('kits')
      .setLabel('Kits')
      .setPlaceholder('Enter your preferred kit you want')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    
    const serverInput = new TextInputBuilder()
      .setCustomId('server')
      .setLabel('Preferred Server')
      .setPlaceholder('Enter your minecraft server ip you prefer')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(nameInput);
    const secondActionRow = new ActionRowBuilder().addComponents(kitsInput);
    const thirdActionRow = new ActionRowBuilder().addComponents(serverInput);

    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

    await interaction.showModal(modal);
  } else if (interaction.customId === 'join_waitlist') {
    const userId = interaction.user.id;
    const userData = userSubmissions.get(userId);
    
    if (!userData) {
      return interaction.reply({
        content: 'Please verify your account details first by clicking the "Verify Account Details" button.',
        ephemeral: true
      });
    }

    const hasRegionQueues = Object.values(settings.channels.regions).some(region => region.queue);
    const hasGamemodeQueues = Object.values(settings.channels.gamemodes).some(gamemode => gamemode.queues?.length > 0);
    const isDefaultOnly = settings.channels.waitlist && !hasRegionQueues && !hasGamemodeQueues;

    if (isDefaultOnly) {
      try {
        const defaultQueueChannel = interaction.guild.channels.cache.get(settings.channels.waitlist);
        if (!defaultQueueChannel) {
          console.warn(`Default queue channel ${settings.channels.waitlist} not found`);
          return interaction.reply({
            content: 'The default queue channel is not accessible. Please contact an administrator to verify the configuration.',
            ephemeral: true
          });
        }

        await defaultQueueChannel.permissionOverwrites.create(interaction.user, {
          ViewChannel: true,
          SendMessages: false,
          AddReactions: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false
        });

        userData.selectedRegion = 'default';
        userData.selectedGamemode = 'default';
        userData.inWaitlist = true;
        userData.joinedWaitlistAt = new Date().toISOString();
        userSubmissions.set(userId, userData);
        saveUserSubmissions();

        return interaction.reply({
          content: `You can now view the default queue channel: <#${settings.channels.waitlist}>. You will be notified when a tester is available.`,
          ephemeral: true
        });
      } catch (error) {
        console.error('Error adding user to default waitlist:', error);
        return interaction.reply({
          content: 'There was an error adding you to the default queue. Please try again later or contact an administrator.',
          ephemeral: true
        });
      }
    }

    const regionOptions = [
      { label: 'Asia', value: 'as' },
      { label: 'Europe', value: 'eu' },
      { label: 'North America', value: 'na' },
      { label: 'Default', value: 'default' }
    ].filter(opt => settings.channels.regions[opt.value]?.queue || opt.value === 'default');

    const gamemodeOptions = [
      { label: 'Crystal PvP', value: 'crystal_pvp', category: settings.channels.categories.crystal_pvp },
      { label: 'Axe PvP', value: 'axe_pvp', category: settings.channels.categories.axe_pvp },
      { label: 'Diamond Pot', value: 'diamond_pot', category: settings.channels.categories.diamond_pot },
      { label: 'Netherite Pot', value: 'netherite_pot', category: settings.channels.categories.netherite_pot },
      { label: 'UHC', value: 'uhc', category: settings.channels.categories.uhc },
      { label: 'Vanilla', value: 'vanilla', category: settings.channels.categories.vanilla },
      { label: 'Sword', value: 'sword', category: settings.channels.categories.sword },
      { label: 'Pot', value: 'pot', category: settings.channels.categories.pot },
      { label: 'SMP', value: 'smp', category: settings.channels.categories.smp },
      { label: 'Axe', value: 'axe', category: settings.channels.categories.axe }
    ].filter(opt => opt.category);

    if (gamemodeOptions.length === 0) {
      return interaction.reply({
        content: 'No gamemodes are configured. Please contact an administrator to set up gamemode categories using `/setup channels`.',
        ephemeral: true
      });
    }

    const components = [];
    
    if (regionOptions.length > 0) {
      const regionSelect = new StringSelectMenuBuilder()
        .setCustomId('select_region')
        .setPlaceholder('Select your region')
        .addOptions(regionOptions);
      components.push(new ActionRowBuilder().addComponents(regionSelect));
    }

    const gamemodeSelect = new StringSelectMenuBuilder()
      .setCustomId('select_gamemode')
      .setPlaceholder('Select your gamemode')
      .addOptions(gamemodeOptions);
    components.push(new ActionRowBuilder().addComponents(gamemodeSelect));

    return interaction.reply({
      content: `Please select your region and gamemode:`,
      components,
      ephemeral: true
    });
  }
}

async function modalHandler(interaction) {
  if (interaction.customId === 'verification_modal') {
    const name = interaction.fields.getTextInputValue('name');
    const kits = interaction.fields.getTextInputValue('kits').toLowerCase();
    const server = interaction.fields.getTextInputValue('server')?.toLowerCase();
    
    userSubmissions.set(interaction.user.id, {
      discordUsername: interaction.user.tag,
      discordId: interaction.user.id,
      guildId: interaction.guild.id,
      name,
      kits,
      server,
      submittedAt: new Date().toISOString(),
      inWaitlist: false,
      selectedRegion: null,
      selectedGamemode: null,
      joinedWaitlistAt: null
    });
    
    saveUserSubmissions();
    
    await interaction.reply({
      content: 'Your account details have been verified.',
      ephemeral: true
    });
  }
}

async function selectMenuHandler(interaction) {
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const settings = guildSettings.get(guildId);
  const userData = userSubmissions.get(userId);

  if (!userData) {
    return interaction.reply({
      content: 'Please verify your account details first.',
      ephemeral: true
    });
  }

  if (interaction.customId === 'select_region') {
    userData.selectedRegion = interaction.values[0];
    userSubmissions.set(userId, userData);
    saveUserSubmissions();
    
    return interaction.update({
      content: `Region set to ${interaction.values[0].toUpperCase()}. Please select your gamemode.`,
      components: interaction.message.components,
      ephemeral: true
    });
  } else if (interaction.customId === 'select_gamemode') {
    userData.selectedGamemode = interaction.values[0];
    userSubmissions.set(userId, userData);
    saveUserSubmissions();
    return joinWaitlist(interaction, userData, settings);
  }
}

function getRegionSpecificGamemodeChannels(settings, gamemode, region) {
  const validChannels = [];
  if (!settings.channels.gamemodes[gamemode]?.queues?.length) {
    console.warn(`No queue channels found for gamemode: ${gamemode}`);
    return validChannels;
  }

  const gamemodeQueueChannels = settings.channels.gamemodes[gamemode].queues;
  console.log(`Checking gamemode ${gamemode} queue channels: ${JSON.stringify(gamemodeQueueChannels)} for region ${region}`);

  for (const queue of gamemodeQueueChannels) {
    if (queue.region === region) {
      validChannels.push(queue.channelId);
      console.log(`Channel ${queue.channelId} matches region ${region}`);
    } else {
      console.log(`Channel ${queue.channelId} does not match region ${region}`);
    }
  }

  return validChannels;
}

async function joinWaitlist(interaction, userData, settings) {
  if (!userData.selectedGamemode || !userData.selectedRegion) {
    return interaction.reply({
      content: 'Please select both a region and a gamemode to join the queue.',
      ephemeral: true
    });
  }

  const gamemodeQueueChannels = getRegionSpecificGamemodeChannels(settings, userData.selectedGamemode, userData.selectedRegion);
  
  if (gamemodeQueueChannels.length === 0) {
    console.warn(`No valid queue channels found for gamemode: ${userData.selectedGamemode} and region: ${userData.selectedRegion}`);
    return interaction.reply({
      content: `No queue channels are configured for ${userData.selectedGamemode.replace(/_/g, ' ').toUpperCase()} in ${userData.selectedRegion.toUpperCase()}. Please contact an administrator to configure queue channels using '/setup gamemode'.`,
      ephemeral: true
    });
  }

  try {
    const validGamemodeChannels = [];
    for (const channelId of gamemodeQueueChannels) {
      const gamemodeChannel = interaction.guild.channels.cache.get(channelId);
      if (gamemodeChannel) {
        await gamemodeChannel.permissionOverwrites.create(interaction.user, {
          ViewChannel: true,
          SendMessages: false,
          AddReactions: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false
        });
        validGamemodeChannels.push(`<#${channelId}>`);
      } else {
        console.warn(`Gamemode queue channel ${channelId} not found for gamemode ${userData.selectedGamemode} and region ${userData.selectedRegion}`);
      }
    }

    if (validGamemodeChannels.length === 0) {
      return interaction.reply({
        content: `No valid queue channels found for ${userData.selectedGamemode.replace(/_/g, ' ').toUpperCase()} in ${userData.selectedRegion.toUpperCase()}. Please contact an administrator to configure queue channels using '/setup gamemode'.`,
        ephemeral: true
      });
    }

    userData.inWaitlist = true;
    userData.joinedWaitlistAt = new Date().toISOString();
    userSubmissions.set(interaction.user.id, userData);
    saveUserSubmissions();

    const responseMessage = `You can now view the ${userData.selectedGamemode.replace(/_/g, ' ').toUpperCase()} queue channel(s) for ${userData.selectedRegion.toUpperCase()}: ${validGamemodeChannels.join(', ')}. You will be notified when a tester is available.`;
    return interaction.reply({
      content: responseMessage,
      ephemeral: true
    });
  } catch (error) {
    console.error('Error adding user to waitlist:', error);
    return interaction.reply({
      content: 'There was an error adding you to the queue. Please try again later or contact an administrator.',
      ephemeral: true
    });
  }
}

module.exports = {
  data,
  execute,
  buttonHandler,
  modalHandler,
  selectMenuHandler
};