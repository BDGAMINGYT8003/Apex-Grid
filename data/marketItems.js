const marketItems = [
    { id: 'twilight_echo_permit', name: 'Twilight Echo Permit x1', cost: 50, stock: 15, levelReq: 1 },
    { id: 'weapon_echo_permit', name: 'Weapon Echo Permit x1', cost: 50, stock: 15, levelReq: 1 },
    { id: 'advanced_echo_permit', name: 'Advanced Echo Permit x1', cost: 50, stock: 15, levelReq: 1 },
    { id: 'purifier_metal', name: 'Purifier Metal x100', cost: 30, stock: 20, levelReq: 1 },
    { id: 'ion_probes', name: 'Ion Probes x200', cost: 40, stock: 20, levelReq: 1 },
    { id: 'stellaris_exp', name: 'Stellaris EXP x10000', cost: 35, stock: 20, levelReq: 1 },
    { id: 'starmap_echo_permit', name: 'Starmap Echo Permit x1', cost: 85, stock: 10, levelReq: 1 },
    { id: 'starsea_ticket', name: 'Starsea Ticket x1', cost: 100, stock: 10, levelReq: 1 },
    { id: 'diamond_blind_box', name: 'Diamond Blind Box x1', cost: 100, stock: 15, levelReq: 1 },
    { id: 'red_2_star_eqpt_selection', name: 'Red 2-Star Eqpt. Selection x1', cost: 100, stock: 10, levelReq: 1 },
    { id: 'ssr_plus_stellaris_selection_box', name: 'SSR+ Stellaris Selection Box x1', cost: 400, stock: 2, levelReq: 11 },
    { id: 'lottery_ticket', name: 'Lottery Ticket', cost: 150, stock: 'unlimited', levelReq: 21 },
];

/**
 * Gets the default market stock for a new user.
 * @returns {object} An object representing the default stock for each item.
 */
function getDefaultMarketStock() {
    const stock = {};
    for (const item of marketItems) {
        stock[item.id] = item.stock;
    }
    return stock;
}

module.exports = {
    marketItems,
    getDefaultMarketStock,
};