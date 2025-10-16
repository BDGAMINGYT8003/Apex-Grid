const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
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
    const pageUsers = sortedUsers.slice(startIndex, startIndex + usersPerPage);

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
            .setCustomId(`leaderboard_prev_${page}`)
            .setLabel('Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`leaderboard_next_${page}`)
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
        const sortedUsers = Object.entries(getGuildProfiles(interaction.guildId))
            .map(([userId, profile]) => ({ userId, profile }))
            .filter(user => user.profile.onboarded)
            .sort((a, b) => b.profile.xp - a.profile.xp);

        if (sortedUsers.length === 0) {
            const noUsersMessage = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("The leaderboard is empty! Be the first to start earning XP."));
            return interaction.reply({ components: [noUsersMessage], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        }

        const initialPage = await createLeaderboardPage(sortedUsers, 0, interaction.client);
        await interaction.reply(initialPage);
    },

    async handleButton(interaction) {
        const customIdParts = interaction.customId.split('_'); // e.g., ['leaderboard', 'next', '0']
        const action = customIdParts[1];
        const currentPage = parseInt(customIdParts[2], 10);
        let newPage = currentPage;

        if (action === 'next') {
            newPage++;
        } else if (action === 'prev') {
            newPage--;
        }

        const sortedUsers = Object.entries(getGuildProfiles(interaction.guildId))
            .map(([userId, profile]) => ({ userId, profile }))
            .filter(user => user.profile.onboarded)
            .sort((a, b) => b.profile.xp - a.profile.xp);

        const updatedPage = await createLeaderboardPage(sortedUsers, newPage, interaction.client);
        await interaction.update(updatedPage);
    },
};