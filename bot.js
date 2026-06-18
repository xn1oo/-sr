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
  ButtonBuilder,
  ButtonStyle,
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

// sessions[channelId] = { messageId, infoMessageId, startTime, data, intervalId, maxPlayers, currentPlayers }
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
    .addIntegerOption(opt =>
      opt.setName('count').setDescription('Current number of players in the server').setRequired(true).setMinValue(0)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post an announcement embed (Staff only)')
    .toJSON(),
];

client.once('clientReady', async () => {
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
  return `${h} hr, ${m} mins`;
}

// ─── LIVE STATUS EMBED (Image 1 style) ─────────────────────────────────────
function buildSessionEmbed(data, uptime, currentPlayers, maxPlayers) {
  const playerStr = `${currentPlayers}/${maxPlayers}`;

  const embed = new EmbedBuilder()
    .setColor('#00FF7F')
    .setTitle(`🎮 ${data.serverName || 'Maryland State Roleplay'}`)
    .addFields(
      { name: '┃ STATUS',         value: `\`\`\`\nOnline\n\`\`\``,       inline: true },
      { name: '┃ PLAYERS',        value: `\`\`\`\n${playerStr}\n\`\`\``,  inline: true },
      { name: '\u200B',           value: '\u200B',                         inline: false },
      { name: '┃ SESSION END',    value: `\`\`\`\n${data.sessionEnd}\n\`\`\``,  inline: true },
      { name: '┃ SESSION UPTIME', value: `\`\`\`\n${uptime}\n\`\`\``,    inline: true },
      { name: '\u200B',           value: '\u200B',                         inline: false },
      { name: '🔗  SERVER LINK',  value: data.serverLink,                  inline: false },
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

// ─── SESSION INFO EMBED (Image 2 style) ────────────────────────────────────
function buildSessionInfoEmbed(data) {
  const description = [
    `**→ Session Information:**`,
    ``,
    `• **Host:** ${data.host}`,
    `• **Co-Host:** ${data.coHost}`,
    `• **FRP Speed Limit:** ${data.speedLimit} MPH (Please do not exceed this limit.)`,
    ``,
    `**→ Roleplay Assistance:**`,
    ``,
    `• **People within the roles:** Will assist you with any roleplay-related issues or concerns during the session.`,
    `• **Staff in-game:** Will also be available to assist you.`,
    ``,
    `**→ In-Game Support:**`,
    ``,
    `• **Problem Reporting:** If you encounter issues in-game, want to report someone, or have questions, use \`!mod\` and someone will be with you as soon as possible. If no one responds, please open a ticket and report the issue.`,
    ``,
    `**→ Joining the Session:**`,
    ``,
    `• **Agreement:** When joining this ongoing session, you agree to comply with the server regulations and rules. I will do my best to follow these rules. I also agree for the Maryland State Roleplay Staff Team to take appropriate action against my account and address any rules violations in-session.`,
    ``,
    `**→ Joining Issues:**`,
    ``,
    `• **If you encounter problems while joining:** Please use the "Issues Joining" button below.`,
    ``,
    `*Explain that you're unable to join. The Maryland State Roleplay team will try to help you join the session, but they cannot guarantee a spot for you to play.*`,
  ].join('\n');

  return new EmbedBuilder()
    .setColor('#00FF7F')
    .setDescription(description)
    .setFooter({ text: 'Maryland State Roleplay' });
}

// ─── SESSION INFO BUTTONS ───────────────────────────────────────────────────
function buildSessionButtons(serverLink) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Join Session')
      .setStyle(ButtonStyle.Link)
      .setURL(serverLink),
    new ButtonBuilder()
      .setCustomId('issues_joining')
      .setLabel('Issues Joining (Console Users)')
      .setStyle(ButtonStyle.Primary),
  );
}

client.on('interactionCreate', async interaction => {

  // ── Button: Issues Joining ──────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'issues_joining') {
    return interaction.reply({
      content: '⚠️ Please open a support ticket or contact a staff member in-game for help joining the session.',
      ephemeral: true,
    });
  }

  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    // ── /session start ──────────────────────────────────────────────────
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
        .setLabel('Server Link (must start with http)')
        .setPlaceholder('e.g. https://cfx.re/join/xxxxxx')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const hostInput = new TextInputBuilder()
        .setCustomId('host')
        .setLabel('Host (mention or name)')
        .setPlaceholder('e.g. @YourName')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const coHostInput = new TextInputBuilder()
        .setCustomId('coHost')
        .setLabel('Co-Host (mention or name, or N/A)')
        .setPlaceholder('e.g. @CoHostName')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const detailsInput = new TextInputBuilder()
        .setCustomId('details')
        .setLabel('Max Players | Speed Limit | Session End | Images')
        .setPlaceholder('Max:15 | Speed:95 | End:In 5 hr, 49 mins | Banner:url | Thumb:url')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(serverNameInput),
        new ActionRowBuilder().addComponents(serverLinkInput),
        new ActionRowBuilder().addComponents(hostInput),
        new ActionRowBuilder().addComponents(coHostInput),
        new ActionRowBuilder().addComponents(detailsInput),
      );

      await interaction.showModal(modal);
      return;
    }

    // ── /session end ────────────────────────────────────────────────────
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

        // Edit the live status embed to "ended"
        const msg = await channel.messages.fetch(session.messageId);
        const endedEmbed = new EmbedBuilder()
          .setTitle('🎮 Session Ended')
          .setColor('#FF4444')
          .addFields(
            { name: '┃ STATUS',       value: '```\nOffline\n```',                                      inline: true },
            { name: '┃ TOTAL UPTIME', value: `\`\`\`\n${formatUptime(session.startTime)}\n\`\`\``,    inline: true },
          )
          .setFooter({ text: 'Session has ended. See you next time!' });

        if (session.data.thumbnailUrl?.startsWith('http')) endedEmbed.setThumbnail(session.data.thumbnailUrl);
        if (session.data.imageUrl?.startsWith('http'))     endedEmbed.setImage(session.data.imageUrl);

        await msg.edit({ embeds: [endedEmbed] });

        // Disable buttons on the info embed
        if (session.infoMessageId) {
          const infoMsg = await channel.messages.fetch(session.infoMessageId);
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Join Session').setStyle(ButtonStyle.Link).setURL(session.data.serverLink).setDisabled(true),
            new ButtonBuilder().setCustomId('issues_joining_disabled').setLabel('Issues Joining (Console Users)').setStyle(ButtonStyle.Primary).setDisabled(true),
          );
          await infoMsg.edit({ components: [disabledRow] });
        }
      } catch (e) { console.error(e); }

      delete sessions[interaction.channelId];
      return interaction.reply({ content: '✅ Session has been ended.', ephemeral: true });
    }

    // ── /playercount ────────────────────────────────────────────────────
    if (commandName === 'playercount') {
      const session = sessions[interaction.channelId];
      if (!session) {
        return interaction.reply({ content: '❌ There is no active session in this channel.', ephemeral: true });
      }

      const newCount = interaction.options.getInteger('count');
      const oldCount = session.currentPlayers;
      session.currentPlayers = newCount;

      // Build change indicator
      const diff = newCount - oldCount;
      let changeMsg = '';
      if (diff > 0)      changeMsg = ` (+${diff} joined)`;
      else if (diff < 0) changeMsg = ` (${diff} left)`;

      try {
        const channel = await client.channels.fetch(interaction.channelId);
        const msg = await channel.messages.fetch(session.messageId);
        await msg.edit({ embeds: [buildSessionEmbed(session.data, formatUptime(session.startTime), session.currentPlayers, session.maxPlayers)] });
      } catch (e) { console.error(e); }

      return interaction.reply({
        content: `✅ Player count updated to **${newCount}/${session.maxPlayers}**${changeMsg}`,
        ephemeral: true,
      });
    }

    // ── /announce ───────────────────────────────────────────────────────
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

  // ── Modal: session_modal ──────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === 'session_modal') {
    const rawDetails = interaction.fields.getTextInputValue('details');

    const maxMatch    = rawDetails.match(/Max:\s*(\d+)/i);
    const speedMatch  = rawDetails.match(/Speed:\s*(\d+)/i);
    const endMatch    = rawDetails.match(/End:\s*([^|]+)/i);
    const bannerMatch = rawDetails.match(/Banner:\s*(https?:\/\/\S+)/i);
    const thumbMatch  = rawDetails.match(/Thumb:\s*(https?:\/\/\S+)/i);

    const maxPlayers = maxMatch  ? parseInt(maxMatch[1]) : 15;
    const speedLimit = speedMatch ? speedMatch[1] : '95';
    const sessionEnd = endMatch  ? endMatch[1].trim() : 'TBD';

    const data = {
      serverName:   interaction.fields.getTextInputValue('serverName'),
      serverLink:   interaction.fields.getTextInputValue('serverLink'),
      host:         interaction.fields.getTextInputValue('host'),
      coHost:       interaction.fields.getTextInputValue('coHost'),
      speedLimit,
      sessionEnd,
      imageUrl:     bannerMatch ? bannerMatch[1] : null,
      thumbnailUrl: thumbMatch  ? thumbMatch[1]  : null,
    };

    await interaction.deferReply({ ephemeral: true });

    try {
      const startTime      = Date.now();
      const currentPlayers = 0;

      // Post live status embed first
      const statusEmbed = buildSessionEmbed(data, '0 hr, 0 mins', currentPlayers, maxPlayers);
      const statusMsg   = await interaction.channel.send({ embeds: [statusEmbed] });

      // Post session info embed with buttons
      const infoEmbed   = buildSessionInfoEmbed(data);
      const infoButtons = buildSessionButtons(data.serverLink);
      const infoMsg     = await interaction.channel.send({ embeds: [infoEmbed], components: [infoButtons] });

      // Auto-update uptime every 30 seconds
      const intervalId = setInterval(async () => {
        try {
          const session = sessions[interaction.channelId];
          if (!session) { clearInterval(intervalId); return; }
          await statusMsg.edit({ embeds: [buildSessionEmbed(data, formatUptime(startTime), session.currentPlayers, maxPlayers)] });
        } catch (e) {
          clearInterval(intervalId);
        }
      }, 30000);

      sessions[interaction.channelId] = {
        messageId:     statusMsg.id,
        infoMessageId: infoMsg.id,
        startTime,
        data,
        intervalId,
        maxPlayers,
        currentPlayers,
      };

      await interaction.editReply({ content: '✅ Session is now live!' });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: '❌ Something went wrong posting the session.' });
    }
  }

  // ── Modal: announce_modal ─────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === 'announce_modal') {
    const title      = interaction.fields.getTextInputValue('title');
    const body       = interaction.fields.getTextInputValue('body');
    const colorInput = interaction.fields.getTextInputValue('color').trim();
    const imageUrl   = interaction.fields.getTextInputValue('imageUrl').trim();
    const color      = /^#[0-9A-Fa-f]{6}$/.test(colorInput) ? colorInput : '#00FF7F';

    await interaction.deferReply({ ephemeral: true });

    try {
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(body)
        .setColor(color)
        .setFooter({ text: `Posted by ${interaction.user.username}` })
        .setTimestamp();

      if (imageUrl.startsWith('http')) embed.setImage(imageUrl);

      await interaction.channel.send({ embeds: [embed] });
      await interaction.editReply({ content: '✅ Announcement posted!' });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: '❌ Something went wrong posting the announcement.' });
    }
  }
});

client.login(TOKEN);
