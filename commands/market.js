const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { getUserProfile, setUserProfile } = require('../data/database');
const { marketItems } = require('../data/marketItems');
const crypto = require('crypto');

/**
 * Generates a random, secure reward code.
 * @returns {string} A formatted reward code.
 */
function generateRewardCode() {
    return `APEX-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('market')
        .setDescription('Purchase items with your CI Tokens.'),
    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const profile = getUserProfile(guildId, userId);

        if (!profile) {
            const notOnboardedMessage = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("You must complete the onboarding first! Run `/profile` to begin."));
            return interaction.reply({ components: [notOnboardedMessage], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        }

        const availableItems = marketItems.filter(item => profile.level >= item.levelReq);

        if (availableItems.length === 0) {
            const noItemsMessage = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("There are no items available for you at your current level. Keep earning XP!"));
            return interaction.reply({ components: [noItemsMessage], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        }

        const itemOptions = availableItems.map(item => {
            const stock = profile.marketStock[item.id];
            const stockDisplay = stock === 'unlimited' ? 'Unlimited' : stock;
            return {
                label: item.name,
                description: `Cost: ${item.cost} CI | Stock: ${stockDisplay}`,
                value: item.id,
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('market_select_item')
            .setPlaceholder('Select an item to purchase')
            .addOptions(itemOptions);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        const header = new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**Welcome to the Apex Market!**\nYour Balance: **${profile.ciTokens.toFixed(1)} CI Tokens**\n\nSelect an item from the menu below to proceed.`)
        );

        const response = await interaction.reply({
            components: [header, row],
            flags: MessageFlags.IsComponentsV2,
            ephemeral: true,
        });

        // --- Collector for Item Selection ---
        const selectCollector = response.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: i => i.user.id === userId && i.customId === 'market_select_item',
            time: 60000
        });

        selectCollector.on('collect', async i => {
            const selectedItemId = i.values[0];
            const selectedItem = marketItems.find(item => item.id === selectedItemId);
            const userStock = profile.marketStock[selectedItemId];

            const modal = new ModalBuilder()
                .setCustomId(`market_quantity_modal_${selectedItemId}`)
                .setTitle(`Purchase ${selectedItem.name}`);

            const quantityInput = new TextInputBuilder()
                .setCustomId('quantity')
                .setLabel('Enter quantity:')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('e.g., 5');

            modal.addComponents(new ActionRowBuilder().addComponents(quantityInput));
            await i.showModal(modal);

            // --- Collector for Modal Submission ---
            const modalInteraction = await interaction.awaitModalSubmit({
                filter: modalSubmitInteraction => modalSubmitInteraction.user.id === userId && modalSubmitInteraction.customId === `market_quantity_modal_${selectedItemId}`,
                time: 60000
            }).catch(() => null);

            if (!modalInteraction) return; // Timed out

            const quantity = parseInt(modalInteraction.fields.getTextInputValue('quantity'), 10);

            // --- Validation ---
            if (isNaN(quantity) || quantity <= 0) {
                return modalInteraction.reply({ content: 'Invalid quantity. Please enter a positive number.', ephemeral: true });
            }
            if (userStock !== 'unlimited' && quantity > userStock) {
                return modalInteraction.reply({ content: `You cannot purchase more than your remaining stock of ${userStock}.`, ephemeral: true });
            }
            const totalCost = selectedItem.cost * quantity;
            if (totalCost > profile.ciTokens) {
                return modalInteraction.reply({ content: `You do not have enough CI Tokens. You need ${totalCost}, but you only have ${profile.ciTokens.toFixed(1)}.`, ephemeral: true });
            }

            // --- Confirmation Step ---
            const confirmButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirm_purchase').setLabel('Confirm').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('cancel_purchase').setLabel('Cancel').setStyle(ButtonStyle.Danger)
            );
            const confirmMessage = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**Confirm Purchase**\nItem: ${selectedItem.name}\nQuantity: ${quantity}\nTotal Cost: ${totalCost} CI Tokens`)
            );

            await modalInteraction.reply({ components: [confirmMessage, confirmButtons], flags: MessageFlags.IsComponentsV2, ephemeral: true });

            // --- Collector for Confirmation Buttons ---
            const buttonInteraction = await response.awaitMessageComponent({
                filter: buttonI => buttonI.user.id === userId && (buttonI.customId === 'confirm_purchase' || buttonI.customId === 'cancel_purchase'),
                time: 60000
            }).catch(() => null);

            if (!buttonInteraction || buttonInteraction.customId === 'cancel_purchase') {
                const cancelMessage = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("Purchase cancelled."));
                return modalInteraction.editReply({ components: [cancelMessage], flags: MessageFlags.IsComponentsV2 });
            }

            // --- Process Purchase ---
            profile.ciTokens -= totalCost;
            if (userStock !== 'unlimited') {
                profile.marketStock[selectedItemId] -= quantity;
            }
            setUserProfile(guildId, userId, profile);

            const rewardCode = generateRewardCode();

            // Send DM
            try {
                await interaction.user.send(`Thank you for your purchase! Here is your reward code:\n\n**${rewardCode}**\n\nThis code was also sent in the channel as a temporary message.`);
            } catch (dmError) {
                console.log(`Could not DM user ${userId}.`);
            }

            // Send ephemeral message in channel
            const successMessage = new ContainerBuilder().setAccentColor(0x00FF00).addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`✅ **Purchase Successful!**\n\nYour reward code is:\n**${rewardCode}**\n\n**IMPORTANT:** Copy this code now! This message is temporary and will disappear. A copy has also been sent to your DMs.`)
            );
            await buttonInteraction.update({ components: [successMessage], flags: MessageFlags.IsComponentsV2 });
        });
    },
};