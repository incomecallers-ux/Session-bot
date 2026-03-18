require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const config = require('./config.json');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// 🔥 BANNER
const BANNER_URL = "https://cdn.discordapp.com/attachments/1482852862357803068/1483875279939178536/Screenshot_2026-03-11_170319.png";

// SESSION TRACKING
let sessionStartTime = null;

// VOTE SYSTEM
let voters = new Set();
let voteTarget = 0;

// ================= READY =================
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ================= COMMANDS =================
const commands = [
  new SlashCommandBuilder().setName('startsession').setDescription('Start session'),

  new SlashCommandBuilder().setName('shutdownsession').setDescription('Shutdown session'),

  new SlashCommandBuilder()
    .setName('sessionvote')
    .setDescription('Start a session vote')
    .addIntegerOption(option =>
      option.setName('target')
        .setDescription('Votes required')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('serverstatus')
    .setDescription('Set server status')
    .addStringOption(option =>
      option.setName('status')
        .setDescription('Open or Closed')
        .setRequired(true)
        .addChoices(
          { name: 'Open', value: 'open' },
          { name: 'Closed', value: 'closed' }
        ))
].map(cmd => cmd.toJSON());

// REGISTER COMMANDS
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('🔄 Registering commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Commands ready');
  } catch (err) {
    console.error(err);
  }
})();

// ================= EMBEDS =================
function createStartEmbed(user) {
  sessionStartTime = Date.now();

  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("Session Started!")
    .setImage(BANNER_URL)
    .setDescription(
`> A session has been initialized, which is open for all to join! If you need any help, you can use !mod/!help

━━━━━━━━━━━━━━━━━━━━━━

### Session Information
> **Started By:** ${user}
> **Start Time:** <t:${Math.floor(sessionStartTime/1000)}:t>`
    )
    .setTimestamp();
}

function createShutdownEmbed(user) {
  const now = Date.now();

  let durationText = "Unknown";
  if (sessionStartTime) {
    const diff = now - sessionStartTime;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    durationText = `${hours}h ${minutes}m ago`;
  }

  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("Session Shutdown!")
    .setImage(BANNER_URL)
    .setDescription(
`> Our in-game server is now offline, please do not join or you will be moderated. Our next session will be hosted whenever our team is available. We ask that you do not request for a session to be hosted or you will be moderated.

━━━━━━━━━━━━━━━━━━━━━━

### Shutdown Information
> **Shutdown By:** ${user}
> **Shutdown Time:** <t:${Math.floor(now/1000)}:t>
> **Session Started:** ${durationText}`
    )
    .setTimestamp();
}

// ================= INTERACTIONS =================
client.on('interactionCreate', async interaction => {

  const channel = await client.channels.fetch(config.channelId);

  // ===== SLASH COMMANDS =====
  if (interaction.isChatInputCommand()) {

    // START
    if (interaction.commandName === 'startsession') {
      const embed = createStartEmbed(interaction.user);
      await channel.send({ embeds: [embed] });

      return interaction.reply({ content: "✅ Session started.", ephemeral: true });
    }

    // SHUTDOWN
    if (interaction.commandName === 'shutdownsession') {
      const embed = createShutdownEmbed(interaction.user);
      await channel.send({ embeds: [embed] });

      return interaction.reply({ content: "✅ Session shutdown sent.", ephemeral: true });
    }

    // SERVER STATUS
    if (interaction.commandName === 'serverstatus') {
      const status = interaction.options.getString('status');
      const isOpen = status === 'open';

      const embed = new EmbedBuilder()
        .setColor(isOpen ? 0x2ecc71 : 0xe74c3c)
        .setTitle(isOpen ? "Server Open" : "Server Closed")
        .setImage(BANNER_URL)
        .setDescription(
          isOpen
            ? `> The server is currently open!`
            : `> The server is currently closed, vote when there is a session vote!`
        )
        .setTimestamp();

      await channel.send({ embeds: [embed] });

      return interaction.reply({ content: "✅ Status sent.", ephemeral: true });
    }

    // SESSION VOTE
    if (interaction.commandName === 'sessionvote') {

      voters.clear();
      voteTarget = interaction.options.getInteger('target');

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("Session Vote")
        .setImage(BANNER_URL)
        .setDescription(`> Click below to vote for a session!\n\n**Votes:** 0 / ${voteTarget}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('vote')
          .setLabel('Vote / Unvote')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId('view_voters')
          .setLabel('View Voters')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        embeds: [embed],
        components: [row]
      });
    }
  }

  // ===== BUTTONS =====
  if (interaction.isButton()) {

    // TOGGLE VOTE
    if (interaction.customId === 'vote') {

      let added = false;

      if (voters.has(interaction.user.id)) {
        voters.delete(interaction.user.id);
      } else {
        voters.add(interaction.user.id);
        added = true;
      }

      const count = voters.size;

      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setDescription(`> Click below to vote for a session!\n\n**Votes:** ${count} / ${voteTarget}`);

      await interaction.update({
        embeds: [updatedEmbed],
        components: interaction.message.components
      });

      // AUTO START
      if (added && count >= voteTarget) {
        const startEmbed = createStartEmbed("Vote System");
        await channel.send({ embeds: [startEmbed] });

        voters.clear();
        voteTarget = 0;
      }
    }

    // VIEW VOTERS
    if (interaction.customId === 'view_voters') {

      if (voters.size === 0) {
        return interaction.reply({ content: "No voters yet.", ephemeral: true });
      }

      const list = [...voters].map(id => `<@${id}>`).join('\n');

      return interaction.reply({
        content: `🗳️ **Voters:**\n${list}`,
        ephemeral: true
      });
    }
  }
});

client.login(process.env.TOKEN);