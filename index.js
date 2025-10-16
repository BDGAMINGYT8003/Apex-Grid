const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, REST, Routes } = require('discord.js');
const chalk = require('chalk');
const cron = require('node-cron');
const { getUserProfile, setUserProfile } = require('./data/database.js');

// Securely retrieve bot token and client ID from environment variables
const { BOT_TOKEN, CLIENT_ID } = process.env;

if (!BOT_TOKEN || !CLIENT_ID) {
    console.error(chalk.red('Error: BOT_TOKEN and CLIENT_ID must be provided in environment variables.'));
    process.exit(1);
}

// Initialize the Discord Client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

// Create a collection to store slash commands
client.commands = new Collection();

// --- DYNAMIC COMMAND LOADER ---
console.log(chalk.yellow('Starting command loading process...'));
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

const commandsToDeploy = [];

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        const command = require(filePath);
        // Set the command in the Collection with the key as the command name and the value as the exported module
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            commandsToDeploy.push(command.data.toJSON());
            console.log(chalk.green(`  [SUCCESS] Loaded command: ${command.data.name}`));
        } else {
            console.log(chalk.yellow(`  [WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`));
        }
    } catch (error) {
        console.error(chalk.red(`  [ERROR] Failed to load command at ${filePath}:`), error);
    }
}
console.log(chalk.yellow('Finished loading commands.'));

// --- SLASH COMMAND DEPLOYMENT ---
const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

(async () => {
    try {
        console.log(chalk.cyan(`Started refreshing ${commandsToDeploy.length} application (/) commands.`));

        // The put method is used to fully refresh all commands globally with the current set
        const data = await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commandsToDeploy },
        );

        console.log(chalk.cyan(`Successfully reloaded ${data.length} application (/) commands.`));
    } catch (error) {
        console.error(chalk.red('Error during command deployment:'), error);
    }
})();


// --- EVENT HANDLER: InteractionCreate ---
client.on(Events.InteractionCreate, async interaction => {
    // Handle slash commands
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        await interaction.reply({ content: 'Error: This command does not exist.', ephemeral: true });
        return;
    }

    try {
        // Delegate execution to the command's file
        await command.execute(interaction);
    } catch (error) {
        console.error(chalk.red(`Error executing command ${interaction.commandName}:`), error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    }
});


// --- EVENT HANDLER: messageCreate (XP and CI Token Accrual) ---
client.on(Events.MessageCreate, async message => {
    // Ignore bots and DMs
    if (message.author.bot || !message.guild) return;

    const guildId = message.guild.id;
    const userId = message.author.id;

    const profile = getUserProfile(guildId, userId);

    // Ignore users who haven't been onboarded yet
    if (!profile) return;

    // --- XP GAIN ---
    const now = Date.now();
    const timeSinceLastMessage = now - (profile.lastMessageTimestamp || 0);

    // Rate limit: 1 message per 15 seconds for XP gain
    if (timeSinceLastMessage < 15000) return;

    let xpGained = 0;
    const messageLength = message.content.length;

    // Scale XP by message length
    if (messageLength > 5 && messageLength <= 25) xpGained = 1;
    else if (messageLength > 25 && messageLength <= 100) xpGained = 2;
    else if (messageLength > 100) xpGained = 5;

    // Bonus for using official server emojis/stickers (once per message)
    if (message.content.match(/<a?:\w+:\d+>/) || message.stickers.size > 0) {
        xpGained += 1;
    }

    if (xpGained > 0) {
        profile.xp += xpGained;
    }

    profile.lastMessageTimestamp = now;

    // --- LEVEL UP & CI TOKEN REWARD ---
    const xpForNextLevel = 100 + (0.5 * profile.level);
    if (profile.xp >= xpForNextLevel) {
        profile.level++;
        profile.xp -= xpForNextLevel; // Reset XP for the new level, keeping the remainder

        // Calculate CI Tokens gained
        const ciGained = 1 + (0.5 * (profile.level - 2)); // Level 2 gives 1 token, Level 3 gives 1.5, etc.

        // Check daily cap
        const today = new Date().toISOString().slice(0, 10);
        if (profile.dailyCiEarned.date !== today) {
            profile.dailyCiEarned = { amount: 0, date: today };
        }

        const remainingDailyCap = 70 - profile.dailyCiEarned.amount;
        const ciToAward = Math.min(ciGained, remainingDailyCap);

        if (ciToAward > 0) {
            profile.ciTokens += ciToAward;
            profile.dailyCiEarned.amount += ciToAward;

            // Notify user of level up and rewards
            try {
                const levelUpMessage = `Congratulations, you've reached **Level ${profile.level}** and earned **${ciToAward.toFixed(1)} CI Tokens**!`;
                await message.author.send(levelUpMessage);
            } catch (error) {
                console.log(`Could not DM user ${userId} about their level up.`);
                // Optionally, send in channel if DMs are closed
                // message.reply(levelUpMessage).then(msg => setTimeout(() => msg.delete(), 10000));
            }
        }
    }

    setUserProfile(guildId, userId, profile);
});


// --- CLIENT READY EVENT ---
client.once(Events.ClientReady, c => {
    console.log(chalk.bold.green(`\n--- Apex Grid Bot is online! ---`));
    console.log(chalk.green(`Logged in as ${c.user.tag}`));
    console.log(chalk.cyan(`Operating in ${client.guilds.cache.size} servers.`));
});


const { performMonthlyReset } = require('./data/reset.js');

// --- MONTHLY RESET SCHEDULER ---
// '0 0 1 * *' = at 00:00 on the 1st day of every month
cron.schedule('0 0 1 * *', () => {
    console.log(chalk.bold.magenta('--- Initiating Monthly Reset Protocol ---'));
    performMonthlyReset(client);
}, {
    scheduled: true,
    timezone: "UTC"
});


// --- LOGIN ---
client.login(BOT_TOKEN);