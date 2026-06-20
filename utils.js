const { getSetting } = require('./database');

function generateRefId(userId) {
  const timestamp = Date.now();
  return `dep-${userId}-${timestamp}`;
}

async function inrToUsdt(inrAmount) {
  const rate = parseFloat(await getSetting('usdt_to_inr_rate')) || 90;
  return Math.round((inrAmount / rate) * 100) / 100;
}

function formatDateTime(dtStr) {
  if (!dtStr) return 'N/A';
  try {
    const date = new Date(dtStr + ' UTC');
    return date.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  } catch {
    return dtStr;
  }
}

function getMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🛒 Buy Product', callback_data: 'buy_product' },
       { text: '📁 Buy Sessions', callback_data: 'buy_sessions' }],
      [{ text: '👤 Profile', callback_data: 'profile' },
       { text: '💰 Deposit', callback_data: 'deposit' }],
      [{ text: '🎁 Refer & Earn', callback_data: 'refer_earn' }],
      [{ text: '📞 Support', callback_data: 'support' }]
    ]
  };
}

function getBackKeyboard(callbackData = 'main_menu') {
  return {
    inline_keyboard: [[{ text: '🏠 Main Menu', callback_data: callbackData }]]
  };
}

async function isUserBanned(userId) {
  const { getUser } = require('./database');
  const user = await getUser(userId);
  return user ? !!user.is_banned : false;
}

async function isUserRestricted(userId) {
  const { getUser } = require('./database');
  const user = await getUser(userId);
  return user ? !!user.is_restricted : false;
}

module.exports = {
  generateRefId, inrToUsdt, formatDateTime,
  getMainMenuKeyboard, getBackKeyboard, isUserBanned, isUserRestricted
};
