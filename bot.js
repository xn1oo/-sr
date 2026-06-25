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
const VOUCH_CHANNEL_ID = '1519725522093998210';
const RULES_CHANNEL_1 = '<#1507975080569864292>';
const RULES_CHANNEL_2 = '<#1509312398039974078>';
const EMBED_COLOR = '#ffcf24';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Store active sessions per channel
// { [channelId]: { sessionInfoMessageId, sessionStatusMessageId, startTime, intervalId, data, hostId, coHostId } }
const sessions = {};

// ─── COMMANDS ────────────────────────────────────────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName('sessioninfo')
    .setDescription('Post the session info embed (Staff only)')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('sessionstatus')
    .setDescription('Post the live session status embed (Staff only)')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('session')
    .setDescription('Manage sessions')
    .addSubcommand(sub =>
      sub.setName('end').setDescription('End the current session (Staff only)')
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('playercountmid')
    .setDescription('Set player count to medium (Staff only)')
    .addStringOption(opt =>
      opt.setName('count').setDescription('e.g. 8/15').setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('playercountfull')
    .setDescription('Set player count to full (Staff only)')
    .addStringOption(opt =>
      opt.setName('count').setDescription('e.g. 15/15').setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('playercountlow')
    .setDescription('Set player count to low (Staff only)')
    .addStringOption(opt =>
      opt.setName('count').setDescription('e.g. 3/15').setRequired(true)
    )
    .toJSON(),

  // Legacy announce command
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post an announcement embed (Staff only)')
    .toJSON(),
];

// ─── READY ───────────────────────────────────────────────────────────────────

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

// ─── HELPERS ─────────────────────────────────────────────────────────────────

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

// ─── SESSION INFO EMBED ──────────────────────────────────────────────────────

function buildSessionInfoEmbed(data) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('📋  Session Information')
    .addFields(
      {
        name: '🎙️  Session Information',
        value: [
          `**Host:** <@${data.hostId}>`,
          `**CoHost:** ${data.coHostId ? `<@${data.coHostId}>` : 'N/A'}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '🚗  Roleplay Information',
        value: [
          `**Speedlimit:**`,
          `\`\`\``,
          `Mainroad  │ ${data.speedMainroad || '70'} MPH`,
          `Dirtroad  │ ${data.speedDirtroad || '55'} MPH`,
          `Town      │ ${data.speedTown || '50'} MPH`,
          `\`\`\``,
        ].join('\n'),
        inline: false,
      },
      {
        name: '🔗  Joining the Session',
        value: [
          `**Agreement:** When joining this ongoing session, you agree to comply with the ${RULES_CHANNEL_1} and ${RULES_CHANNEL_2}. I will do my best to follow these rules. I also agree for the Maryland State RP Staff Team to take appropriate action against my account and address any rules violations in-session.`,
          ``,
          `**Click the Join Session button below:** You will receive the correct session role and then be given the Roblox join button.`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '🎮  Console Players Notice',
        value: `**If you can't join through the link, please DM Host:** <@${data.hostId}>`,
        inline: false,
      },
      {
        name: '⚠️  WARNING',
        value: `**Strictly prohibited:** Utilizing alternative accounts to cause disruptions or engage in FRP. Violations will result in an **immediate permanent ban**.`,
        inline: false,
      },
    )
    .setFooter({ text: 'Maryland State Roleplay • Session System' });

  if (data.bannerUrl && data.bannerUrl.startsWith('http')) {
    embed.setThumbnail(data.bannerUrl);
  }

  return embed;
}

function buildSessionInfoButtons() {
  const joinBtn = new ButtonBuilder()
    .setCustomId('join_session')
    .setLabel('Join Session')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('');

  const vouchBtn = new ButtonBuilder()
    .setCustomId('vouch_session')
    .setLabel('Vouch')
    .setStyle(ButtonStyle.Success)
    .setEmoji('');

  return new ActionRowBuilder().addComponents(joinBtn, vouchBtn);
}

// ─── SESSION STATUS EMBED ────────────────────────────────────────────────────

function buildSessionStatusEmbed(data, uptime) {
  const playerCount = data.playerCount || '???';

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`🎮  ${data.serverName || 'Active Session'}`)
    .addFields(
      { name: '🟢  STATUS', value: '```\nActive\n```', inline: true },
      { name: '👥  PLAYERS', value: `\`\`\`\n${playerCount}\n\`\`\``, inline: true },
      { name: '\u200B', value: '\u200B', inline: false },
      { name: '🕐  SESSION END', value: `\`\`\`\n${data.sessionEnd || 'TBD'}\n\`\`\``, inline: true },
      { name: '⏱️  SESSION UPTIME', value: `\`\`\`\n${uptime}\n\`\`\``, inline: true },
      { name: '\u200B', value: '\u200B', inline: false },
      { name: '📋  INFO', value: data.info || 'No info provided.', inline: false },
    )
    .setFooter({ text: 'Session is live! Use /playercountmid, /playercountfull, or /playercountlow to update players.' });

  if (data.thumbnailUrl && data.thumbnailUrl.startsWith('http')) {
    embed.setThumbnail(data.thumbnailUrl);
  }
  if (data.imageUrl && data.imageUrl.startsWith('http')) {
    embed.setImage(data.imageUrl);
  }

  return embed;
}

// ─── UPDATE PLAYER COUNT HELPER ──────────────────────────────────────────────

async function updatePlayerCount(interaction, count) {
  const session = sessions[interaction.channelId];
  if (!session) {
    return interaction.reply({ content: '❌ There is no active session in this channel.', flags: 64 });
  }
  session.data.playerCount = count;

  try {
    if (session.statusMessageId) {
      const channel = await client.channels.fetch(interaction.channelId);
      const msg = await channel.messages.fetch(session.statusMessageId);
      await msg.edit({ embeds: [buildSessionStatusEmbed(session.data, formatUptime(session.startTime))] });
    }
  } catch (e) {
    console.error(e);
  }

  return interaction.reply({ content: `✅ Player count updated to **${count}**`, flags: 64 });
}

// ─── INTERACTION HANDLER ──────────────────────────────────────────────────────

client.on('interactionCreate', async interaction => {

  // ── SLASH COMMANDS ──────────────────────────────────────────────────────────

  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    // /sessioninfo — show modal
    if (commandName === 'sessioninfo') {
      if (!isStaff(interaction.member)) {
        return interaction.reply({ content: '❌ You do not have permission.', flags: 64 });
      }

      const modal = new ModalBuilder()
        .setCustomId('sessioninfo_modal')
        .setTitle('📋 Session Info Setup');

      const serverNameInput = new TextInputBuilder()
        .setCustomId('serverName')
        .setLabel('Server Name')
        .setPlaceholder('e.g. Maryland State Roleplay')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const coHostInput = new TextInputBuilder()
        .setCustomId('coHostId')
        .setLabel('CoHost User ID (optional)')
        .setPlaceholder('e.g. 123456789012345678 — leave blank if none')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const speedInput = new TextInputBuilder()
        .setCustomId('speeds')
        .setLabel('Speed Limits (Mainroad/Dirtroad/Town)')
        .setPlaceholder('e.g. 70 / 55 / 50')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const serverLinkInput = new TextInputBuilder()
        .setCustomId('serverLink')
        .setLabel('Roblox Private Server Link')
        .setPlaceholder('https://www.roblox.com/games/...')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const bannerInput = new TextInputBuilder()
        .setCustomId('bannerUrl')
        .setLabel('Banner URL (optional, top-right)')
        .setPlaceholder('https://... — leave blank to skip')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(serverNameInput),
        new ActionRowBuilder().addComponents(coHostInput),
        new ActionRowBuilder().addComponents(speedInput),
        new ActionRowBuilder().addComponents(serverLinkInput),
        new ActionRowBuilder().addComponents(bannerInput),
      );

      await interaction.showModal(modal);
      return;
    }

    // /sessionstatus — show modal
    if (commandName === 'sessionstatus') {
      if (!isStaff(interaction.member)) {
        return interaction.reply({ content: '❌ You do not have permission.', flags: 64 });
      }

      const session = sessions[interaction.channelId];
      if (!session) {
        return interaction.reply({ content: '❌ No active session in this channel. Run /sessioninfo first.', flags: 64 });
      }

      const modal = new ModalBuilder()
        .setCustomId('sessionstatus_modal')
        .setTitle('📊 Session Status Setup');

      const sessionEndInput = new TextInputBuilder()
        .setCustomId('sessionEnd')
        .setLabel('Session End Time')
        .setPlaceholder('e.g. In 2 hrs, 30 mins')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const infoInput = new TextInputBuilder()
        .setCustomId('info')
        .setLabel('Info / Next Session Details')
        .setPlaceholder('e.g. Next session: Saturday 6PM EST')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      const thumbnailInput = new TextInputBuilder()
        .setCustomId('thumbnailUrl')
        .setLabel('Thumbnail URL (top-right, optional)')
        .setPlaceholder('https://... or leave blank')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const imageInput = new TextInputBuilder()
        .setCustomId('imageUrl')
        .setLabel('Bottom Banner URL (optional)')
        .setPlaceholder('https://... or leave blank')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(sessionEndInput),
        new ActionRowBuilder().addComponents(infoInput),
        new ActionRowBuilder().addComponents(thumbnailInput),
        new ActionRowBuilder().addComponents(imageInput),
      );

      await interaction.showModal(modal);
      return;
    }

    // /session end
    if (commandName === 'session' && interaction.options.getSubcommand() === 'end') {
      if (!isStaff(interaction.member)) {
        return interaction.reply({ content: '❌ You do not have permission.', flags: 64 });
      }
      const session = sessions[interaction.channelId];
      if (!session) {
        return interaction.reply({ content: '❌ There is no active session in this channel.', flags: 64 });
      }
      clearInterval(session.intervalId);

      const endedEmbed = new EmbedBuilder()
        .setTitle('🎮 Session Ended')
        .setColor('#FF4444')
        .addFields(
          { name: '🔴  STATUS', value: '```\nOffline\n```', inline: true },
          { name: '⏱️  TOTAL UPTIME', value: `\`\`\`\n${formatUptime(session.startTime)}\n\`\`\``, inline: true },
          { name: '\u200B', value: '\u200B', inline: false },
          { name: '📋  INFO', value: session.data.info || 'No info provided.', inline: false }
        )
        .setFooter({ text: 'Session has ended. See you next time!' });

      if (session.data.thumbnailUrl?.startsWith('http')) endedEmbed.setThumbnail(session.data.thumbnailUrl);
      if (session.data.imageUrl?.startsWith('http')) endedEmbed.setImage(session.data.imageUrl);

      try {
        const channel = await client.channels.fetch(interaction.channelId);
        if (session.statusMessageId) {
          const statusMsg = await channel.messages.fetch(session.statusMessageId);
          await statusMsg.edit({ embeds: [endedEmbed] });
        }
      } catch (e) { console.error(e); }

      delete sessions[interaction.channelId];
      return interaction.reply({ content: '✅ Session has been ended.', flags: 64 });
    }

    // /playercountmid
    if (commandName === 'playercountmid') {
      if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      return updatePlayerCount(interaction, interaction.options.getString('count'));
    }

    // /playercountfull
    if (commandName === 'playercountfull') {
      if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      return updatePlayerCount(interaction, interaction.options.getString('count'));
    }

    // /playercountlow
    if (commandName === 'playercountlow') {
      if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
      return updatePlayerCount(interaction, interaction.options.getString('count'));
    }

    // /announce
    if (commandName === 'announce') {
      if (!isStaff(interaction.member)) {
        return interaction.reply({ content: '❌ You do not have permission.', flags: 64 });
      }
      const modal = new ModalBuilder()
        .setCustomId('announce_modal')
        .setTitle('📢 Post Announcement');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('title').setLabel('Title').setPlaceholder('e.g. Session Startup Rules').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('body').setLabel('Body').setPlaceholder('Type your announcement here...').setStyle(TextInputStyle.Paragraph).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('color').setLabel('Color (hex, optional)').setPlaceholder('e.g. #FF0000 — leave blank for default').setStyle(TextInputStyle.Short).setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('imageUrl').setLabel('Image URL (optional)').setPlaceholder('Paste a direct image link or leave blank').setStyle(TextInputStyle.Short).setRequired(false)
        ),
      );
      await interaction.showModal(modal);
      return;
    }
  }

  // ── MODAL SUBMITS ───────────────────────────────────────────────────────────

  if (interaction.isModalSubmit()) {

    // /sessioninfo modal submitted
    if (interaction.customId === 'sessioninfo_modal') {
      await interaction.deferReply({ flags: 64 });

      const rawSpeeds = interaction.fields.getTextInputValue('speeds') || '70 / 55 / 50';
      const speedParts = rawSpeeds.split('/').map(s => s.trim());
      const coHostRaw = interaction.fields.getTextInputValue('coHostId').trim();

      const data = {
        serverName: interaction.fields.getTextInputValue('serverName'),
        serverLink: interaction.fields.getTextInputValue('serverLink'),
        bannerUrl: interaction.fields.getTextInputValue('bannerUrl').trim() || null,
        hostId: interaction.user.id,
        coHostId: coHostRaw || null,
        speedMainroad: speedParts[0] || '70',
        speedDirtroad: speedParts[1] || '55',
        speedTown: speedParts[2] || '50',
        playerCount: '???',
        sessionEnd: 'TBD',
        info: '',
        thumbnailUrl: null,
        imageUrl: null,
      };

      try {
        const embed = buildSessionInfoEmbed(data);
        const row = buildSessionInfoButtons();
        const msg = await interaction.channel.send({ embeds: [embed], components: [row] });

        const startTime = Date.now();

        // Initialize session (status message set later by /sessionstatus)
        sessions[interaction.channelId] = {
          infoMessageId: msg.id,
          statusMessageId: null,
          startTime,
          data,
          intervalId: null,
        };

        await interaction.editReply({ content: '✅ Session info posted! Now run `/sessionstatus` to post the live status embed.' });
      } catch (err) {
        console.error(err);
        await interaction.editReply({ content: '❌ Something went wrong posting the session info.' });
      }
      return;
    }

    // /sessionstatus modal submitted
    if (interaction.customId === 'sessionstatus_modal') {
      await interaction.deferReply({ flags: 64 });

      const session = sessions[interaction.channelId];
      if (!session) {
        return interaction.editReply({ content: '❌ No active session found. Run /sessioninfo first.' });
      }

      session.data.sessionEnd = interaction.fields.getTextInputValue('sessionEnd');
      session.data.info = interaction.fields.getTextInputValue('info') || '';
      const thumbRaw = interaction.fields.getTextInputValue('thumbnailUrl').trim();
      const imageRaw = interaction.fields.getTextInputValue('imageUrl').trim();
      session.data.thumbnailUrl = thumbRaw.startsWith('http') ? thumbRaw : null;
      session.data.imageUrl = imageRaw.startsWith('http') ? imageRaw : null;

      try {
        const statusEmbed = buildSessionStatusEmbed(session.data, formatUptime(session.startTime));
        const msg = await interaction.channel.send({ embeds: [statusEmbed] });
        session.statusMessageId = msg.id;

        // Start auto-update interval for uptime
        if (session.intervalId) clearInterval(session.intervalId);
        session.intervalId = setInterval(async () => {
          try {
            const channel = await client.channels.fetch(interaction.channelId);
            const statusMsg = await channel.messages.fetch(session.statusMessageId);
            await statusMsg.edit({ embeds: [buildSessionStatusEmbed(session.data, formatUptime(session.startTime))] });
          } catch (e) {
            clearInterval(session.intervalId);
          }
        }, 30000);

        await interaction.editReply({ content: '✅ Session status is now live and updating every 30 seconds!' });
      } catch (err) {
        console.error(err);
        await interaction.editReply({ content: '❌ Something went wrong posting the status embed.' });
      }
      return;
    }

    // /announce modal submitted
    if (interaction.customId === 'announce_modal') {
      const title = interaction.fields.getTextInputValue('title');
      const body = interaction.fields.getTextInputValue('body');
      const colorInput = interaction.fields.getTextInputValue('color').trim();
      const imageUrl = interaction.fields.getTextInputValue('imageUrl').trim();
      const color = /^#[0-9A-Fa-f]{6}$/.test(colorInput) ? colorInput : EMBED_COLOR;

      await interaction.deferReply({ flags: 64 });
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
      return;
    }
  }

  // ── BUTTON INTERACTIONS ─────────────────────────────────────────────────────

  if (interaction.isButton()) {

    // Join Session button — show private link only to the clicker
    if (interaction.customId === 'join_session') {
      const session = sessions[interaction.channelId];

      if (!session) {
        return interaction.reply({
          content: '❌ No active session found.',
          flags: 64,
        });
      }

      const joinBtn = new ButtonBuilder()
        .setLabel('Open Roblox Server')
        .setStyle(ButtonStyle.Link)
        .setURL(session.data.serverLink)
        .setEmoji('🎮');

      const row = new ActionRowBuilder().addComponents(joinBtn);

      return interaction.reply({
        content: '✅ Here is your private server link! Only you can see this.',
        components: [row],
        flags: 64,
      });
    }

    // Vouch button — confirmation step
    if (interaction.customId === 'vouch_session') {
      const confirmBtn = new ButtonBuilder()
        .setCustomId('vouch_confirm')
        .setLabel('Yes, submit my vouch!')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅');

      const row = new ActionRowBuilder().addComponents(confirmBtn);

      return interaction.reply({
        content: `By clicking here, you are letting us know that you enjoyed the session and would like to vouch for and support the host in the future!`,
        components: [row],
        flags: 64,
      });
    }

    // Vouch confirm — send feedback to vouch channel
    if (interaction.customId === 'vouch_confirm') {
      const session = sessions[interaction.channelId];
      const hostId = session?.data?.hostId;

      try {
        const vouchChannel = await client.channels.fetch(VOUCH_CHANNEL_ID);

        const vouchEmbed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle('✅  New Session Vouch')
          .addFields(
            { name: 'Vouched By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Session Host', value: hostId ? `<@${hostId}>` : 'Unknown', inline: true },
          )
          .setTimestamp()
          .setFooter({ text: 'Maryland State Roleplay • Vouch System' });

        await vouchChannel.send({ embeds: [vouchEmbed] });

        return interaction.update({
          content: `✅ Your vouch has been submitted! Thank you for supporting the host${hostId ? ` <@${hostId}>` : ''}.`,
          components: [],
        });
      } catch (err) {
        console.error('Vouch channel error:', err);
        return interaction.update({
          content: '❌ Feedback channel has not been set up yet.',
          components: [],
        });
      }
    }
  }
});

client.login(TOKEN);
