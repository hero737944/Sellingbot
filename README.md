# Zed Zoee Bot — Telegram Store Bot (Node.js)

## Setup on Render.com

1. Push this code to a GitHub repo
2. Go to render.com → New → Background Worker
3. Connect your GitHub repo
4. Set Environment Variables in Render dashboard:
   - USER_BOT_TOKEN = your user bot token (from @BotFather)
   - ADMIN_BOT_TOKEN = your admin bot token (from @BotFather)
   - ADMIN_PASSWORD = hero.96
5. Build Command: npm install
6. Start Command: node index.js
7. Deploy

## Important
- Render free tier workers may sleep on inactivity on some plans — check current Render free tier rules before relying on it for 24/7 uptime.
- store.db is SQLite — on Render's ephemeral filesystem, this resets on every redeploy. For permanent storage, consider Render's persistent disk (paid) or an external DB like PostgreSQL/MongoDB later.
- Never commit your bot tokens to GitHub. Use Render's Environment Variables instead.

## Admin Bot Commands
- /start → asks for password
- Password: set via ADMIN_PASSWORD env var

## Features
- User bot: Buy products, deposit via UPI QR/BNB, referral system, profile, support
- Admin bot: Approve/reject deposits, manage products, toggle payment methods, change QR codes, change rate, manage referral settings, ban/restrict users, broadcast, change group/channel/support links, change password
