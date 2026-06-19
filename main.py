# main.py - User Telegram Bot

import logging
import random
import string
from datetime import datetime
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes
import config
import database as db

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ==================== GENERATE REF ID ====================
def generate_ref_id(user_id: int):
    """Generate unique deposit reference ID"""
    timestamp = int(datetime.now().timestamp())
    random_num = ''.join(random.choices(string.digits, k=10))
    return f"dep-{user_id}-{timestamp}{random_num[:5]}"

# ==================== CHECK USER STATUS ====================
async def check_user_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Check if user is banned or restricted"""
    user = db.get_user(update.effective_user.id)
    if not user:
        return None
    
    if user['is_banned'] == 1:
        await update.message.reply_text(
            "🚫 **You have been banned from using this bot.**\n\n"
            "Contact support if you think this is a mistake.",
            parse_mode='Markdown'
        )
        return False
    
    return user

# ==================== START COMMAND ====================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command"""
    user_id = update.effective_user.id
    username = update.effective_user.username
    full_name = update.effective_user.full_name
    
    # Check for referral
    referrer_id = None
    if context.args and context.args[0].startswith('ref_'):
        try:
            referrer_id = int(context.args[0].replace('ref_', ''))
        except:
            pass
    
    # Get or create user
    user = db.get_user(user_id)
    if not user:
        user = db.create_user(user_id, username, full_name, referrer_id)
    
    # Check if banned
    if user and user['is_banned'] == 1:
        await update.message.reply_text(
            "🚫 **You have been banned from using this bot.**\n\n"
            "Contact support if you think this is a mistake.",
            parse_mode='Markdown'
        )
        return
    
    # Check if terms accepted
    if user and user['terms_accepted'] == 0:
        await show_welcome_with_terms(update, context)
        return
    
    # Show main menu with referral link
    await show_main_menu(update, context, user_id)

async def show_welcome_with_terms(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show welcome message with join links and terms"""
    keyboard = [
        [InlineKeyboardButton("📢 Join Channel", url=config.CHANNEL_LINK)],
        [InlineKeyboardButton("👥 Join Group", url=config.GROUP_LINK)],
        [InlineKeyboardButton("📋 Review & Accept Terms", web_app=WebAppInfo(url="https://your-web-app-url.com/terms"))]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    welcome_text = config.WELCOME_TEXT.format(
        channel=config.CHANNEL_LINK,
        group=config.GROUP_LINK
    )
    
    await update.message.reply_text(
        welcome_text,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def accept_terms(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle terms acceptance from web app"""
    query = update.callback_query
    await query.answer()
    
    user_id = query.from_user.id
    db.update_user(user_id, terms_accepted=1)
    
    await query.edit_message_text(
        "✅ **You're all set!**\n\n"
        "Terms accepted. Returning you to the bot...",
        parse_mode='Markdown'
    )
    
    # Show main menu after terms accepted
    await show_main_menu(update, context, user_id)

# ==================== MAIN MENU ====================
async def show_main_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, user_id: int = None):
    """Show main menu with referral link"""
    if not user_id:
        user_id = update.effective_user.id
    
    user = db.get_user(user_id)
    if not user:
        return
    
    # Check if restricted
    if user['is_restricted'] == 1:
        await update.message.reply_text(
            "⚠️ **You are restricted from making purchases.**\n"
            "You can still view products but cannot buy.",
            parse_mode='Markdown'
        )
    
    # Check referral ON/OFF
    referral_on = db.get_setting('referral_on', '1')
    referral_link = f"https://t.me/{config.BOT_USERNAME.replace('@', '')}?start=ref_{user_id}"
    
    keyboard = [
        [InlineKeyboardButton("🛒 Buy Account", callback_data="buy_account")],
        [InlineKeyboardButton("📁 Buy Sessions", callback_data="buy_sessions")],
        [InlineKeyboardButton("👤 Profile", callback_data="profile")],
        [InlineKeyboardButton("💰 Deposit", callback_data="deposit")],
        [InlineKeyboardButton("🎁 Refer & Earn", callback_data="refer_earn")],
        [InlineKeyboardButton("📞 Support", callback_data="support")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    message = f"**🏠 Main Menu**"
    
    if referral_on == '1':
        message += f"\n\n**🎁 Earn Money!**\nRefer friends and get ${db.get_setting('referral_reward', '0.01')} when they join!\n🔗 `{referral_link}`"
    
    await update.message.reply_text(
        message,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

# ==================== BUY PRODUCT ====================
async def buy_product(update: Update, context: ContextTypes.DEFAULT_TYPE, category: str = "Account"):
    """Show products list"""
    query = update.callback_query
    await query.answer()
    
    user = db.get_user(query.from_user.id)
    if user['is_restricted'] == 1:
        await query.edit_message_text(
            "⚠️ **You are restricted from making purchases.**\n"
            "Contact support for more information.",
            parse_mode='Markdown'
        )
        return
    
    products = db.get_products(category)
    if not products:
        await query.edit_message_text(
            "📭 **No products available in this category.**\n"
            "Please check back later.",
            parse_mode='Markdown'
        )
        return
    
    keyboard = []
    for product in products:
        # Format: India Best Quality | $0.39 • ₹35 | 39 In Stock
        label = f"{product['name']} | ${product['price_usd']:.2f} • ₹{product['price_inr']:.0f} | {product['stock']} In Stock"
        keyboard.append([InlineKeyboardButton(label, callback_data=f"product_{product['id']}")])
    
    keyboard.append([InlineKeyboardButton("🔙 Back", callback_data="main_menu")])
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    rate = float(db.get_setting('rate', '90.0'))
    await query.edit_message_text(
        f"**🛒 {category}**\n\n"
        f"**Select {category}**\n"
        f"• Rate: 1 USDT = ₹{rate:.1f}\n"
        f"• Good Quality 2FA\n"
        f"• Age Of The Accounts Are Valued Using (Personal Message)\n\n"
        f"Choose an option below:",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def product_detail(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show product details and purchase option"""
    query = update.callback_query
    await query.answer()
    
    product_id = int(query.data.replace('product_', ''))
    product = db.get_product(product_id)
    
    if not product or product['is_active'] == 0:
        await query.edit_message_text(
            "❌ **Product not found or unavailable.**",
            parse_mode='Markdown'
        )
        return
    
    user = db.get_user(query.from_user.id)
    
    # Format product details
    keyboard = []
    
    if product['stock'] > 0 and user['balance'] >= product['price_inr']:
        keyboard.append([InlineKeyboardButton("✅ Confirm & Buy", callback_data=f"confirm_{product_id}")])
    elif product['stock'] > 0 and user['balance'] < product['price_inr']:
        keyboard.append([InlineKeyboardButton("💰 Deposit First", callback_data="deposit")])
    else:
        keyboard.append([InlineKeyboardButton("❌ Out of Stock", callback_data="out_of_stock")])
    
    keyboard.append([InlineKeyboardButton("🔙 Back", callback_data="buy_account")])
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    message = f"""**🛒 PURCHASE CONFIRMATION**

**{product['name']}** ✅

**Product Details:**
• Price: ${product['price_usd']:.2f} • ₹{product['price_inr']:.0f}
• Stock: {product['stock']}
• Quality: {product['quality'] or 'Standard'}

**Wallet:**
• Balance: ₹{user['balance']:.2f}

{f"✅ Balance sufficient! You can buy this product." if user['balance'] >= product['price_inr'] else "❌ Insufficient balance! Please deposit first."}
• Please use Telegram X for best experience
• We are not responsible for any freeze/ban"""
    
    await query.edit_message_text(
        message,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def confirm_purchase(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Confirm and complete purchase"""
    query = update.callback_query
    await query.answer()
    
    product_id = int(query.data.replace('confirm_', ''))
    product = db.get_product(product_id)
    
    if not product or product['is_active'] == 0 or product['stock'] <= 0:
        await query.edit_message_text(
            "❌ **Product is no longer available.**",
            parse_mode='Markdown'
        )
        return
    
    user_id = query.from_user.id
    user = db.get_user(user_id)
    
    if user['balance'] < product['price_inr']:
        await query.edit_message_text(
            "❌ **Insufficient balance!**\n\n"
            "Please deposit first using the Deposit option.",
            parse_mode='Markdown'
        )
        return
    
    # Deduct balance
    db.deduct_balance(user_id, product['price_inr'])
    
    # Update stock
    db.update_stock(product_id, product['stock'] - 1)
    
    # Deliver product
    content = product['content'] or "Product details will be sent manually by admin."
    
    await query.edit_message_text(
        f"✅ **Purchase Successful!**\n\n"
        f"**Product:** {product['name']}\n"
        f"**Price:** ₹{product['price_inr']:.2f}\n"
        f"**Balance Remaining:** ₹{db.get_user(user_id)['balance']:.2f}\n\n"
        f"📦 **Product Details:**\n{content}\n\n"
        f"Thank you for your purchase! 🎉",
        parse_mode='Markdown'
    )

# ==================== PROFILE ====================
async def profile(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show user profile"""
    query = update.callback_query
    await query.answer()
    
    user_id = query.from_user.id
    user = db.get_user(user_id)
    
    if not user:
        return
    
    referral_link = f"https://t.me/{config.BOT_USERNAME.replace('@', '')}?start=ref_{user_id}"
    referral_on = db.get_setting('referral_on', '1')
    reward = db.get_setting('referral_reward', '0.01')
    
    message = f"""**👤 YOUR PROFILE**

**Account Information**
• Name: {user['full_name']}
• ID: {user['telegram_id']}
• Joined: {user['join_date'][:16] if user['join_date'] else 'N/A'}

**Wallet**
• Balance: ₹{user['balance']:.2f}
• Deposited: ₹{user['total_deposited']:.2f}
• Spent: ₹{user['total_spent']:.2f}
• Purchases: {user['purchases_count']}

**Referral Program**
• Referrals: {user['referral_count']}
• Earned: ₹{user['referral_earned']:.2f}
• Reward: ₹{reward} per validated join

{f"**Your Referral Link:**\n`{referral_link}`\n\nShare your link — earn ₹{reward} when they join!" if referral_on == '1' else ""}"""
    
    keyboard = [[InlineKeyboardButton("🔙 Back", callback_data="main_menu")]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await query.edit_message_text(
        message,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

# ==================== DEPOSIT ====================
async def deposit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show deposit methods"""
    query = update.callback_query
    await query.answer()
    
    user = db.get_user(query.from_user.id)
    
    # Check payment ON/OFF
    payment_on = db.get_setting('payment_on', '1')
    if payment_on == '0':
        await query.edit_message_text(
            "⏳ **Deposits are currently disabled.**\n"
            "Please try again later.",
            parse_mode='Markdown'
        )
        return
    
    keyboard = [
        [InlineKeyboardButton("💳 GPay", callback_data="deposit_gpay")],
        [InlineKeyboardButton("📱 FamPay", callback_data="deposit_fampay")],
        [InlineKeyboardButton("🔄 Any UPI", callback_data="deposit_anyupi")],
        [InlineKeyboardButton("🔗 BNB Smart Chain (BEP20)", callback_data="deposit_crypto")],
        [InlineKeyboardButton("🔙 Back", callback_data="main_menu")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await query.edit_message_text(
        "💰 **Select Payment Method**\n\n"
        "Choose your preferred payment method:",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def deposit_method(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show deposit method details"""
    query = update.callback_query
    await query.answer()
    
    method = query.data.replace('deposit_', '')
    user_id = query.from_user.id
    
    # Store method in context for later
    context.user_data['deposit_method'] = method
    
    # Show amount entry
    keyboard = [[InlineKeyboardButton("🔙 Back", callback_data="deposit")]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    min_deposit = db.get_setting('min_deposit', '20')
    await query.edit_message_text(
        f"💳 **{method.upper()} Payment**\n\n"
        f"Minimum: ₹{min_deposit}\n"
        f"Manual verification after screenshot\n\n"
        f"Enter amount in ₹ (minimum ₹{min_deposit}):",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )
    
    # Set state for amount entry
    context.user_data['waiting_for_amount'] = True

async def process_deposit_amount(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Process deposit amount entry"""
    try:
        amount = float(update.message.text)
        min_deposit = float(db.get_setting('min_deposit', '20'))
        
        if amount < min_deposit:
            await update.message.reply_text(
                f"❌ Minimum deposit is ₹{min_deposit:.0f}.\n"
                f"Please try again.",
                parse_mode='Markdown'
            )
            return
        
        user_id = update.effective_user.id
        method = context.user_data.get('deposit_method', 'UPI')
        ref_id = generate_ref_id(user_id)
        
        # Create deposit record
        db.create_deposit(user_id, amount, method, ref_id)
        
        # Show QR code and payment details
        upi_id = db.get_setting('upi_id', 'saniguru41-1@okicici')
        rate = float(db.get_setting('rate', '90.0'))
        usd_amount = amount / rate
        
        # Get active QR
        qr = db.get_active_qr(method)
        qr_text = "Please contact admin for QR code" if not qr else "✅ QR Code available"
        
        # Rate is 90, so amount/rate
        keyboard = [
            [InlineKeyboardButton("✅ I Have Paid", callback_data=f"paid_{ref_id}")],
            [InlineKeyboardButton("❌ Cancel Deposit", callback_data="deposit")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        message = f"""**💳 UPI Payment**

🔴 **Scan The Above QR Code to Pay:**
💰 **Amount:** ₹{amount:.0f} (${usd_amount:.2f})

📋 **Ref ID:** `{ref_id}`
📄 **UPI ID:** `{upi_id}`

⚡ **Instructions:**
1. Open GPay and scan the QR
2. or manually enter UPI ID above
3. Pay exactly ₹{amount:.0f} (Do Not Change The Amount)
4. After Successful Payment Click "✅ I Have Paid" below

⚠️ The QR Code Is Only Valid For 15 Minutes!

{qr_text}"""
        
        await update.message.reply_text(
            message,
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
        
        context.user_data['waiting_for_amount'] = False
        
    except ValueError:
        await update.message.reply_text(
            "❌ Please enter a valid number (e.g., 100).",
            parse_mode='Markdown'
        )

async def deposit_paid(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle paid confirmation"""
    query = update.callback_query
    await query.answer()
    
    ref_id = query.data.replace('paid_', '')
    
    await query.edit_message_text(
        f"📤 **Payment Noted!**\n\n"
        "⚠️ Please send a screenshot of your payment now.\n\n"
        f"**Amount:** ₹{query.message.text.split('**Amount:**')[1].split('\\n')[0] if '**Amount:**' in query.message.text else 'N/A'}\n"
        f"**Ref ID:** `{ref_id}`\n\n"
        "📸 Send the screenshot image...",
        parse_mode='Markdown'
    )
    
    context.user_data['waiting_for_screenshot'] = ref_id

async def handle_screenshot(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle payment screenshot"""
    user_id = update.effective_user.id
    ref_id = context.user_data.get('waiting_for_screenshot')
    
    if not ref_id:
        await update.message.reply_text(
            "❌ No pending payment found. Please start a new deposit.",
            parse_mode='Markdown'
        )
        return
    
    photo = update.message.photo[-1]
    file_id = photo.file_id
    
    # Update deposit with screenshot
    # Get deposit by ref_id
    conn = db.get_db()
    c = conn.cursor()
    c.execute("SELECT id FROM deposits WHERE ref_id = ?", (ref_id,))
    deposit = c.fetchone()
    conn.close()
    
    if deposit:
        db.update_deposit_screenshot(deposit['id'], file_id)
        
        await update.message.reply_text(
            "✅ **Screenshot received!**\n\n"
            "⏳ Please wait... Our team is reviewing your payment.\n"
            "You will be notified once it's approved.\n\n"
            f"**Ref ID:** `{ref_id}`",
            parse_mode='Markdown'
        )
        
        # Notify admin
        await notify_admin(update, context, ref_id, user_id)
        
        context.user_data['waiting_for_screenshot'] = None

async def notify_admin(update: Update, context: ContextTypes.DEFAULT_TYPE, ref_id: str, user_id: int):
    """Notify admin about new deposit"""
    # Get deposit details
    conn = db.get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM deposits WHERE ref_id = ?", (ref_id,))
    deposit = c.fetchone()
    conn.close()
    
    if not deposit:
        return
    
    user = db.get_user(user_id)
    
    message = f"💰 **New Deposit Request**\n\n"
    message += f"**User:** {user['full_name']}\n"
    message += f"**ID:** `{user_id}`\n"
    message += f"**Amount:** ₹{deposit['amount']:.0f}\n"
    message += f"**Ref ID:** `{ref_id}`\n"
    message += f"**Method:** {deposit['method']}\n\n"
    message += f"Use Admin Bot to approve/reject."
    
    try:
        await context.bot.send_message(
            chat_id=config.OWNER_ID,
            text=message,
            parse_mode='Markdown'
        )
    except:
        pass

# ==================== REFERRAL ====================
async def refer_earn(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show referral info"""
    query = update.callback_query
    await query.answer()
    
    user_id = query.from_user.id
    user = db.get_user(user_id)
    
    referral_on = db.get_setting('referral_on', '1')
    reward = db.get_setting('referral_reward', '0.01')
    referral_link = f"https://t.me/{config.BOT_USERNAME.replace('@', '')}?start=ref_{user_id}"
    
    if referral_on == '0':
        await query.edit_message_text(
            "🎁 **Referral Program is currently disabled.**\n"
            "Please check back later.",
            parse_mode='Markdown'
        )
        return
  
