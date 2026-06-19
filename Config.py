# config.py - All Bot Configurations

import os
from dotenv import load_dotenv

load_dotenv()

# ==================== BOT TOKENS ====================
USER_BOT_TOKEN = os.getenv("USER_BOT_TOKEN", "YOUR_USER_BOT_TOKEN_HERE")
ADMIN_BOT_TOKEN = os.getenv("ADMIN_BOT_TOKEN", "YOUR_ADMIN_BOT_TOKEN_HERE")

# ==================== OWNER DETAILS ====================
OWNER_ID = 8605943790  # Your numeric Telegram ID
OWNER_USERNAME = "@Tgstoreapix"

# ==================== LINKS ====================
CHANNEL_LINK = "https://t.me/TGSOTR"
GROUP_LINK = "https://t.me/TGSTOREX"

# ==================== BOT SETTINGS ====================
BOT_NAME = "TgStoreAPI"
BOT_USERNAME = "@TgStoreAPI_bot"  # Change to your bot username

# ==================== ADMIN PASSWORD ====================
ADMIN_PASSWORD = "hero.96"

# ==================== PAYMENT SETTINGS ====================
DEFAULT_RATE = 90.0  # 1 USDT = ₹90
MIN_DEPOSIT = 20
REFERRAL_REWARD = 0.01  # $0.01 per referral

# ==================== DATABASE ====================
DATABASE_FILE = "data/bot.db"

# ==================== WEB PANEL ====================
WEB_PANEL_PORT = 5000
WEB_PANEL_HOST = "0.0.0.0"

# ==================== QR SETTINGS ====================
QR_EXPIRY_MINUTES = 15
MAX_QR_STORAGE = 5

# ==================== SUPPORT ====================
SUPPORT_MESSAGE = """📞 **TgStoreAPI Support & Relevant Information**

All purchases made via TgStoreAPI are final — no refunds or replacements will be provided under any circumstances, and all products are bought entirely at the buyer's own risk.

• For support: @Tgstoreapix
• Channel: @TGSOTR
• Group: @TGSTOREX"""

# ==================== WELCOME MESSAGE ====================
WELCOME_TEXT = """🌟 **Welcome to TgApiStore!**

To start using the bot, please complete these steps:

**Step 1 – Our Rules:**
• Accounts & sessions are sold as-is – keep your files secure
• Log in one account at a time, wait 2–3 min between each
• No spam or mass messaging – misused accounts may freeze
• Failed OTPs are auto-refunded to your balance
• One genuine account per person – fake referrals void rewards

**Step 2 – Join our community:**
• Channel: {channel}
• Group: {group}

Tap the join buttons above, then accept the terms below ⬇️"""

# ==================== TERMS & CONDITIONS ====================
TERMS_TEXT = """📋 **Terms & Conditions**

Please read and accept before using the bot. This keeps your purchases protected and your account safe.

🔒 Accounts & sessions are sold as-is. Keep your files secure and never share them.

🔑 Log in **one account at a time**, waiting 2–3 minutes between each. Rushing gets accounts frozen.

❌ No spam, mass messaging, or abuse. Misused accounts may freeze – that's not our responsibility.

💰 Refunds apply only as described at purchase. Failed OTPs are auto-refunded to your balance.

🔒 One genuine account per person. Fake or duplicate referrals void all rewards.

✅ I have read and agree to the Terms & Conditions above."""
