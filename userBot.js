const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const db = require('./database');
const utils = require('./utils');

const bot = new TelegramBot(config.USER_BOT_TOKEN, { polling: true });

// Temporary in-memory state per user (deposit flow, screenshot wait, etc)
const userState = {};

function getState(userId) {
  if (!userState[userId]) userState[userId] = {};
  return userState[userId];
}

// ─────────────────────────────────────────
// /start handler
// ─────────────────────────────────────────
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const userId = msg.from.id;
  const username = msg.from.username || '';
  const fullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();

  if (await utils.isUserBanned(userId)) {
    return bot.sendMessage(userId, '🚫 You have been banned from using this bot.');
  }

  // Handle referral
  let referredBy = null;
  const arg = match && match[1];
  if (arg && arg.startsWith('ref_')) {
    const refUid = parseInt(arg.replace('ref_', ''));
    if (refUid && refUid !== userId) referredBy = refUid;
  }

  let dbUser = await db.getUser(userId);
  if (!dbUser) {
    await db.createUser(userId, username, fullName, referredBy);
    dbUser = await db.getUser(userId);
  }

  if (!dbUser.terms_accepted) {
    return sendTermsMessage(userId);
  }

  await showMainMenu(userId);
});

// ─────────────────────────────────────────
// Terms & Conditions — NORMAL BUTTONS (no web app)
// ─────────────────────────────────────────
async function sendTermsMessage(userId) {
  const groupLink = await db.getSetting('group_link') || config.GROUP_LINK;
  const channelLink = await db.getSetting('channel_link') || config.CHANNEL_LINK;
  const botName = await db.getSetting('bot_name') || config.BOT_NAME;

  const text =
`👋 *Welcome to ${botName}!*

To start using the bot, please complete these steps:

📋 *Step 1 — Our Rules:*
🔒 Accounts & sessions are sold as-is — keep your files secure
⏰ Log in one account at a time, wait 2–3 min between each
🚫 No spam or mass messaging — misused accounts may freeze
💰 Failed OTPs are auto-refunded to your balance
🎁 One genuine account per person — fake referrals void rewards

📢 *Step 2 — Join our community:*
📢 Channel
👥 Group

Tap the join buttons above, then review and accept the terms below 👇`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '📢 Join Channel', url: channelLink }],
      [{ text: '👥 Join Group', url: groupLink }],
      [{ text: '📋 Review Terms & Conditions', callback_data: 'show_terms' }]
    ]
  };

  bot.sendMessage(userId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
}

async function sendTermsDetail(userId, messageId) {
  const text =
`📋 *Terms & Conditions*

Please read and accept before using the bot. This keeps your purchases protected and your account safe.

🔒 Accounts & sessions are sold *as-is*. Keep your files secure and never share them.

⏰ Log in *one account at a time*, waiting 2–3 minutes between each. Rushing gets accounts frozen.

🚫 No spam, mass messaging, or abuse. Misused accounts may freeze — that's *not our responsibility*.

💰 Refunds apply only as described at purchase. *Failed OTPs are auto-refunded* to your balance.

🎁 One genuine account per person. *Fake or duplicate referrals void all rewards.*

━━━━━━━━━━━━━━━━━━━━
Do you accept these terms?`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '✅ I Accept & Continue', callback_data: 'accept_terms' }],
      [{ text: '❌ Decline', callback_data: 'decline_terms' }]
    ]
  };

  bot.editMessageText(text, {
    chat_id: userId, message_id: messageId,
    parse_mode: 'Markdown', reply_markup: keyboard
  });
}

// ─────────────────────────────────────────
// Main Menu
// ─────────────────────────────────────────
async function showMainMenu(userId, messageId = null) {
  const refEnabled = (await db.getSetting('referral_enabled')) === '1';
  const refReward = await db.getSetting('referral_reward_inr') || '1';
  const botUsername = (await bot.getMe()).username;
  const refLink = `https://t.me/${botUsername}?start=ref_${userId}`;

  let text = '🏠 Use the menu below to get started →';
  if (refEnabled) {
    text =
`🎁 *Earn Money!*
Refer friends and get ₹${refReward} when they join!
🔗 ${refLink}

Use the menu below to get started →`;
  }

  const keyboard = utils.getMainMenuKeyboard();

  if (messageId) {
    bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {
      bot.sendMessage(userId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
    });
  } else {
    bot.sendMessage(userId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

// ─────────────────────────────────────────
// Callback Query Handler
// ─────────────────────────────────────────
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const data = query.data;
  const messageId = query.message.message_id;

  bot.answerCallbackQuery(query.id).catch(() => {});

  if (await utils.isUserBanned(userId)) {
    return bot.sendMessage(userId, '🚫 You are banned.');
  }

  try {
    if (data === 'show_terms') {
      await sendTermsDetail(userId, messageId);
    } else if (data === 'accept_terms') {
      await handleAcceptTerms(userId, messageId);
    } else if (data === 'decline_terms') {
      bot.editMessageText('❌ You must accept the terms to use this bot. Send /start to try again.', {
        chat_id: userId, message_id: messageId
      });
    } else if (data === 'main_menu') {
      await showMainMenu(userId, messageId);
    } else if (data === 'buy_product' || data === 'buy_sessions') {
      await showProducts(userId, messageId);
    } else if (data === 'profile') {
      await showProfile(userId, messageId);
    } else if (data === 'deposit') {
      await showDepositMenu(userId, messageId);
    } else if (data === 'refer_earn') {
      await showReferral(userId, messageId);
    } else if (data === 'support') {
      await showSupport(userId, messageId);
    } else if (data.startsWith('buy_item_')) {
      await showPurchaseConfirm(userId, messageId, parseInt(data.replace('buy_item_', '')));
    } else if (data.startsWith('confirm_buy_')) {
      await processPurchase(userId, messageId, parseInt(data.replace('confirm_buy_', '')));
    } else if (data === 'deposit_upi') {
      await showUpiOptions(userId, messageId);
    } else if (data === 'deposit_bnb') {
      await showBnbDeposit(userId, messageId);
    } else if (data.startsWith('upi_app_')) {
      const app = data.replace('upi_app_', '');
      getState(userId).upiApp = app;
      await askDepositAmount(userId, messageId, app);
    } else if (data === 'i_have_paid') {
      await askPaymentScreenshot(userId);
    } else if (data === 'cancel_deposit') {
      bot.editMessageText('❌ Deposit cancelled.', { chat_id: userId, message_id: messageId, reply_markup: utils.getBackKeyboard() });
    }
  } catch (err) {
    console.error('Callback error:', err);
  }
});

async function handleAcceptTerms(userId, messageId) {
  await db.getDB().run('UPDATE users SET terms_accepted = 1 WHERE user_id = ?', userId);

  const dbUser = await db.getUser(userId);
  if (dbUser && dbUser.referred_by) {
    const refEnabled = (await db.getSetting('referral_enabled')) === '1';
    if (refEnabled) {
      const reward = parseFloat(await db.getSetting('referral_reward_inr')) || 1.0;
      await db.getDB().run(
        'UPDATE users SET balance_inr = balance_inr + ?, referral_earned = referral_earned + ?, referral_count = referral_count + 1 WHERE user_id = ?',
        reward, reward, dbUser.referred_by
      );
      bot.sendMessage(dbUser.referred_by,
        `🎁 *Referral Reward!*\n\nSomeone joined using your link!\n✅ ₹${reward.toFixed(0)} added to your wallet!`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }
  }

  bot.editMessageText("✅ *You're all set!*\n\nTerms accepted successfully.", {
    chat_id: userId, message_id: messageId, parse_mode: 'Markdown'
  }).then(() => showMainMenu(userId));
}

// ─────────────────────────────────────────
// Products
// ─────────────────────────────────────────
async function showProducts(userId, messageId) {
  const products = await db.getActiveProducts();
  const rate = parseFloat(await db.getSetting('usdt_to_inr_rate')) || 90;

  if (!products.length) {
    return bot.editMessageText('📦 No products available right now.\n\nCheck back soon!', {
      chat_id: userId, message_id: messageId, reply_markup: utils.getBackKeyboard()
    });
  }

  let text = `✨ *Select Product*\n⚡ Rate: 1 USDT = ₹${rate.toFixed(1)}\n\n`;
  const keyboard = [];

  for (const p of products) {
    const usdt = await utils.inrToUsdt(p.price_inr);
    text += `📦 ${p.name} | $${usdt.toFixed(2)} • ₹${p.price_inr.toFixed(0)} | ${p.stock} In Stock\n`;
    keyboard.push([{ text: `📦 ${p.name} | ₹${p.price_inr.toFixed(0)}`, callback_data: `buy_item_${p.id}` }]);
  }
  keyboard.push([{ text: '🏠 Main Menu', callback_data: 'main_menu' }]);

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

async function showPurchaseConfirm(userId, messageId, productId) {
  const product = await db.getDB().get('SELECT * FROM products WHERE id = ?', productId);
  if (!product) {
    return bot.editMessageText('❌ Product not found.', { chat_id: userId, message_id: messageId, reply_markup: utils.getBackKeyboard() });
  }

  const dbUser = await db.getUser(userId);
  const balance = dbUser.balance_inr;
  const price = product.price_inr;
  const usdtPrice = await utils.inrToUsdt(price);
  const usdtBalance = await utils.inrToUsdt(balance);

  const balanceStatus = balance >= price ? '✅ Sufficient' : '⚠️ *Insufficient balance! Please deposit first.*';

  const text =
`🛒 *PURCHASE CONFIRMATION*
━━━━━━━━━━━━━━━━━━━━

📦 *${product.name}*

${product.description || 'Premium Digital Product'}

*Payment:*
💰 Price: $${usdtPrice.toFixed(2)} • ₹${price.toFixed(0)}
💳 Balance: $${usdtBalance.toFixed(2)} • ₹${balance.toFixed(0)}
${balanceStatus}

✅ Please use Telegram X.
🚫 We are not responsible for any freeze/ban`;

  const keyboard = [];
  if (balance >= price) keyboard.push([{ text: '✅ Confirm & Buy', callback_data: `confirm_buy_${productId}` }]);
  keyboard.push([{ text: '« Back', callback_data: 'buy_product' }, { text: '❌ Cancel', callback_data: 'main_menu' }]);

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

async function processPurchase(userId, messageId, productId) {
  const product = await db.getDB().get('SELECT * FROM products WHERE id = ? AND stock > 0', productId);
  if (!product) {
    return bot.editMessageText('❌ Product out of stock!', { chat_id: userId, message_id: messageId, reply_markup: utils.getBackKeyboard() });
  }

  const dbUser = await db.getUser(userId);
  if (dbUser.balance_inr < product.price_inr) {
    return bot.editMessageText('❌ Insufficient balance!', { chat_id: userId, message_id: messageId, reply_markup: utils.getBackKeyboard() });
  }

  await db.deductUserBalance(userId, product.price_inr);
  await db.getDB().run('UPDATE products SET stock = stock - 1 WHERE id = ?', productId);
  await db.getDB().run(
    'INSERT INTO purchases (user_id, product_id, amount_inr, content_delivered) VALUES (?, ?, ?, ?)',
    userId, productId, product.price_inr, product.content
  );

  bot.editMessageText(
    `✅ *Purchase Successful!*\n\n📦 *${product.name}*\n\n*Your Product:*\n\`${product.content}\`\n\nKeep this safe! 🔒`,
    { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: utils.getBackKeyboard() }
  );
}

// ─────────────────────────────────────────
// Profile
// ─────────────────────────────────────────
async function showProfile(userId, messageId) {
  const u = await db.getUser(userId);
  if (!u) return;

  const balanceUsdt = await utils.inrToUsdt(u.balance_inr);
  const depositedUsdt = await utils.inrToUsdt(u.total_deposited);
  const spentUsdt = await utils.inrToUsdt(u.total_spent);
  const earnedUsdt = await utils.inrToUsdt(u.referral_earned);
  const refReward = await db.getSetting('referral_reward_inr') || '1';
  const botUsername = (await bot.getMe()).username;

  const text =
`👤 *YOUR PROFILE*
━━━━━━━━━━━━━━━━━━━━

*Account Information*
👤 ${u.full_name}
🆔 ${u.user_id}
📅 Joined ${utils.formatDateTime(u.joined_at)}

*Wallet*
💰 Balance: $${balanceUsdt.toFixed(2)} • ₹${u.balance_inr.toFixed(0)}
📥 Deposited: $${depositedUsdt.toFixed(2)} • ₹${u.total_deposited.toFixed(0)}
🛍️ Spent: $${spentUsdt.toFixed(2)} • ₹${u.total_spent.toFixed(0)}
🛒 Purchases: ${u.total_purchases}

*Referral Program*
👥 Referrals: ${u.referral_count}
💰 Earned: $${earnedUsdt.toFixed(2)} • ₹${u.referral_earned.toFixed(0)}
💡 Reward: ₹${refReward} per validated join

*Your Referral Link:*
https://t.me/${botUsername}?start=ref_${userId}

_Share your link — earn ₹${refReward} when they join!_`;

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: utils.getBackKeyboard() });
}

// ─────────────────────────────────────────
// Deposit
// ─────────────────────────────────────────
async function showDepositMenu(userId, messageId) {
  const upiOn = (await db.getSetting('upi_enabled')) === '1';
  const bnbOn = (await db.getSetting('bnb_enabled')) === '1';
  const fampayOn = (await db.getSetting('fampay_enabled')) === '1';

  const keyboard = [];
  if (upiOn || fampayOn) keyboard.push([{ text: '📱 UPI QR Code', callback_data: 'deposit_upi' }]);
  if (bnbOn) keyboard.push([{ text: '🟡 BNB Smart Chain (BEP20)', callback_data: 'deposit_bnb' }]);
  keyboard.push([{ text: '🏠 Main Menu', callback_data: 'main_menu' }]);

  if (keyboard.length <= 1) {
    return bot.editMessageText('⚠️ No payment methods available right now.\n\nPlease contact support.', {
      chat_id: userId, message_id: messageId, reply_markup: utils.getBackKeyboard()
    });
  }

  bot.editMessageText('💰 *Select Payment Method:*', {
    chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard }
  });
}

async function showUpiOptions(userId, messageId) {
  const minDep = await db.getSetting('min_deposit_inr') || '20';
  const keyboard = [];

  if ((await db.getSetting('upi_enabled')) === '1') {
    keyboard.push([
      { text: '📱 GPay', callback_data: 'upi_app_gpay' },
      { text: '💳 FamPay', callback_data: 'upi_app_fampay' },
      { text: '📲 Any UPI', callback_data: 'upi_app_any' }
    ]);
  }
  keyboard.push([{ text: '« Back', callback_data: 'deposit' }]);

  const text = `📱 *UPI Payment*\n\n✅ Minimum: ₹${minDep}\n⚠️ Manual verification after screenshot\n\nChoose your UPI app:`;

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

async function askDepositAmount(userId, messageId, upiApp) {
  const minDep = await db.getSetting('min_deposit_inr') || '20';
  const appNames = { gpay: 'GPay', fampay: 'FamPay', any: 'UPI' };
  const appName = appNames[upiApp] || 'UPI';

  const state = getState(userId);
  state.waitingDepositAmount = true;
  state.upiApp = upiApp;

  bot.editMessageText(
    `📱 *${appName} Payment*\n\n✅ Minimum: ₹${minDep}\n\nEnter amount in ₹ (minimum ₹${minDep}):`,
    { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '« Back', callback_data: 'deposit_upi' }]] } }
  );
}

async function showBnbDeposit(userId, messageId) {
  const bnbAddress = await db.getSetting('bnb_address') || 'YOUR_BNB_ADDRESS';
  const refId = utils.generateRefId(userId);

  const text =
`🟡 *BNB Smart Chain (BEP20) Deposit*

Send *USDT (BEP20)* to:
\`${bnbAddress}\`

📝 Ref ID: \`${refId}\`

⚠️ Send only BEP20 USDT
✅ Balance will be added after confirmation`;

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: utils.getBackKeyboard('deposit') });
}

// ─────────────────────────────────────────
// Refer & Earn
// ─────────────────────────────────────────
async function showReferral(userId, messageId) {
  const refEnabled = (await db.getSetting('referral_enabled')) === '1';

  if (!refEnabled) {
    return bot.editMessageText('🎁 *Referral Program*\n\n❌ Referral program is currently disabled.\n\nCheck back soon!', {
      chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: utils.getBackKeyboard()
    });
  }

  const u = await db.getUser(userId);
  const refReward = await db.getSetting('referral_reward_inr') || '1';
  const earnedUsdt = await utils.inrToUsdt(u.referral_earned);
  const botUsername = (await bot.getMe()).username;
  const refLink = `https://t.me/${botUsername}?start=ref_${userId}`;

  const text =
`🎁 *Refer & Earn*

👥 Referrals: ${u.referral_count}
💰 Total Earned: $${earnedUsdt.toFixed(2)} • ₹${u.referral_earned.toFixed(0)}
💡 Reward: ₹${refReward} per validated join

*Your Referral Link:*
\`${refLink}\`

_Share your link and earn ₹${refReward} for every person who joins!_`;

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: utils.getBackKeyboard() });
}

// ─────────────────────────────────────────
// Support
// ─────────────────────────────────────────
async function showSupport(userId, messageId) {
  const supportLink = await db.getSetting('support_link') || config.SUPPORT_LINK;

  const text =
`🟢 *Support & Relevant Information*

⚠️ All purchases made are final — no refunds or replacements will be provided under any circumstances, and all products are bought entirely at the buyer's own risk.`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '📞 Contact Support', url: supportLink }],
      [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
    ]
  };

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard });
}

// ─────────────────────────────────────────
// Text & Photo messages (deposit amount + screenshot)
// ─────────────────────────────────────────
bot.on('message', async (msg) => {
  const userId = msg.from.id;
  if (msg.text && msg.text.startsWith('/')) return; // skip commands
  if (await utils.isUserBanned(userId)) return;

  const state = getState(userId);

  if (state.waitingDepositAmount && msg.text) {
    return handleDepositAmount(userId, msg.text.trim());
  }

  if (state.waitingScreenshot && msg.photo) {
    return handleScreenshot(userId, msg.photo);
  }
});

async function handleDepositAmount(userId, text) {
  const amount = parseFloat(text);
  if (isNaN(amount)) return bot.sendMessage(userId, '❌ Please enter a valid number.');

  const minDep = parseFloat(await db.getSetting('min_deposit_inr')) || 20;
  if (amount < minDep) return bot.sendMessage(userId, `❌ Minimum deposit is ₹${minDep.toFixed(0)}`);

  const state = getState(userId);
  state.waitingDepositAmount = false;
  const upiApp = state.upiApp || 'any';
  const appNames = { gpay: 'GPay', fampay: 'FamPay', any: 'UPI' };
  const appName = appNames[upiApp] || 'UPI';

  const qr = await db.getActiveQR('upi', upiApp);
  const upiId = await db.getSetting('upi_id') || 'yourname@upi';
  const refId = utils.generateRefId(userId);
  const amountUsdt = await utils.inrToUsdt(amount);

  await db.getDB().run(
    'INSERT INTO deposits (user_id, amount_inr, ref_id, payment_method, upi_app) VALUES (?, ?, ?, ?, ?)',
    userId, amount, refId, 'upi', upiApp
  );

  state.currentRefId = refId;
  state.waitingScreenshot = true;

  const text2 =
`⚡ Scan The Above QR Code to Pay:
₹${amount.toFixed(0)} ($${amountUsdt.toFixed(2)} (~₹${amount.toFixed(0)}))

📝 Ref ID: \`${refId}\`
💳 UPI ID: \`${upiId}\`

👉 Open *${appNam
