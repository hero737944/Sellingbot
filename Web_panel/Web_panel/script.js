// web_panel/script.js

const PASSWORD = 'hero.96';

function login() {
    const input = document.getElementById('password-input');
    const error = document.getElementById('login-error');
    
    if (input.value === PASSWORD) {
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        loadStats();
        updateTime();
        setInterval(updateTime, 1000);
    } else {
        error.style.display = 'block';
        input.value = '';
        input.focus();
    }
}

function logout() {
    document.getElementById('login-container').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('password-input').value = '';
    document.getElementById('login-error').style.display = 'none';
}

function updateTime() {
    document.getElementById('time-display').textContent = new Date().toLocaleString();
}

function loadStats() {
    // Fetch stats from API
    fetch('/api/stats')
        .then(res => res.json())
        .then(data => {
            document.getElementById('total-users').textContent = data.total_users || 0;
            document.getElementById('total-deposits').textContent = '₹' + (data.total_deposits || 0).toFixed(2);
            document.getElementById('total-sales').textContent = '₹' + (data.total_sales || 0).toFixed(2);
            document.getElementById('active-users').textContent = data.active_users || 0;
        })
        .catch(err => console.error('Error loading stats:', err));
}

function loadPage(page) {
    const content = document.getElementById('content-area');
    
    const pages = {
        'pending': `
            <h2>📋 Pending Deposits</h2>
            <p>Loading pending deposits...</p>
            <div id="pending-list"></div>
            <button onclick="loadPending()" class="refresh-btn">🔄 Refresh</button>
        `,
        'products': `
            <h2>📦 Products</h2>
            <button onclick="showAddProduct()" class="action-btn">➕ Add Product</button>
            <div id="product-list"></div>
        `,
        'payment': `
            <h2>💳 Payment Methods</h2>
            <div id="payment-settings"></div>
        `,
        'rate': `
            <h2>💱 Rate Settings</h2>
            <div id="rate-settings"></div>
        `,
        'referral': `
            <h2>🎁 Referral Settings</h2>
            <div id="referral-settings"></div>
        `,
        'broadcast': `
            <h2>📢 Broadcast</h2>
            <textarea id="broadcast-message" rows="6" placeholder="Type your broadcast message here..."></textarea>
            <button onclick="sendBroadcast()" class="action-btn">📤 Send Broadcast</button>
            <div id="broadcast-result"></div>
        `,
        'links': `
            <h2>🔗 Join Links</h2>
            <div id="links-settings"></div>
        `,
        'password': `
            <h2>🔐 Password Settings</h2>
            <input type="password" id="new-password" placeholder="Enter new password">
            <button onclick="changePassword()" class="action-btn">🔑 Change Password</button>
            <div id="password-result"></div>
        `
    };
    
    content.innerHTML = pages[page] || '<p>Page not found</p>';
    
    // Load specific page data
    if (page === 'pending') loadPending();
    if (page === 'products') loadProducts();
    if (page === 'payment') loadPaymentSettings();
    if (page === 'rate') loadRateSettings();
    if (page === 'referral') loadReferralSettings();
    if (page === 'links') loadLinksSettings();
}

// ==================== PENDING DEPOSITS ====================
function loadPending() {
    fetch('/api/pending')
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('pending-list');
            if (data.length === 0) {
                container.innerHTML = '<p style="color:#4caf50;">✅ No pending deposits</p>';
                return;
            }
            
            let html = '';
            data.forEach(d => {
                html += `
                    <div class="deposit-item">
                        <p><strong>${d.full_name}</strong> (${d.user_id})</p>
                        <p>💰 ₹${d.amount} | ${d.method} | Ref: ${d.ref_id}</p>
                        <div class="deposit-actions">
                            <button onclick="approveDeposit(${d.id})" class="approve-btn">✅ Approve</button>
                            <button onclick="rejectDeposit(${d.id})" class="reject-btn">❌ Reject</button>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        })
        .catch(err => console.error('Error loading pending:', err));
}

function approveDeposit(id) {
    if (!confirm('Approve this deposit?')) return;
    fetch(`/api/approve/${id}`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            alert(data.message);
            loadPending();
            loadStats();
        })
        .catch(err => alert('Error approving deposit'));
}

function rejectDeposit(id) {
    if (!confirm('Reject this deposit?')) return;
    fetch(`/api/reject/${id}`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            alert(data.message);
            loadPending();
        })
        .catch(err => alert('Error rejecting deposit'));
}

// ==================== PRODUCTS ====================
function loadProducts() {
    fetch('/api/products')
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('product-list');
            if (data.length === 0) {
                container.innerHTML = '<p>No products available</p>';
                return;
            }
            
            let html = '';
            data.forEach(p => {
                html += `
                    <div class="product-item">
                        <h4>${p.name}</h4>
                        <p>💰 ₹${p.price_inr} | 📦 ${p.stock} in stock</p>
                        <div class="product-actions">
                            <button onclick="editProduct(${p.id})" class="edit-btn">✏️ Edit</button>
                            <button onclick="deleteProduct(${p.id})" class="delete-btn">🗑️ Delete</button>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        })
        .catch(err => console.error('Error loading products:', err));
}

function showAddProduct() {
    const container = document.getElementById('product-list');
    container.innerHTML = `
        <div class="add-product-form">
            <input type="text" id="prod-name" placeholder="Product Name">
            <input type="number" id="prod-price" placeholder="Price (₹)">
            <input type="number" id="prod-stock" placeholder="Stock">
            <textarea id="prod-content" placeholder="Product Content/Delivery"></textarea>
            <button onclick="addProduct()" class="action-btn">✅ Add Product</button>
        </div>
    `;
}

function addProduct() {
    const name = document.getElementById('prod-name').value;
    const price = parseFloat(document.getElementById('prod-price').value);
    const stock = parseInt(document.getElementById('prod-stock').value);
    const content = document.getElementById('prod-content').value;
    
    if (!name || !price || !stock) {
        alert('Please fill all fields');
        return;
    }
    
    fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price, stock, content })
    })
        .then(res => res.json())
        .then(data => {
            alert(data.message);
            loadProducts();
        })
        .catch(err => alert('Error adding product'));
}

function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    fetch(`/api/products/${id}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
            alert(data.message);
            loadProducts();
        })
        .catch(err => alert('Error deleting product'));
}

// ==================== PAYMENT SETTINGS ====================
function loadPaymentSettings() {
    fetch('/api/settings/payment')
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('payment-settings');
            container.innerHTML = `
                <div class="setting-item">
                    <p><strong>Payment Status:</strong> ${data.payment_on === '1' ? '🟢 ON' : '🔴 OFF'}</p>
                    <button onclick="togglePayment()" class="action-btn">
                        ${data.payment_on === '1' ? '🔴 Turn OFF' : '🟢 Turn ON'}
                    </button>
                </div>
                <div class="setting-item">
                    <p><strong>UPI ID:</strong> ${data.upi_id}</p>
                    <input type="text" id="new-upi" placeholder="New UPI ID">
                    <button onclick="updateUPI()" class="action-btn">💳 Update UPI</button>
                </div>
                <div class="setting-item">
                    <p><strong>BNB Address:</strong> ${data.crypto_address}</p>
                    <input type="text" id="new-crypto" placeholder="New BNB Address">
                    <button onclick="updateCrypto()" class="action-btn">🔗 Update BNB</button>
                </div>
            `;
        })
        .catch(err => console.error('Error loading payment settings:', err));
}

function togglePayment() {
    fetch('/api/settings/payment/toggle', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            alert(data.message);
            loadPaymentSettings();
        })
        .catch(err => alert('Error toggling payment'));
}

function updateUPI() {
    const upi = document.getElementById('new-upi').value;
    if (!upi) return;
    fetch('/api/settings/upi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upi_id: upi })
    })
        .then(res => res.json())
        .then(data => {
            alert(data.message);
            loadPaymentSettings();
        })
        .catch(err => alert('Error updating UPI'));
}

function updateCrypto() {
    const address = document.getElementById('new-crypto').value;
    if (!address) return;
    fetch('/api/settings/crypto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crypto_address: address })
    })
        .then(res => res.json())
        .then(data => {
            alert(data.message);
            loadPaymentSettings();
        })
        .catch(err => alert('Error updating crypto address'));
}

// ==================== RATE SETTINGS ====================
function loadRateSettings() {
    fetch('/api/settings/rate')
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('rate-settings');
            container.innerHTML = `
                <div class="setting-item">
                    <p><strong>Current Rate:</strong> 1 USDT = ₹${data.rate}</p>
                    <input type="number" id="new-rate" placeholder="New Rate (e.g., 90)" step="0.5">
                    <button onclick="updateRate()" class="action-btn">💱 Update Rate</button>
                </div>
            `;
        })
        .catch(err => console.error('Error loading rate settings:', err));
}

function updateRate() {
    const rate = document.getElementById('new-rate').value;
    if (!rate) return;
    fetch('/api/settings/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate: parseFloat(rate) })
    })
        .then(res => res.json())
        .then(data => {
            alert(data.message);
            loadRateSettings();
        })
        .catch(err => alert('Error updating rate'));
}

// ==================== REFERRAL SETTINGS ====================
function loadReferralSettings() {
    fetch('/api/settings/referral')
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('referral-settings');
            container.innerHTML = `
                <div class="setting-item">
                    <p><strong>Referral Status:</strong> ${data.referral_on === '1' ? '🟢 ON' : '🔴 OFF'}</p>
                    <button onclick="toggleReferral()" class="action-btn">
                        ${data.referral_on === '1' ? '🔴 Turn OFF' : '🟢 Turn ON'}
                    </button>
                </div>
                <div class="setting-item">
                    <p><strong>Reward per Referral:</strong> ₹${data.referral_reward}</p>
                    <input type="number" id="new-reward" placeholder="New Reward (₹)" step="0.01">
                    <button onclick="updateReward()" class="action-btn">💵 Update Reward</button>
                </div>
            `;
        })
        .catch(err => console.error('Error loading referral settings:', err));
}

function toggleReferral() {
    fetch('/api/settings/referral/toggle', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            alert(data.message);
            loadReferralSettings();
        })
        .catch(err => alert('Error toggling referral'));
}

function updateReward() {
    const reward = document.getElementById('new-reward').value;
    if (!reward) return;
    fetch('/api/settings/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reward: parseFloat(reward) })
    })
        .then(res => res.json())
        .then(data => {
            alert(data.message);
            loadReferralSettings();
        })
        .catch(err => alert('Error updating reward'));
}

// ==================== BROADCAST ====================
function sendBroadcast() {
    const message = document.getElementById('broadcast-message').value;
    if (!message) {
        alert('Please enter a message');
        return;
    }
    
    if (!confirm('Send this broadcast to all users?')) return;
    
    fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
    })
        .then(res => res.json())
        .then(data => {
            document.getElementById('broadcast-result').innerHTML = `
                <p style="color:#4caf50;">✅ ${data.message}</p>
                <p>✅ Sent: ${data.sent} | ❌ Failed: ${data.failed}</p>
            `;
            document.getElementById('broadcast-message').value = '';
        })
        .catch(err => alert('Error sending broadcast'));
}

// ==================== LINKS SETTINGS ====================
function loadLinksSettings() {
    fetch('/api/settings/links')
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('links-settings');
            container.innerHTML = `
                <div class="setting-item">
                    <p><strong>Channel Link:</strong> ${data.channel_link}</p>
                    <input type="text" id="new-channel" placeholder="New Channel Link">
                    <button onclick="updateChannel()" class="action-btn">📢 Update Channel</button>
                </div>
                <div class="setting-item">
                    <p><strong>Group Link:</strong> ${data.group_link}</p>
                    <input type="text" id="new-group" placeholder="New Group Link">
                    <button onclick="updateGroup()" class="action-btn">👥 Update Group</button>
                </div>
            `;
        })
        .catch(err => console.error('Error loading links settings:', err));
}

function updateChannel() {
    const link = document.getElementById('new-channel').value;
    if (!link) return;
    fetch('/api/settings/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_link: link })
    })
        .then(res => res.json())
        .then(data => {
            alert(data.message);
            loadLinksSettings();
        })
        .catch(err => alert('Error updating channel'));
}

function updateGroup() {
    const link = document.getElementById('new-group').value;
    if (!link) return;
    fetch('/api/settings/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_link: link })
    })
        .then(res => res.json())
        .then(data => {
            alert(data.message);
            loadLinksSettings();
        })
        .catch(err => alert('Error updating group'));
}

// ==================== PASSWORD ====================
function changePassword() {
    const newPassword = document.getElementById('new-password').value;
    if (!newPassword || newPassword.length < 4) {
        alert('Password must be at least 4 characters');
        return;
    }
    
    fetch('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
    })
        .then(res => res.json())
        .then(data => {
            document.getElementById('password-result').innerHTML = `
                <p style="color:#4caf50;">✅ ${data.message}</p>
            `;
            document.getElementById('new-password').value = '';
        })
        .catch(err => alert('Error changing password'));
              }
