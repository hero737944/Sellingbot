# database.py - SQLite Database Operations

import sqlite3
import json
from datetime import datetime
from typing import Optional, List, Dict, Any

DB_PATH = "data/bot.db"

def get_db():
    """Get database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize all database tables"""
    conn = get_db()
    c = conn.cursor()
    
    # Users Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER UNIQUE NOT NULL,
            username TEXT,
            full_name TEXT,
            join_date TEXT,
            balance REAL DEFAULT 0,
            total_deposited REAL DEFAULT 0,
            total_spent REAL DEFAULT 0,
            purchases_count INTEGER DEFAULT 0,
            is_banned INTEGER DEFAULT 0,
            is_restricted INTEGER DEFAULT 0,
            referral_count INTEGER DEFAULT 0,
            referral_earned REAL DEFAULT 0,
            referrer_id INTEGER DEFAULT NULL,
            terms_accepted INTEGER DEFAULT 0,
            FOREIGN KEY (referrer_id) REFERENCES users (telegram_id)
        )
    ''')
    
    # Products Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT DEFAULT 'Account',
            price_usd REAL NOT NULL,
            price_inr REAL NOT NULL,
            stock INTEGER DEFAULT 0,
            content TEXT,
            quality TEXT,
            is_active INTEGER DEFAULT 1,
            date_added TEXT
        )
    ''')
    
    # Deposits Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS deposits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            ref_id TEXT UNIQUE NOT NULL,
            screenshot TEXT,
            method TEXT,
            status TEXT DEFAULT 'pending',
            date TEXT,
            approved_by INTEGER DEFAULT NULL,
            approved_date TEXT DEFAULT NULL,
            FOREIGN KEY (user_id) REFERENCES users (telegram_id)
        )
    ''')
    
    # Referrals Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_id INTEGER NOT NULL,
            referred_id INTEGER NOT NULL,
            reward_amount REAL DEFAULT 0,
            date TEXT,
            status TEXT DEFAULT 'pending',
            FOREIGN KEY (referrer_id) REFERENCES users (telegram_id),
            FOREIGN KEY (referred_id) REFERENCES users (telegram_id)
        )
    ''')
    
    # Settings Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT,
            updated_at TEXT
        )
    ''')
    
    # QR Codes Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS qr_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            method TEXT NOT NULL,
            pic_data TEXT,
            uploaded_at TEXT,
            expiry TEXT,
            is_active INTEGER DEFAULT 1
        )
    ''')
    
    # Default Settings
    default_settings = [
        ('payment_on', '1'),
        ('referral_on', '1'),
        ('referral_reward', '0.01'),
        ('rate', '90.0'),
        ('upi_id', 'saniguru41-1@okicici'),
        ('group_link', 'https://t.me/TGSTOREX'),
        ('channel_link', 'https://t.me/TGSOTR'),
        ('min_deposit', '20'),
        ('crypto_address', '0x16cd0453d4d8f95fb33eb2e63575643e808daf71')
    ]
    
    for key, value in default_settings:
        c.execute('''
            INSERT OR IGNORE INTO settings (key, value, updated_at)
            VALUES (?, ?, ?)
        ''', (key, value, datetime.now().isoformat()))
    
    conn.commit()
    conn.close()

# ==================== USER FUNCTIONS ====================

def create_user(telegram_id: int, username: str = None, full_name: str = None, referrer_id: int = None):
    """Create new user"""
    conn = get_db()
    c = conn.cursor()
    
    # Check if user exists
    c.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
    user = c.fetchone()
    
    if user:
        conn.close()
        return user
    
    # Create user
    join_date = datetime.now().isoformat()
    c.execute('''
        INSERT INTO users (telegram_id, username, full_name, join_date, referrer_id)
        VALUES (?, ?, ?, ?, ?)
    ''', (telegram_id, username, full_name, join_date, referrer_id))
    
    # Handle referral reward
    if referrer_id and referrer_id != telegram_id:
        # Check if referrer exists
        c.execute("SELECT * FROM users WHERE telegram_id = ?", (referrer_id,))
        referrer = c.fetchone()
        if referrer:
            reward = float(get_setting('referral_reward', '0.01'))
            c.execute('''
                UPDATE users SET 
                    referral_count = referral_count + 1,
                    referral_earned = referral_earned + ?,
                    balance = balance + ?
                WHERE telegram_id = ?
            ''', (reward, reward, referrer_id))
            
            c.execute('''
                INSERT INTO referrals (referrer_id, referred_id, reward_amount, date, status)
                VALUES (?, ?, ?, ?, 'completed')
            ''', (referrer_id, telegram_id, reward, datetime.now().isoformat()))
    
    conn.commit()
    c.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
    user = c.fetchone()
    conn.close()
    return user

def get_user(telegram_id: int):
    """Get user by ID"""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
    user = c.fetchone()
    conn.close()
    return user

def update_user(telegram_id: int, **kwargs):
    """Update user fields"""
    conn = get_db()
    c = conn.cursor()
    
    for key, value in kwargs.items():
        c.execute(f"UPDATE users SET {key} = ? WHERE telegram_id = ?", (value, telegram_id))
    
    conn.commit()
    conn.close()

def add_balance(telegram_id: int, amount: float):
    """Add balance to user"""
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        UPDATE users SET 
            balance = balance + ?,
            total_deposited = total_deposited + ?
        WHERE telegram_id = ?
    ''', (amount, amount, telegram_id))
    conn.commit()
    conn.close()

def deduct_balance(telegram_id: int, amount: float):
    """Deduct balance from user"""
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        UPDATE users SET 
            balance = balance - ?,
            total_spent = total_spent + ?,
            purchases_count = purchases_count + 1
        WHERE telegram_id = ?
    ''', (amount, amount, telegram_id))
    conn.commit()
    conn.close()

# ==================== PRODUCT FUNCTIONS ====================

def add_product(name: str, price_usd: float, price_inr: float, stock: int, content: str, quality: str = "", category: str = "Account"):
    """Add new product"""
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT INTO products (name, category, price_usd, price_inr, stock, content, quality, date_added)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (name, category, price_usd, price_inr, stock, content, quality, datetime.now().isoformat()))
    conn.commit()
    product_id = c.lastrowid
    conn.close()
    return product_id

def get_products(category: str = None):
    """Get all active products"""
    conn = get_db()
    c = conn.cursor()
    if category:
        c.execute("SELECT * FROM products WHERE is_active = 1 AND category = ? ORDER BY id", (category,))
    else:
        c.execute("SELECT * FROM products WHERE is_active = 1 ORDER BY id")
    products = c.fetchall()
    conn.close()
    return products

def get_product(product_id: int):
    """Get product by ID"""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM products WHERE id = ?", (product_id,))
    product = c.fetchone()
    conn.close()
    return product

def update_product(product_id: int, **kwargs):
    """Update product"""
    conn = get_db()
    c = conn.cursor()
    for key, value in kwargs.items():
        c.execute(f"UPDATE products SET {key} = ? WHERE id = ?", (value, product_id))
    conn.commit()
    conn.close()

def delete_product(product_id: int):
    """Soft delete product"""
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE products SET is_active = 0 WHERE id = ?", (product_id,))
    conn.commit()
    conn.close()

def update_stock(product_id: int, new_stock: int):
    """Update product stock"""
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE products SET stock = ? WHERE id = ?", (new_stock, product_id))
    conn.commit()
    conn.close()

# ==================== DEPOSIT FUNCTIONS ====================

def create_deposit(user_id: int, amount: float, method: str, ref_id: str):
    """Create new deposit request"""
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT INTO deposits (user_id, amount, ref_id, method, status, date)
        VALUES (?, ?, ?, ?, 'pending', ?)
    ''', (user_id, amount, ref_id, method, datetime.now().isoformat()))
    conn.commit()
    deposit_id = c.lastrowid
    conn.close()
    return deposit_id

def get_pending_deposits():
    """Get all pending deposits"""
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        SELECT d.*, u.username, u.full_name 
        FROM deposits d
        JOIN users u ON d.user_id = u.telegram_id
        WHERE d.status = 'pending'
        ORDER BY d.date DESC
    ''')
    deposits = c.fetchall()
    conn.close()
    return deposits

def get_user_deposits(user_id: int):
    """Get user deposits"""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM deposits WHERE user_id = ? ORDER BY date DESC", (user_id,))
    deposits = c.fetchall()
    conn.close()
    return deposits

def approve_deposit(deposit_id: int, admin_id: int):
    """Approve deposit"""
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        SELECT * FROM deposits WHERE id = ? AND status = 'pending'
    ''', (deposit_id,))
    deposit = c.fetchone()
    
    if not deposit:
        conn.close()
        return False
    
    c.execute('''
        UPDATE deposits SET 
            status = 'approved', 
            approved_by = ?, 
            approved_date = ?
        WHERE id = ?
    ''', (admin_id, datetime.now().isoformat(), deposit_id))
    
    # Add balance to user
    c.execute('''
        UPDATE users SET 
            balance = balance + ?,
            total_deposited = total_deposited + ?
        WHERE telegram_id = ?
    ''', (deposit['amount'], deposit['amount'], deposit['user_id']))
    
    conn.commit()
    conn.close()
    return True

def reject_deposit(deposit_id: int, admin_id: int):
    """Reject deposit"""
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        UPDATE deposits SET 
            status = 'rejected', 
            approved_by = ?, 
            approved_date = ?
        WHERE id = ? AND status = 'pending'
    ''', (admin_id, datetime.now().isoformat(), deposit_id))
    conn.commit()
    conn.close()

def update_deposit_screenshot(deposit_id: int, screenshot: str):
    """Update deposit screenshot"""
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE deposits SET screenshot = ? WHERE id = ?", (screenshot, deposit_id))
    conn.commit()
    conn.close()

# ==================== SETTINGS FUNCTIONS ====================

def get_setting(key: str, default: str = None):
    """Get setting value"""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT value FROM settings WHERE key = ?", (key,))
    result = c.fetchone()
    conn.close()
    return result[0] if result else default

def update_setting(key: str, value: str):
    """Update setting"""
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT OR REPLACE INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
    ''', (key, value, datetime.now().isoformat()))
    conn.commit()
    conn.close()

def toggle_setting(key: str):
    """Toggle boolean setting"""
    current = get_setting(key, '0')
    new_value = '0' if current == '1' else '1'
    update_setting(key, new_value)
    return new_value

# ==================== QR FUNCTIONS ====================

def save_qr(method: str, pic_data: str):
    """Save QR code"""
    conn = get_db()
    c = conn.cursor()
    
    # Deactivate old QR
    c.execute("UPDATE qr_codes SET is_active = 0 WHERE method = ?", (method,))
    
    # Save new QR
    c.execute('''
        INSERT INTO qr_codes (method, pic_data, uploaded_at, expiry, is_active)
        VALUES (?, ?, ?, ?, 1)
    ''', (method, pic_data, datetime.now().isoformat(), 
          datetime.now().isoformat(), 1))
    
    # Keep only last MAX_QR_STORAGE
    c.execute('''
        DELETE FROM qr_codes 
        WHERE method = ? AND id NOT IN (
            SELECT id FROM qr_codes 
            WHERE method = ? 
            ORDER BY uploaded_at DESC 
            LIMIT ?
        )
    ''', (method, method, 5))
    
    conn.commit()
    conn.close()

def get_active_qr(method: str):
    """Get active QR code"""
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        SELECT * FROM qr_codes 
        WHERE method = ? AND is_active = 1
        ORDER BY uploaded_at DESC LIMIT 1
    ''', (method,))
    qr = c.fetchone()
    conn.close()
    return qr

def get_all_qr(method: str):
    """Get all QR codes for a method"""
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        SELECT * FROM qr_codes 
        WHERE method = ?
        ORDER BY uploaded_at DESC
    ''', (method,))
    qrs = c.fetchall()
    conn.close()
    return qrs

# ==================== STATS FUNCTIONS ====================

def get_stats():
    """Get bot statistics"""
    conn = get_db()
    c = conn.cursor()
    
    # Total users
    c.execute("SELECT COUNT(*) FROM users")
    total_users = c.fetchone()[0]
    
    # Total deposits
    c.execute("SELECT SUM(amount) FROM deposits WHERE status = 'approved'")
    total_deposits = c.fetchone()[0] or 0
    
    # Total sales
    c.execute("SELECT SUM(total_spent) FROM users")
    total_sales = c.fetchone()[0] or 0
    
    # Active users (joined in last 7 days)
    c.execute("SELECT COUNT(*) FROM users WHERE join_date > datetime('now', '-7 days')")
    active_users = c.fetchone()[0]
    
    conn.close()
    
    return {
        'total_users': total_users,
        'total_deposits': total_deposits,
        'total_sales': total_sales,
        'active_users': active_users
    }

def get_all_users():
    """Get all users"""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM users ORDER BY join_date DESC")
    users = c.fetchall()
    conn.close()
    return users

def get_user_by_telegram_id(telegram_id: int):
    """Get user by Telegram ID"""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
    user = c.fetchone()
    conn.close()
    return user

def ban_user(telegram_id: int):
    """Ban user"""
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE users SET is_banned = 1 WHERE telegram_id = ?", (telegram_id,))
    conn.commit()
    conn.close()

def unban_user(telegram_id: int):
    """Unban user"""
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE users SET is_banned = 0 WHERE telegram_id = ?", (telegram_id,))
    conn.commit()
    conn.close()

def restrict_user(telegram_id: int):
    """Restrict user"""
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE users SET is_restricted = 1 WHERE telegram_id = ?", (telegram_id,))
    conn.commit()
    conn.close()

def unrestrict_user(telegram_id: int):
    """Unrestrict user"""
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE users SET is_restricted = 0 WHERE telegram_id = ?", (telegram_id,))
    conn.commit()
    conn.close()
