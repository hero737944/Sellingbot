# admin_bot.py - Admin/Owner Bot

import logging
from datetime import datetime
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes
import config
import database as db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Admin states
AWAITING_PASSWORD = 0
AWAITING_NEW_PASSWORD = 1
AWAITING_PRODUCT_NAME = 2
AWAITING_PRODUCT_PRICE = 3
AWAITING_PRODUCT_STOCK = 4
AWAITING_PRODUCT_CONTENT = 5
AWAITING_RATE = 6
AWAITING_REWARD = 7
AWAITING_BROADCAST = 8
AWAITING_MESSAGE_USER = 9
AWAITING_QR_METHOD = 10
AWAITING_QR_UPLOAD = 11
AWAITING_GROUP_LINK = 12
AWAITING_CHANNEL_LINK = 13
AWAITING_UPI_ID = 14

# Check if user is owner
def is_owner(user_id):
    return user_id == config.OWNER_ID

# ==================== START ====================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command - Password protected"""
    user_id = update.effective_user.id
    
    if not is_owner(user_id):
        await update.message.reply_text(
            "🚫 **Unauthorized Access**\n\n"
            "This bot is for owner only.",
            parse_mode='Markdown'
        )
        return
    
    # Check if already logged in
    if context.user_data.get('logged_in', False):
        await show_admin_menu(update, context)
        return
    
    # Ask for password
    await update.message.reply_text(
        "🔐 **Enter Password:**",
        parse_mode='Markdown'
    )
    context.user_data['state'] = AWAITING_PASSWORD

async def handle_password(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle password entry"""
    password = update.message.text
    
    if password == config.ADMIN_PASSWORD:
        context.user_data['logged_in'] = True
        context.user_data['state'] = None
        await update.message.reply_text(
            "✅ **Password Correct!**\n\n"
            "👑 Welcome Owner! All systems online.\n"
            "Loading admin panel...",
            parse_mode='Markdown'
        )
        await show_admin_menu(update, context)
    else:
        await update.message.reply_text(
            "❌ **Wrong Password!**\n\n"
            "Please try again or contact support.",
            parse_mode='Markdown'
        )

async def show_admin_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show admin main menu"""
    keyboard = [
        [InlineKeyboardButton("📋 Pending Deposits", callback_data="admin_pending")],
        [InlineKeyboardButton("📦 Products", callback_data="admin_products")],
        [InlineKeyboardButton("💳 Payment Methods", callback_data="admin_payment")],
        [InlineKeyboardButton("💱 Rate Settings", callback_data="admin_rate")],
        [InlineKeyboardButton("🎁 Referral Settings", callback_data="admin_referral")],
        [InlineKeyboardButton("👥 User Management", callback_data="admin_users")],
        [InlineKeyboardButton("📢 Broadcast", callback_data="admin_broadcast")],
        [InlineKeyboardButton("🔗 Join Links", callback_data="admin_links")],
        [InlineKeyboardButton("🔐 Password", callback_data="admin_password")],
        [InlineKeyboardButton("📊 Stats", callback_data="admin_stats")],
        [InlineKeyboardButton("🚪 Logout", callback_data="admin_logout")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        f"👑 **Welcome Owner!**\n\n"
        f"📊 **Dashboard Overview**\n"
        f"• Bot: {config.BOT_NAME}\n"
        f"• Owner: {config.OWNER_USERNAME}\n\n"
        f"Select an option below:",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

# ==================== ADMIN CALLBACKS ====================
async def admin_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle admin callback queries"""
    query = update.callback_query
    await query.answer()
    
    if not is_owner(query.from_user.id):
        await query.edit_message_text("🚫 Unauthorized access.", parse_mode='Markdown')
        return
    
    if not context.user_data.get('logged_in', False):
        await query.edit_message_text("🔐 Please login with /start first.", parse_mode='Markdown')
        return
    
    data = query.data
    
    if data == "admin_pending":
        await show_pending_deposits(query, context)
    elif data == "admin_products":
        await show_products_menu(query, context)
    elif data == "admin_payment":
        await show_payment_menu(query, context)
    elif data == "admin_rate":
        await show_rate_menu(query, context)
    elif data == "admin_referral":
        await show_referral_menu(query, context)
    elif data == "admin_users":
        await show_user_management(query, context)
    elif data == "admin_broadcast":
        await show_broadcast(query, context)
    elif data == "admin_links":
        await show_links_menu(query, context)
    elif data == "admin_password":
        await show_password_menu(query, context)
    elif data == "admin_stats":
        await show_stats(query, context)
    elif data == "admin_logout":
        context.user_data['logged_in'] = False
        await query.edit_message_text(
            "🔐 **Logged Out Successfully.**\n\n"
            "Use /start to login again.",
            parse_mode='Markdown'
        )
    elif data.startswith("approve_"):
        await approve_deposit_action(query, context)
    elif data.startswith("reject_"):
        await reject_deposit_action(query, context)
    elif data.startswith("product_add"):
        await start_add_product(query, context)
    elif data.startswith("product_edit"):
        await edit_product(query, context)
    elif data.startswith("product_delete"):
        await delete_product_action(query, context)
    elif data.startswith("payment_toggle_"):
        await toggle_payment_method(query, context)
    elif data.startswith("change_qr_"):
        await change_qr_action(query, context)
    elif data.startswith("upload_qr_"):
        await upload_qr_action(query, context)
    elif data == "admin_back":
        await query.edit_message_reply_markup(None)
        await show_admin_menu_from_query(query, context)

# ==================== PENDING DEPOSITS ====================
async def show_pending_deposits(query, context):
    """Show pending deposits"""
    deposits = db.get_pending_deposits()
    
    if not deposits:
        await query.edit_message_text(
            "✅ **No pending deposits.**\n\n"
            "All deposits have been processed.",
            parse_mode='Markdown'
        )
        return
    
    for deposit in deposits[:10]:  # Show first 10
        keyboard = [
            [InlineKeyboardButton("✅ Approve", callback_data=f"approve_{deposit['id']}")],
            [InlineKeyboardButton("❌ Reject", callback_data=f"reject_{deposit['id']}")],
            [InlineKeyboardButton("✉️ Send Message", callback_data=f"message_{deposit['user_id']}")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        message = f"**💰 Pending Deposit**\n\n"
        message += f"**User:** {deposit['full_name']}\n"
        message += f"**ID:** `{deposit['user_id']}`\n"
        message += f"**Amount:** ₹{deposit['amount']:.0f}\n"
        message += f"**Ref ID:** `{deposit['ref_id']}`\n"
        message += f"**Method:** {deposit['method']}\n"
        message += f"**Date:** {deposit['date'][:16]}\n"
        message += f"**Screenshot:** {'✅' if deposit['screenshot'] else '❌'}"
        
        await query.message.reply_text(
            message,
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
    
    # Add back button
    keyboard = [[InlineKeyboardButton("🔙 Back", callback_data="admin_back")]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await query.message.reply_text(
        "📋 **Deposits List**\n\n"
        f"Showing {min(len(deposits), 10)} of {len(deposits)} pending deposits.",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def approve_deposit_action(query, context):
    """Approve a deposit"""
    deposit_id = int(query.data.replace('approve_', ''))
    
    if db.approve_deposit(deposit_id, query.from_user.id):
        await query.edit_message_text(
            f"✅ **Deposit Approved!**\n\n"
            f"Deposit ID: {deposit_id}\n"
            f"User has been credited.",
            parse_mode='Markdown'
        )
        
        # Get deposit details for notification
        conn = db.get_db()
        c = conn.cursor()
        c.execute("SELECT * FROM deposits WHERE id = ?", (deposit_id,))
        deposit = c.fetchone()
        conn.close()
        
        if deposit:
            try:
                await context.bot.send_message(
                    chat_id=deposit['user_id'],
                    text=f"✅ **Payment Approved!**\n\n"
                         f"₹{deposit['amount']:.0f} has been added to your wallet.\n\n"
                         f"**Ref ID:** `{deposit['ref_id']}`\n"
                         f"**Balance:** ₹{db.get_user(deposit['user_id'])['balance']:.2f}",
                    parse_mode='Markdown'
                )
            except:
                pass
    else:
        await query.edit_message_text(
            "❌ **Failed to approve deposit.**\n"
            "Deposit may not exist or already processed.",
            parse_mode='Markdown'
        )

async def reject_deposit_action(query, context):
    """Reject a deposit"""
    deposit_id = int(query.data.replace('reject_', ''))
    
    db.reject_deposit(deposit_id, query.from_user.id)
    
    await query.edit_message_text(
        f"❌ **Deposit Rejected!**\n\n"
        f"Deposit ID: {deposit_id}\n"
        f"User has been notified.",
        parse_mode='Markdown'
    )
    
    # Get deposit details
    conn = db.get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM deposits WHERE id = ?", (deposit_id,))
    deposit = c.fetchone()
    conn.close()
    
    if deposit:
        try:
            await context.bot.send_message(
                chat_id=deposit['user_id'],
                text=f"❌ **Payment Rejected!**\n\n"
                     f"Your payment of ₹{deposit['amount']:.0f} has been rejected.\n\n"
                     f"**Ref ID:** `{deposit['ref_id']}`\n"
                     f"Please contact support for more information.\n\n"
                     f"Contact: {config.OWNER_USERNAME}",
                parse_mode='Markdown'
            )
        except:
            pass

# ==================== PRODUCTS ====================
async def show_products_menu(query, context):
    """Show products management menu"""
    keyboard = [
        [InlineKeyboardButton("➕ Add Product", callback_data="product_add")],
        [InlineKeyboardButton("📋 List Products", callback_data="product_list")],
        [InlineKeyboardButton("🔙 Back", callback_data="admin_back")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await query.edit_message_text(
        "📦 **Product Management**\n\n"
        "Manage your products here.",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def start_add_product(query, context):
    """Start adding a product"""
    await query.edit_message_text(
        "➕ **Add New Product**\n\n"
        "Enter product name:",
        parse_mode='Markdown'
    )
    context.user_data['state'] = AWAITING_PRODUCT_NAME

async def handle_add_product(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle product addition flow"""
    state = context.user_data.get('state')
    
    if state == AWAITING_PRODUCT_NAME:
        context.user_data['product_name'] = update.message.text
        context.user_data['state'] = AWAITING_PRODUCT_PRICE
        await update.message.reply_text(
            "💰 Enter product price in ₹:\n(e.g., 35)",
            parse_mode='Markdown'
        )
    
    elif state == AWAITING_PRODUCT_PRICE:
        try:
            price = float(update.message.text)
            context.user_data['product_price'] = price
            context.user_data['state'] = AWAITING_PRODUCT_STOCK
            rate = float(db.get_setting('rate', '90.0'))
            usd_price = price / rate
            await update.message.reply_text(
                f"📦 Enter stock quantity:\n\n"
                f"Price: ₹{price:.0f} (${usd_price:.2f})\n"
                f"Stock: ",
                parse_mode='Markdown'
            )
        except ValueError:
            await update.message.reply_text(
                "❌ Please enter a valid number.",
                parse_mode='Markdown'
            )
    
    elif state == AWAITING_PRODUCT_STOCK:
        try:
            stock = int(update.message.text)
            context.user_data['product_stock'] = stock
            context.user_data['state'] = AWAITING_PRODUCT_CONTENT
            await update.message.reply_text(
                "📝 Enter product content/description:\n"
                "(This will be delivered to buyer)",
                parse_mode='Markdown'
            )
        except ValueError:
            await update.message.reply_text(
                "❌ Please enter a valid number for stock.",
                parse_mode='Markdown'
            )
    
    elif state == AWAITING_PRODUCT_CONTENT:
        content = update.message.text
        name = context.user_data.get('product_name')
        price = context.user_data.get('product_price')
        stock = context.user_data.get('product_stock')
        rate = float(db.get_setting('rate', '90.0'))
        usd_price = price / rate
        
        db.add_product(name, usd_price, price, stock, content)
        
        await update.message.reply_text(
            f"✅ **Product Added Successfully!**\n\n"
            f"**Name:** {name}\n"
            f"**Price:** ₹{price:.0f} (${usd_price:.2f})\n"
            f"**Stock:** {stock}\n\n"
            f"Product is now available for purchase.",
            parse_mode='Markdown'
        )
        context.user_data['state'] = None

# ==================== PAYMENT METHODS ====================
async def show_payment_menu(query, context):
    """Show payment methods management"""
    payment_on = db.get_setting('payment_on', '1')
    upi_id = db.get_setting('upi_id', 'saniguru41-1@okicici')
    
    keyboard = [
        [InlineKeyboardButton(
            f"{'🟢' if payment_on == '1' else '🔴'} Payments: {'ON' if payment_on == '1' else 'OFF'}",
            callback_data="payment_toggle_main"
        )],
        [InlineKeyboardButton("💳 UPI ID Change", callback_data="change_upi")],
        [InlineKeyboardButton("📱 QR Code", callback_data="change_qr")],
        [InlineKeyboardButton("🔗 BNB Address", callback_data="change_crypto")],
        [InlineKeyboardButton("🔙 Back", callback_data="admin_back")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await query.edit_message_text(
        f"💳 **Payment Methods**\n\n"
        f"Current UPI ID: `{upi_id}`\n"
        f"Payment Status: {'🟢 ON' if payment_on == '1' else '🔴 OFF'}\n\n"
        f"Manage payment methods below:",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def toggle_payment_method(query, context):
    """Toggle payment ON/OFF"""
    current = db.get_setting('payment_on', '1')
    new_value = '0' if current == '1' else '1'
    db.update_setting('payment_on', new_value)
    
    await query.edit_message_text(
        f"✅ **Payment {'Disabled' if new_value == '0' else 'Enabled'}!**\n\n"
        f"Payment method is now {'OFF' if new_value == '0' else 'ON'}.",
        parse_mode='Markdown'
    )
    await show_payment_menu(query, context)

async def change_upi_id(query, context):
    """Change UPI ID"""
    await query.edit_message_text(
        "💳 **Change UPI ID**\n\n"
        "Enter new UPI ID:\n"
        "(e.g., example@okicici)",
        parse_mode='Markdown'
    )
    context.user_data['state'] = AWAITING_UPI_ID

async def handle_change_upi(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle UPI ID change"""
    upi_id = update.message.text
    db.update_setting('upi_id', upi_id)
    
    await update.message.reply_text(
        f"✅ **UPI ID Updated!**\n\n"
        f"New UPI ID: `{upi_id}`\n"
        f"Users will see this when making deposits.",
        parse_mode='Markdown'
    )
    context.user_data['state'] = None

async def change_qr_action(query, context):
    """Show QR change options"""
    keyboard = [
        [InlineKeyboardButton("📱 GPay QR", callback_data="upload_qr_GPay")],
        [InlineKeyboardButton("📱 FamPay QR", callback_data="upload_qr_FamPay")],
        [InlineKeyboardButton("🔄 Any UPI QR", callback_data="upload_qr_AnyUPI")],
        [InlineKeyboardButton("🔙 Back", callback_data="admin_payment")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await query.edit_message_text(
        "📱 **Change QR Code**\n\n"
        "Select which method's QR to change:",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def upload_qr_action(query, context):
    """Start QR upload process"""
    method = query.data.replace('upload_qr_', '')
    context.user_data['qr_method'] = method
    context.user_data['state'] = AWAITING_QR_UPLOAD
    
    await query.edit_message_text(
        f"📤 **Upload New QR Code**\n\n"
        f"Method: {method}\n\n"
        f"Please send the QR code image.\n"
        f"(Send as photo, not file)",
        parse_mode='Markdown'
    )

async def handle_qr_upload(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle QR code upload"""
    method = context.user_data.get('qr_method')
    if not method:
        await update.message.reply_text(
            "❌ No QR method selected. Please start again.",
            parse_mode='Markdown'
        )
        return
    
    photo = update.message.photo[-1]
    file_id = photo.file_id
    
    db.save_qr(method, file_id)
    
    await update.message.reply_text(
        f"✅ **QR Code Updated!**\n\n"
        f"Method: {method}\n"
        f"QR code has been saved and will be shown to users.\n\n"
        f"🔄 Old QR codes have been archived.",
        parse_mode='Markdown'
    )
    context.user_data['state'] = None
    context.user_data['qr_method'] = None

# ==================== RATE SETTINGS ====================
async def show_rate_menu(query, context):
    """Show rate settings"""
    rate = float(db.get_setting('rate', '90.0'))
    
    keyboard = [
        [InlineKeyboardButton("💱 Change Rate", callback_data="rate_change")],
        [InlineKeyboardButton("🔙 Back", callback_data="admin_back")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await query.edit_message_text(
        f"💱 **Rate Settings**\n\n"
        f"Current Rate: 1 USDT = ₹{rate:.1f}\n\n"
        f"Products priced in ₹ are calculated using this rate.\n"
        f"Users see both ₹ and $ prices.",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def change_rate(query, context):
    """Start rate change"""
    await query.edit_message_text(
        "💱 **Change Rate**\n\n"
        "Enter new rate:\n"
        "(e.g., 90 for 1 USDT = ₹90)",
        parse_mode='Markdown'
    )
    context.user_data['state'] = AWAITING_RATE

async def handle_rate_change(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle rate change"""
    try:
        rate = float(update.message.text)
        db.update_setting('rate', str(rate))
        
        await update.message.reply_text(
            f"✅ **Rate Updated!**\n\n"
            f"New Rate: 1 USDT = ₹{rate:.1f}\n\n"
            f"All products will use this rate for price display.",
            parse_mode='Markdown'
        )
        context.user_data['state'] = None
    except ValueError:
        await update.message.reply_text(
            "❌ Please enter a valid number.",
            parse_mode='Markdown'
        )

# =
