const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { getUserProfile, setUserProfile } = require('../data/database');
const { getDefaultMarketStock } = require('../data/marketItems');

// --- PROFILE HELPER FUNCTIONS ---

/**
 * Calculates the XP needed to reach the next level.
 * @param {number} currentLevel The user's current level.
 * @returns {number} The XP required for the next level.
 */
function getXpForNextLevel(currentLevel) {
    if (currentLevel === 0) return 100; // Base XP for level 1
    return 100 + (0.5 * currentLevel);
}

/**
 * Creates the Components v2 profile card.
 * @param {object} user The user object from the interaction.
 * @param {object} profile The user's profile data.
 * @returns {ContainerBuilder} The constructed profile card component.
 */
function createProfileCard(user, profile) {
    const xpNeeded = getXpForNextLevel(profile.level);
    const progress = Math.floor((profile.xp / xpNeeded) * 20); // 20-block progress bar
    const progressBar = '█'.repeat(progress) + '░'.repeat(20 - progress);

    const profileCard = new ContainerBuilder()
        .setAccentColor(0x5865F2) // Discord Blurple
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${user.username}'s Apex Grid Profile**`),
            new TextDisplayBuilder().setContent(`**Level:** ${profile.level}`),
            new TextDisplayBuilder().setContent(`**CI Tokens:** ${profile.ciTokens.toFixed(1)} <:token:0000000000>`), // Placeholder for a token emoji
            new TextDisplayBuilder().setContent(`**XP:** ${profile.xp.toFixed(2)} / ${xpNeeded.toFixed(2)}`),
            new TextDisplayBuilder().setContent(`\`[${progressBar}]\``)
        );

    return profileCard;
}

// --- ONBOARDING TUTORIAL ---
const tutorialSteps = [
    {
        content: "Welcome to the Apex Grid! Before you begin, let's go over the basics.",
        buttonLabel: "Next"
    },
    {
        content: "This server has a unique monthly economy. You'll earn **Server XP** by chatting, which increases your **Level** and rank on the `/leaderboard`.",
        buttonLabel: "Next"
    },
    {
        content: "Leveling up is the *only* way to earn **Calamity Intel (CI) Tokens**. These are your currency for the `/market`.",
        buttonLabel: "Next"
    },
    {
        content: "Everything—XP, Levels, CI Tokens, and Market Stock—**resets on the 1st of every month**. This keeps the competition fresh!",
        buttonLabel: "Got it!"
    }
];

async function startOnboarding(interaction) {
    let currentStep = 0;

    const getTutorialMessage = (stepIndex) => {
        const step = tutorialSteps[stepIndex];
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`tutorial_next_${stepIndex}`)
                .setLabel(step.buttonLabel)
                .setStyle(ButtonStyle.Primary)
        );
        const container = new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(step.content)
        );
        return {
            components: [container, row],
            flags: MessageFlags.IsComponentsV2,
            ephemeral: true
        };
    };

    await interaction.reply(getTutorialMessage(currentStep));

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i => i.user.id === interaction.user.id && i.customId.startsWith('tutorial_next_'),
        time: 60000 // 1 minute to complete tutorial
    });

    collector.on('collect', async i => {
        currentStep++;
        if (currentStep < tutorialSteps.length) {
            await i.update(getTutorialMessage(currentStep));
        } else {
            // Tutorial finished, create profile
            const newUserProfile = {
                onboarded: true,
                level: 1,
                xp: 0,
                ciTokens: 0,
                dailyCiEarned: { amount: 0, date: null },
                marketStock: getDefaultMarketStock(),
                lastMessageTimestamp: 0,
            };
            setUserProfile(interaction.guildId, interaction.user.id, newUserProfile);

            const finalMessage = new ContainerBuilder()
                .setAccentColor(0x00FF00)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent("✅ **Onboarding Complete!**\nYour profile has been created. You can now use all bot commands. Try running `/profile` again to see your new rank card!")
                );

            await i.update({
                components: [finalMessage],
                flags: MessageFlags.IsComponentsV2,
                ephemeral: true
            });
            collector.stop();
        }
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.followUp({ content: 'Tutorial timed out.', ephemeral: true });
        }
    });
}


// --- SLASH COMMAND ---
module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription("Check your monthly progress or another user's.")
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose profile you want to see.')
                .setRequired(false)),
    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guildId;

        // Prevent bot from looking up its own or other bots' profiles
        if (targetUser.bot) {
            const botProfileMessage = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("Bots do not participate in the Apex Grid."));
            return interaction.reply({ components: [botProfileMessage], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        }

        const userProfile = getUserProfile(guildId, targetUser.id);

        if (!userProfile) {
            // If the user running the command is the one without a profile, start onboarding
            if (targetUser.id === interaction.user.id) {
                return startOnboarding(interaction);
            } else {
                // If checking another user who hasn't started
                const notStartedMessage = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`${targetUser.username} hasn't started their Apex Grid journey yet.`));
                return interaction.reply({ components: [notStartedMessage], flags: MessageFlags.IsComponentsV2, ephemeral: true });
            }
        }

        // If profile exists, display it
        const profileCard = createProfileCard(targetUser, userProfile);
        await interaction.reply({
            components: [profileCard],
            flags: MessageFlags.IsComponentsV2,
            ephemeral: true
        });
    },
};