const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Starts a new giveaway!'),
    async execute(interaction) {
        // Create the modal
        const modal = new ModalBuilder()
            .setCustomId('giveaway_modal')
            .setTitle('Start a New Giveaway');

        // Create text input components
        const durationInput = new TextInputBuilder()
            .setCustomId('giveaway_duration')
            .setLabel("Duration (e.g., 1h, 30m, 1d)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const prizeInput = new TextInputBuilder()
            .setCustomId('giveaway_prize')
            .setLabel("What's the prize?")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const imageInput = new TextInputBuilder()
            .setCustomId('giveaway_image')
            .setLabel("Image URL (optional)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        const winnersInput = new TextInputBuilder()
            .setCustomId('giveaway_winners')
            .setLabel("Number of winners?")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        // Add inputs to action rows
        const firstActionRow = new ActionRowBuilder().addComponents(durationInput);
        const secondActionRow = new ActionRowBuilder().addComponents(prizeInput);
        const thirdActionRow = new ActionRowBuilder().addComponents(imageInput);
        const fourthActionRow = new ActionRowBuilder().addComponents(winnersInput);

        // Add action rows to the modal
        modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow);

        // Show the modal to the user
        await interaction.showModal(modal);
    },
};