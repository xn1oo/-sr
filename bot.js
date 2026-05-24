const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const STAFF_ROLE_NAME = '𝐀𝐝𝐦𝐢𝐧𝐬𝐭𝐫𝐚𝐭𝐢𝐨𝐧 𝐓𝐞𝐚𝐦';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const sessions = {};
const wizards = {};

const commands = [
  new SlashCommandBuilder()
    .setName('session')
    .setDescription('Manage sessions')
    .addSubcommand(sub =>
      sub.setName('start').setDescription('Start a new session (Staff only)')
    )
    .addSubcommand(sub =>
      sub.setName('end').setDescription('End the current session (Staff only)')
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('playercount')
    .setDescription('Update the player count on the active session')
    .addStringOption(opt =>
      opt.setName('count').setDescription('New player count e.g. 11/15').setRequired(true)
    )
    .toJSON(),
];

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Commands registered.');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
});

function isStaff(member) {
  return member.roles.cache.some(r => r.name === STAFF_ROLE_NAME);
}

function formatUptime(startTime) {
  const diff = Math.floor((Date.now() - startTime) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${h}h ${m}m ${s}s`;
}

function buildSessionEmbed(data, uptime) {
  const embed = new EmbedBuilder()
    .setTitle('🎮 Active Session')
    .setColor('#00FF7F')
    .addFields(
      { name: '🟢 STATUS', value: '**Online**', inline: true },
      { name: '👥 PLAYERS', value: `**${data.playerCount}/${data.maxPlayers}**`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '🔗 SERVER LINK', value: data.serverLink, inline: false },
      { name: '⏱️ SESSION UPTIME', value: uptime, inline: true },
      { name: '🕐 SESSION END', value: data.endTime, inline: true },
      { name: '📅 NEXT SESSION', value: data.nextSession, inline: false }
    )
    .setFooter({ text: 'Session is live! Join now.' });

  if (data.imageUrl) embed.setImage(data.imageUrl);
  return embed;
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === 'session' && interaction.options.getSubcommand() === 'start') {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ You do not have permission to start a session.', ephemeral: true });
    }
    if (sessions[interaction.channelId]) {
      return interaction.reply({ content: '❌ There is already an active session in this channel.', ephemeral: true });
    }
    try {
      const dmChannel = await interaction.user.createDM();
      wizards[interaction.user.id] = {
        step: 1,
        channelId: interaction.channelId,
        guildId: interaction.guildId,
        data: {},
        dmChannel,
      };
      await dmChannel.send('👋 **Session Setup Wizard**\n\nLets get your session set up!\n\n**Step 1/6 — Server Link:**\nPlease enter the server link:');
      await interaction.reply({ content: '📬 Check your DMs! I sent you the session setup wizard.', ephemeral: true });
    } catch (err) {
      await interaction.reply({ content: '❌ I couldn\'t DM you. Please enable DMs from server members and try again.', ephemeral: true });
    }
    return;
  }

  if (commandName === 'session' && interaction.options.getSubcommand() === 'end') {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ You do not have permission to end a session.', ephemeral: true });
    }
    const session = sessions[interaction.channelId];
    if (!session) {
      return interaction.reply({ content: '❌ There is no active session in this channel.', ephemeral: true });
    }
    clearInterval(session.intervalId);
    try {
      const channel = await client.channels.fetch(interaction.channelId);
      const msg = await channel.messages.fetch(session.messageId);
      const endedEmbed = new EmbedBuilder()
        .setTitle('🎮 Session Ended')
        .setColor('#FF4444')
        .addFields(
          { name: '🔴 STATUS', value: '**Offline**', inline: true },
          { name: '⏱️ TOTAL UPTIME', value: formatUptime(session.startTime), inline: true },
          { name: '📅 NEXT SESSION', value: session.data.nextSession, inline: false }
        )
        .setFooter({ text: 'Session has ended. See you next time!' });
      if (session.data.imageUrl) endedEmbed.setImage(session.data.imageUrl);
      await msg.edit({ embeds: [endedEmbed] });
    } catch (e) {}
    delete sessions[interaction.channelId];
    return interaction.reply({ content: '✅ Session has been ended.', ephemeral: true });
  }

  if (commandName === 'playercount') {
    const session = sessions[interaction.channelId];
    if (!session) {
      return interaction.reply({ content: '❌ There is no active session in this channel.', ephemeral: true });
    }
    const count = interaction.options.getString('count');
    const parts = count.split('/');
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
      return interaction.reply({ content: '❌ Invalid format. Use something like 11/15', ephemeral: true });
    }
    session.data.playerCount = parts[0].trim();
    session.data.maxPlayers = parts[1].trim();
    try {
      const channel = await client.channels.fetch(interaction.channelId);
      const msg = await channel.messages.fetch(session.messageId);
      await msg.edit({ embeds: [buildSessionEmbed(session.data, formatUptime(session.startTime))] });
    } catch (e) {}
    return interaction.reply({ content: `✅ Player count updated to **${count}**`, ephemeral: true });
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.guild) return;

  const wizard = wizards[message.author.id];
  if (!wizard) return;

  const { step, data, dmChannel } = wizard;

  if (step === 1) {
    data.serverLink = message.content.trim();
    wizard.step = 2;
    await dmChannel.send('**Step 2/6 — Current Player Count:**\nHow many players are currently in? (e.g. 10)');
  } else if (step === 2) {
    if (isNaN(message.content.trim())) return dmChannel.send('❌ Please enter a number only (e.g. 10)');
    data.playerCount = message.content.trim();
    wizard.step = 3;
    await dmChannel.send('**Step 3/6 — Max Players:**\nWhat is the max player count? (e.g. 15)');
  } else if (step === 3) {
    if (isNaN(message.content.trim())) return dmChannel.send('❌ Please enter a number only (e.g. 15)');
    data.maxPlayers = message.content.trim();
    wizard.step = 4;
    await dmChannel.send('**Step 4/6 — Session Duration:**\nHow many hours will this session run for? (e.g. 3)');
  } else if (step === 4) {
    if (isNaN(message.content.trim())) return dmChannel.send('❌ Please enter a number only (e.g. 3)');
    const hours = parseFloat(message.content.trim());
    const endDate = new Date(Date.now() + hours * 60 * 60 * 1000);
    data.endTime = endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ` (${hours}hr)`;
    wizard.step = 5;
    await dmChannel.send('**Step 5/6 — Next Session:**\nWhen is the next session? (e.g. Tomorrow at 6PM)');
  } else if (step === 5) {
    data.nextSession = message.content.trim();
    wizard.step = 6;
    await dmChannel.send('**Step 6/6 — Session Image:**\nPlease attach an image for the session, or type skip to post without one.');
  } else if (step === 6) {
    if (message.attachments.size > 0) {
      data.imageUrl = message.attachments.first().url;
    } else if (message.content.toLowerCase() !== 'skip') {
      return dmChannel.send('❌ Please attach an image or type skip.');
    }
    delete wizards[message.author.id];
    try {
      const guild = await client.guilds.fetch(wizard.guildId);
      const channel = await guild.channels.fetch(wizard.channelId);
      const startTime = Date.now();
      const embed = buildSessionEmbed(data, '0h 0m 0s');
      const msg = await channel.send({ embeds: [embed] });
      const intervalId = setInterval(async () => {
        try {
          await msg.edit({ embeds: [buildSessionEmbed(data, formatUptime(startTime))] });
        } catch (e) {
          clearInterval(intervalId);
        }
      }, 30000);
      sessions[wizard.channelId] = {
        messageId: msg.id,
        startTime,
        data,
        intervalId,
      };
      await dmChannel.send('✅ **Session is now live!** The embed has been posted in the channel.');
    } catch (err) {
      await dmChannel.send('❌ Something went wrong posting the session. Make sure I have permission to send messages in that channel.');
      console.error(err);
    }
  }
});

client.login(TOKEN);
