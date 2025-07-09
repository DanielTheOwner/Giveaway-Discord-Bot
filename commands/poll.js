// commands/poll.js
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

// Define the path to your polls.json file
const pollsFilePath = path.join(__dirname, '..', 'polls.json');

// Emoji mapping for poll options
const numberEmojis = [
    '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣',
    '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Manages polls in your server.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels) // Only users who can manage channels can use this
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new poll.')
                .addStringOption(option =>
                    option.setName('question')
                        .setDescription('The question for your poll.')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('options')
                        .setDescription('Comma-separated list of poll options (max 10).')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('End an active poll and show results.')
                .addStringOption(option =>
                    option.setName('message_id')
                        .setDescription('The message ID of the poll to end.')
                        .setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') {
            const question = interaction.options.getString('question');
            const optionsString = interaction.options.getString('options');
            const options = optionsString.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);

            if (options.length < 2) {
                return interaction.reply({ content: 'Please provide at least two poll options separated by commas.', ephemeral: true });
            }
            if (options.length > numberEmojis.length) { // Max 10 options
                return interaction.reply({ content: `You can provide a maximum of ${numberEmojis.length} options.`, ephemeral: true });
            }

            // Construct poll embed
            const pollEmbed = new EmbedBuilder()
                .setTitle(question)
                .setDescription('Vote by reacting with the corresponding emoji below.')
                .setColor('#0099ff')
                .setFooter({ text: `Poll created by ${interaction.user.tag}` })
                .setTimestamp();

            const optionFields = options.map((option, index) => ({
                name: `${numberEmojis[index]} ${option}`,
                value: '\u200B', // Unicode zero width space for empty value
                inline: false,
            }));
            pollEmbed.addFields(optionFields);

            // Send the poll message
            const pollMessage = await interaction.reply({ embeds: [pollEmbed], fetchReply: true });

            // Add reactions to the poll message
            for (let i = 0; i < options.length; i++) {
                await pollMessage.react(numberEmojis[i]);
            }

            // Store poll data
            const polls = JSON.parse(fs.readFileSync(pollsFilePath, 'utf8'));
            polls[pollMessage.id] = {
                channelId: pollMessage.channel.id,
                question: question,
                options: options,
                creatorId: interaction.user.id,
                creationTime: new Date().toISOString(),
            };
            fs.writeFileSync(pollsFilePath, JSON.stringify(polls, null, 2));

            console.log(`Poll created by <span class="math-inline">\{interaction\.user\.tag\}\: "</span>{question}" in <span class="math-inline">\{interaction\.guild\.name\} \(</span>{pollMessage.channel.name}). Message ID: ${pollMessage.id}`);

        } else if (subcommand === 'end') {
            const messageId = interaction.options.getString('message_id');
            let polls = {};

            try {
                polls = JSON.parse(fs.readFileSync(pollsFilePath, 'utf8'));
            } catch (error) {
                console.error('Error reading polls.json:', error);
                return interaction.reply({ content: 'Could not read poll data. Try again later.', ephemeral: true });
            }

            const pollData = polls[messageId];

            if (!pollData) {
                return interaction.reply({ content: 'That message ID does not correspond to an active poll or the poll has already ended.', ephemeral: true });
            }

            try {
                const channel = await interaction.guild.channels.fetch(pollData.channelId);
                if (!channel) {
                    delete polls[messageId]; // Clean up orphaned poll data
                    fs.writeFileSync(pollsFilePath, JSON.stringify(polls, null, 2));
                    return interaction.reply({ content: 'Could not find the channel where that poll was created. Poll data removed.', ephemeral: true });
                }

                const pollMessage = await channel.messages.fetch(messageId);
                if (!pollMessage) {
                    delete polls[messageId]; // Clean up orphaned poll data
                    fs.writeFileSync(pollsFilePath, JSON.stringify(polls, null, 2));
                    return interaction.reply({ content: 'Could not find the poll message. Poll data removed.', ephemeral: true });
                }

                // Count reactions
                const results = {};
                for (let i = 0; i < pollData.options.length; i++) {
                    const emoji = numberEmojis[i];
                    const reaction = pollMessage.reactions.cache.get(emoji);
                    // Subtract 1 from count as the bot's own reaction should not count as a vote
                    results[pollData.options[i]] = reaction ? reaction.count - 1 : 0;
                }

                const totalVotes = Object.values(results).reduce((sum, count) => sum + count, 0);

                // Sort results
                const sortedResults = Object.entries(results).sort(([,a],[,b]) => b - a);

                // Construct results embed
                const resultsEmbed = new EmbedBuilder()
                    .setTitle(`📊 Poll Results: ${pollData.question}`)
                    .setColor('#00ff00')
                    .setFooter({ text: `Poll ended by ${interaction.user.tag}` })
                    .setTimestamp();

                if (totalVotes === 0) {
                    resultsEmbed.setDescription('No votes were cast in this poll.');
                } else {
                    resultsEmbed.setDescription(`Total Votes: ${totalVotes}\n\n`);
                    sortedResults.forEach(([option, count]) => {
                        const percentage = totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(1) : 0;
                        resultsEmbed.addFields({ name: option, value: `Votes: <span class="math-inline">\{count\} \(</span>{percentage}%)`, inline: false });
                    });
                }

                await interaction.reply({ embeds: [resultsEmbed] });

                // Remove poll from active storage
                delete polls[messageId];
                fs.writeFileSync(pollsFilePath, JSON.stringify(polls, null, 2));

                console.log(`Poll ended: "${pollData.question}". Results displayed.`);

            } catch (error) {
                console.error(`Error ending poll ${messageId}:`, error);
                // Try to clean up if error occurs during ending
                if (polls[messageId]) {
                     delete polls[messageId];
                     fs.writeFileSync(pollsFilePath, JSON.stringify(polls, null, 2));
                     console.warn(`Cleaned up orphaned poll data for message ID: ${messageId}`);
                }
                return interaction.reply({ content: `An error occurred while trying to end the poll: \`${error.message}\`. Please check the message ID.`, ephemeral: true });
            }
        }
    }
};