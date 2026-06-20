const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const db = require('./database');
const utils = require('./utils');

const bot = new TelegramBot(config.ADMIN_BOT_TOKEN, { polling: true });

let currentPassword = config.ADMIN_PASSWORD;
const authenticatedUsers = new Set();
const adminState = {};

function getState(userId) {
  if (!adminState[userId]) adminState[userId] = {};
  return adminState[userId];
}

function isOwner(userId) {
  return userId === config.OWNER_ID;
}

function adminBackKeyboard() {
  return { inline_keyboard: [[{ text: '« Back to Menu', callback_data: 'adm_menu' }]] };
}

// ─────────────────────────────────────────
// /start - Password gate
// ─────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;

  if (!isOwner(userId)) {
    return bot.sendMessage(userId, '🚫 Unauthorized access.');
  }

  if (authenticatedUsers.has(userId)) {
    return showAdminMenu(userId);
  }

  getState(userId).waitingPassword = true;
  bot.sendMessage(userId, '🔐 *Admin Panel*\n\nEnter your password to continue:', { parse_mode: 'Markdown' });
});

// ─────────────────────────────────────────
// Main admin menu
// ─────────────────────────────────────────
async function showAdminMenu(userId, messageId = null) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '📋 Pending Deposits', callback_data: 'adm_deposits' }, { text: '📦 Products', callback_data: 'adm_products' }],
      [{ text: '💳 Payment Methods', callback_data: 'adm_payments' }, { text: '💱 Rate Settings', callback_data: 'adm_rate' }],
      [{ text: '🎁 Referral Settings', callback_data: 'adm_referral' }, { text: '👥 Users', callback_data: 'adm_users' }],
      [{ text: '🔗 Links Settings', callback_data: 'adm_links' }, { text: '📊 Stats', callback_data: 'adm_stats' }],
      [{ text: '📢 Broadcast', callback_data: 'adm_broadcast' }, { text: '🔐 Password Settings', callback_data: 'adm_password' }]
    ]
  };

  const text = '👑 *Admin Control Panel*\n\nSelect an option to manage your store:';

  if (messageId) {
    bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {
      bot.sendMessage(userId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
    });
  } else {
    bot.sendMessage(userId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

// ─────────────────────────────────────────
// Callback Handler
// ─────────────────────────────────────────
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const data = query.data;
  const messageId = query.message.message_id;

  bot.answerCallbackQuery(query.id).catch(() => {});

  if (!isOwner(userId) || !authenticatedUsers.has(userId)) {
    return bot.sendMessage(userId, '🚫 Please /start and authenticate first.');
  }

  try {
    if (data === 'adm_menu') await showAdminMenu(userId, messageId);
    else if (data === 'adm_deposits') await showPendingDeposits(userId, messageId);
    else if (data === 'adm_products') await showProductsMenu(userId, messageId);
    else if (data === 'adm_payments') await showPaymentMethods(userId, messageId);
    else if (data === 'adm_rate') await showRateSettings(userId, messageId);
    else if (data === 'adm_referral') await showReferralSettings(userId, messageId);
    else if (data === 'adm_users') await showUsersMenu(userId, messageId);
    else if (data === 'adm_broadcast') await startBroadcast(userId, messageId);
    else if (data === 'adm_stats') await showStats(userId, messageId);
    else if (data === 'adm_password') await showPasswordSettings(userId, messageId);
    else if (data === 'adm_links') await showLinksSettings(userId, messageId);
    else if (data === 'adm_change_group') {
      getState(userId).waitingGroupLink = true;
      bot.sendMessage(userId, '🔗 Enter new *Group* link (e.g. https://t.me/yourgroup):', { parse_mode: 'Markdown' });
    }
    else if (data === 'adm_change_channel') {
      getState(userId).waitingChannelLink = true;
      bot.sendMessage(userId, '🔗 Enter new *Channel* link (e.g. https://t.me/yourchannel):', { parse_mode: 'Markdown' });
    }
    else if (data === 'adm_change_support') {
      getState(userId).waitingSupportLink = true;
      bot.sendMessage(userId, '🔗 Enter new *Support* link (e.g. https://t.me/yourusername):', { parse_mode: 'Markdown' });
    }

    // Deposit actions
    else if (data.startsWith('adm_approve_')) await approveDeposit(userId, data.replace('adm_approve_', ''));
    else if (data.startsWith('adm_reject_')) await rejectDeposit(userId, data.replace('adm_reject_', ''));
    else if (data.startsWith('adm_msg_')) {
      const targetUserId = parseInt(data.replace('adm_msg_', ''));
      const st = getState(userId);
      st.sendMsgTo = targetUserId;
      st.waitingSendMsg = true;
      bot.sendMessage(userId, `✉️ *Send message to user ${targetUserId}*\n\nType your message below:`, { parse_mode: 'Markdown' });
    }

    // Product actions
    else if (data === 'adm_add_product') await startAddProduct(userId);
    else if (data.startsWith('adm_edit_product_')) await showEditProduct(userId, parseInt(data.replace('adm_edit_product_', '')));
    else if (data.startsWith('adm_del_product_')) await deleteProduct(userId, parseInt(data.replace('adm_del_product_', '')));
    else if (data.startsWith('adm_edit_field_')) {
      const parts = data.replace('adm_edit_field_', '').split('_');
      const pid = parseInt(parts[0]);
      const field = parts.slice(1).join('_');
      const st = getState(userId);
      st.editingProductId = pid;
      st.editingField = field;
      st.waitingProductEdit = true;
      const fieldNames = { name: 'Product Name', price_inr: 'Price (₹)', stock: 'Stock Count', description: 'Description', content: 'Product Content (delivered to buyer)' };
      bot.sendMessage(userId, `✏️ Enter new *${fieldNames[field] || field}*:`, { parse_mode: 'Markdown' });
    }

    // Payment toggles
    else if (data === 'adm_toggle_upi') await togglePayment(userId, messageId, 'upi_enabled');
    else if (data === 'adm_toggle_bnb') await togglePayment(userId, messageId, 'bnb_enabled');
    else if (data === 'adm_toggle_fampay') await togglePayment(userId, messageId, 'fampay_enabled');
    else if (data === 'adm_toggle_referral') {
      const current = await db.getSetting('referral_enabled');
      await db.setSetting('referral_enabled', current === '1' ? '0' : '1');
      await showReferralSettings(userId, messageId);
    }

    else if (data === 'adm_upi_settings') await showUpiSettings(userId, messageId);
    else if (data === 'adm_change_upi_id') {
      getState(userId).waitingUpiId = true;
      bot.sendMessage(userId, '💳 Enter new UPI ID:');
    }
    else if (data === 'adm_change_qr') await showQrChangeMenu(userId, messageId);
    else if (data.startsWith('adm_qr_method_')) {
      const method = data.replace('adm_qr_method_', '');
      const st = getState(userId);
      st.qrUploadMethod = method;
      st.waitingQrUpload = true;
      const methodNames = { gpay: 'GPay', fampay: 'FamPay', any: 'Any UPI', bnb: 'BNB' };
      bot.sendMessage(userId, `📸 Upload new QR image for *${methodNames[method] || method}*\n\nSend the QR code photo now:`, { parse_mode: 'Markdown' });
    }

    else if (data === 'adm_set_rate') {
      getState(userId).waitingRate = true;
      bot.sendMessage(userId, '💱 Enter new USDT to INR rate (e.g., 90):');
    }
    else if (data === 'adm_set_ref_reward') {
      getState(userId).waitingRefReward = true;
      bot.sendMessage(userId, '🎁 Enter new referral reward amount in ₹:');
    }

    // User management
    else if (data.startsWith('adm_user_')) await showUserDetail(userId, parseInt(data.replace('adm_user_', '')));
    else if (data.startsWith('adm_ban_')) await toggleBanUser(userId, parseInt(data.replace('adm_ban_', '')));
    else if (data.startsWith('adm_restrict_')) await toggleRestrictUser(userId, parseInt(data.replace('adm_restrict_', '')));

    else if (data === 'adm_change_password') {
      getState(userId).waitingNewPassword = true;
      bot.sendMessage(userId, '🔐 Enter new password:');
    }
  } catch (err) {
    console.error('Admin callback error:', err);
  }
});

// ─────────────────────────────────────────
// Pending Deposits
// ─────────────────────────────────────────
async function showPendingDeposits(userId, messageId) {
  const deposits = await db.getPendingDeposits();

  if (!deposits.length) {
    return bot.editMessageText('📋 *Pending Deposits*\n\n✅ No pending deposits!', {
      chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: adminBackKeyboard()
    });
  }

  let text = `📋 *Pending Deposits* (${deposits.length})\n\n`;
  const keyboard = [];

  for (const dep of deposits) {
    text += `👤 ${dep.full_name} | ₹${dep.amount_inr.toFixed(0)}\n🆔 ${dep.user_id} | 📝 \`${dep.ref_id.substring(0, 20)}...\`\n\n`;
    keyboard.push([
      { text: `✅ Approve ₹${dep.amount_inr.toFixed(0)}`, callback_data: `adm_approve_${dep.ref_id}` },
      { text: '❌ Reject', callback_data: `adm_reject_${dep.ref_id}` }
    ]);
    keyboard.push([{ text: `✉️ Msg ${dep.full_name}`, callback_data: `adm_msg_${dep.user_id}` }]);
  }
  keyboard.push([{ text: '« Back', callback_data: 'adm_menu' }]);

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

async function approveDeposit(userId, refId) {
  const deposit = await db.getDB().get('SELECT * FROM deposits WHERE ref_id = ?', refId);

  if (!deposit || deposit.status !== 'pending') {
    return bot.sendMessage(userId, '❌ Deposit not found or already processed.');
  }

  await db.getDB().run("UPDATE deposits SET status = 'approved', approved_at = CURRENT_TIMESTAMP WHERE ref_id = ?", refId);
  await db.updateUserBalance(deposit.user_id, deposit.amount_inr);

  const userBotApi = `https://api.telegram.org/bot${config.USER_BOT_TOKEN}/sendMessage`;
  notifyUserViaUserBot(deposit.user_id,
    `✅ *Payment Approved!*\n\n💰 ₹${deposit.amount_inr.toFixed(0)} has been added to your wallet!\n📝 Ref: \`${refId}\`\n\nThank you! Happy shopping 🛒`
  );

  bot.sendMessage(userId, `✅ *Approved!*\n\n₹${deposit.amount_inr.toFixed(0)} added to user ${deposit.user_id}'s wallet.`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '📋 Back to Deposits', callback_data: 'adm_deposits' }]] }
  });
}

async function rejectDeposit(userId, refId) {
  const deposit = await db.getDB().get('SELECT * FROM deposits WHERE ref_id = ?', refId);
  if (!deposit) return bot.sendMessage(userId, '❌ Deposit not found.');

  await db.getDB().run("UPDATE deposits SET status = 'rejected' WHERE ref_id = ?", refId);

  notifyUserViaUserBot(deposit.user_id,
    `❌ *Payment Rejected*\n\nYour deposit of ₹${deposit.amount_inr.toFixed(0)} was rejected.\n📝 Ref: \`${refId}\`\n\nIf you believe this is an error, please contact support.`
  );

  bot.sendMessage(userId, `❌ *Rejected!*\n\nDeposit ${refId.substring(0, 20)}... has been rejected.`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '📋 Back to Deposits', callback_data: 'adm_deposits' }]] }
  });
}

// Helper: send message via user bot's token using raw HTTPS fetch (no second TelegramBot instance needed)
async function notifyUserViaUserBot(chatId, text) {
  try {
    const url = `https://api.telegram.org/bot${config.USER_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
  } catch (err) {
    console.error('notifyUserViaUserBot error:', err.message);
  }
}

// ─────────────────────────────────────────
// Products Management
// ─────────────────────────────────────────
async function showProductsMenu(userId, messageId) {
  const products = await db.getAllProducts();

  let text = `📦 *Products Management* (${products.length} products)\n\n`;
  const keyboard = [[{ text: '➕ Add New Product', callback_data: 'adm_add_product' }]];

  for (const p of products) {
    const status = p.stock > 0 ? '✅' : '❌';
    text += `${status} ${p.name} | ₹${p.price_inr.toFixed(0)} | Stock: ${p.stock}\n`;
    keyboard.push([
      { text: `✏️ ${p.name}`, callback_data: `adm_edit_product_${p.id}` },
      { text: '🗑️', callback_data: `adm_del_product_${p.id}` }
    ]);
  }
  keyboard.push([{ text: '« Back', callback_data: 'adm_menu' }]);

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

function startAddProduct(userId) {
  getState(userId).addingProduct = { step: 'name' };
  bot.sendMessage(userId, '➕ *Add New Product*\n\nStep 1/5: Enter product *name*:', { parse_mode: 'Markdown' });
}

async function showEditProduct(userId, pid) {
  const p = await db.getDB().get('SELECT * FROM products WHERE id = ?', pid);
  if (!p) return bot.sendMessage(userId, '❌ Product not found.');

  const text =
`✏️ *Edit Product*

📦 Name: ${p.name}
💰 Price: ₹${p.price_inr.toFixed(0)}
📊 Stock: ${p.stock}
📝 Description: ${p.description || 'N/A'}

Select field to edit:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '📝 Name', callback_data: `adm_edit_field_${pid}_name` }, { text: '💰 Price', callback_data: `adm_edit_field_${pid}_price_inr` }],
      [{ text: '📊 Stock', callback_data: `adm_edit_field_${pid}_stock` }, { text: '📄 Description', callback_data: `adm_edit_field_${pid}_description` }],
      [{ text: '📦 Content', callback_data: `adm_edit_field_${pid}_content` }],
      [{ text: '« Back', callback_data: 'adm_products' }]
    ]
  };

  bot.sendMessage(userId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
}

async function deleteProduct(userId, pid) {
  await db.getDB().run('UPDATE products SET is_active = 0 WHERE id = ?', pid);
  bot.sendMessage(userId, '🗑️ Product deleted!', { reply_markup: adminBackKeyboard() });
}

// ─────────────────────────────────────────
// Payment Methods
// ─────────────────────────────────────────
async function showPaymentMethods(userId, messageId) {
  const upi = (await db.getSetting('upi_enabled')) === '1' ? '✅ ON' : '❌ OFF';
  const bnb = (await db.getSetting('bnb_enabled')) === '1' ? '✅ ON' : '❌ OFF';
  const fampay = (await db.getSetting('fampay_enabled')) === '1' ? '✅ ON' : '❌ OFF';

  const text = `💳 *Payment Methods*\n\n📱 UPI: ${upi}\n💳 FamPay: ${fampay}\n🟡 BNB Chain: ${bnb}\n\nTap to toggle or manage:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: `📱 UPI ${upi}`, callback_data: 'adm_toggle_upi' }, { text: `💳 FamPay ${fampay}`, callback_data: 'adm_toggle_fampay' }],
      [{ text: `🟡 BNB ${bnb}`, callback_data: 'adm_toggle_bnb' }],
      [{ text: '⚙️ UPI Settings', callback_data: 'adm_upi_settings' }],
      [{ text: '🖼️ Change QR Code', callback_data: 'adm_change_qr' }],
      [{ text: '« Back', callback_data: 'adm_menu' }]
    ]
  };

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard });
}

async function togglePayment(userId, messageId, key) {
  const current = await db.getSetting(key);
  await db.setSetting(key, current === '1' ? '0' : '1');
  await showPaymentMethods(userId, messageId);
}

async function showUpiSettings(userId, messageId) {
  const upiId = await db.getSetting('upi_id') || 'Not set';
  const text = `⚙️ *UPI Settings*\n\n💳 Current UPI ID: \`${upiId}\``;
  const keyboard = {
    inline_keyboard: [
      [{ text: '✏️ Change UPI ID', callback_data: 'adm_change_upi_id' }],
      [{ text: '« Back', callback_data: 'adm_payments' }]
    ]
  };
  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard });
}

async function showQrChangeMenu(userId, messageId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '📱 GPay QR', callback_data: 'adm_qr_method_gpay' }, { text: '💳 FamPay QR', callback_data: 'adm_qr_method_fampay' }],
      [{ text: '📲 Any UPI QR', callback_data: 'adm_qr_method_any' }, { text: '🟡 BNB QR', callback_data: 'adm_qr_method_bnb' }],
      [{ text: '« Back', callback_data: 'adm_payments' }]
    ]
  };
  bot.editMessageText('🖼️ *Change QR Code*\n\nSelect which QR code to change:', {
    chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard
  });
}

// ─────────────────────────────────────────
// Rate Settings
// ─────────────────────────────────────────
async function showRateSettings(userId, messageId) {
  const rate = await db.getSetting('usdt_to_inr_rate') || '90';
  const text = `💱 *Rate Settings*\n\nCurrent Rate: 1 USDT = ₹${rate}\n\nTap to change:`;
  const keyboard = {
    inline_keyboard: [
      [{ text: '✏️ Change Rate', callback_data: 'adm_set_rate' }],
      [{ text: '« Back', callback_data: 'adm_menu' }]
    ]
  };
  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard });
}

// ─────────────────────────────────────────
// Referral Settings
// ─────────────────────────────────────────
async function showReferralSettings(userId, messageId) {
  const enabled = (await db.getSetting('referral_enabled')) === '1' ? '✅ ON' : '❌ OFF';
  const reward = await db.getSetting('referral_reward_inr') || '1';

  const text = `🎁 *Referral Settings*\n\nStatus: ${enabled}\nReward per referral: ₹${reward}`;
  const keyboard = {
    inline_keyboard: [
      [{ text: `🔄 Toggle ${enabled}`, callback_data: 'adm_toggle_referral' }],
      [{ text: '✏️ Change Reward Amount', callback_data: 'adm_set_ref_reward' }],
      [{ text: '« Back', callback_data: 'adm_menu' }]
    ]
  };
  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard });
}

// ─────────────────────────────────────────
// Links Settings
// ─────────────────────────────────────────
async function showLinksSettings(userId, messageId) {
  const group = await db.getSetting('group_link') || 'Not set';
  const channel = await db.getSetting('channel_link') || 'Not set';
  const support = await db.getSetting('support_link') || 'Not set';

  const text = `🔗 *Links Settings*\n\n👥 Group: ${group}\n📢 Channel: ${channel}\n📞 Support: ${support}`;
  const keyboard = {
    inline_keyboard: [
      [{ text: '✏️ Change Group Link', callback_data: 'adm_change_group' }],
      [{ text: '✏️ Change Channel Link', callback_data: 'adm_change_channel' }],
      [{ text: '✏️ Change Support Link', callback_data: 'adm_change_support' }],
      [{ text: '« Back', callback_data: 'adm_menu' }]
    ]
  };
  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard });
}

// ─────────────────────────────────────────
// User Management
// ─────────────────────────────────────────
async function showUsersMenu(userId, messageId) {
  const users = await db.getAllUsers();

  let text = `👥 *Users* (${users.length} total)\n\n`;
  const keyboard = [];

  for (const u of users.slice(0, 15)) {
    const status = u.is_banned ? '🚫' : (u.is_restricted ? '⚠️' : '✅');
    text += `${status} ${u.full_name} | ₹${u.balance_inr.toFixed(0)}\n`;
    keyboard.push([{ text: `${status} ${u.full_name.substring(0, 20)} | ₹${u.balance_inr.toFixed(0)}`, callback_data: `adm_user_${u.user_id}` }]);
  }
  keyboard.push([{ text: '« Back', callback_data: 'adm_menu' }]);

  bot.editMessageText(text, { chat_id: userId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

async function showUserDetail(userId, uid) {
  const u = await db.getUser(uid);
  if (!u) return bot.sendMessage(userId, '❌ User not found.');

  const banStatus = u.is_banned ? '🚫 Banned' : (u.is_restricted ? '⚠️ Restricte
