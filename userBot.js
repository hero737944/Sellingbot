const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const db = require('./database');
const utils = require('./utils');

const bot = new TelegramBot(
  config.USER_BOT_TOKEN,
  { polling: true }
);

const userState = {};

function getState(userId) {
  if (!userState[userId]) {
    userState[userId] = {};
  }
  return userState[userId];
}

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const userId = msg.from.id;
  const username = msg.from.username || '';
  const firstName = msg.from.first_name || '';
  const lastName = msg.from.last_name || '';
  const fullName = (firstName + ' ' + lastName).trim();

  const banned = await utils.isUserBanned(userId);
  if (banned) {
    bot.sendMessage(
      userId,
      '🚫 You have been banned from using this bot.'
    );
    return;
  }

  let referredBy = null;
  const arg = match && match[1];
  if (arg && arg.indexOf('ref_') === 0) {
    const refIdStr = arg.replace('ref_', '');
    const refUid = parseInt(refIdStr);
    if (refUid && refUid !== userId) {
      referredBy = refUid;
    }
  }

  let dbUser = await db.getUser(userId);
  if (!dbUser) {
    await db.createUser(
      userId,
      username,
      fullName,
      referredBy
    );
    dbUser = await db.getUser(userId);
  }

  if (!dbUser.terms_accepted) {
    sendTermsMessage(userId);
    return;
  }

  await showMainMenu(userId);
});

async function sendTermsMessage(userId) {
  const groupSetting = await db.getSetting('group_link');
  const groupLink = groupSetting || config.GROUP_LINK;

  const channelSetting = await db.getSetting('channel_link');
  const channelLink = channelSetting || config.CHANNEL_LINK;

  const nameSetting = await db.getSetting('bot_name');
  const botName = nameSetting || config.BOT_NAME;

  const lines = [];
  lines.push('👋 Welcome to ' + botName + '!');
  lines.push('');
  lines.push('To start using the bot, please complete these steps:');
  lines.push('');
  lines.push('Step 1 - Our Rules:');
  lines.push('Accounts and sessions are sold as-is - keep your files secure');
  lines.push('Log in one account at a time, wait 2-3 min between each');
  lines.push('No spam or mass messaging - misused accounts may freeze');
  lines.push('Failed OTPs are auto-refunded to your balance');
  lines.push('One genuine account per person - fake referrals void rewards');
  lines.push('');
  lines.push('Step 2 - Join our community:');
  lines.push('Channel');
  lines.push('Group');
  lines.push('');
  lines.push('Tap the join buttons above, then review and accept the terms below');

  const text = lines.join('\n');

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Join Channel', url: channelLink }],
      [{ text: 'Join Group', url: groupLink }],
      [{ text: 'Review Terms and Conditions', callback_data: 'show_terms' }]
    ]
  };

  bot.sendMessage(userId, text, {
    reply_markup: keyboard
  });
}

async function sendTermsDetail(userId, messageId) {
  const lines = [];
  lines.push('Terms and Conditions');
  lines.push('');
  lines.push('Please read and accept before using the bot.');
  lines.push('This keeps your purchases protected and your account safe.');
  lines.push('');
  lines.push('Accounts and sessions are sold as-is.');
  lines.push('Keep your files secure and never share them.');
  lines.push('');
  lines.push('Log in one account at a time, waiting 2-3 minutes between each.');
  lines.push('Rushing gets accounts frozen.');
  lines.push('');
  lines.push('No spam, mass messaging, or abuse.');
  lines.push('Misused accounts may freeze - that is not our responsibility.');
  lines.push('');
  lines.push('Refunds apply only as described at purchase.');
  lines.push('Failed OTPs are auto-refunded to your balance.');
  lines.push('');
  lines.push('One genuine account per person.');
  lines.push('Fake or duplicate referrals void all rewards.');
  lines.push('');
  lines.push('Do you accept these terms?');

  const text = lines.join('\n');

  const keyboard = {
    inline_keyboard: [
      [{ text: 'I Accept and Continue', callback_data: 'accept_terms' }],
      [{ text: 'Decline', callback_data: 'decline_terms' }]
    ]
  };

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: keyboard
  });
}

async function showMainMenu(userId, messageId) {
  if (typeof messageId === 'undefined') {
    messageId = null;
  }

  const refSetting = await db.getSetting('referral_enabled');
  const refEnabled = refSetting === '1';

  const rewardSetting = await db.getSetting('referral_reward_inr');
  const refReward = rewardSetting || '1';

  const me = await bot.getMe();
  const botUsername = me.username;
  const refLink = 'https://t.me/' + botUsername + '?start=ref_' + userId;

  let text = 'Use the menu below to get started';

  if (refEnabled) {
    const lines = [];
    lines.push('Earn Money!');
    lines.push('Refer friends and get Rs ' + refReward + ' when they join!');
    lines.push(refLink);
    lines.push('');
    lines.push('Use the menu below to get started');
    text = lines.join('\n');
  }

  const keyboard = utils.getMainMenuKeyboard();

  if (messageId) {
    try {
      await bot.editMessageText(text, {
        chat_id: userId,
        message_id: messageId,
        reply_markup: keyboard
      });
    } catch (e) {
      bot.sendMessage(userId, text, {
        reply_markup: keyboard
      });
    }
  } else {
    bot.sendMessage(userId, text, {
      reply_markup: keyboard
    });
  }
}

bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const data = query.data;
  const messageId = query.message.message_id;

  try {
    await bot.answerCallbackQuery(query.id);
  } catch (e) {
    console.error('answerCallbackQuery error');
  }

  const banned = await utils.isUserBanned(userId);
  if (banned) {
    bot.sendMessage(userId, 'You are banned.');
    return;
  }

  try {
    if (data === 'show_terms') {
      await sendTermsDetail(userId, messageId);
    } else if (data === 'accept_terms') {
      await handleAcceptTerms(userId, messageId);
    } else if (data === 'decline_terms') {
      const msg = 'You must accept the terms to use this bot. Send /start to try again.';
      await bot.editMessageText(msg, {
        chat_id: userId,
        message_id: messageId
      });
    } else if (data === 'main_menu') {
      await showMainMenu(userId, messageId);
    } else if (data === 'buy_product') {
      await showProducts(userId, messageId);
    } else if (data === 'buy_sessions') {
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
      const idStr = data.replace('buy_item_', '');
      const productId = parseInt(idStr);
      await showPurchaseConfirm(userId, messageId, productId);
    } else if (data.indexOf('confirm_buy_') === 0) {
      const idStr = data.replace('confirm_buy_', '');
      const productId = parseInt(idStr);
      await processPurchase(userId, messageId, productId);
    } else if (data === 'deposit_upi') {
      await showUpiOptions(userId, messageId);
    } else if (data === 'deposit_bnb') {
      await showBnbDeposit(userId, messageId);
    } else if (data.indexOf('upi_app_') === 0) {
      const app = data.replace('upi_app_', '');
      const state = getState(userId);
      state.upiApp = app;
      await askDepositAmount(userId, messageId, app);
    } else if (data === 'i_have_paid') {
      askPaymentScreenshot(userId);
    } else if (data === 'cancel_deposit') {
      await bot.editMessageText('Deposit cancelled.', {
        chat_id: userId,
        message_id: messageId,
        reply_markup: utils.getBackKeyboard()
      });
    }
  } catch (err) {
    console.error('Callback error:', err);
  }
});

async function handleAcceptTerms(userId, messageId) {
  const database = db.getDB();
  await database.run(
    'UPDATE users SET terms_accepted = 1 WHERE user_id = ?',
    userId
  );

  const dbUser = await db.getUser(userId);

  if (dbUser && dbUser.referred_by) {
    const refSetting = await db.getSetting('referral_enabled');
    const refEnabled = refSetting === '1';

    if (refEnabled) {
      const rewardSetting = await db.getSetting('referral_reward_inr');
      const reward = parseFloat(rewardSetting) || 1.0;

      await database.run(
        'UPDATE users SET balance_inr = balance_inr + ?, referral_earned = referral_earned + ?, referral_count = referral_count + 1 WHERE user_id = ?',
        reward,
        reward,
        dbUser.referred_by
      );

      const rewardLines = [];
      rewardLines.push('Referral Reward!');
      rewardLines.push('');
      rewardLines.push('Someone joined using your link!');
      rewardLines.push('Rs ' + reward.toFixed(0) + ' added to your wallet!');
      const rewardText = rewardLines.join('\n');

      try {
        await bot.sendMessage(dbUser.referred_by, rewardText);
      } catch (e) {
        console.error('referral notify failed');
      }
    }
  }

  const successText = "You're all set! Terms accepted successfully.";

  await bot.editMessageText(successText, {
    chat_id: userId,
    message_id: messageId
  });

  await showMainMenu(userId);
}

async function showProducts(userId, messageId) {
  const products = await db.getActiveProducts();

  const rateSetting = await db.getSetting('usdt_to_inr_rate');
  const rate = parseFloat(rateSetting) || 90;

  if (!products.length) {
    await bot.editMessageText('No products available right now. Check back soon!', {
      chat_id: userId,
      message_id: messageId,
      reply_markup: utils.getBackKeyboard()
    });
    return;
  }

  const lines = [];
  lines.push('Select Product');
  lines.push('Rate: 1 USDT = Rs ' + rate.toFixed(1));
  lines.push('');

  const keyboard = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const usdt = await utils.inrToUsdt(p.price_inr);

    const line = p.name + ' | $' + usdt.toFixed(2) + ' / Rs ' + p.price_inr.toFixed(0) + ' | ' + p.stock + ' In Stock';
    lines.push(line);

    const btnText = p.name + ' | Rs ' + p.price_inr.toFixed(0);
    keyboard.push([{ text: btnText, callback_data: 'buy_item_' + p.id }]);
  }

  keyboard.push([{ text: 'Main Menu', callback_data: 'main_menu' }]);

  const text = lines.join('\n');

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function showPurchaseConfirm(userId, messageId, productId) {
  const database = db.getDB();
  const product = await database.get(
    'SELECT * FROM products WHERE id = ?',
    productId
  );

  if (!product) {
    await bot.editMessageText('Product not found.', {
      chat_id: userId,
      message_id: messageId,
      reply_markup: utils.getBackKeyboard()
    });
    return;
  }

  const dbUser = await db.getUser(userId);
  const balance = dbUser.balance_inr;
  const price = product.price_inr;

  const usdtPrice = await utils.inrToUsdt(price);
  const usdtBalance = await utils.inrToUsdt(balance);

  let balanceStatus = 'Sufficient';
  if (balance < price) {
    balanceStatus = 'Insufficient balance! Please deposit first.';
  }

  const lines = [];
  lines.push('PURCHASE CONFIRMATION');
  lines.push('');
  lines.push(product.name);
  lines.push('');
  lines.push(product.description || 'Premium Digital Product');
  lines.push('');
  lines.push('Payment:');
  lines.push('Price: $' + usdtPrice.toFixed(2) + ' / Rs ' + price.toFixed(0));
  lines.push('Balance: $' + usdtBalance.toFixed(2) + ' / Rs ' + balance.toFixed(0));
  lines.push(balanceStatus);
  lines.push('');
  lines.push('Please use Telegram X.');
  lines.push('We are not responsible for any freeze/ban');

  const text = lines.join('\n');

  const keyboard = [];

  if (balance >= price) {
    keyboard.push([{
      text: 'Confirm and Buy',
      callback_data: 'confirm_buy_' + productId
    }]);
  }

  keyboard.push([
    { text: 'Back', callback_data: 'buy_product' },
    { text: 'Cancel', callback_data: 'main_menu' }
  ]);

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function processPurchase(userId, messageId, productId) {
  const database = db.getDB();

  const product = await database.get(
    'SELECT * FROM products WHERE id = ? AND stock > 0',
    productId
  );

  if (!product) {
    await bot.editMessageText('Product out of stock!', {
      chat_id: userId,
      message_id: messageId,
      reply_markup: utils.getBackKeyboard()
    });
    return;
  }

  const dbUser = await db.getUser(userId);

  if (dbUser.balance_inr < product.price_inr) {
    await bot.editMessageText('Insufficient balance!', {
      chat_id: userId,
      message_id: messageId,
      reply_markup: utils.getBackKeyboard()
    });
    return;
  }

  await db.deductUserBalance(userId, product.price_inr);

  await database.run(
    'UPDATE products SET stock = stock - 1 WHERE id = ?',
    productId
  );

  await database.run(
    'INSERT INTO purchases (user_id, product_id, amount_inr, content_delivered) VALUES (?, ?, ?, ?)',
    userId,
    productId,
    product.price_inr,
    product.content
  );

  const lines = [];
  lines.push('Purchase Successful!');
  lines.push('');
  lines.push(product.name);
  lines.push('');
  lines.push('Your Product:');
  lines.push(product.content);
  lines.push('');
  lines.push('Keep this safe!');

  const text = lines.join('\n');

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: utils.getBackKeyboard()
  });
}

async function showProfile(userId, messageId) {
  const u = await db.getUser(userId);
  if (!u) {
    return;
  }

  const balanceUsdt = await utils.inrToUsdt(u.balance_inr);
  const depositedUsdt = await utils.inrToUsdt(u.total_deposited);
  const spentUsdt = await utils.inrToUsdt(u.total_spent);
  const earnedUsdt = await utils.inrToUsdt(u.referral_earned);

  const rewardSetting = await db.getSetting('referral_reward_inr');
  const refReward = rewardSetting || '1';

  const me = await bot.getMe();
  const botUsername = me.username;

  const lines = [];
  lines.push('YOUR PROFILE');
  lines.push('');
  lines.push('Account Information');
  lines.push(u.full_name);
  lines.push('ID: ' + u.user_id);
  lines.push('Joined ' + utils.formatDateTime(u.joined_at));
  lines.push('');
  lines.push('Wallet');
  lines.push('Balance: $' + balanceUsdt.toFixed(2) + ' / Rs ' + u.balance_inr.toFixed(0));
  lines.push('Deposited: $' + depositedUsdt.toFixed(2) + ' / Rs ' + u.total_deposited.toFixed(0));
  lines.push('Spent: $' + spentUsdt.toFixed(2) + ' / Rs ' + u.total_spent.toFixed(0));
  lines.push('Purchases: ' + u.total_purchases);
  lines.push('');
  lines.push('Referral Program');
  lines.push('Referrals: ' + u.referral_count);
  lines.push('Earned: $' + earnedUsdt.toFixed(2) + ' / Rs ' + u.referral_earned.toFixed(0));
  lines.push('Reward: Rs ' + refReward + ' per validated join');
  lines.push('');
  lines.push('Your Referral Link:');
  lines.push('https://t.me/' + botUsername + '?start=ref_' + userId);
  lines.push('');
  lines.push('Share your link - earn Rs ' + refReward + ' when they join!');

  const text = lines.join('\n');

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: utils.getBackKeyboard()
  });
}

async function showDepositMenu(userId, messageId) {
  const upiSetting = await db.getSetting('upi_enabled');
  const upiOn = upiSetting === '1';

  const bnbSetting = await db.getSetting('bnb_enabled');
  const bnbOn = bnbSetting === '1';

  const fampaySetting = await db.getSetting('fampay_enabled');
  const fampayOn = fampaySetting === '1';

  const keyboard = [];

  if (upiOn || fampayOn) {
    keyboard.push([{ text: 'UPI QR Code', callback_data: 'deposit_upi' }]);
  }

  if (bnbOn) {
    keyboard.push([{ text: 'BNB Smart Chain (BEP20)', callback_data: 'deposit_bnb' }]);
  }

  keyboard.push([{ text: 'Main Menu', callback_data: 'main_menu' }]);

  if (keyboard.length <= 1) {
    await bot.editMessageText('No payment methods available right now. Please contact support.', {
      chat_id: userId,
      message_id: messageId,
      reply_markup: utils.getBackKeyboard()
    });
    return;
  }

  await bot.editMessageText('Select Payment Method:', {
    chat_id: userId,
    message_id: messageId,
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function showUpiOptions(userId, messageId) {
  const minSetting = await db.getSetting('min_deposit_inr');
  const minDep = minSetting || '20';

  const keyboard = [];

  const upiSetting = await db.getSetting('upi_enabled');
  if (upiSetting === '1') {
    keyboard.push([
      { text: 'GPay', callback_data: 'upi_app_gpay' },
      { text: 'FamPay', callback_data: 'upi_app_fampay' },
      { text: 'Any UPI', callback_data: 'upi_app_any' }
    ]);
  }

  keyboard.push([{ text: 'Back', callback_data: 'deposit' }]);

  const lines = [];
  lines.push('UPI Payment');
  lines.push('');
  lines.push('Minimum: Rs ' + minDep);
  lines.push('Manual verification after screenshot');
  lines.push('');
  lines.push('Choose your UPI app:');

  const text = lines.join('\n');

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function askDepositAmount(userId, messageId, upiApp) {
  const minSetting = await db.getSetting('min_deposit_inr');
  const minDep = minSetting || '20';

  const appNames = {
    gpay: 'GPay',
    fampay: 'FamPay',
    any: 'UPI'
  };
  const appName = appNames[upiApp] || 'UPI';

  const state = getState(userId);
  state.waitingDepositAmount = true;
  state.upiApp = upiApp;

  const lines = [];
  lines.push(appName + ' Payment');
  lines.push('');
  lines.push('Minimum: Rs ' + minDep);
  lines.push('');
  lines.push('Enter amount in Rs (minimum Rs ' + minDep + '):');

  const text = lines.join('\n');

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: [[{ text: 'Back', callback_data: 'deposit_upi' }]]
    }
  });
}

async function showBnbDeposit(userId, messageId) {
  const addrSetting = await db.getSetting('bnb_address');
  const bnbAddress = addrSetting || 'YOUR_BNB_ADDRESS';

  const refId = utils.generateRefId(userId);

  const lines = [];
  lines.push('BNB Smart Chain (BEP20) Deposit');
  lines.push('');
  lines.push('Send USDT (BEP20) to:');
  lines.push(bnbAddress);
  lines.push('');
  lines.push('Ref ID: ' + refId);
  lines.push('');
  lines.push('Send only BEP20 USDT');
  lines.push('Balance will be added after confirmation');

  const text = lines.join('\n');

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: utils.getBackKeyboard('deposit')
  });
}

async function showReferral(userId, messageId) {
  const refSetting = await db.getSetting('referral_enabled');
  const refEnabled = refSetting === '1';

  if (!refEnabled) {
    const offText = 'Referral Program is currently disabled. Check back soon!';
    await bot.editMessageText(offText, {
      chat_id: userId,
      message_id: messageId,
      reply_markup: utils.getBackKeyboard()
    });
    return;
  }

  const u = await db.getUser(userId);

  const rewardSetting = await db.getSetting('referral_reward_inr');
  const refReward = rewardSetting || '1';

  const earnedUsdt = await utils.inrToUsdt(u.referral_earned);

  const me = await bot.getMe();
  const botUsername = me.username;
  const refLink = 'https://t.me/' + botUsern
  ame + '?start=ref_' + userId;

  const lines = [];
  lines.push('Refer and Earn');
  lines.push('');
  lines.push('Referrals: ' + u.referral_count);
  lines.push('Total Earned: $' + earnedUsdt.toFixed(2) + ' / Rs ' + u.referral_earned.toFixed(0));
  lines.push('Reward: Rs ' + refReward + ' per validated join');
  lines.push('');
  lines.push('Your Referral Link:');
  lines.push(refLink);
  lines.push('');
  lines.push('Share your link and earn Rs ' + refReward + ' for every person who joins!');

  const text = lines.join('\n');

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: utils.getBackKeyboard()
  });
}

async function showSupport(userId, messageId) {
  const supportSetting = await db.getSetting('support_link');
  const supportLink = supportSetting || config.SUPPORT_LINK;

  const lines = [];
  lines.push('Support and Relevant Information');
  lines.push('');
  lines.push('All purchases made are final - no refunds or replacements will be provided under any circumstances, and all products are bought entirely at the buyer\'s own risk.');

  const text = lines.join('\n');

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Contact Support', url: supportLink }],
      [{ text: 'Main Menu', callback_data: 'main_menu' }]
    ]
  };

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: keyboard
  });
}

bot.on('message', async (msg) => {
  const userId = msg.from.id;

  if (msg.text && msg.text.indexOf('/') === 0) {
    return;
  }

  const banned = await utils.isUserBanned(userId);
  if (banned) {
    return;
  }

  const state = getState(userId);

  if (state.waitingDepositAmount && msg.text) {
    await handleDepositAmount(userId, msg.text.trim());
    return;
  }

  if (state.waitingScreenshot && msg.photo) {
    await handleScreenshot(userId, msg.photo);
    return;
  }
});

async function handleDepositAmount(userId, text) {
  const amount = parseFloat(text);

  if (isNaN(amount)) {
    await bot.sendMessage(userId, 'Please enter a valid number.');
    return;
  }

  const minSetting = await db.getSetting('min_deposit_inr');
  const minDep = parseFloat(minSetting) || 20;

  if (amount < minDep) {
    await bot.sendMessage(userId, 'Minimum deposit is Rs ' + minDep.toFixed(0));
    return;
  }

  const state = getState(userId);
  state.waitingDepositAmount = false;

  const upiApp = state.upiApp || 'any';

  const appNames = {
    gpay: 'GPay',
    fampay: 'FamPay',
    any: 'UPI'
  };
  const appName = appNames[upiApp] || 'UPI';

  const qr = await db.getActiveQR('upi', upiApp);

  const upiIdSetting = await db.getSetting('upi_id');
  const upiId = upiIdSetting || 'yourname@upi';

  const refId = utils.generateRefId(userId);
  const amountUsdt = await utils.inrToUsdt(amount);

  const database = db.getDB();
  await database.run(
    'INSERT INTO deposits (user_id, amount_inr, ref_id, payment_method, upi_app) VALUES (?, ?, ?, ?, ?)',
    userId,
    amount,
    refId,
    'upi',
    upiApp
  );

  state.currentRefId = refId;
  state.waitingScreenshot = true;

  const lines = [];
  lines.push('Scan The Above QR Code to Pay:');
  lines.push('Rs ' + amount.toFixed(0) + ' ($' + amountUsdt.toFixed(2) + ')');
  lines.push('');
  lines.push('Ref ID: ' + refId);
  lines.push('UPI ID: ' + upiId);
  lines.push('');
  lines.push('Open ' + appName + ' and scan the QR');
  lines.push('or manually enter UPI ID above');
  lines.push('Pay exactly Rs ' + amount.toFixed(0) + ' (Do Not Change The Amount)');
  lines.push("After Successful Payment Click 'I Have Paid' below");
  lines.push('');
  lines.push('The QR Code Is Only Valid For 15 Minutes!');

  const text2 = lines.join('\n');

  const keyboard = {
    inline_keyboard: [
      [{ text: 'I Have Paid', callback_data: 'i_have_paid' }],
      [{ text: 'Cancel Deposit', callback_data: 'cancel_deposit' }]
    ]
  };

  if (qr && qr.file_id) {
    await bot.sendPhoto(userId, qr.file_id, {
      caption: text2,
      reply_markup: keyboard
    });
  } else {
    const fallbackText = appName + ' Payment\n\n' + text2;
    await bot.sendMessage(userId, fallbackText, {
      reply_markup: keyboard
    });
  }
}

function askPaymentScreenshot(userId) {
  const state = getState(userId);
  state.waitingScreenshot = true;

  const lines = [];
  lines.push('Payment Noted!');
  lines.push('');
  lines.push('Please send a screenshot of your payment now.');
  lines.push('');
  lines.push('Send the screenshot image...');

  const text = lines.join('\n');

  bot.sendMessage(userId, text);
}

async function handleScreenshot(userId, photos) {
  const state = getState(userId);
  state.waitingScreenshot = false;

  const fileId = photos[photos.length - 1].file_id;
  const refId = state.currentRefId;

  const database = db.getDB();

  await database.run(
    'UPDATE deposits SET screenshot_file_id = ? WHERE ref_id = ?',
    fileId,
    refId
  );

  const deposit = await database.get(
    'SELECT * FROM deposits WHERE ref_id = ?',
    refId
  );

  const waitLines = [];
  waitLines.push('Please wait...');
  waitLines.push('');
  waitLines.push('Our team is reviewing your payment.');
  waitLines.push('You will be notified once approved!');
  const waitText = waitLines.join('\n');

  await bot.sendMessage(userId, waitText, {
    reply_markup: utils.getBackKeyboard()
  });

  if (deposit) {
    const dbUser = await db.getUser(userId);

    const adminLines = [];
    adminLines.push('New Deposit Request!');
    adminLines.push('');
    adminLines.push('User: ' + dbUser.full_name + ' (@' + (dbUser.username || 'N/A') + ')');
    adminLines.push('ID: ' + userId);
    adminLines.push('Amount: Rs ' + deposit.amount_inr.toFixed(0));
    adminLines.push('Ref ID: ' + refId);
    adminLines.push('Method: ' + (deposit.upi_app || 'UPI'));

    const adminText = adminLines.join('\n');

    const adminKeyboard = {
      inline_keyboard: [
        [
          { text: 'Approve', callback_data: 'adm_approve_' + refId },
          { text: 'Reject', callback_data: 'adm_reject_' + refId }
        ],
        [{ text: 'Send Message', callback_data: 'adm_msg_' + userId }]
      ]
    };

    try {
      await bot.sendPhoto(config.OWNER_ID, fileId, {
        caption: adminText,
        reply_markup: adminKeyboard
      });
    } catch (err) {
      console.error('Failed to notify admin:', err.message);
    }
  }
}

console.log('User bot loaded!');

module.exports = bot;
ame + '?start=ref_' + userId;

  const lines = [];
  lines.push('Refer and Earn');
  lines.push('');
  lines.push('Referrals: ' + u.referral_count);
  lines.push('Total Earned: $' + earnedUsdt.toFixed(2) + ' / Rs ' + u.referral_earned.toFixed(0));
  lines.push('Reward: Rs ' + refReward + ' per validated join');
  lines.push('');
  lines.push('Your Referral Link:');
  lines.push(refLink);
  lines.push('');
  lines.push('Share your link and earn Rs ' + refReward + ' for every person who joins!');

  const text = lines.join('\n');

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: utils.getBackKeyboard()
  });
}

async function showSupport(userId, messageId) {
  const supportSetting = await db.getSetting('support_link');
  const supportLink = supportSetting || config.SUPPORT_LINK;

  const lines = [];
  lines.push('Support and Relevant Information');
  lines.push('');
  lines.push('All purchases made are final - no refunds or replacements will be provided under any circumstances, and all products are bought entirely at the buyer own risk.');

  const text = lines.join('\n');

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Contact Support', url: supportLink }],
      [{ text: 'Main Menu', callback_data: 'main_menu' }]
    ]
  };

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: keyboard
  });
}

bot.on('message', async (msg) => {
  const userId = msg.from.id;

  if (msg.text && msg.text.indexOf('/') === 0) {
    return;
  }

  const banned = await utils.isUserBanned(userId);
  if (banned) {
    return;
  }

  const state = getState(userId);

  if (state.waitingDepositAmount && msg.text) {
    await handleDepositAmount(userId, msg.text.trim());
    return;
  }

  if (state.waitingScreenshot && msg.photo) {
    await handleScreenshot(userId, msg.photo);
    return;
  }
});

async function handleDepositAmount(userId, text) {
  const amount = parseFloat(text);

  if (isNaN(amount)) {
    await bot.sendMessage(userId, 'Please enter a valid number.');
    return;
  }

  const minSetting = await db.getSetting('min_deposit_inr');
  const minDep = parseFloat(minSetting) || 20;

  if (amount < minDep) {
    await bot.sendMessage(userId, 'Minimum deposit is Rs ' + minDep.toFixed(0));
    return;
  }

  const state = getState(userId);
  state.waitingDepositAmount = false;

  const upiApp = state.upiApp || 'any';

  const appNames = {
    gpay: 'GPay',
    fampay: 'FamPay',
    any: 'UPI'
  };
  const appName = appNames[upiApp] || 'UPI';

  const qrKeyMap = {
    gpay: 'qr_gpay',
    fampay: 'qr_fampay',
    any: 'qr_any',
    bnb: 'qr_bnb'
  };
  const qrKey = qrKeyMap[upiApp] || 'qr_any';
  const qrFileId = await db.getSetting(qrKey);

  const upiIdSetting = await db.getSetting('upi_id');
  const upiId = upiIdSetting || 'yourname@upi';

  const refId = utils.generateRefId(userId);
  const amountUsdt = await utils.inrToUsdt(amount);

  const database = db.getDB();
  await database.run(
    'INSERT INTO deposits (user_id, amount_inr, ref_id, payment_method, upi_app) VALUES (?, ?, ?, ?, ?)',
    userId,
    amount,
    refId,
    'upi',
    upiApp
  );

  state.currentRefId = refId;
  state.waitingScreenshot = true;

  const lines = [];
  lines.push('Scan The Above QR Code to Pay:');
  lines.push('Rs ' + amount.toFixed(0) + ' ($' + amountUsdt.toFixed(2) + ')');
  lines.push('');
  lines.push('Ref ID: ' + refId);
  lines.push('UPI ID: ' + upiId);
  lines.push('');
  lines.push('Open ' + appName + ' and scan the QR');
  lines.push('or manually enter UPI ID above');
  lines.push('Pay exactly Rs ' + amount.toFixed(0) + ' (Do Not Change The Amount)');
  lines.push("After Successful Payment Click 'I Have Paid' below");
  lines.push('');
  lines.push('The QR Code Is Only Valid For 15 Minutes!');

  const text2 = lines.join('\n');

  const keyboard = {
    inline_keyboard: [
      [{ text: 'I Have Paid', callback_data: 'i_have_paid' }],
      [{ text: 'Cancel Deposit', callback_data: 'cancel_deposit' }]
    ]
  };

  if (qrFileId) {
    await bot.sendPhoto(userId, qrFileId, {
      caption: text2,
      reply_markup: keyboard
    });
  } else {
    const fallbackText = appName + ' Payment\n\n' + text2;
    await bot.sendMessage(userId, fallbackText, {
      reply_markup: keyboard
    });
  }
}

function askPaymentScreenshot(userId) {
  const state = getState(userId);
  state.waitingScreenshot = true;

  const lines = [];
  lines.push('Payment Noted!');
  lines.push('');
  lines.push('Please send a screenshot of your payment now.');
  lines.push('');
  lines.push('Send the screenshot image...');

  const text = lines.join('\n');

  bot.sendMessage(userId, text);
}

async function handleScreenshot(userId, photos) {
  const state = getState(userId);
  state.waitingScreenshot = false;

  const fileId = photos[photos.length - 1].file_id;
  const refId = state.currentRefId;

  const database = db.getDB();

  await database.run(
    'UPDATE deposits SET screenshot_file_id = ? WHERE ref_id = ?',
    fileId,
    refId
  );

  const deposit = await database.get(
    'SELECT * FROM deposits WHERE ref_id = ?',
    refId
  );

  const waitLines = [];
  waitLines.push('Please wait...');
  waitLines.push('');
  waitLines.push('Our team is reviewing your payment.');
  waitLines.push('You will be notified once approved!');
  const waitText = waitLines.join('\n');

  await bot.sendMessage(userId, waitText, {
    reply_markup: utils.getBackKeyboard()
  });

  if (deposit) {
    const dbUser = await db.getUser(userId);

    const adminLines = [];
    adminLines.push('New Deposit Request!');
    adminLines.push('');
    adminLines.push('User: ' + dbUser.full_name + ' (@' + (dbUser.username || 'N/A') + ')');
    adminLines.push('ID: ' + userId);
    adminLines.push('Amount: Rs ' + deposit.amount_inr.toFixed(0));
    adminLines.push('Ref ID: ' + refId);
    adminLines.push('Method: ' + (deposit.upi_app || 'UPI'));

    const adminText = adminLines.join('\n');

    const adminKeyboard = {
      inline_keyboard: [
        [
          { text: 'Approve', callback_data: 'adm_approve_' + refId },
          { text: 'Reject', callback_data: 'adm_reject_' + refId }
        ],
        [{ text: 'Send Message', callback_data: 'adm_msg_' + userId }]
      ]
    };

    try {
      await bot.sendPhoto(config.OWNER_ID, fileId, {
        caption: adminText,
        reply_markup: adminKeyboard
      });
    } catch (err) {
      console.error('Failed to notify admin:', err.message);
    }
  }
}

console.log('User bot loaded!');

module.exports = bot;
