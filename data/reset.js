const { readDatabase, writeDatabase } = require('./database');
const { getDefaultMarketStock } = require('./marketItems');
const { marketItems } = require('../data/marketItems');
const crypto = require('crypto');

/**
 * Generates a random, secure reward code.
 * @returns {string} A formatted reward code.
 */
function generateRewardCode() {
    return `APEX-RESET-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

const leaderboardRewards = {
    1: { name: "5x Starmap Echoes", code: generateRewardCode() },
    2: { name: "4x Starmap Echoes", code: generateRewardCode() },
    3: { name: "3x Starmap Echoes", code: generateRewardCode() },
    4: { name: "2x Starmap Echoes", code: generateRewardCode() },
    5: { name: "2x Starmap Echoes", code: generateRewardCode() },
};

/**
 * Performs the full monthly data reset for all guilds.
 * @param {Client} client The Discord client instance to send DMs.
 */
async function performMonthlyReset(client) {
    console.log('--- Starting Monthly Reset Process ---');
    const db = readDatabase();

    for (const guildId in db) {
        if (!db.hasOwnProperty(guildId)) continue;

        const guildData = db[guildId];
        if (!guildData.users) continue;

        // 1. Determine Leaderboard Winners
        const sortedUsers = Object.entries(guildData.users)
            .map(([userId, profile]) => ({ userId, profile }))
            .sort((a, b) => b.profile.xp - a.profile.xp);

        // 2. Award Rewards via DM
        for (let i = 0; i < sortedUsers.length && i < 5; i++) {
            const winner = sortedUsers[i];
            const rank = i + 1;
            const reward = leaderboardRewards[rank];
            try {
                const user = await client.users.fetch(winner.userId);
                await user.send(`Congratulations! You placed **${rank}th** on this month's Apex Grid leaderboard. Your reward is: **${reward.name}**. \nRedeem Code: \`${reward.code}\``);
                console.log(`Sent reward to rank ${rank} user ${user.tag}`);
            } catch (error) {
                console.error(`Could not send reward DM to user ${winner.userId}`, error);
            }
        }

        // 3. Reset all user data for the guild
        for (const userId in guildData.users) {
            if (!guildData.users.hasOwnProperty(userId)) continue;

            const userProfile = guildData.users[userId];

            // Reset core stats
            userProfile.level = 1;
            userProfile.xp = 0;
            userProfile.ciTokens = 0;
            userProfile.dailyCiEarned = { amount: 0, date: null };

            // Reset market stock
            userProfile.marketStock = getDefaultMarketStock();
        }
    }

    // 4. Write the updated database back to the file
    writeDatabase(db);
    console.log('--- Monthly Reset Process Finished ---');
}

module.exports = { performMonthlyReset };