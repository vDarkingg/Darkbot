const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const GUILD_SETTINGS_FILE = path.join(DATA_DIR, 'guild-settings.json');
const USER_SUBMISSIONS_FILE = path.join(DATA_DIR, 'user-submissions.json');
const QUEUE_DATA_FILE = path.join(DATA_DIR, 'queue-data.json');

const userSubmissions = new Map();

const guildSettings = new Map();

const queueDataMap = new Map();

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadGuildSettings() {
  try {
    if (fs.existsSync(GUILD_SETTINGS_FILE)) {
      const data = fs.readFileSync(GUILD_SETTINGS_FILE, 'utf8');
      const parsedData = JSON.parse(data);
      
      Object.entries(parsedData).forEach(([guildId, settings]) => {
        if (!settings.roles || !settings.channels || !settings.server) {
          console.warn(`Invalid settings structure for guild ${guildId}, skipping.`);
          return;
        }
        const validatedSettings = {
          roles: {
            tester: settings.roles.tester || null,
            admin: settings.roles.admin || null,
            cooldown: settings.roles.cooldown || null
          },
          channels: {
            categories: {
              default: settings.channels.categories?.default || null,
              crystal_pvp: settings.channels.categories?.crystal_pvp || null,
              axe_pvp: settings.channels.categories?.axe_pvp || null,
              diamond_pot: settings.channels.categories?.diamond_pot || null,
              netherite_pot: settings.channels.categories?.netherite_pot || null,
              uhc: settings.channels.categories?.uhc || null,
              vanilla: settings.channels.categories?.vanilla || null,
              sword: settings.channels.categories?.sword || null,
              pot: settings.channels.categories?.pot || null,
              smp: settings.channels.categories?.smp || null,
              axe: settings.channels.categories?.axe || null
            },
            waitlist: settings.channels.waitlist || null,
            regions: {
              as: { queue: settings.channels.regions?.as?.queue || null },
              eu: { queue: settings.channels.regions?.eu?.queue || null },
              na: { queue: settings.channels.regions?.na?.queue || null }
            },
            gamemodes: {
              crystal_pvp: { queues: settings.channels.gamemodes?.crystal_pvp?.queues?.map(q => ({ channelId: q.channelId || q, region: q.region || null })) || [] },
              axe_pvp: { queues: settings.channels.gamemodes?.axe_pvp?.queues?.map(q => ({ channelId: q.channelId || q, region: q.region || null })) || [] },
              diamond_pot: { queues: settings.channels.gamemodes?.diamond_pot?.queues?.map(q => ({ channelId: q.channelId || q, region: q.region || null })) || [] },
              netherite_pot: { queues: settings.channels.gamemodes?.netherite_pot?.queues?.map(q => ({ channelId: q.channelId || q, region: q.region || null })) || [] },
              uhc: { queues: settings.channels.gamemodes?.uhc?.queues?.map(q => ({ channelId: q.channelId || q, region: q.region || null })) || [] },
              vanilla: { queues: settings.channels.gamemodes?.vanilla?.queues?.map(q => ({ channelId: q.channelId || q, region: q.region || null })) || [] },
              sword: { queues: settings.channels.gamemodes?.sword?.queues?.map(q => ({ channelId: q.channelId || q, region: q.region || null })) || [] },
              pot: { queues: settings.channels.gamemodes?.pot?.queues?.map(q => ({ channelId: q.channelId || q, region: q.region || null })) || [] },
              smp: { queues: settings.channels.gamemodes?.smp?.queues?.map(q => ({ channelId: q.channelId || q, region: q.region || null })) || [] },
              axe: { queues: settings.channels.gamemodes?.axe?.queues?.map(q => ({ channelId: q.channelId || q, region: q.region || null })) || [] }
            }
          },
          server: {
            name: settings.server.name || null,
            icon: settings.server.icon || null
          },
          setupComplete: settings.setupComplete || false
        };
        guildSettings.set(guildId, validatedSettings);
      });
      
      console.log(`Loaded settings for ${guildSettings.size} guilds from file.`);
    } else {
      console.log('No existing guild settings file found. Starting with empty settings.');
    }
  } catch (error) {
    console.error('Error loading guild settings:', error);
  }
}

function saveGuildSettings() {
  try {
    const settingsObject = {};
    guildSettings.forEach((value, key) => {
      settingsObject[key] = value;
    });
    
    fs.writeFileSync(GUILD_SETTINGS_FILE, JSON.stringify(settingsObject, null, 2), 'utf8');
    console.log(`Saved settings for ${guildSettings.size} guilds to file.`);
  } catch (error) {
    console.error('Error saving guild settings:', error);
  }
}

function loadUserSubmissions() {
  try {
    if (fs.existsSync(USER_SUBMISSIONS_FILE)) {
      const data = fs.readFileSync(USER_SUBMISSIONS_FILE, 'utf8');
      const parsedData = JSON.parse(data);
      
      Object.entries(parsedData).forEach(([userId, submission]) => {
        if (!submission.discordId || !submission.guildId || !submission.name) {
          console.warn(`Invalid submission for user ${userId}, skipping.`);
          return;
        }
        const validatedSubmission = {
          discordUsername: submission.discordUsername || '',
          discordId: submission.discordId,
          guildId: submission.guildId,
          name: submission.name,
          kits: submission.kits || submission.region || '',
          server: submission.server || submission.gamemode || '',
          submittedAt: submission.submittedAt || new Date().toISOString(),
          inWaitlist: submission.inWaitlist || false,
          selectedRegion: submission.selectedRegion || null,
          selectedGamemode: submission.selectedGamemode || null,
          joinedWaitlistAt: submission.joinedWaitlistAt || null
        };
        userSubmissions.set(userId, validatedSubmission);
      });
      
      console.log(`Loaded ${userSubmissions.size} user submissions from file.`);
    } else {
      console.log('No existing user submissions file found. Starting with empty submissions.');
    }
  } catch (error) {
    console.error('Error loading user submissions:', error);
  }
}

function saveUserSubmissions() {
  try {
    const submissionsObject = {};
    userSubmissions.forEach((value, key) => {
      submissionsObject[key] = {
        discordUsername: value.discordUsername,
        discordId: value.discordId,
        guildId: value.guildId,
        name: value.name,
        kits: value.kits,
        server: value.server,
        submittedAt: value.submittedAt,
        inWaitlist: value.inWaitlist,
        selectedRegion: value.selectedRegion,
        selectedGamemode: value.selectedGamemode,
        joinedWaitlistAt: value.joinedWaitlistAt
      };
    });
    
    fs.writeFileSync(USER_SUBMISSIONS_FILE, JSON.stringify(submissionsObject, null, 2), 'utf8');
    console.log(`Saved ${userSubmissions.size} user submissions to file.`);
  } catch (error) {
    console.error('Error saving user submissions:', error);
  }
}

function loadQueueData() {
  try {
    if (fs.existsSync(QUEUE_DATA_FILE)) {
      const data = fs.readFileSync(QUEUE_DATA_FILE, 'utf8');
      const parsedData = JSON.parse(data);
      
      Object.entries(parsedData).forEach(([key, queueData]) => {
        if (!queueData.region || !queueData.gamemode) {
          console.warn(`Invalid queue data for key ${key}, skipping.`);
          return;
        }
        const validatedQueueData = {
          isOpen: queueData.isOpen || false,
          queue: queueData.queue || [],
          testers: queueData.testers || [],
          lastTestingSession: queueData.lastTestingSession || null,
          messageId: queueData.messageId || null,
          channelId: queueData.channelId || null,
          region: queueData.region,
          gamemode: queueData.gamemode
        };
        queueDataMap.set(key, validatedQueueData);
      });
      
      console.log(`Loaded queue data for ${queueDataMap.size} guild-region combinations from file.`);
    } else {
      console.log('No existing queue data file found. Starting with empty queue data.');
    }
  } catch (error) {
    console.error('Error loading queue data:', error);
  }
}

function saveQueueData() {
  try {
    const queueDataObject = {};
    queueDataMap.forEach((value, key) => {
      queueDataObject[key] = value;
    });
    
    fs.writeFileSync(QUEUE_DATA_FILE, JSON.stringify(queueDataObject, null, 2), 'utf8');
    console.log(`Saved queue data for ${queueDataMap.size} guild-region combinations to file.`);
  } catch (error) {
    console.error('Error saving queue data:', error);
  }
}

loadGuildSettings();
loadUserSubmissions();
loadQueueData();

const SAVE_INTERVAL = 5 * 60 * 1000;
setInterval(() => {
  saveGuildSettings();
  saveUserSubmissions();
  saveQueueData();
}, SAVE_INTERVAL);

process.on('SIGINT', () => {
  console.log('Saving data before exit...');
  saveGuildSettings();
  saveUserSubmissions();
  saveQueueData();
  process.exit(0);
});

module.exports = {
  userSubmissions,
  guildSettings,
  queueDataMap,
  saveGuildSettings,
  loadGuildSettings,
  saveUserSubmissions,
  loadUserSubmissions,
  saveQueueData,
  loadQueueData
};