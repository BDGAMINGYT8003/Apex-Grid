const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getUserProfile, setUserProfile } = require('../data/database');
const { marketItems } = require('../data/marketItems');
const crypto = require('crypto');

function generateRewardCode() {
    return `APEX-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('market')
        .setDescription('Purchase items with your CI Tokens.'),

    async execute(interaction) {
        const profile = getUserProfile(interaction.guildId, interaction.user.id);

        if (!profile) {
            const notOnboardedMessage = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("You must complete the onboarding first! Run `/profile` to begin."));
            return interaction.reply({ components: [notOnboardedMessage], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        }

        const availableItems = marketItems.filter(item => profile.level >= item.levelReq);
        if (availableItems.length === 0) {
            const noItemsMessage = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("There are no items available for you at your current level. Keep earning XP!"));
            return interaction.reply({ components: [noItemsMessage], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        }

        const itemOptions = availableItems.map(item => ({
            label: item.name,
            description: `Cost: ${item.cost} CI | Stock: ${profile.marketStock[item.id] === 'unlimited' ? 'Unlimited' : profile.marketStock[item.id]}`,
            value: item.id,
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('market_select')
            .setPlaceholder('Select an item to purchase')
            .addOptions(itemOptions);

        const header = new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**Welcome to the Apex Market!**\nYour Balance: **${profile.ciTokens.toFixed(1)} CI Tokens**\n\nSelect an item from the menu below.`)
        );

        await interaction.reply({
            components: [header, new ActionRowBuilder().addComponents(selectMenu)],
            flags: MessageFlags.IsComponentsV2,
            ephemeral: true,
        });
    },

    async handleSelectMenu(interaction) {
        const selectedItemId = interaction.values[0];
        const selectedItem = marketItems.find(item => item.id === selectedItemId);

        const modal = new ModalBuilder()
            .setCustomId(`market_modal_${selectedItemId}`)
            .setTitle(`Purchase ${selectedItem.name}`);

        const quantityInput = new TextInputBuilder()
            .setCustomId('quantity')
            .setLabel('Enter quantity:')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('e.g., 5');

        modal.addComponents(new ActionRowBuilder().addComponents(quantityInput));
        await interaction.showModal(modal);
    },

    async handleModal(interaction) {
        const customIdParts = interaction.customId.split('_');
        const selectedItemId = customIdParts.slice(2).join('_'); // Correctly join multi-word IDs
        const selectedItem = marketItems.find(item => item.id === selectedItemId);
        const quantity = parseInt(interaction.fields.getTextInputValue('quantity'), 10);

        const profile = getUserProfile(interaction.guildId, interaction.user.id);
        const userStock = profile.marketStock[selectedItemId];
        const totalCost = selectedItem.cost * quantity;

        // Validation
        if (isNaN(quantity) || quantity <= 0) {
            return interaction.reply({ content: 'Invalid quantity. Please enter a positive number.', ephemeral: true });
        }
        if (userStock !== 'unlimited' && quantity > userStock) {
            return interaction.reply({ content: `You cannot purchase more than your remaining stock of ${userStock}.`, ephemeral: true });
        }
        if (totalCost > profile.ciTokens) {
            return interaction.reply({ content: `You do not have enough CI Tokens. You need ${totalCost}, but you only have ${profile.ciTokens.toFixed(1)}.`, ephemeral: true });
        }

        const confirmButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`market_confirm_${selectedItemId}_${quantity}`).setLabel('Confirm').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('market_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
        );
        const confirmMessage = new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**Confirm Purchase**\nItem: ${selectedItem.name}\nQuantity: ${quantity}\nTotal Cost: ${totalCost} CI Tokens`)
        );

        await interaction.reply({ components: [confirmMessage, confirmButtons], flags: MessageFlags.IsComponentsV2, ephemeral: true });
    },

    async handleButton(interaction) {
        const customIdParts = interaction.customId.split('_');
        const action = customIdParts[1];

        if (action === 'cancel') {
            const cancelMessage = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent("Purchase cancelled."));
            return interaction.update({ components: [cancelMessage], flags: MessageFlags.IsComponentsV2 });
        }

        if (action === 'confirm') {
            const quantity = parseInt(customIdParts.pop(), 10); // Last part is always quantity
            const selectedItemId = customIdParts.slice(2).join('_'); // The rest is the ID
            const selectedItem = marketItems.find(item => item.id === selectedItemId);
            const profile = getUserProfile(interaction.guildId, interaction.user.id);
            const totalCost = selectedItem.cost * quantity;

            // Final validation before processing
            if (totalCost > profile.ciTokens || (profile.marketStock[selectedItemId] !== 'unlimited' && quantity > profile.marketStock[selectedItemId])) {
                 const errorMessage = new ContainerBuilder().setAccentColor(0xFF0000).addTextDisplayComponents(new TextDisplayBuilder().setContent("Error: Your balance or stock changed since you started this purchase. Please try again."));
                 return interaction.update({ components: [errorMessage], flags: MessageFlags.IsComponentsV2 });
            }

            profile.ciTokens -= totalCost;
            if (profile.marketStock[selectedItemId] !== 'unlimited') {
                profile.marketStock[selectedItemId] -= quantity;
            }
            setUserProfile(interaction.guildId, interaction.user.id, profile);

            const rewardCode = generateRewardCode();
            try {
                await interaction.user.send(`Thank you for your purchase! Here is your reward code:\n\n**${rewardCode}**\n\nThis code was also sent in the channel as a temporary message.`);
            } catch (dmError) {
                console.log(`Could not DM user ${interaction.user.id}.`);
            }

            const successMessage = new ContainerBuilder().setAccentColor(0x00FF00).addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`✅ **Purchase Successful!**\n\nYour reward code is:\n**${rewardCode}**\n\n**IMPORTANT:** Copy this code now! This message is temporary. A copy has also been sent to your DMs.`)
            );
            await interaction.update({ components: [successMessage], flags: MessageFlags.IsComponentsV2 });
        }
    },
};