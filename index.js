const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, REST, Routes } = require('discord.js');
const chalk = require('chalk');
const cron = require('node-cron');
const { getUserProfile, setUserProfile } = require('./data/database.js');
const { performMonthlyReset } = require('./data/reset.js');

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
        const data = await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commandsToDeploy },
        );
        console.log(chalk.cyan(`Successfully reloaded ${data.length} application (/) commands.`));
    } catch (error) {
        console.error(chalk.red('Error during command deployment:'), error);
    }
})();


// --- CENTRAL INTERACTION ROUTER ---
client.on(Events.InteractionCreate, async interaction => {
    const commandName = interaction.isCommand() ? interaction.commandName : interaction.customId.split('_')[0];
    const command = interaction.client.commands.get(commandName);

    if (!command) {
        console.error(`No command matching '${commandName}' was found.`);
        return;
    }

    try {
        if (interaction.isChatInputCommand()) {
            await command.execute(interaction);
        } else if (interaction.isButton()) {
            if (command.handleButton) {
                await command.handleButton(interaction);
            }
        } else if (interaction.isStringSelectMenu()) {
            if (command.handleSelectMenu) {
                await command.handleSelectMenu(interaction);
            }
        } else if (interaction.isModalSubmit()) {
            if (command.handleModal) {
                await command.handleModal(interaction);
            }
        }
    } catch (error) {
        console.error(chalk.red(`Error handling interaction for command '${commandName}':`), error);
        const errorMessage = { content: 'There was an error while executing this interaction!', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});


// --- EVENT HANDLER: messageCreate (XP and CI Token Accrual) ---
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;

    const profile = getUserProfile(message.guild.id, message.author.id);
    if (!profile || !profile.onboarded) return;

    const now = Date.now();
    if (now - (profile.lastMessageTimestamp || 0) < 15000) return;

    let xpGained = 0;
    const messageLength = message.content.length;

    if (messageLength > 5 && messageLength <= 25) xpGained = 1;
    else if (messageLength > 25 && messageLength <= 100) xpGained = 2;
    else if (messageLength > 100) xpGained = 5;

    if (message.content.match(/<a?:\w+:\d+>/) || message.stickers.size > 0) {
        xpGained += 1;
    }

    if (xpGained > 0) {
        profile.xp += xpGained;

        const xpForNextLevel = 100 + (0.5 * profile.level);
        if (profile.xp >= xpForNextLevel) {
            profile.level++;
            profile.xp -= xpForNextLevel;

            const ciGained = 1 + (0.5 * (profile.level - 2));
            const today = new Date().toISOString().slice(0, 10);
            if (profile.dailyCiEarned.date !== today) {
                profile.dailyCiEarned = { amount: 0, date: today };
            }

            const remainingDailyCap = 70 - profile.dailyCiEarned.amount;
            const ciToAward = Math.min(ciGained, remainingDailyCap);

            if (ciToAward > 0) {
                profile.ciTokens += ciToAward;
                profile.dailyCiEarned.amount += ciToAward;
                try {
                    await message.author.send(`Congratulations, you've reached **Level ${profile.level}** and earned **${ciToAward.toFixed(1)} CI Tokens**!`);
                } catch (error) {
                    console.log(`Could not DM user ${message.author.id} about their level up.`);
                }
            }
        }
    }

    profile.lastMessageTimestamp = now;
    setUserProfile(message.guild.id, message.author.id, profile);
});


// --- CLIENT READY EVENT ---
client.once(Events.ClientReady, c => {
    console.log(chalk.bold.green(`\n--- Apex Grid Bot is online! ---`));
    console.log(chalk.green(`Logged in as ${c.user.tag}`));
});


// --- MONTHLY RESET SCHEDULER ---
cron.schedule('0 0 1 * *', () => {
    console.log(chalk.bold.magenta('--- Initiating Monthly Reset Protocol ---'));
    performMonthlyReset(client);
}, { scheduled: true, timezone: "UTC" });


// --- LOGIN ---
client.login(BOT_TOKEN);