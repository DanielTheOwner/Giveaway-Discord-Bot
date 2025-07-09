const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder, ModalBuilder, TextInputBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // Essential for fetching member data
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.commands = new Collection();
client.giveaways = new Map(); // Store active giveaways: Map<messageId, giveawayData>
client.config = {}; // Will store configuration from config.json

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Function to load configuration from config.json
function loadConfig() {
    try {
        const configPath = path.join(__dirname, 'config.json');
        client.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log('Configuration loaded successfully.');
    } catch (error) {
        console.error('Error loading config.json:', error);
        console.error('Please ensure config.json exists and is valid. Status channels will not be updated.');
        client.config = { statusChannels: {} }; // Default empty to prevent errors
    }
}

// Function to update voice channel names with member counts
async function updateMemberCounts() {
    if (!client.config || !client.config.statusChannels) return;

    for (const guild of client.guilds.cache.values()) {
        try {
            // Ensure all members are cached for accurate counts
            // This requires the GUILD_MEMBERS intent and "SERVER MEMBERS INTENT" enabled in dev portal
            await guild.members.fetch();

            const totalMembers = guild.memberCount;
            const humanMembers = guild.members.cache.filter(member => !member.user.bot).size;
            const botMembers = guild.members.cache.filter(member => member.user.bot).size;

            if (client.config.statusChannels.totalMembers) {
                const channel = guild.channels.cache.get(client.config.statusChannels.totalMembers);
                if (channel && channel.type === 2) { // Type 2 is VoiceChannel
                    const newName = `Total Members: ${totalMembers}`;
                    if (channel.name !== newName) {
                        await channel.setName(newName).catch(err => console.error(`Failed to set name for channel ${channel.id}: ${err}`));
                    }
                } else {
                    console.warn(`Channel ID ${client.config.statusChannels.totalMembers} for totalMembers not found or not a voice channel in guild ${guild.name}.`);
                }
            }

            if (client.config.statusChannels.membersOnly) {
                const channel = guild.channels.cache.get(client.config.statusChannels.membersOnly);
                if (channel && channel.type === 2) {
                    const newName = `Members: ${humanMembers}`;
                    if (channel.name !== newName) {
                        await channel.setName(newName).catch(err => console.error(`Failed to set name for channel ${channel.id}: ${err}`));
                    }
                } else {
                    console.warn(`Channel ID ${client.config.statusChannels.membersOnly} for membersOnly not found or not a voice channel in guild ${guild.name}.`);
                }
            }

            if (client.config.statusChannels.botsOnly) {
                const channel = guild.channels.cache.get(client.config.statusChannels.botsOnly);
                if (channel && channel.type === 2) {
                    const newName = `Bots: ${botMembers}`;
                    if (channel.name !== newName) {
                        await channel.setName(newName).catch(err => console.error(`Failed to set name for channel ${channel.id}: ${err}`));
                    }
                } else {
                    console.warn(`Channel ID ${client.config.statusChannels.botsOnly} for botsOnly not found or not a voice channel in guild ${guild.name}.`);
                }
            }

        } catch (error) {
            console.error(`Error updating member counts for guild ${guild.name}:`, error);
        }
    }
}


// Function to update the giveaway message with participant count
async function updateGiveawayMessage(client, messageId) {
    const giveaway = client.giveaways.get(messageId);
    if (!giveaway) return;

    const channel = await client.channels.fetch(giveaway.channelId);
    if (!channel) return;

    const giveawayMessage = await channel.messages.fetch(giveaway.messageId);
    if (!giveawayMessage) return;

    const currentEmbed = EmbedBuilder.from(giveawayMessage.embeds[0]);
    currentEmbed.setDescription(
        `Click the button below to enter!\n\n` +
        `**Ends:** <t:${Math.floor(giveaway.endTime / 1000)}:R>\n` +
        `**Winners:** ${giveaway.numberOfWinners}\n` +
        `**Participants:** ${giveaway.participants.length}\n\n` +
        `**CREATE A TICKET IF YOU WIN TO CLAIM YOUR REWARD**\n`
    );

    const joinButton = new ButtonBuilder()
        .setCustomId('join_giveaway')
        .setLabel('🎁 Join Giveaway')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder()
        .addComponents(joinButton);

    await giveawayMessage.edit({
        embeds: [currentEmbed],
        components: [row]
    }).catch(console.error);
}


// Event handler for interactions (slash commands, buttons, modals)
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', flags: [MessageFlags.Ephemeral] });
            }
        }
    } else if (interaction.isButton()) {
        if (interaction.customId === 'join_giveaway') {
            const giveawayMessageId = interaction.message.id;
            const giveaway = client.giveaways.get(giveawayMessageId);

            if (!giveaway) {
                return interaction.reply({ content: 'This giveaway is no longer active or could not be found.', flags: [MessageFlags.Ephemeral] });
            }

            if (giveaway.participants.includes(interaction.user.id)) {
                return interaction.reply({ content: 'You have already joined this giveaway!', flags: [MessageFlags.Ephemeral] });
            }

            giveaway.participants.push(interaction.user.id);
            client.giveaways.set(giveawayMessageId, giveaway);

            await interaction.reply({ content: 'You have successfully joined the giveaway!', flags: [MessageFlags.Ephemeral] });

            await updateGiveawayMessage(client, giveawayMessageId);

        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'giveaway_modal') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

            const durationInput = interaction.fields.getTextInputValue('giveaway_duration');
            const prizeInput = interaction.fields.getTextInputValue('giveaway_prize');
            const imageInput = interaction.fields.getTextInputValue('giveaway_image');
            const winnersInput = interaction.fields.getTextInputValue('giveaway_winners');

            const durationMs = parseDuration(durationInput);
            if (isNaN(durationMs) || durationMs <= 0) {
                return interaction.editReply({ content: 'Invalid duration. Please use formats like 1h, 30m, 1d.' });
            }

            const numberOfWinners = parseInt(winnersInput);
            if (isNaN(numberOfWinners) || numberOfWinners <= 0) {
                return interaction.editReply({ content: 'Invalid number of winners. Please enter a positive number.' });
            }

            // --- Create Giveaway Embed ---
            const giveawayEmbed = new EmbedBuilder()
                .setTitle(`🎉 Giveaway: ${prizeInput} 🎉`)
                .setDescription(
                    `Click the button below to enter!\n\n` +
                    `**Ends:** <t:${Math.floor((Date.now() + durationMs) / 1000)}:R>\n` +
                    `**Winners:** ${numberOfWinners}\n\n` +
                    `**Participants:** 0`
                )
                .setColor('Blurple')
                .setFooter({ text: `Hosted by ${interaction.user.tag}` })
                .setTimestamp(Date.now() + durationMs)
                .setThumbnail(client.user.displayAvatarURL()); // Bot's profile picture as thumbnail

            if (imageInput) {
                giveawayEmbed.setImage(imageInput);
            }

            const joinButton = new ButtonBuilder()
                .setCustomId('join_giveaway')
                .setLabel('🎁 Join Giveaway')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder()
                .addComponents(joinButton);

            const giveawayMessage = await interaction.channel.send({
                embeds: [giveawayEmbed],
                components: [row]
            });

            // --- NEW: Send a separate @everyone ping message ---
            await interaction.channel.send({
                content: `🎉 **A new giveaway has started!** Everyone, check out the prize: **${prizeInput}**!\n@everyone`,
                allowedMentions: { parse: ['everyone'] } // Crucial for the @everyone ping to work
            }).catch(error => {
                console.error(`Failed to send @everyone ping for giveaway in channel ${interaction.channel.id}:`, error);
                // Optionally inform the user if the ping failed (e.g., due to missing permissions)
                interaction.followUp({ content: 'Failed to send @everyone ping for the giveaway. Ensure the bot has the "Mention Everyone" permission.', flags: [MessageFlags.Ephemeral] });
            });


            await interaction.editReply({ content: 'Giveaway started successfully!'});

            client.giveaways.set(giveawayMessage.id, {
                prize: prizeInput,
                image: imageInput,
                numberOfWinners: numberOfWinners,
                endTime: Date.now() + durationMs,
                participants: [],
                channelId: interaction.channel.id,
                guildId: interaction.guild.id,
                messageId: giveawayMessage.id,
                hostId: interaction.user.id
            });

            setTimeout(async () => {
                await endGiveaway(client, giveawayMessage.id);
            }, durationMs);
        }
    }
});

function parseDuration(durationString) {
    const match = durationString.match(/^(\d+)([hmd])$/);
    if (!match) return NaN;

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
        case 'h': return value * 60 * 60 * 1000;
        case 'm': return value * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return NaN;
    }
}

async function endGiveaway(client, messageId, endedManually = false) {
    const giveaway = client.giveaways.get(messageId);

    if (!giveaway) {
        console.log(`Giveaway with message ID ${messageId} not found or already ended.`);
        return;
    }

    client.giveaways.delete(messageId);

    const channel = await client.channels.fetch(giveaway.channelId);
    if (!channel) return console.error('Channel not found for giveaway.');

    let giveawayMessage;
    try {
        giveawayMessage = await channel.messages.fetch(giveaway.messageId);
    } catch (error) {
        console.error(`Could not fetch giveaway message ${giveaway.messageId}:`, error);
        giveawayMessage = null;
    }

    const participants = giveaway.participants;
    let winners = [];

    if (participants.length === 0) {
        if (giveawayMessage) {
            const noWinnersEmbed = new EmbedBuilder()
                .setTitle('🎉 Giveaway Ended 🎉')
                .setDescription(`No one entered the giveaway for **${giveaway.prize}**.`)
                .setColor('Red');
            await giveawayMessage.edit({ embeds: [noWinnersEmbed], components: [] });
        }
        return channel.send(`The giveaway for **${giveaway.prize}** has ended with no participants.`);
    }

    const shuffledParticipants = participants.sort(() => 0.5 - Math.random());
    for (let i = 0; i < giveaway.numberOfWinners && i < shuffledParticipants.length; i++) {
        winners.push(shuffledParticipants[i]);
    }

    const winnerMentions = winners.map(id => `<@${id}>`).join(', ') || 'No valid winners found.';

    const winnersEmbed = new EmbedBuilder()
        .setTitle('🎉 Giveaway Ended! 🎉')
        .setDescription(
            `The giveaway for **${giveaway.prize}** has ended!\n\n` +
            `**Winner(s):** ${winnerMentions}\n\n` +
            `**Total Participants:** ${participants.length}` +
            (endedManually ? `\n\n*(Ended manually by <@${giveaway.hostId}>)*` : '')
        )
        .setColor('Green')
        .setFooter({ text: `Hosted by ${giveawayMessage?.embeds[0]?.footer?.text.replace('Hosted by ', '') || 'N/A'}` })
        .setTimestamp();

    if (giveawayMessage) {
        await giveawayMessage.edit({ embeds: [winnersEmbed], components: [] });
    }
    await channel.send(`Congratulations ${winnerMentions}! You won the **${giveaway.prize}**!`);
}


client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Set the bot's status
    client.user.setActivity('over Krack Dupes!', { type: 'WATCHING' });

    loadConfig();

    await updateMemberCounts();
    setInterval(updateMemberCounts, 300000);

    const commands = Array.from(client.commands.values()).map(command => command.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    (async () => {
        try {
            console.log(`Started refreshing ${commands.length} application (/) commands.`);
            const data = await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands },
            );
            console.log(`Successfully reloaded ${data.length} application (/) commands.`);
        } catch (error) {
            console.error(error);
        }
    })();
});

client.login(process.env.DISCORD_TOKEN);