const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const db = require('./database');
const utils = require('./utils');

const bot = new TelegramBot(
  config.ADMIN_BOT_TOKEN,
  { polling: true }
);

let currentPassword = config.ADMIN_PASSWORD;
const authenticatedUsers = new Set();
const adminState = {};

function getState(userId) {
  if (!adminState[userId]) {
    adminState[userId] = {};
  }
  return adminState[userId];
}

function isOwner(userId) {
  return userId === config.OWNER_ID;
}

function adminBackKeyboard() {
  return {
    inline_keyboard: [[{ text: 'Back to Menu', callback_data: 'adm_menu' }]]
  };
}

async function notifyUserViaUserBot(chatId, text) {
  try {
    const url = 'https://api.telegram.org/bot' + config.USER_BOT_TOKEN + '/sendMessage';
    const payload = {
      chat_id: chatId,
      text: text
    };
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('notifyUserViaUserBot error:', err.message);
  }
}

bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;

  if (!isOwner(userId)) {
    await bot.sendMessage(userId, 'Unauthorized access.');
    return;
  }

  if (authenticatedUsers.has(userId)) {
    await showAdminMenu(userId);
    return;
  }

  const state = getState(userId);
  state.waitingPassword = true;

  await bot.sendMessage(userId, 'Admin Panel. Enter your password to continue:');
});

async function showAdminMenu(userId, messageId) {
  if (typeof messageId === 'undefined') {
    messageId = null;
  }

  const keyboard = {
    inline_keyboard: [
      [
        { text: 'Pending Deposits', callback_data: 'adm_deposits' },
        { text: 'Products', callback_data: 'adm_products' }
      ],
      [
        { text: 'Payment Methods', callback_data: 'adm_payments' },
        { text: 'Rate Settings', callback_data: 'adm_rate' }
      ],
      [
        { text: 'Referral Settings', callback_data: 'adm_referral' },
        { text: 'Users', callback_data: 'adm_users' }
      ],
      [
        { text: 'Links Settings', callback_data: 'adm_links' },
        { text: 'Stats', callback_data: 'adm_stats' }
      ],
      [
        { text: 'Broadcast', callback_data: 'adm_broadcast' },
        { text: 'Password Settings', callback_data: 'adm_password' }
      ]
    ]
  };

  const text = 'Admin Control Panel. Select an option to manage your store:';

  if (messageId) {
    try {
      await bot.editMessageText(text, {
        chat_id: userId,
        message_id: messageId,
        reply_markup: keyboard
      });
    } catch (e) {
      await bot.sendMessage(userId, text, {
        reply_markup: keyboard
      });
    }
  } else {
    await bot.sendMessage(userId, text, {
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

  if (!isOwner(userId) || !authenticatedUsers.has(userId)) {
    await bot.sendMessage(userId, 'Please /start and authenticate first.');
    return;
  }

  try {
    if (data === 'adm_menu') {
      await showAdminMenu(userId, messageId);
    } else if (data === 'adm_deposits') {
      await showPendingDeposits(userId, messageId);
    } else if (data === 'adm_products') {
      await showProductsMenu(userId, messageId);
    } else if (data === 'adm_payments') {
      await showPaymentMethods(userId, messageId);
    } else if (data === 'adm_rate') {
      await showRateSettings(userId, messageId);
    } else if (data === 'adm_referral') {
      await showReferralSettings(userId, messageId);
    } else if (data === 'adm_users') {
      await showUsersMenu(userId, messageId);
    } else if (data === 'adm_broadcast') {
      await startBroadcast(userId, messageId);
    } else if (data === 'adm_stats') {
      await showStats(userId, messageId);
    } else if (data === 'adm_password') {
      await showPasswordSettings(userId, messageId);
    } else if (data === 'adm_links') {
      await showLinksSettings(userId, messageId);
    } else if (data === 'adm_change_group') {
      const state = getState(userId);
      state.waitingGroupLink = true;
      await bot.sendMessage(userId, 'Enter new Group link:');
    } else if (data === 'adm_change_channel') {
      const state = getState(userId);
      state.waitingChannelLink = true;
      await bot.sendMessage(userId, 'Enter new Channel link:');
    } else if (data === 'adm_change_support') {
      const state = getState(userId);
      state.waitingSupportLink = true;
      await bot.sendMessage(userId, 'Enter new Support link:');
    } else if (data.indexOf('adm_approve_') === 0) {
      const refId = data.replace('adm_approve_', '');
      await approveDeposit(userId, refId);
    } else if (data.indexOf('adm_reject_') === 0) {
      const refId = data.replace('adm_reject_', '');
      await rejectDeposit(userId, refId);
    } else if (data.indexOf('adm_msg_') === 0) {
      const targetUserId = parseInt(data.replace('adm_msg_', ''));
      const state = getState(userId);
      state.sendMsgTo = targetUserId;
      state.waitingSendMsg = true;
      const txt = 'Send message to user ' + targetUserId + '. Type your message below:';
      await bot.sendMessage(userId, txt);
    } else if (data === 'adm_add_product') {
      await startAddProduct(userId);
    } else if (data.indexOf('adm_edit_product_') === 0) {
      const pid = parseInt(data.replace('adm_edit_product_', ''));
      await showEditProduct(userId, pid);
    } else if (data.indexOf('adm_del_product_') === 0) {
      const pid = parseInt(data.replace('adm_del_product_', ''));
      await deleteProduct(userId, pid);
    } else if (data.indexOf('adm_edit_field_') === 0) {
      const raw = data.replace('adm_edit_field_', '');
      const parts = raw.split('_');
      const pid = parseInt(parts[0]);
      const field = parts.slice(1).join('_');
      const state = getState(userId);
      state.editingProductId = pid;
      state.editingField = field;
      state.waitingProductEdit = true;
      const fieldNames = {
        name: 'Product Name',
        price_inr: 'Price (Rs)',
        stock: 'Stock Count',
        description: 'Description',
        content: 'Product Content'
      };
      const label = fieldNames[field] || field;
      await bot.sendMessage(userId, 'Enter new ' + label + ':');
    } else if (data === 'adm_toggle_upi') {
      await togglePayment(userId, messageId, 'upi_enabled');
    } else if (data === 'adm_toggle_bnb') {
      await togglePayment(userId, messageId, 'bnb_enabled');
    } else if (data === 'adm_toggle_fampay') {
      await togglePayment(userId, messageId, 'fampay_enabled');
    } else if (data === 'adm_toggle_referral') {
      const current = await db.getSetting('referral_enabled');
      const newVal = current === '1' ? '0' : '1';
      await db.setSetting('referral_enabled', newVal);
      await showReferralSettings(userId, messageId);
    } else if (data === 'adm_upi_settings') {
      await showUpiSettings(userId, messageId);
    } else if (data === 'adm_change_upi_id') {
      const state = getState(userId);
      state.waitingUpiId = true;
      await bot.sendMessage(userId, 'Enter new UPI ID:');
    } else if (data === 'adm_change_qr') {
      await showQrChangeMenu(userId, messageId);
    } else if (data.indexOf('adm_qr_method_') === 0) {
      const method = data.replace('adm_qr_method_', '');
      const state = getState(userId);
      state.qrUploadMethod = method;
      state.waitingQrUpload = true;
      const methodNames = {
        gpay: 'GPay',
        fampay: 'FamPay',
        any: 'Any UPI',
        bnb: 'BNB'
      };
      const label = methodNames[method] || method;
      await bot.sendMessage(userId, 'Upload new QR image for ' + label + '. Send the QR code photo now:');
    } else if (data === 'adm_set_rate') {
      const state = getState(userId);
      state.waitingRate = true;
      await bot.sendMessage(userId, 'Enter new USDT to INR rate (e.g., 90):');
    } else if (data === 'adm_set_ref_reward') {
      const state = getState(userId);
      state.waitingRefReward = true;
      await bot.sendMessage(userId, 'Enter new referral reward amount in Rs:');
    } else if (data.indexOf('adm_user_') === 0) {
      const uid = parseInt(data.replace('adm_user_', ''));
      await showUserDetail(userId, uid);
    } else if (data.indexOf('adm_ban_') === 0) {
      const uid = parseInt(data.replace('adm_ban_', ''));
      await toggleBanUser(userId, uid);
    } else if (data.indexOf('adm_restrict_') === 0) {
      const uid = parseInt(data.replace('adm_restrict_', ''));
      await toggleRestrictUser(userId, uid);
    } else if (data === 'adm_change_password') {
      const state = getState(userId);
      state.waitingNewPassword = true;
      await bot.sendMessage(userId, 'Enter new password:');
    }
  } catch (err) {
    console.error('Admin callback error:', err);
  }
});

async function showPendingDeposits(userId, messageId) {
  const deposits = await db.getPendingDeposits();

  if (!deposits.length) {
    await bot.editMessageText('Pending Deposits. No pending deposits!', {
      chat_id: userId,
      message_id: messageId,
      reply_markup: adminBackKeyboard()
    });
    return;
  }

  const lines = [];
  lines.push('Pending Deposits (' + deposits.length + ')');
  lines.push('');

  const keyboard = [];

  for (let i = 0; i < deposits.length; i++) {
    const dep = deposits[i];
    lines.push(dep.full_name + ' | Rs ' + dep.amount_inr.toFixed(0));
    lines.push('ID: ' + dep.user_id + ' | Ref: ' + dep.ref_id.substring(0, 20));
    lines.push('');

    keyboard.push([
      { text: 'Approve Rs ' + dep.amount_inr.toFixed(0), callback_data: 'adm_approve_' + dep.ref_id },
      { text: 'Reject', callback_data: 'adm_reject_' + dep.ref_id }
    ]);
    keyboard.push([
      { text: 'Msg ' + dep.full_name, callback_data: 'adm_msg_' + dep.user_id }
    ]);
  }
  keyboard.push([{ text: 'Back', callback_data: 'adm_menu' }]);

  const text = lines.join('\n');

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function approveDeposit(userId, refId) {
  const database = db.getDB();
  const deposit = await database.get(
    'SELECT * FROM deposits WHERE ref_id = ?',
    refId
  );

  if (!deposit || deposit.status !== 'pending') {
    await bot.sendMessage(userId, 'Deposit not found or already processed.');
    return;
  }

  await database.run(
    "UPDATE deposits SET status = 'approved', approved_at = CURRENT_TIMESTAMP WHERE ref_id = ?",
    refId
  );

  await db.updateUserBalance(deposit.user_id, deposit.amount_inr);

  const userMsg = 'Payment Approved! Rs ' + deposit.amount_inr.toFixed(0) + ' has been added to your wallet! Ref: ' + refId;
  await notifyUserViaUserBot(deposit.user_id, userMsg);

  const adminMsg = 'Approved! Rs ' + deposit.amount_inr.toFixed(0) + ' added to user ' + deposit.user_id + ' wallet.';

  await bot.sendMessage(userId, adminMsg, {
    reply_markup: {
      inline_keyboard: [[{ text: 'Back to Deposits', callback_data: 'adm_deposits' }]]
    }
  });
}

async function rejectDeposit(userId, refId) {
  const database = db.getDB();
  const deposit = await database.get(
    'SELECT * FROM deposits WHERE ref_id = ?',
    refId
  );

  if (!deposit) {
    await bot.sendMessage(userId, 'Deposit not found.');
    return;
  }

  await database.run(
    "UPDATE deposits SET status = 'rejected' WHERE ref_id = ?",
    refId
  );

  const userMsg = 'Payment Rejected. Your deposit of Rs ' + deposit.amount_inr.toFixed(0) + ' was rejected. Ref: ' + refId + '. If you believe this is an error, please contact support.';
  await notifyUserViaUserBot(deposit.user_id, userMsg);

  const adminMsg = 'Rejected! Deposit ' + refId.substring(0, 20) + ' has been rejected.';

  await bot.sendMessage(userId, adminMsg, {
    reply_markup: {
      inline_keyboard: [[{ text: 'Back to Deposits', callback_data: 'adm_deposits' }]]
    }
  });
}

async function showProductsMenu(userId, messageId) {
  const products = await db.getAllProducts();

  const lines = [];
  lines.push('Products Management (' + products.length + ' products)');
  lines.push('');

  const keyboard = [[{ text: 'Add New Product', callback_data: 'adm_add_product' }]];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const status = p.stock > 0 ? 'OK' : 'OUT';
    lines.push(status + ' ' + p.name + ' | Rs ' + p.price_inr.toFixed(0) + ' | Stock: ' + p.stock);

    keyboard.push([
      { text: 'Edit ' + p.name, callback_data: 'adm_edit_product_' + p.id },
      { text: 'Delete', callback_data: 'adm_del_product_' + p.id }
    ]);
  }
  keyboard.push([{ text: 'Back', callback_data: 'adm_menu' }]);

  const text = lines.join('\n');

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: { inline_keyboard: keyboard }
  });
}

function startAddProduct(userId) {
  const state = getState(userId);
  state.addingProduct = { step: 'name' };
  bot.sendMessage(userId, 'Add New Product. Step 1/5: Enter product name:');
}

async function showEditProduct(userId, pid) {
  const database = db.getDB();
  const p = await database.get(
    'SELECT * FROM products WHERE id = ?',
    pid
  );

  if (!p) {
    await bot.sendMessage(userId, 'Product not found.');
    return;
  }

  const lines = [];
  lines.push('Edit Product');
  lines.push('');
  lines.push('Name: ' + p.name);
  lines.push('Price: Rs ' + p.price_inr.toFixed(0));
  lines.push('Stock: ' + p.stock);
  lines.push('Description: ' + (p.description || 'N/A'));
  lines.push('');
  lines.push('Select field to edit:');

  const text = lines.join('\n');

  const keyboard = {
    inline_keyboard: [
      [
        { text: 'Name', callback_data: 'adm_edit_field_' + pid + '_name' },
        { text: 'Price', callback_data: 'adm_edit_field_' + pid + '_price_inr' }
      ],
      [
        { text: 'Stock', callback_data: 'adm_edit_field_' + pid + '_stock' },
        { text: 'Description', callback_data: 'adm_edit_field_' + pid + '_description' }
      ],
      [
        { text: 'Content', callback_data: 'adm_edit_field_' + pid + '_content' }
      ],
      [{ text: 'Back', callback_data: 'adm_products' }]
    ]
  };

  await bot.sendMessage(userId, text, {
    reply_markup: keyboard
  });
}

async function deleteProduct(userId, pid) {
  const database = db.getDB();
  await database.run(
    'UPDATE products SET is_active = 0 WHERE id = ?',
    pid
  );
  await bot.sendMessage(userId, 'Product deleted!', {
    reply_markup: adminBackKeyboard()
  });
}

async function showPaymentMethods(userId, messageId) {
  const upiSetting = await db.getSetting('upi_enabled');
  const upi = upiSetting === '1' ? 'ON' : 'OFF';

  const bnbSetting = await db.getSetting('bnb_enabled');
  const bnb = bnbSetting === '1' ? 'ON' : 'OFF';

  const fampaySetting = await db.getSetting('fampay_enabled');
  const fampay = fampaySetting === '1' ? 'ON' : 'OFF';

  const lines = [];
  lines.push('Payment Methods');
  lines.push('');
  lines.push('UPI: ' + upi);
  lines.push('FamPay: ' + fampay);
  lines.push('BNB Chain: ' + bnb);
  lines.push('');
  lines.push('Tap to toggle or manage:');

  const text = lines.join('\n');

  const keyboard = {
    inline_keyboard: [
      [
        { text: 'UPI ' + upi, callback_data: 'adm_toggle_upi' },
        { text: 'FamPay ' + fampay, callback_data: 'adm_toggle_fampay' }
      ],
      [{ text: 'BNB ' + bnb, callback_data: 'adm_toggle_bnb' }],
      [{ text: 'UPI Settings', callback_data: 'adm_upi_settings' }],
      [{ text: 'Change QR Code', callback_data: 'adm_change_qr' }],
      [{ text: 'Back', callback_data: 'adm_menu' }]
    ]
  };

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: keyboard
  });
}

async function togglePayment(userId, messageId, key) {
  const current = await db.getSetting(key);
  const newVal = current === '1' ? '0' : '1';
  await db.setSetting(key, newVal);
  await showPaymentMethods(userId, messageId);
}

async function showUpiSettings(userId, messageId) {
  const upiIdSetting = await db.getSetting('upi_id');
  const upiId = upiIdSetting || 'Not set';

  const text = 'UPI Settings. Current UPI ID: ' + upiId;

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Change UPI ID', callback_data: 'adm_change_upi_id' }],
      [{ text: 'Back', callback_data: 'adm_payments' }]
    ]
  };

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: keyboard
  });
}

async function showQrChangeMenu(userId, messageId) {
  const keyboard = {
    inline_keyboard: [
      [
        { text: 'GPay QR', callback_data: 'adm_qr_method_gpay' },
        { text: 'FamPay QR', callback_data: 'adm_qr_method_fampay' }
      ],
      [
        { text: 'Any UPI QR', callback_data: 'adm_qr_method_any' },
        { text: 'BNB QR', callback_data: 'adm_qr_method_bnb' }
      ],
      [{ text: 'Back', callback_data: 'adm_payments' }]
    ]
  };

  await bot.editMessageText('Change QR Code. Select which QR code to change:', {
    chat_id: userId,
    message_id: messageId,
    reply_markup: keyboard
  });
}

async function showRateSettings(userId, messageId) {
  const rateSetting = await db.getSetting('usdt_to_inr_rate');
  const rate = rateSetting || '90';

  const text = 'Rate Settings. Current Rate: 1 USDT = Rs ' + rate;

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Change Rate', callback_data: 'adm_set_rate' }],
      [{ text: 'Back', callback_data: 'adm_menu' }]
    ]
  };

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: keyboard
  });
}

async function showReferralSettings(userId, messageId) {
  const refSetting = await db.getSetting('referral_enabled');
  const enabled = refSetting === '1' ? 'ON' : 'OFF';

  const rewardSetting = await db.getSetting('referral_reward_inr');
  const reward = rewardSetting || '1';

  const text = 'Referral Settings. Status: ' + enabled + '. Reward per referral: Rs ' + reward;

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Toggle ' + enabled, callback_data: 'adm_toggle_referral' }],
      [{ text: 'Change Reward Amount', callback_data: 'adm_set_ref_reward' }],
      [{ text: 'Back', callback_data: 'adm_menu' }]
    ]
  };

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: keyboard
  });
}

async function showLinksSettings(userId, messageId) {
  const groupSetting = await db.getSetting('group_link');
  const group = groupSetting || 'Not set';

  const channelSetting = await db.getSetting('channel_link');
  const channel = channelSetting || 'Not set';

  const supportSetting = await db.getSetting('support_link');
  const support = supportSetting || 'Not set';

  const lines = [];
  lines.push('Links Settings');
  lines.push('');
  lines.push('Group: ' + group);
  lines.push('Channel: ' + channel);
  lines.push('Support: ' + support);

  const text = lines.join('\n');

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Change Group Link', callback_data: 'adm_change_group' }],
      [{ text: 'Change Channel Link', callback_data: 'adm_change_channel' }],
      [{ text: 'Change Support Link', callback_data: 'adm_change_support' }],
      [{ text: 'Back', callback_data: 'adm_menu' }]
    ]
  };

  await bot.editMessageText(text, {
    chat_id: userId,
    message_id: messageId,
    reply_markup: keyboard
  });
}

async function showUsersMenu(userId, messageId) {
  const users = await db.getAllUsers();

  const lines = [];
  lines.push('Users (' + users.length
