const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const db = require('./database');
const utils = require('./utils');

const bot = new TelegramBot(config.USER_BOT_TOKEN, { polling: true });

const userState = {};

function getState(userId) {
  if (!userState[userId]) userState[userId] = {};
  return userState[userId];
}

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const userId = msg.from.id;
  const username = msg.from.username || '';
  const fullName = (msg.from.first_name || '') + ' ' + (msg.from.last_name || '');

  if (await utils.isUserBanned(userId)) {
    return bot.sendMessage(userId, '🚫 You have been banned from using this bot.');
  }

  let referredBy = null;
  const arg = match && match[1];
  if (arg && arg.indexOf('ref_') === 0) {
    const refUid = parseInt(arg.replace('ref_', ''));
    if (refUid && refUid !== userId) referredBy = refUid;
  }

  let dbUser = await db.getUser(userId);
  if (!dbUser) {
    await db.createUser(userId, username, fullName.trim(), referredBy);
    dbUser = await db.getUser(userId);
  }

  if (!dbUser.terms_accepted) {
    return sendTermsMessage(userId);
  }

  await showMainMenu(userId);
});

async function sendTermsMessage(userId) {
  const groupLink = await db.getSetting('group_link') || config.GROUP_LINK;
  const channelLink = await db.getSetting('channel_link') || config.CHANNEL_LINK;
  const botName = await db.getSetting('bot_name') || config.BOT_NAME;

  const lines = [];
  lines.push('👋 *Welcome to ' + botName + '!*');
  lines.push('');
  lines.push('To start using the bot, please complete these steps:');
  lines.push('');
  lines.push('📋 *Step 1 — Our Rules:*');
  lines.push('🔒 Accounts & sessions are sold as-is — keep your files secure');
  lines.push('⏰ Log in one account at a time, wait 2–3 min between each');
  lines.push('🚫 No spam or mass messaging — misused accounts may freeze');
  lines.push('💰 Failed OTPs are auto-refunded to your balance');
  lines.push('🎁 One genuine account per person — fake referrals void rewards');
  lines.push('');
  lines.push('📢 *Step 2 — Join our community:*');
  lines.push('📢 Channel');
  lines.push('👥 Group');
  lines.push('');
  lines.push('Tap the join buttons above, then review and accept the terms below 👇');

  const text = lines.join('\n');

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
  const lines = [];
  lines.push('📋 *Terms & Conditions*');
  lines.push('');
  lines.push('Please read and accept before using the bot. This keeps your purchases protected and your account safe.');
  lines.push('');
  lines.push('🔒 Accounts & sessions are sold *as-is*. Keep your files secure and never share them.');
  lines.push('');
  lines.push('⏰ Log in *one account at a time*, waiting 2–3 minutes between each. Rushing gets accounts frozen.');
  lines.push('');
  lines.push('🚫 No spam, mass messaging, or abuse. Misused accounts may freeze — that is *not our responsibility*.');
  lines.push('');
  lines.push('💰 Refunds apply only as described at purchase. *Failed OTPs are auto-refunded* to your balance.');
  lines.push('');
  lines.push('🎁 One genuine account per person. *Fake or duplicate referrals void all rewards.*');
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('Do you accept these terms?');

  const text = lines.join('\n');

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

async function showMainMenu(userId, messageId) {
  if (typeof messageId === 'undefined') messageId = null;

  const refEnabled = (await db.getSetting('referral_enabled')) === '1';
  const refReward = await db.getSetting('referral_reward_inr') || '1';
  const me = await bot.getMe();
  const botUsername = me.username;
  const refLink = 'https://t.me/' + botUsername + '?start=ref_' + userId;

  let text = '🏠 Use the menu below to get started →';
  if (refEnabled) {
    const lines = [];
    lines.push('🎁 *Earn Money!*');
    lines.push('Refer friends and get ₹' + refReward + ' when they join!');
    lines.push('🔗 ' + refLink);
    lines.push('');
    lines.push('Use the menu below to get started →');
    text = lines.join('\n');
  }

  const keyboard = utils.getMainMenuKeyboard();

  if (messageId) {
    bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard }).catch(function () {
      bot.sendMessage(userId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
    });
  } else {
    bot.sendMessage(userId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const data = query.data;
  const messageId = query.message.message_id;

  bot.answerCallbackQuery(query.id).catch(function () {});

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
    } else if (data.indexOf('buy_item_') === 0) {
      await showPurchaseConfirm(userId, messageId, parseInt(data.replace('buy_item_', '')));
    } else if (data.indexOf('confirm_buy_') === 0) {
      await processPurchase(userId, messageId, parseInt(data.replace('confirm_buy_', '')));
    } else if (data === 'deposit_upi') {
      await showUpiOptions(userId, messageId);
    } else if (data === 'deposit_bnb') {
      await showBnbDeposit(userId, messageId);
    } else if (data.indexOf('upi_app_') === 0) {
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
      const rewardText = '🎁 *Referral Reward!*\n\nSomeone joined using your link!\n✅ ₹' + reward.toFixed(0) + ' added to your wallet!';
      bot.sendMessage(dbUser.referred_by, rewardText, { parse_mode: 'Markdown' }).catch(function () {});
    }
  }

  bot.editMessageText("✅ *You're all set!*\n\nTerms accepted successfully.", {
    chat_id: userId, message_id: messageId, parse_mode: 'Markdown'
  }).then(function () {
    showMainMenu(userId);
  });
}

async function showProducts(userId, messageId) {
  const products = await db.getActiveProducts();
  const rate = parseFloat(await db.getSetting('usdt_to_inr_rate')) || 90;

  if (!products.length) {
    return bot.editMessageText('📦 No products available right now.\n\nCheck back soon!', {
      chat_id: userId, message_id: messageId, reply_markup: utils.getBackKeyboard()
    });
  }

  let text = '✨ *Select Product*\n⚡ Rate: 1 USDT = ₹' + rate.toFixed(1) + '\n\n';
  const keyboard = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const usdt = await utils.inrToUsdt(p.price_inr);
    text += '📦 ' + p.name + ' | $' + usdt.toFixed(2) + ' • ₹' + p.price_inr.toFixed(0) + ' | ' + p.stock + ' In Stock\n';
    keyboard.push([{ text: '📦 ' + p.name + ' | ₹' + p.price_inr.toFixed(0), callback_data: 'buy_item_' + p.id }]);
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

  const lines = [];
  lines.push('🛒 *PURCHASE CONFIRMATION*');
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('📦 *' + product.name + '*');
  lines.push('');
  lines.push(product.description || 'Premium Digital Product');
  lines.push('');
  lines.push('*Payment:*');
  lines.push('💰 Price: $' + usdtPrice.toFixed(2) + ' • ₹' + price.toFixed(0));
  lines.push('💳 Balance: $' + usdtBalance.toFixed(2) + ' • ₹' + balance.toFixed(0));
  lines.push(balanceStatus);
  lines.push('');
  lines.push('✅ Please use Telegram X.');
  lines.push('🚫 We are not responsible for any freeze/ban');

  const text = lines.join('\n');

  const keyboard = [];
  if (balance >= price) keyboard.push([{ text: '✅ Confirm & Buy', callback_data: 'confirm_buy_' + productId }]);
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

  const text = '✅ *Purchase Successful!*\n\n📦 *' + product.name + '*\n\n*Your Product:*\n`' + product.content + '`\n\nKeep this safe! 🔒';

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: utils.getBackKeyboard() });
}

async function showProfile(userId, messageId) {
  const u = await db.getUser(userId);
  if (!u) return;

  const balanceUsdt = await utils.inrToUsdt(u.balance_inr);
  const depositedUsdt = await utils.inrToUsdt(u.total_deposited);
  const spentUsdt = await utils.inrToUsdt(u.total_spent);
  const earnedUsdt = await utils.inrToUsdt(u.referral_earned);
  const refReward = await db.getSetting('referral_reward_inr') || '1';
  const me = await bot.getMe();
  const botUsername = me.username;

  const lines = [];
  lines.push('👤 *YOUR PROFILE*');
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('*Account Information*');
  lines.push('👤 ' + u.full_name);
  lines.push('🆔 ' + u.user_id);
  lines.push('📅 Joined ' + utils.formatDateTime(u.joined_at));
  lines.push('');
  lines.push('*Wallet*');
  lines.push('💰 Balance: $' + balanceUsdt.toFixed(2) + ' • ₹' + u.balance_inr.toFixed(0));
  lines.push('📥 Deposited: $' + depositedUsdt.toFixed(2) + ' • ₹' + u.total_deposited.toFixed(0));
  lines.push('🛍️ Spent: $' + spentUsdt.toFixed(2) + ' • ₹' + u.total_spent.toFixed(0));
  lines.push('🛒 Purchases: ' + u.total_purchases);
  lines.push('');
  lines.push('*Referral Program*');
  lines.push('👥 Referrals: ' + u.referral_count);
  lines.push('💰 Earned: $' + earnedUsdt.toFixed(2) + ' • ₹' + u.referral_earned.toFixed(0));
  lines.push('💡 Reward: ₹' + refReward + ' per validated join');
  lines.push('');
  lines.push('*Your Referral Link:*');
  lines.push('https://t.me/' + botUsername + '?start=ref_' + userId);
  lines.push('');
  lines.push('_Share your link — earn ₹' + refReward + ' when they join!_');

  const text = lines.join('\n');

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: utils.getBackKeyboard() });
}

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

  const text = '📱 *UPI Payment*\n\n✅ Minimum: ₹' + minDep + '\n⚠️ Manual verification after screenshot\n\nChoose your UPI app:';

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

async function askDepositAmount(userId, messageId, upiApp) {
  const minDep = await db.getSetting('min_deposit_inr') || '20';
  const appNames = { gpay: 'GPay', fampay: 'FamPay', any: 'UPI' };
  const appName = appNames[upiApp] || 'UPI';

  const state = getState(userId);
  state.waitingDepositAmount = true;
  state.upiApp = upiApp;

  const text = '📱 *' + appName + ' Payment*\n\n✅ Minimum: ₹' + minDep + '\n\nEnter amount in ₹ (minimum ₹' + minDep + '):';

  bot.editMessageText(text, {
    chat_id: userId, message_id: messageId, parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '« Back', callback_data: 'deposit_upi' }]] }
  });
}

async function showBnbDeposit(userId, messageId) {
  const bnbAddress = await db.getSetting('bnb_address') || 'YOUR_BNB_ADDRESS';
  const refId = utils.generateRefId(userId);

  const lines = [];
  lines.push('🟡 *BNB Smart Chain (BEP20) Deposit*');
  lines.push('');
  lines.push('Send *USDT (BEP20)* to:');
  lines.push('`' + bnbAddress + '`');
  lines.push('');
  lines.push('📝 Ref ID: `' + refId + '`');
  lines.push('');
  lines.push('⚠️ Send only BEP20 USDT');
  lines.push('✅ Balance will be added after confirmation');

  const text = lines.join('\n');

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: utils.getBackKeyboard('deposit') });
}

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
  const me = await bot.getMe();
  const botUsername = me.username;
  const refLink = 'https://t.me/' + botUsername + '?start=ref_' + userId;

  const lines = [];
  lines.push('🎁 *Refer & Earn*');
  lines.push('');
  lines.push('👥 Referrals: ' + u.referral_count);
  lines.push('💰 Total Earned: $' + earnedUsdt.toFixed(2) + ' • ₹' + u.referral_earned.toFixed(0));
  lines.push('💡 Reward: ₹' + refReward + ' per validated join');
  lines.push('');
  lines.push('*Your Referral Link:*');
  lines.push('`' + refLink + '`');
  lines.push('');
  lines.push('_Share your link and earn ₹' + refReward + ' for every person who joins!_');

  const text = lines.join('\n');

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: utils.getBackKeyboard() });
}

async function showSupport(userId, messageId) {
  const supportLink = await db.getSetting('support_link') || config.SUPPORT_LINK;

  const text = '🟢 *Support & Relevant Information*\n\n⚠️ All purchases made are final — no refunds or replacements will be provided under any circumstances, and all products are bought entirely at the buyer\'s own risk.';

  const keyboard = {
    inline_keyboard: [
      [{ text: '📞 Contact Support', url: supportLink }],
      [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
    ]
  };

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard });
}

bot.on('message', async (msg) => {
  const userId = msg.from.id;
  if (msg.text && msg.text.indexOf('/') === 0) return;
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

  const minDep = parseFloat(await db.getSetting('min_d
