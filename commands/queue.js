const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');

const { userSubmissions, guildSettings } = require('./shared-data.js');
const fs = require('fs').promises;

const queueDataMap = new Map();

async function saveQueueData() {
  try {
    await fs.writeFile('./data/queue-data.json', JSON.stringify([...queueDataMap], null, 2));
    console.log('Queue data saved successfully.');
  } catch (error) {
    console.error('Failed to save queue data:', error);
  }
}

function getQueueData(guildId, channelId) {
  const settings = guildSettings.get(guildId);
  let region = 'default';
  let gamemode = 'default';

  if (!settings || !settings.channels) {
    console.error(`getQueueData: Settings or channels missing for guild ${guildId}`);
    return null;
  }

  console.log(`getQueueData: Checking channelId ${channelId}, waitlist: ${settings.channels.waitlist}, regions: ${JSON.stringify(settings.channels.regions)}, gamemodes: ${JSON.stringify(settings.channels.gamemodes)}`);

  if (settings.channels.waitlist === channelId) {
    region = 'default';
    gamemode = 'default';
  } else {
    Object.entries(settings.channels.regions).forEach(([reg, data]) => {
      if (data.queue === channelId) {
        region = reg;
      }
    });

    Object.entries(settings.channels.gamemodes || {}).forEach(([gm, data]) => {
      if (data.queues) {
        data.queues.forEach(queue => {
          if (queue.channelId === channelId) {
            gamemode = gm;
            region = queue.region || region;
          }
        });
      }
    });
  }

  if (region === 'default' && settings.channels.waitlist !== channelId && gamemode === 'default') {
    console.error(`getQueueData: Channel ${channelId} is not a configured queue channel`);
    return null;
  }

  const key = `${guildId}-${region}-${gamemode}`;
  if (!queueDataMap.has(key)) {
    queueDataMap.set(key, {
      isOpen: false,
      queue: [],
      testers: [],
      lastTestingSession: null,
      messageId: null,
      channelId: null,
      region,
      gamemode,
      lastNotifiedPlayer: null
    });
  }
  return queueDataMap.get(key);
}

async function findExistingQueueMessage(channel) {
  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const guildId = channel.guild.id;
    const settings = guildSettings.get(guildId) || { server: { name: channel.guild.name } };
    
    for (const [_, message] of messages) {
      if (message.author.bot && 
          message.embeds.length > 0 && 
          (message.embeds[0].title.includes('Testing Queue') || 
           message.embeds[0].title === settings.server.name)) {
        return message;
      }
    }
    return null;
  } catch (error) {
    console.error('Error finding existing queue message:', error);
    return null;
  }
}

async function sendQueuePositionDM(client, userId, guildId, queueData) {
  try {
    const user = await client.users.fetch(userId);
    const settings = guildSettings.get(guildId);
    const queueName = `${queueData.region.toUpperCase()} ${queueData.gamemode !== 'default' ? `(${queueData.gamemode.replace(/_/g, ' ').toUpperCase()})` : ''}`;
    await user.send({
      content: `You are now #1 in the testing queue for ${queueName}! It's your turn to test soon. Please stay active and wait for a tester to create your testing channel.`,
    });
    console.log(`Sent DM to user ${userId} for reaching #1 in ${queueName} queue`);
  } catch (error) {
    console.error(`Failed to send DM to user ${userId}:`, error);
  }
}

async function updateQueueAndNotify(client, guildId, channelId, queueData) {
  if (queueData.messageId && queueData.channelId) {
    try {
      const channel = await client.channels.fetch(queueData.channelId);
      const message = await channel.messages.fetch(queueData.messageId).catch(() => null);
      if (message) {
        const updatedEmbed = createQueueEmbed(guildId, channelId);
        await message.edit({ embeds: [updatedEmbed] });
      }
    } catch (error) {
      console.error('Failed to update queue message:', error);
    }
  }

  if (queueData.queue.length > 0 && queueData.queue[0] !== queueData.lastNotifiedPlayer) {
    const settings = guildSettings.get(guildId);
    const member = await client.guilds.cache.get(guildId).members.fetch(queueData.queue[0]).catch(() => null);
    if (member && !member.roles.cache.has(settings.roles.tester)) {
      await sendQueuePositionDM(client, queueData.queue[0], guildId, queueData);
      queueData.lastNotifiedPlayer = queueData.queue[0];
    }
  } else if (queueData.queue.length === 0) {
    queueData.lastNotifiedPlayer = null;
  }

  await saveQueueData();
}

module.exports.openQueueCommand = {
  data: new SlashCommandBuilder()
    .setName('openqueue')
    .setDescription('Opens the testing queue in the current channel'),
  
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const channelId = interaction.channel.id;
    
    if (!guildSettings.has(guildId) || !guildSettings.get(guildId).setupComplete) {
      return interaction.reply({ 
        content: 'Bot setup is not complete. Please ask an administrator to configure the following using `/setup` commands:\n' +
                 '- Tester role (`/setup roles`)\n' +
                 '- Default category (`/setup channels`)\n' +
                 '- Waitlist channel (`/setup channels`)\n' +
                 '- Server name (`/setup server`)',
        ephemeral: true 
      });
    }
    
    const settings = guildSettings.get(guildId);
    
    if (!interaction.member.roles.cache.has(settings.roles.tester)) {
      return interaction.reply({ 
        content: 'You need the Tester role to use this command.', 
        ephemeral: true 
      });
    }

    const queueData = getQueueData(guildId, channelId);
    if (!queueData) {
      return interaction.reply({
        content: 'This command must be used in a configured queue channel (default, region-specific, or gamemode-specific). Please check `/setup channels` or `/setup gamemode` configuration.',
        ephemeral: true
      });
    }

    try {
      await interaction.deferReply({ ephemeral: true });
      if (queueData.messageId && queueData.channelId) {
        try {
          const channel = await interaction.client.channels.fetch(queueData.channelId);
          const message = await channel.messages.fetch(queueData.messageId).catch(() => null);
          if (message) {
            await message.delete();
            console.log(`Deleted previous queue message ${queueData.messageId} in channel ${channelId}`);
          }
        } catch (error) {
          console.error(`Failed to delete previous queue message ${queueData.messageId}:`, error);
        }
        queueData.messageId = null;
      }

      const existingMessage = await findExistingQueueMessage(interaction.channel);
      if (existingMessage) {
        try {
          await existingMessage.delete();
          console.log(`Deleted existing queue message ${existingMessage.id} in channel ${channelId}`);
        } catch (error) {
          console.error(`Failed to delete existing queue message ${existingMessage.id}:`, error);
        }
      }

      queueData.isOpen = true;
      queueData.lastTestingSession = new Date().toLocaleString();
      queueData.queue = [];
      queueData.channelId = channelId;
      queueData.lastNotifiedPlayer = null;
      
      if (!queueData.testers.includes(interaction.user.id)) {
        queueData.testers.push(interaction.user.id);
      }

      const queueEmbed = createQueueEmbed(guildId, channelId);
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('join_queue')
            .setLabel('Join')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('leave_queue')
            .setLabel('Leave')
            .setStyle(ButtonStyle.Danger)
        );

      const message = await interaction.channel.send({ 
        content: '@everyone',
        allowedMentions: { parse: ['everyone'] },
        embeds: [queueEmbed], 
        components: [row] 
      });
      
      queueData.messageId = message.id;
      await saveQueueData();

      await interaction.editReply({
        content: 'Opened the testing queue.',
        ephemeral: true
      });
    } catch (error) {
      console.error('Error in openQueueCommand:', error);
      try {
        await interaction.editReply({
          content: 'An error occurred while opening the queue. Please try again.',
          ephemeral: true
        });
      } catch (followUpError) {
        console.error('Failed to send error reply:', followUpError);
      }
    }
  }
};

module.exports.closeQueueCommand = {
  data: new SlashCommandBuilder()
    .setName('closequeue')
    .setDescription('Closes the testing queue in the current channel'),
  
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const channelId = interaction.channel.id;
    
    if (!guildSettings.has(guildId) || !guildSettings.get(guildId).setupComplete) {
      return interaction.reply({ 
        content: 'Bot setup is not complete. Please ask an administrator to configure the following using `/setup` commands:\n' +
                 '- Tester role (`/setup roles`)\n' +
                 '- Default category (`/setup channels`)\n' +
                 '- Waitlist channel (`/setup channels`)\n' +
                 '- Server name (`/setup server`)',
        ephemeral: true 
      });
    }
    
    const settings = guildSettings.get(guildId);
    
    if (!interaction.member.roles.cache.has(settings.roles.tester)) {
      return interaction.reply({ 
        content: 'You need the Tester role to use this command.', 
        ephemeral: true 
      });
    }
    
    const queueData = getQueueData(guildId, channelId);
    if (!queueData) {
      return interaction.reply({
        content: 'This command must be used in a configured queue channel (default, region-specific, or gamemode-specific). Please check `/setup channels` or `/setup gamemode` configuration.',
        ephemeral: true
      });
    }

    if (!queueData.isOpen) {
      return interaction.reply({ 
        content: 'The queue is already closed.',
        ephemeral: true 
      });
    }

    try {
      await interaction.deferReply({ ephemeral: true });

      if (queueData.messageId && queueData.channelId) {
        try {
          const channel = await interaction.client.channels.fetch(queueData.channelId);
          const message = await channel.messages.fetch(queueData.messageId).catch(() => null);
          if (message) {
            await message.delete();
            console.log(`Deleted queue message ${queueData.messageId} in channel ${channelId}`);
          }
        } catch (error) {
          console.error(`Failed to delete queue message ${queueData.messageId}:`, error);
        }
        queueData.messageId = null;
      }

      queueData.isOpen = false;
      queueData.lastNotifiedPlayer = null;
      const closedEmbed = createClosedQueueEmbed(guildId, channelId);

      await interaction.channel.send({ 
        embeds: [closedEmbed] 
      });

      queueData.queue = [];
      queueData.testers = [];
      await saveQueueData();

      await interaction.editReply({
        content: 'Closed the testing queue.',
        ephemeral: true
      });
    } catch (error) {
      console.error('Error in closeQueueCommand:', error);
      try {
        await interaction.editReply({
          content: 'An error occurred while closing the queue. Please try again.',
          ephemeral: true
        });
      } catch (followUpError) {
        console.error('Failed to send error reply:', followUpError);
      }
    }
  }
};

module.exports.queueCommand = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('View or interact with the testing queue in the current channel'),
  
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const channelId = interaction.channel.id;
    
    if (!guildSettings.has(guildId) || !guildSettings.get(guildId).setupComplete) {
      return interaction.reply({ 
        content: 'Bot setup is not complete. Please ask an administrator to configure the following using `/setup` commands:\n' +
                 '- Tester role (`/setup roles`)\n' +
                 '- Default category (`/setup channels`)\n' +
                 '- Waitlist channel (`/setup channels`)\n' +
                 '- Server name (`/setup server`)',
        ephemeral: true 
      });
    }
    
    const settings = guildSettings.get(guildId);
    const queueData = getQueueData(guildId, channelId);
    
    if (!queueData) {
      return interaction.reply({
        content: 'This command must be used in a configured queue channel (default, region-specific, or gamemode-specific). Please check `/setup channels` or `/setup gamemode` configuration.',
        ephemeral: true
      });
    }
    
    if (!queueData.isOpen) {
      return interaction.reply({
        content: 'The testing queue is currently closed.',
        ephemeral: true
      });
    }

    const userId = interaction.user.id;
    
    if (interaction.member.roles.cache.has(settings.roles.tester)) {
      if (queueData.queue.length === 0) {
        return interaction.reply({
          content: 'There are no users in the queue for this region and gamemode.',
          ephemeral: true
        });
      }
      
      const options = await Promise.all(queueData.queue.map(async (queueUserId) => {
        try {
          const user = await interaction.client.users.fetch(queueUserId);
          const userData = userSubmissions.get(queueUserId);
          return {
            label: user.username,
            value: queueUserId,
            description: userData ? `Gamemode: ${userData.gamemode}, Region: ${userData.region}` : 'No data'
          };
        } catch (error) {
          console.error(`Failed to fetch user ${queueUserId}:`, error);
          return {
            label: `User ID: ${queueUserId}`,
            value: queueUserId,
            description: 'No data available'
          };
        }
      }));
      
      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_user')
            .setPlaceholder('Select a user from the queue')
            .addOptions(options)
        );
      
      return interaction.reply({
        content: 'Select a user to create a testing channel:',
        components: [row],
        ephemeral: true
      });
    } else {
      if (settings.roles.cooldown && interaction.member.roles.cache.has(settings.roles.cooldown)) {
        return interaction.reply({
          content: 'You are on cooldown and cannot join the queue at this time.',
          ephemeral: true
        });
      }
      
      if (queueData.queue.includes(userId) || queueData.testers.includes(userId)) {
        return interaction.reply({
          content: 'You are already in the queue or testers list for this region and gamemode.',
          ephemeral: true
        });
      }

      const userData = userSubmissions.get(userId);
      if (!userData) {
        return interaction.reply({
          content: 'Please verify your account details first using the verification form.',
          ephemeral: true
        });
      }

      if (userData.selectedRegion !== queueData.region && userData.selectedRegion !== 'default' && queueData.region !== 'default') {
        return interaction.reply({
          content: `This queue is for the ${queueData.region.toUpperCase()} region. Your selected region is ${userData.selectedRegion.toUpperCase()}. Please join the correct region queue.`,
          ephemeral: true
        });
      }

      if (userData.selectedGamemode !== queueData.gamemode && userData.selectedGamemode && queueData.gamemode !== 'default') {
        return interaction.reply({
          content: `This queue is for the ${queueData.gamemode.replace(/_/g, ' ').toUpperCase()} gamemode. Your selected gamemode is ${userData.selectedGamemode.replace(/_/g, ' ').toUpperCase()}. Please join the correct gamemode queue.`,
          ephemeral: true
        });
      }
      
      try {
        await interaction.deferReply({ ephemeral: true });
        queueData.queue.push(userId);
        await updateQueueAndNotify(interaction.client, guildId, channelId, queueData);

        await interaction.editReply({
          content: `You have been added to the testing queue for ${queueData.region.toUpperCase()} ${queueData.gamemode !== 'default' ? `(${queueData.gamemode.replace(/_/g, ' ').toUpperCase()})` : ''}!`,
          ephemeral: true
        });
      } catch (error) {
        console.error('Error in queueCommand:', error);
        try {
          await interaction.editReply({
            content: 'An error occurred while joining the queue. Please try again.',
            ephemeral: true
          });
        } catch (followUpError) {
          console.error('Failed to send error reply:', followUpError);
        }
      }
    }
  }
};

module.exports.joinCommand = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join the testing queue in the current channel'),
  
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const channelId = interaction.channel.id;
    
    if (!guildSettings.has(guildId) || !guildSettings.get(guildId).setupComplete) {
      return interaction.reply({ 
        content: 'Bot setup is not complete. Please ask an administrator to configure the following using `/setup` commands:\n' +
                 '- Tester role (`/setup roles`)\n' +
                 '- Default category (`/setup channels`)\n' +
                 '- Waitlist channel (`/setup channels`)\n' +
                 '- Server name (`/setup server`)',
        ephemeral: true 
      });
    }
    
    const settings = guildSettings.get(guildId);
    const queueData = getQueueData(guildId, channelId);
    
    if (!queueData) {
      return interaction.reply({
        content: 'This command must be used in a configured queue channel (default, region-specific, or gamemode-specific). Please check `/setup channels` or `/setup gamemode` configuration.',
        ephemeral: true
      });
    }
    
    if (!queueData.isOpen) {
      return interaction.reply({
        content: 'The testing queue is currently closed.',
        ephemeral: true
      });
    }
    
    const userId = interaction.user.id;
    
    if (settings.roles.cooldown && interaction.member.roles.cache.has(settings.roles.cooldown)) {
      return interaction.reply({
        content: 'You are on cooldown and cannot join the queue at this time.',
        ephemeral: true
      });
    }
    
    if (queueData.queue.includes(userId) || queueData.testers.includes(userId)) {
      return interaction.reply({
        content: 'You are already in the queue or testers list for this region and gamemode.',
        ephemeral: true
      });
    }
    
    try {
      await interaction.deferReply({ ephemeral: true });
      
      if (!interaction.member.roles.cache.has(settings.roles.tester)) {
        const userData = userSubmissions.get(userId);
        if (!userData) {
          return interaction.editReply({
            content: 'Please verify your account details first using the verification form.',
            ephemeral: true
          });
        }

        if (userData.selectedRegion !== queueData.region && userData.selectedRegion !== 'default' && queueData.region !== 'default') {
          return interaction.editReply({
            content: `This queue is for the ${queueData.region.toUpperCase()} region. Your selected region is ${userData.selectedRegion.toUpperCase()}. Please join the correct region queue.`,
            ephemeral: true
          });
        }

        if (userData.selectedGamemode !== queueData.gamemode && userData.selectedGamemode && queueData.gamemode !== 'default') {
          return interaction.editReply({
            content: `This queue is for the ${queueData.gamemode.replace(/_/g, ' ').toUpperCase()} gamemode. Your selected gamemode is ${userData.selectedGamemode.replace(/_/g, ' ').toUpperCase()}. Please join the correct gamemode queue.`,
            ephemeral: true
          });
        }
        queueData.queue.push(userId);
      } else {
        queueData.testers.push(userId);
      }
      
      await updateQueueAndNotify(interaction.client, guildId, channelId, queueData);

      await interaction.editReply({
        content: `You have been added to the ${interaction.member.roles.cache.has(settings.roles.tester) ? 'testers list' : 'testing queue'} for ${queueData.region.toUpperCase()} ${queueData.gamemode !== 'default' ? `(${queueData.gamemode.replace(/_/g, ' ').toUpperCase()})` : ''}!`,
        ephemeral: true
      });
    } catch (error) {
      console.error('Error in joinCommand:', error);
      try {
        await interaction.editReply({
          content: 'An error occurred while joining the queue. Please try again.',
          ephemeral: true
        });
      } catch (followUpError) {
        console.error('Failed to send error reply:', followUpError);
      }
    }
  }
};

module.exports.closeTicketCommand = {
  data: new SlashCommandBuilder()
    .setName('closeticket')
    .setDescription('Close and delete the current testing channel'),
  
  async execute(interaction) {
    const guildId = interaction.guild.id;
    
    if (!guildSettings.has(guildId) || !guildSettings.get(guildId).setupComplete) {
      return interaction.reply({ 
        content: 'Bot setup is not complete. Please ask an administrator to configure the following using `/setup` commands:\n' +
                 '- Tester role (`/setup roles`)\n' +
                 '- Default category (`/setup channels`)\n' +
                 '- Waitlist channel (`/setup channels`)\n' +
                 '- Server name (`/setup server`)',
        ephemeral: true 
      });
    }
    
    const settings = guildSettings.get(guildId);
    
    if (!interaction.member.roles.cache.has(settings.roles.tester)) {
      return interaction.reply({ 
        content: 'You need the Tester role to use this command.', 
        ephemeral: true 
      });
    }

    try {
      await interaction.reply({
        content: 'Closing this testing channel in 10 seconds...',
        ephemeral: false
      });

      setTimeout(async () => {
        try {
          await interaction.channel.delete();
        } catch (error) {
          console.error('Failed to delete channel:', error);
          try {
            await interaction.followUp({
              content: 'Failed to delete the channel. Please try again or use `/closeticket` command.',
              ephemeral: false
            });
          } catch (followUpError) {
            console.error('Failed to send follow-up message:', followUpError);
          }
        }
      }, 10000);
    } catch (error) {
      console.error('Error in closeTicketCommand:', error);
      try {
        await interaction.followUp({
          content: 'An error occurred while closing the ticket. Please try again.',
          ephemeral: true
        });
      } catch (followUpError) {
        console.error('Failed to send error follow-up:', followUpError);
      }
    }
  }
};

module.exports.buttonHandler = async function(interaction) {
  if (!interaction.guild) return;
  
  const guildId = interaction.guild.id;
  const channelId = interaction.channel.id;

  if (!guildSettings.has(guildId) || !guildSettings.get(guildId).setupComplete) {
    return interaction.reply({ 
      content: 'Bot setup is not complete. Please ask an administrator to configure the following using `/setup` commands:\n' +
               '- Tester role (`/setup roles`)\n' +
               '- Default category (`/setup channels`)\n' +
               '- Waitlist channel (`/setup channels`)\n' +
               '- Server name (`/setup server`)',
      ephemeral: true 
    });
  }

  const settings = guildSettings.get(guildId);
  const queueData = getQueueData(guildId, channelId);

  try {
    await interaction.deferReply({ ephemeral: true });

    if (interaction.customId === 'join_queue') {
      if (!queueData) {
        console.error(`buttonHandler: Invalid queue channel ${channelId} for guild ${guildId}`);
        return interaction.editReply({
          content: 'This button must be used in a configured queue channel (default, region-specific, or gamemode-specific). Please check `/setup channels` or `/setup gamemode` configuration.',
          ephemeral: true
        });
      }

      if (settings.roles.cooldown && interaction.member.roles.cache.has(settings.roles.cooldown)) {
        return interaction.editReply({
          content: 'You are on cooldown and cannot join the queue at this time.',
          ephemeral: true
        });
      }

      if (queueData.queue.includes(interaction.user.id) || queueData.testers.includes(interaction.user.id)) {
        return interaction.editReply({
          content: 'You are already in the queue or testers list for this region and gamemode.',
          ephemeral: true
        });
      }

      if (!interaction.member.roles.cache.has(settings.roles.tester)) {
        const userData = userSubmissions.get(interaction.user.id);
        if (!userData) {
          return interaction.editReply({
            content: 'Please verify your account details first using the verification form.',
            ephemeral: true
          });
        }

        if (userData.selectedRegion !== queueData.region && userData.selectedRegion !== 'default' && queueData.region !== 'default') {
          return interaction.editReply({
            content: `This queue is for the ${queueData.region.toUpperCase()} region. Your selected region is ${userData.selectedRegion.toUpperCase()}. Please join the correct region queue.`,
            ephemeral: true
          });
        }

        if (userData.selectedGamemode !== queueData.gamemode && userData.selectedGamemode && queueData.gamemode !== 'default') {
          return interaction.editReply({
            content: `This queue is for the ${queueData.gamemode.replace(/_/g, ' ').toUpperCase()} gamemode. Your selected gamemode is ${userData.selectedGamemode.replace(/_/g, ' ').toUpperCase()}. Please join the correct gamemode queue.`,
            ephemeral: true
          });
        }
        queueData.queue.push(interaction.user.id);
      } else {
        queueData.testers.push(interaction.user.id);
      }

      await updateQueueAndNotify(interaction.client, guildId, channelId, queueData);

      await interaction.editReply({
        content: `You have been added to the ${interaction.member.roles.cache.has(settings.roles.tester) ? 'testers list' : 'testing queue'} for ${queueData.region.toUpperCase()} ${queueData.gamemode !== 'default' ? `(${queueData.gamemode.replace(/_/g, ' ').toUpperCase()})` : ''}!`,
        ephemeral: true
      });
    } else if (interaction.customId === 'leave_queue') {
      if (!queueData) {
        console.error(`buttonHandler: Invalid queue channel ${channelId} for guild ${guildId}`);
        return interaction.editReply({
          content: 'This button must be used in a configured queue channel (default, region-specific, or gamemode-specific). Please check `/setup channels` or `/setup gamemode` configuration.',
          ephemeral: true
        });
      }

      let removed = false;
      const queueIndex = queueData.queue.indexOf(interaction.user.id);
      if (queueIndex !== -1) {
        queueData.queue.splice(queueIndex, 1);
        removed = true;
      }
      const testerIndex = queueData.testers.indexOf(interaction.user.id);
      if (testerIndex !== -1) {
        queueData.testers.splice(testerIndex, 1);
        removed = true;
      }

      if (!removed) {
        return interaction.editReply({
          content: 'You are not in the queue or testers list for this region and gamemode.',
          ephemeral: true
        });
      }

      await updateQueueAndNotify(interaction.client, guildId, channelId, queueData);

      await interaction.editReply({
        content: `You have been removed from the ${interaction.member.roles.cache.has(settings.roles.tester) ? 'testers list' : 'testing queue'} for ${queueData.region.toUpperCase()} ${queueData.gamemode !== 'default' ? `(${queueData.gamemode.replace(/_/g, ' ').toUpperCase()})` : ''}.`,
        ephemeral: true
      });
    } else if (interaction.customId === 'close_ticket') {
      if (!interaction.member.roles.cache.has(settings.roles.tester)) {
        return interaction.editReply({
          content: 'Only testers can close this channel.',
          ephemeral: true
        });
      }

      await interaction.editReply({
        content: 'Closing this testing channel in 10 seconds...',
        ephemeral: false
      });

      setTimeout(async () => {
        try {
          await interaction.channel.delete();
        } catch (error) {
          console.error('Failed to delete channel:', error);
          try {
            await interaction.followUp({
              content: 'Failed to delete the channel. Please try again or use `/closeticket` command.',
              ephemeral: false
            });
          } catch (followUpError) {
            console.error('Failed to send follow-up message:', followUpError);
          }
        }
      }, 10000);
    }
  } catch (error) {
    console.error('Error in buttonHandler:', error);
    try {
      await interaction.editReply({
        content: 'An error occurred while processing the button interaction. Please try again.',
        ephemeral: true
      });
    } catch (followUpError) {
      console.error('Failed to send error reply:', followUpError);
    }
  }
};

module.exports.selectMenuHandler = async function(interaction) {
  if (!interaction.guild) return;
  
  const guildId = interaction.guild.id;
  const channelId = interaction.channel.id;

  const queueData = getQueueData(guildId, channelId);
  if (!queueData) {
    console.error(`selectMenuHandler: Invalid queue channel ${channelId} for guild ${guildId}`);
    return interaction.reply({
      content: 'This select menu must be used in a configured queue channel (default, region-specific, or gamemode-specific). Please check `/setup channels` or `/setup gamemode` configuration.',
      ephemeral: true
    });
  }

  if (interaction.customId === 'select_user') {
    try {
      await interaction.deferReply({ ephemeral: true });
      const selectedUserId = interaction.values[0];
      await createChannelForUser(interaction, guildId, channelId, selectedUserId);
    } catch (error) {
      console.error('Error in selectMenuHandler:', error);
      try {
        await interaction.editReply({
          content: 'An error occurred while processing the select menu. Please try again.',
          ephemeral: true
        });
      } catch (followUpError) {
        console.error('Failed to send error reply:', followUpError);
      }
    }
  }
};

function createQueueEmbed(guildId, channelId) {
  const settings = guildSettings.get(guildId);
  const queueData = getQueueData(guildId, channelId);
  
  if (!queueData) {
    console.error(`createQueueEmbed: Invalid queue data for guild ${guildId}, channel ${channelId}`);
    return new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('Error')
      .setDescription('Failed to create queue embed due to invalid channel configuration.')
      .setTimestamp();
  }

  const embed = new EmbedBuilder()
    .setColor('#36393F')
    .setTitle(`Testing Queue - ${queueData.region.toUpperCase()} ${queueData.gamemode !== 'default' ? `(${queueData.gamemode.replace(/_/g, ' ').toUpperCase()})` : ''}`)
    .setDescription(`Please use the command /join to join the ${queueData.region.toUpperCase()} ${queueData.gamemode !== 'default' ? queueData.gamemode.replace(/_/g, ' ').toUpperCase() : ''} queue`)
    .setTimestamp();
  
  if (settings && settings.server.icon) {
    embed.setThumbnail(settings.server.icon);
  }

  let queueList = '';
  for (let i = 0; i < 10; i++) {
    if (i < queueData.queue.length) {
      const userData = userSubmissions.get(queueData.queue[i]);
      queueList += `${i + 1}. <@${queueData.queue[i]}> (${userData ? userData.gamemode : 'No gamemode'})\n`;
    } else {
      queueList += `${i + 1}.\n`;
    }
  }
  
  embed.addFields({ name: 'Players:', value: queueList });

  let testersList = '';
  for (let i = 0; i < 3; i++) {
    if (i < queueData.testers.length) {
      testersList += `${i + 1}. <@${queueData.testers[i]}>\n`;
    } else {
      testersList += `${i + 1}.\n`;
    }
  }
  
  embed.addFields({ name: 'Testers', value: testersList });

  return embed;
}

function createClosedQueueEmbed(guildId, channelId) {
  const settings = guildSettings.get(guildId);
  const queueData = getQueueData(guildId, channelId);
  
  if (!queueData) {
    console.error(`createClosedQueueEmbed: Invalid queue data for guild ${guildId}, channel ${channelId}`);
    return new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('Error')
      .setDescription('Failed to create closed queue embed due to invalid channel configuration.')
      .setTimestamp();
  }

  const embed = new EmbedBuilder()
    .setColor('#36393F')
    .setTitle(`Testing Queue - ${queueData.region.toUpperCase()} ${queueData.gamemode !== 'default' ? `(${queueData.gamemode.replace(/_/g, ' ').toUpperCase()})` : ''}`)
    .setDescription(`No Testers Online in ${queueData.region.toUpperCase()} ${queueData.gamemode !== 'default' ? queueData.gamemode.replace(/_/g, ' ').toUpperCase() : ''}\n\nNo testers are available at this time.\nYou will be pinged when a tester is available.\nCheck back later!`)
    .addFields({ name: 'Last testing session:', value: queueData.lastTestingSession || 'No previous session' });

  if (settings && settings.server.icon) {
    embed.setThumbnail(settings.server.icon);
  }

  return embed;
}

async function createChannelForUser(interaction, guildId, channelId, userId) {
  const userData = userSubmissions.get(userId);
  if (!userData && !interaction.member.roles.cache.has(guildSettings.get(guildId).roles.tester)) {
    return interaction.editReply({
      content: 'User verification data not found.',
      ephemeral: true
    });
  }

  const settings = guildSettings.get(guildId);
  if (!settings || !settings.setupComplete) {
    return interaction.editReply({
      content: 'Bot setup is not complete. Please ask an administrator to configure the following using `/setup` commands:\n' +
               '- Tester role (`/setup roles`)\n' +
               '- Default category (`/setup channels`)\n' +
               '- Waitlist channel (`/setup channels`)\n' +
               '- Server name (`/setup server`)',
      ephemeral: true
    });
  }

  const queueData = getQueueData(guildId, channelId);
  if (!queueData) {
    console.error(`createChannelForUser: Invalid queue channel ${channelId} for guild ${guildId}`);
    return interaction.editReply({
      content: 'This select menu must be used in a configured queue channel (default, region-specific, or gamemode-specific). Please check `/setup channels` or `/setup gamemode` configuration.',
      ephemeral: true
    });
  }

  try {
    const user = await interaction.client.users.fetch(userId);
    
    let categoryId = settings.channels.categories.default;
    if (queueData.gamemode !== 'default' && settings.channels.categories[queueData.gamemode]) {
      categoryId = settings.channels.categories[queueData.gamemode];
    }

    const channelName = userData ? 
      `testing-${userData.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${queueData.gamemode || 'default'}-${queueData.region}` :
      `testing-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${queueData.gamemode || 'default'}-${queueData.region}`;

    const channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: userId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
        {
          id: settings.roles.tester,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
      ],
    });

    const closeButtonRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
      );

  const verificationMessage = userData ?
  `<@&${settings.roles.tester}> <@${userId}> Testing channel created.\n\n` +
  `**Name:**\n\`\`\`${userData.name}\`\`\`\n` +
  `**Kits:**\n\`\`\`${userData.kits}\`\`\`\n` +
  `**Preferred Server:**\n\`\`\`${userData.server}\`\`\`` :
  `<@&${settings.roles.tester}> <@${userId}> Testing channel created.\n\n` +
  `**Name:**\n\`\`\`${user.username}\`\`\`\n` +
  `**Kits:**\n\`\`\`Not specified\`\`\`\n` +
  `**Preferred Server:**\n\`\`\`Not specified\`\`\``;


    await channel.send({ 
      content: verificationMessage,
      components: [closeButtonRow]
    });

    const userIndex = queueData.queue.indexOf(userId);
    if (userIndex !== -1) {
      queueData.queue.splice(userIndex, 1);
      await updateQueueAndNotify(interaction.client, guildId, channelId, queueData);
    }

    await interaction.editReply({
      content: interaction.isStringSelectMenu() ?
        `Created channel <#${channel.id}> for <@${userId}> in ${queueData.region.toUpperCase()} ${queueData.gamemode !== 'default' ? `(${queueData.gamemode.replace(/_/g, ' ').toUpperCase()})` : ''}. They have been removed from the queue.` :
        `Created channel <#${channel.id}> for you in ${queueData.region.toUpperCase()} ${queueData.gamemode !== 'default' ? `(${queueData.gamemode.replace(/_/g, ' ').toUpperCase()})` : ''}. You have been removed from the queue.`,
      ephemeral: true
    });
  } catch (error) {
    console.error('Failed to create user channel:', error);
    try {
      await interaction.editReply({
        content: 'There was an error creating the channel. Please try again later.',
        ephemeral: true
      });
    } catch (followUpError) {
      console.error('Failed to send error reply:', followUpError);
    }
  }
}

module.exports = {
  commands: [
    module.exports.openQueueCommand,
    module.exports.closeQueueCommand,
    module.exports.queueCommand,
    module.exports.joinCommand,
    module.exports.closeTicketCommand
  ],
  buttonHandler: module.exports.buttonHandler,
  selectMenuHandler: module.exports.selectMenuHandler,
  queueDataMap
};