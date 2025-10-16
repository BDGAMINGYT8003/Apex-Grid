const fs = require('node:fs');
const path = require('node:path');
const dbPath = path.join(__dirname, 'database.json');

// --- DATABASE UTILITY FUNCTIONS ---

/**
 * Reads the entire database from the JSON file.
 * @returns {object} The parsed database object.
 */
function readDatabase() {
    try {
        const data = fs.readFileSync(dbPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // If the file doesn't exist, return an empty object
            return {};
        }
        console.error('Error reading database file:', error);
        return {};
    }
}

/**
 * Writes an object to the database JSON file.
 * @param {object} data The data to write to the database.
 */
function writeDatabase(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error writing to database file:', error);
    }
}

/**
 * Retrieves a user's profile for a specific guild.
 * @param {string} guildId The ID of the server.
 * @param {string} userId The ID of the user.
 * @returns {object|null} The user's profile object or null if not found.
 */
function getUserProfile(guildId, userId) {
    const db = readDatabase();
    if (db[guildId] && db[guildId].users && db[guildId].users[userId]) {
        return db[guildId].users[userId];
    }
    return null;
}

/**
 * Creates or updates a user's profile for a specific guild.
 * @param {string} guildId The ID of the server.
 * @param {string} userId The ID of the user.
 * @param {object} profileData The new profile data to set.
 */
function setUserProfile(guildId, userId, profileData) {
    const db = readDatabase();

    // Ensure the guild and user objects exist
    if (!db[guildId]) {
        db[guildId] = { users: {} };
    }
    if (!db[guildId].users) {
        db[guildId].users = {};
    }

    db[guildId].users[userId] = profileData;
    writeDatabase(db);
}

/**
 * Retrieves all user profiles for a specific guild.
 * @param {string} guildId The ID of the server.
 * @returns {object} An object containing all user profiles for the guild.
 */
function getGuildProfiles(guildId) {
    const db = readDatabase();
    return (db[guildId] && db[guildId].users) ? db[guildId].users : {};
}


module.exports = {
    readDatabase,
    writeDatabase,
    getUserProfile,
    setUserProfile,
    getGuildProfiles,
};