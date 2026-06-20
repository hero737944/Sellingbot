const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const config = require('./config');

let db;

async function initDB() {
  db = await open({
    filename: config.DATABASE_FILE,
    driver: sqlite3.Database
  });

  await db.exec(`CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    full_name TEXT,
    balance_inr REAL DEFAULT 0,
    total_deposited REAL DEFAULT 0,
    total_spent REAL DEFAULT 0,
    total_purchases INTEGER DEFAULT 0,
    referral_code TEXT,
    referred_by INTEGER,
    referral_count INTEGER DEFAULT 0,
    referral_earned REAL DEFAULT 0,
    joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
    is_banned INTEGER DEFAULT 0,
    is_restricted INTEGER DEFAULT 0,
    terms_accepted INTEGER DEFAULT 0
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price_inr REAL NOT NULL,
    stock INTEGER DEFAULT 0,
    content TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    amount_inr REAL,
    ref_id TEXT UNIQUE,
    payment_method TEXT,
    upi_app TEXT,
    screenshot_file_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    approved_at TEXT
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    product_id INTEGER,
    amount_inr REAL,
    content_delivered TEXT,
    purchased_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS qr_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_method TEXT,
    upi_app TEXT,
    file_id TEXT,
    uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
  )`);

  const defaults = [
    ['upi_enabled', '1'],
    ['bnb_enabled', '0'],
    ['fampay_enabled', '1'],
    ['referral_enabled', '1'],
    ['usdt_to_inr_rate', '90.0'],
    ['referral_reward_inr', '1.0'],
    ['min_deposit_inr', '20'],
    ['upi_id', 'yourname@upi'],
    ['bnb_address', 'YOUR_BNB_ADDRESS'],
    ['bot_name', config.BOT_NAME],
    ['support_link', config.SUPPORT_LINK],
    ['channel_link', config.CHANNEL_LINK],
    ['group_link', config.GROUP_LINK]
  ];

  for (const [key, value] of defaults) {
    await db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', key, value);
  }

  console.log('✅ Database initialized!');
  return db;
}

function getDB() {
  return db;
}

async function getSetting(key) {
  const row = await db.get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : null;
}

async function setSetting(key, value) {
  await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, String(value));
}

async function getUser(userId) {
  return await db.get('SELECT * FROM users WHERE user_id = ?', userId);
}

async function createUser(userId, username, fullName, referredBy = null) {
  const refCode = Math.random().toString(36).substring(2, 10).toUpperCase();
  try {
    await db.run(
      `INSERT OR IGNORE INTO users (user_id, username, full_name, referral_code, referred_by) VALUES (?, ?, ?, ?, ?)`,
      userId, username, fullName, refCode, referredBy
    );
  } catch (e) {
    console.error('createUser error:', e);
  }
}

async function updateUserBalance(userId, amountInr) {
  await db.run(
    'UPDATE users SET balance_inr = balance_inr + ?, total_deposited = total_deposited + ? WHERE user_id = ?',
    amountInr, amountInr, userId
  );
}

async function deductUserBalance(userId, amountInr) {
  await db.run(
    'UPDATE users SET balance_inr = balance_inr - ?, total_spent = total_spent + ?, total_purchases = total_purchases + 1 WHERE user_id = ?',
    amountInr, amountInr, userId
  );
}

async function getAllUsers() {
  return await db.all('SELECT * FROM users');
}

async function getPendingDeposits() {
  return await db.all(`
    SELECT d.*, u.full_name, u.username 
    FROM deposits d JOIN users u ON d.user_id = u.user_id 
    WHERE d.status = 'pending' ORDER BY d.created_at DESC
  `);
}

async function getActiveProducts() {
  return await db.all('SELECT * FROM products WHERE is_active = 1 AND stock > 0');
}

async function getAllProducts() {
  return await db.all('SELECT * FROM products WHERE is_active = 1');
}

async function getActiveQR(paymentMethod, upiApp = null) {
  if (upiApp) {
    return await db.get(
      'SELECT * FROM qr_images WHERE payment_method = ? AND upi_app = ? AND is_active = 1 ORDER BY uploaded_at DESC LIMIT 1',
      paymentMethod, upiApp
    );
  }
  return await db.get(
    'SELECT * FROM qr_images WHERE payment_method = ? AND is_active = 1 ORDER BY uploaded_at DESC LIMIT 1',
    paymentMethod
  );
}

module.exports = {
  initDB, getDB, getSetting, setSetting, getUser, createUser,
  updateUserBalance, deductUserBalance, getAllUsers, getPendingDeposits,
  getActiveProducts, getAllProducts, getActiveQR
};
