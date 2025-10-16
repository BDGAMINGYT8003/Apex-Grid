const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getUserProfile, setUserProfile } = require('../data/database');
const { getDefaultMarketStock } = require('../data/marketItems');

// --- TUTORIAL CONTENT ---
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

// --- HELPER FUNCTIONS ---

/**
 * Generates the message payload for a given tutorial step.
 * @param {number} stepIndex The index of the tutorial step.
 * @returns {object} The message payload with Components v2.
 */
function getTutorialMessage(stepIndex) {
    const step = tutorialSteps[stepIndex];
    const isLastStep = stepIndex === tutorialSteps.length - 1;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`profile_tutorial_${stepIndex + 1}`) // e.g., profile_tutorial_1
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
}

/**
 * Creates the Components v2 profile card.
 * @param {object} user The user object from the interaction.
 * @param {object} profile The user's profile data.
 * @returns {ContainerBuilder} The constructed profile card component.
 */
function createProfileCard(user, profile) {
    const xpNeeded = 100 + (0.5 * profile.level);
    const progress = Math.floor((profile.xp / xpNeeded) * 20);
    const progressBar = '█'.repeat(progress) + '░'.repeat(20 - progress);

    return new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${user.username}'s Apex Grid Profile**`),
            new TextDisplayBuilder().setContent(`**Level:** ${profile.level}`),
            new TextDisplayBuilder().setContent(`**CI Tokens:** ${profile.ciTokens.toFixed(1)}`),
            new TextDisplayBuilder().setContent(`**XP:** ${profile.xp.toFixed(2)} / ${xpNeeded.toFixed(2)}`),
            new TextDisplayBuilder().setContent(`\`[${progressBar}]\``)
        );
}


// --- COMMAND DEFINITION ---
module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription("Check your monthly progress or another user's.")
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose profile you want to see.')
                .setRequired(false)),

    // --- SLASH COMMAND EXECUTION ---
    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guildId;

        if (targetUser.bot) {
            const botProfileMessage = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("Bots do not participate in the Apex Grid."));
            return interaction.reply({ components: [botProfileMessage], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        }

        const userProfile = getUserProfile(guildId, targetUser.id);

        if (!userProfile) {
            if (targetUser.id === interaction.user.id) {
                // Start onboarding for the user who ran the command
                const initialMessage = getTutorialMessage(0);
                return interaction.reply(initialMessage);
            } else {
                const notStartedMessage = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`${targetUser.username} hasn't started their Apex Grid journey yet.`));
                return interaction.reply({ components: [notStartedMessage], flags: MessageFlags.IsComponentsV2, ephemeral: true });
            }
        }

        const profileCard = createProfileCard(targetUser, userProfile);
        await interaction.reply({
            components: [profileCard],
            flags: MessageFlags.IsComponentsV2,
            ephemeral: true
        });
    },

    // --- BUTTON INTERACTION HANDLER ---
    async handleButton(interaction) {
        const customIdParts = interaction.customId.split('_'); // e.g., ['profile', 'tutorial', '1']
        const action = customIdParts[1];

        if (action === 'tutorial') {
            const nextStepIndex = parseInt(customIdParts[2], 10);

            if (nextStepIndex < tutorialSteps.length) {
                // If there are more steps, show the next one
                const nextMessage = getTutorialMessage(nextStepIndex);
                await interaction.update(nextMessage);
            } else {
                // This was the "Got it!" button, finish onboarding
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

                await interaction.update({
                    components: [finalMessage],
                    flags: MessageFlags.IsComponentsV2,
                    ephemeral: true
                });
            }
        }
    },
};