const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('everyone')
        .setDescription('Pings everyone in the server with a message.')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message to send with the @everyone ping.')
                .setRequired(true)),
    async execute(interaction) {
        // Check if the user has the 'MentionEveryone' permission
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.MentionEveryone)) {
            return interaction.reply({ content: 'You do not have permission to ping everyone.', flags: [MessageFlags.Ephemeral] });
        }

        const messageContent = interaction.options.getString('message');

        try {
            // Send the message with the @everyone ping and specify allowedMentions
            await interaction.reply({ content: `**Pinging @everyone:**\n${messageContent}\n@everyone`, allowedMentions: { parse: ['everyone'] } });
        } catch (error) {
            console.error('Error sending @everyone ping:', error);
            await interaction.reply({ content: 'There was an error trying to send the @everyone ping.', flags: [MessageFlags.Ephemeral] });
        }
    },
};