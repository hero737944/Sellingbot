module.exports = {
  // Bot Tokens — Render Environment Variables mein daalna, yahan mat likhna
  USER_BOT_TOKEN: process.env.USER_BOT_TOKEN || "YOUR_USER_BOT_TOKEN_HERE",
  ADMIN_BOT_TOKEN: process.env.ADMIN_BOT_TOKEN || "YOUR_ADMIN_BOT_TOKEN_HERE",

  // Owner Telegram User ID
  OWNER_ID: 8605943790,

  // Admin Bot Password
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "hero.96",

  // Bot Names
  BOT_NAME: "Zed Zoee Bot",

  // Channel & Group Links
  CHANNEL_LINK: "https://t.me/TGSOTR",
  GROUP_LINK: "https://t.me/TGSTOREX",

  // Support
  SUPPORT_LINK: "https://t.me/Tgstoreapix",

  // Database file path
  DATABASE_FILE: "./store.db",

  // Defaults
  DEFAULT_RATE: 90.0,
  DEFAULT_MIN_DEPOSIT: 20,
  DEFAULT_REFERRAL_REWARD: 1.0
};
