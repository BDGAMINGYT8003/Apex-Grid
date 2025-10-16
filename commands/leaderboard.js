const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { getGuildProfiles } = require('../data/database');

/**
 * Creates the leaderboard component for a specific page.
 * @param {Array<object>} sortedUsers The sorted array of user profiles.
 * @param {number} page The current page number (0-indexed).
 * @param {Client} client The Discord client instance.
 * @returns {Promise<object>} The message payload for the leaderboard page.
 */
async function createLeaderboardPage(sortedUsers, page, client) {
    const usersPerPage = 10;
    const startIndex = page * usersPerPage;
    const endIndex = startIndex + usersPerPage;
    const pageUsers = sortedUsers.slice(startIndex, endIndex);

    const leaderboardLines = await Promise.all(pageUsers.map(async (user, index) => {
        const rank = startIndex + index + 1;
        const discordUser = await client.users.fetch(user.userId).catch(() => ({ username: 'Unknown User' }));
        return `**${rank}.** ${discordUser.username} - **${user.profile.xp.toFixed(2)} XP** (Level ${user.profile.level})`;
    }));

    const description = leaderboardLines.join('\n') || 'No users to display on this page.';
    const totalPages = Math.ceil(sortedUsers.length / usersPerPage);

    const container = new ContainerBuilder()
        .setAccentColor(0xFFD700) // Gold
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('**🏆 Monthly Apex Grid Leaderboard 🏆**'),
            new TextDisplayBuilder().setContent(description)
        );

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('leaderboard_prev')
            .setLabel('Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId('leaderboard_next')
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= totalPages - 1)
    );

    return {
        components: [container, buttons],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Shows the server-wide monthly XP leaderboard.'),
    async execute(interaction) {
        const guildId = interaction.guildId;
        const allProfiles = getGuildProfiles(guildId);

        const sortedUsers = Object.entries(allProfiles)
            .map(([userId, profile]) => ({ userId, profile }))
            .filter(user => user.profile.onboarded) // Only show users who have completed onboarding
            .sort((a, b) => b.profile.xp - a.profile.xp);

        if (sortedUsers.length === 0) {
            const noUsersMessage = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("The leaderboard is empty! Be the first to start earning XP."));
            return interaction.reply({ components: [noUsersMessage], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        }

        let currentPage = 0;
        const messagePayload = await createLeaderboardPage(sortedUsers, currentPage, interaction.client);
        const response = await interaction.reply(messagePayload);

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i => i.user.id === interaction.user.id,
            time: 120000 // 2 minutes
        });

        collector.on('collect', async i => {
            if (i.customId === 'leaderboard_next') {
                currentPage++;
            } else if (i.customId === 'leaderboard_prev') {
                currentPage--;
            }

            const updatedPayload = await createLeaderboardPage(sortedUsers, currentPage, interaction.client);
            await i.update(updatedPayload);
        });

        collector.on('end', async () => {
            // Remove buttons after collector expires
            const finalPayload = await createLeaderboardPage(sortedUsers, currentPage, interaction.client);
            finalPayload.components.pop(); // Remove the button row
            await interaction.editReply(finalPayload);
        });
    },
};