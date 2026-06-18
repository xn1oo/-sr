const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const STAFF_ROLE_NAME = 'AT | 𝐀𝐝𝐦𝐢𝐧𝐬𝐭𝐫𝐚𝐭𝐢𝐨𝐧 𝐓𝐞𝐚𝐦';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const sessions = {};

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
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post an announcement embed (Staff only)')
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
    .setColor('#00FF7F')
    .setTitle(`🎮 ${data.serverName || 'Active Session'}`)
    .addFields(
      { name: '🟢  STATUS', value: '```\nOnline\n```', inline: true },
      { name: '👥  PLAYERS', value: `\`\`\`\n${data.playerCount}\n\`\`\``, inline: true },
      { name: '\u200B', value: '\u200B', inline: false },
      { name: '🕐  SESSION END', value: `\`\`\`\n${data.sessionEnd}\n\`\`\``, inline: true },
      { name: '⏱️  SESSION UPTIME', value: `\`\`\`\n${uptime}\n\`\`\``, inline: true },
      { name: '\u200B', value: '\u200B', inline: false },
      { name: '🔗  SERVER LINK', value: data.serverLink, inline: false },
      { name: '📋  INFO', value: data.info, inline: false },
    )
    .setFooter({ text: 'Session is live! Join now.' });

  if (data.thumbnailUrl && data.thumbnailUrl.startsWith('http')) {
    embed.setThumbnail(data.thumbnailUrl);
  }
  if (data.imageUrl && data.imageUrl.startsWith('http')) {
    embed.setImage(data.imageUrl);
  }
  return embed;
}

client.on('interactionCreate', async interaction => {

  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'session' && interaction.options.getSubcommand() === 'start') {
      if (!isStaff(interaction.member)) {
        return interaction.reply({ content: '❌ You do not have permission to start a session.', ephemeral: true });
      }
      if (sessions[interaction.channelId]) {
        return interaction.reply({ content: '❌ There is already an active session in this channel.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId('session_modal')
        .setTitle('🎮 Start a Session');

      const serverNameInput = new TextInputBuilder()
        .setCustomId('serverName')
        .setLabel('Server Name')
        .setPlaceholder('e.g. Maryland State Roleplay')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const serverLinkInput = new TextInputBuilder()
        .setCustomId('serverLink')
        .setLabel('Server Link')
        .setPlaceholder('e.g. fivem://connect/123.456.789.0')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const playerCountInput = new TextInputBuilder()
        .setCustomId('playerCount')
        .setLabel('Player Count')
        .setPlaceholder('e.g. 15/15')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const sessionEndInput = new TextInputBuilder()
        .setCustomId('sessionEnd')
        .setLabel('Session End Time')
        .setPlaceholder('e.g. In 12 hr, 4 mins')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const infoInput = new TextInputBuilder()
        .setCustomId('info')
        .setLabel('Info / Next Session + Image URLs')
        .setPlaceholder('Next session: Saturday 6PM | Banner: url | Thumb: url')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(serverNameInput),
        new ActionRowBuilder().addComponents(serverLinkInput),
        new ActionRowBuilder().addComponents(playerCountInput),
        new ActionRowBuilder().addComponents(sessionEndInput),
        new ActionRowBuilder().addComponents(infoInput),
      );

      await interaction.showModal(modal);
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
            { name: '🔴  STATUS', value: '```\nOffline\n```', inline: true },
            { name: '⏱️  TOTAL UPTIME', value: `\`\`\`\n${formatUptime(session.startTime)}\n\`\`\``, inline: true },
            { name: '\u200B', value: '\u200B', inline: false },
            { name: '📋  INFO', value: session.data.info, inline: false }
          )
          .setFooter({ text: 'Session has ended. See you next time!' });
        if (session.data.thumbnailUrl && session.data.thumbnailUrl.startsWith('http')) {
          endedEmbed.setThumbnail(session.data.thumbnailUrl);
        }
        if (session.data.imageUrl && session.data.imageUrl.startsWith('http')) {
          endedEmbed.setImage(session.data.imageUrl);
        }
        await msg.edit({ embeds: [endedEmbed] });
      } catch (e) { console.error(e); }
      delete sessions[interaction.channelId];
      return interaction.reply({ content: '✅ Session has been ended.', ephemeral: true });
    }

    if (commandName === 'playercount') {
      const session = sessions[interaction.channelId];
      if (!session) {
        return interaction.reply({ content: '❌ There is no active session in this channel.', ephemeral: true });
      }
      const count = interaction.options.getString('count');
      session.data.playerCount = count;
      try {
        const channel = await client.channels.fetch(interaction.channelId);
        const msg = await channel.messages.fetch(session.messageId);
        await msg.edit({ embeds: [buildSessionEmbed(session.data, formatUptime(session.startTime))] });
      } catch (e) { console.error(e); }
      return interaction.reply({ content: `✅ Player count updated to **${count}**`, ephemeral: true });
    }

    if (commandName === 'announce') {
      if (!isStaff(interaction.member)) {
        return interaction.reply({ content: '❌ You do not have permission to post announcements.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId('announce_modal')
        .setTitle('📢 Post Announcement');

      const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Title')
        .setPlaceholder('e.g. Session Startup Rules')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const bodyInput = new TextInputBuilder()
        .setCustomId('body')
        .setLabel('Body')
        .setPlaceholder('Type your announcement here...')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const colorInput = new TextInputBuilder()
        .setCustomId('color')
        .setLabel('Color (hex code, optional)')
        .setPlaceholder('e.g. #FF0000 — leave blank for default green')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const imageInput = new TextInputBuilder()
        .setCustomId('imageUrl')
        .setLabel('Image URL (optional)')
        .setPlaceholder('Paste a direct image link or leave blank')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(bodyInput),
        new ActionRowBuilder().addComponents(colorInput),
        new ActionRowBuilder().addComponents(imageInput),
      );

      await interaction.showModal(modal);
      return;
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === 'session_modal') {
    const rawInfo = interaction.fields.getTextInputValue('info');
    const bannerMatch = rawInfo.match(/Banner:\s*(https?:\/\/\S+)/i);
    const thumbMatch = rawInfo.match(/Thumb:\s*(https?:\/\/\S+)/i);
    const cleanInfo = rawInfo
      .replace(/Banner:\s*https?:\/\/\S+/i, '')
      .replace(/Thumb:\s*https?:\/\/\S+/i, '')
      .trim();

    const data = {
      serverName: interaction.fields.getTextInputValue('serverName'),
      serverLink: interaction.fields.getTextInputValue('serverLink'),
      playerCount: interaction.fields.getTextInputValue('playerCount'),
      sessionEnd: interaction.fields.getTextInputValue('sessionEnd'),
      info: cleanInfo,
      imageUrl: bannerMatch ? bannerMatch[1] : null,
      thumbnailUrl: thumbMatch ? thumbMatch[1] : null,
    };

    await interaction.deferReply({ ephemeral: true });

    try {
      const startTime = Date.now();
      const embed = buildSessionEmbed(data, '0h 0m 0s');
      const msg = await interaction.channel.send({ embeds: [embed] });

      const intervalId = setInterval(async () => {
        try {
          await msg.edit({ embeds: [buildSessionEmbed(data, formatUptime(startTime))] });
        } catch (e) {
          clearInterval(intervalId);
        }
      }, 30000);

      sessions[interaction.channelId] = {
        messageId: msg.id,
        startTime,
        data,
        intervalId,
      };

      await interaction.editReply({ content: '✅ Session is now live!' });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: '❌ Something went wrong posting the session.' });
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === 'announce_modal') {
    const title = interaction.fields.getTextInputValue('title');
    const body = interaction.fields.getTextInputValue('body');
    const colorInput = interaction.fields.getTextInputValue('color').trim();
    const imageUrl = interaction.fields.getTextInputValue('imageUrl').trim();

    const color = /^#[0-9A-Fa-f]{6}$/.test(colorInput) ? colorInput : '#00FF7F';

    await interaction.deferReply({ ephemeral: true });

    try {
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(body)
        .setColor(color)
        .setFooter({ text: `Posted by ${interaction.user.username}` })
        .setTimestamp();

      if (imageUrl.startsWith('http')) {
        embed.setImage(imageUrl);
      }

      await interaction.channel.send({ embeds: [embed] });
      await interaction.editReply({ content: '✅ Announcement posted!' });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: '❌ Something went wrong posting the announcement.' });
    }
  }
});

client.login(TOKEN);
