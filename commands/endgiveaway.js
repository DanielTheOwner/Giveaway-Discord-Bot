const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('endgiveaway')
        .setDescription('Ends an ongoing giveaway and picks winner(s).')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('The message ID of the giveaway to end.')
                .setRequired(true)),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return interaction.reply({ content: 'You do not have permission to end giveaways.', flags: [MessageFlags.Ephemeral] });
        }

        const messageIdToEnd = interaction.options.getString('message_id');
        const giveaway = interaction.client.giveaways.get(messageIdToEnd);

        if (!giveaway) {
            return interaction.reply({ content: 'No active giveaway found with that message ID.', flags: [MessageFlags.Ephemeral] });
        }

        if (giveaway.hostId !== interaction.user.id && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
             return interaction.reply({ content: 'You can only end giveaways that you have hosted, or if you are an Administrator.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            await interaction.client.endGiveaway(interaction.client, messageIdToEnd, true);

            await interaction.editReply({ content: 'Giveaway has been successfully ended!' });
        } catch (error) {
            console.error('Error ending giveaway:', error);
            await interaction.editReply({ content: 'There was an error trying to end the giveaway.' });
        }
    },
};