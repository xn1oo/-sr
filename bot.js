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
const STAFF_ROLE_NAME = '𝐀𝐝𝐦𝐢𝐧𝐬𝐭𝐫𝐚𝐭𝐢𝐨𝐧 𝐓𝐞𝐚𝐦';

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
    .addFields(
      { name: '🟢 STATUS', value: '**Online**', inline: true },
      { name: '👥 PLAYERS', value: `**${data.playerCount}**`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '🔗 SERVER LINK', value: data.serverLink, inline: false },
      { name: '⏱️ SESSION UPTIME', value: uptime, inline: true },
      { name: '🕐 SESSION END', value: data.sessionEnd, inline: true },
      { name: '📋 INFO', value: data.info, inline: false }
    )
    .setFooter({ text: 'Session is live! Join now.' });

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
        .setLabel('Session End')
        .setPlaceholder('e.g. In 12 hr, 4 mins')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const infoInput = new TextInputBuilder()
        .setCustomId('info')
        .setLabel('Info / Next Session')
        .setPlaceholder('e.g. Next session: Saturday at 6PM')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const imageInput = new TextInputBuilder()
        .setCustomId('imageUrl')
        .setLabel('Image URL (optional)')
        .setPlaceholder('Paste a direct image link or leave blank')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(serverLinkInput),
        new ActionRowBuilder().addComponents(playerCountInput),
        new ActionRowBuilder().addComponents(sessionEndInput),
        new ActionRowBuilder().addComponents(infoInput),
        new ActionRowBuilder().addComponents(imageInput),
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
            { name: '🔴 STATUS', value: '**Offline**', inline: true },
            { name: '⏱️ TOTAL UPTIME', value: formatUptime(session.startTime), inline: true },
            { name: '📋 INFO', value: session.data.info, inline: false }
          )
          .setFooter({ text: 'Session has ended. See you next time!' });
        if (session.data.imageUrl && session.data.imageUrl.startsWith('http')) {
          endedEmbed.setImage(session.data.imageUrl);
        }
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
      session.data.playerCount = count;
      try {
        const channel = await client.channels.fetch(interaction.channelId);
        const msg = await channel.messages.fetch(session.messageId);
        await msg.edit({ embeds: [buildSessionEmbed(session.data, formatUptime(session.startTime))] });
      } catch (e) {}
      return interaction.reply({ content: `✅ Player count updated to **${count}**`, ephemeral: true });
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === 'session_modal') {
    const data = {
      serverLink: interaction.fields.getTextInputValue('serverLink'),
      playerCount: interaction.fields.getTextInputValue('playerCount'),
      sessionEnd: interaction.fields.getTextInputValue('sessionEnd'),
      info: interaction.fields.getTextInputValue('info'),
      imageUrl: interaction.fields.getTextInputValue('imageUrl') || null,
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
});

client.login(TOKEN);
