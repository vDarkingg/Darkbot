const { Client, Collection, Events, GatewayIntentBits, REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const { loadGuildSettings, loadUserSubmissions, loadQueueData } = require('./commands/shared-data.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'shared-data.js');

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const commandModule = require(filePath);

  if (commandModule.commands && Array.isArray(commandModule.commands)) {
    for (const command of commandModule.commands) {
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`Loaded command: ${command.data.name}`);
      } else {
        console.log(`[WARNING] A command in ${filePath} is missing required "data" or "execute" property.`);
      }
    }
  } else if ('data' in commandModule && 'execute' in commandModule) {
    client.commands.set(commandModule.data.name, commandModule);
    console.log(`Loaded command: ${commandModule.data.name}`);
  } else {
    console.log(`[WARNING] The command module at ${filePath} is not in the expected format.`);
  }
}

async function clearCommandsForGuild(guildId) {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
      { body: [] }
    );
    console.log(`Cleared all guild commands for guild: ${guildId}`);
  } catch (error) {
    console.error(`Error clearing guild commands for guild ${guildId}:`, error);
  }
}

async function registerCommandsForGuild(guildId) {
  try {
    console.log(`Registering commands for guild: ${guildId}`);
    const commands = [];
    for (const [name, command] of client.commands) {
      commands.push(command.data.toJSON());
    }

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
      { body: commands }
    );
    console.log(`Successfully registered commands for guild: ${guildId}`);
  } catch (error) {
    console.error(`Error registering commands for guild ${guildId}:`, error);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  loadGuildSettings();
  loadUserSubmissions();
  loadQueueData();

  console.log(`Registering commands for ${client.guilds.cache.size} guilds...`);
  const guilds = [...client.guilds.cache.values()];
  for (const guild of guilds) {
    await clearCommandsForGuild(guild.id);
    await registerCommandsForGuild(guild.id);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('Finished registering commands for all guilds');
});

client.on(Events.GuildCreate, async guild => {
  console.log(`Joined new guild: ${guild.name} (${guild.id})`);
  await clearCommandsForGuild(guild.id);
  await registerCommandsForGuild(guild.id);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        const errorResponse = {
          content: 'There was an error while executing this command!',
          ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorResponse);
        } else {
          await interaction.reply(errorResponse);
        }
      }
    }

    else if (interaction.isButton()) {
      const buttonId = interaction.customId;

      if (
        buttonId === 'verify_account' ||
        buttonId === 'join_waitlist' ||
        buttonId === 'select_region' ||
        buttonId === 'select_gamemode'
      ) {
        const waitlistCommand = require('./commands/waitlist.js');
        if (waitlistCommand.buttonHandler) {
          await waitlistCommand.buttonHandler(interaction);
        }
      } else if (
        buttonId === 'join_queue' ||
        buttonId === 'leave_queue' ||
        buttonId === 'close_ticket'
      ) {
        const queueCommands = require('./commands/queue.js');
        if (queueCommands.buttonHandler) {
          await queueCommands.buttonHandler(interaction);
        }
      } else if (buttonId === 'reset_settings') {
        const setupCommand = require('./commands/setup.js');
        if (setupCommand.buttonHandler) {
          await setupCommand.buttonHandler(interaction);
        }
      } else if (buttonId.startsWith('guide_')) {
        const helpCommand = require('./commands/help.js');
        if (helpCommand.buttonHandler) {
          await helpCommand.buttonHandler(interaction);
        }
      }
    }

    else if (interaction.isStringSelectMenu()) {
      const selectId = interaction.customId;

      if (selectId === 'select_region' || selectId === 'select_gamemode') {
        const waitlistCommand = require('./commands/waitlist.js');
        if (waitlistCommand.selectMenuHandler) {
          await waitlistCommand.selectMenuHandler(interaction);
        }
      } else if (selectId === 'select_user') {
        const queueCommands = require('./commands/queue.js');
        if (queueCommands.selectMenuHandler) {
          await queueCommands.selectMenuHandler(interaction);
        }
      }
    }

    else if (interaction.isModalSubmit()) {
      const modalId = interaction.customId;

      if (modalId === 'verification_modal') {
        const waitlistCommand = require('./commands/waitlist.js');
        if (waitlistCommand.modalHandler) {
          await waitlistCommand.modalHandler(interaction);
        }
      }
    }
  } catch (error) {
    console.error('Error in interaction handling:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An unexpected error occurred while processing your interaction.',
        ephemeral: true
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
