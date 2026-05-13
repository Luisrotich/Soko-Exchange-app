// ==================== KILIMO TECH - UNIFIED SYSTEM (NO BLINKING) ====================
// Single source of truth - No duplicate functions

// Database Manager
const KilimoDB = {
    init() {
        if (!localStorage.getItem('kilimo_users')) {
            localStorage.setItem('kilimo_users', JSON.stringify([
                { id: 1, username: 'Admin User', email: 'admin@kilimo.com', phone: '254711111111', password: 'admin123', role: 'admin', is_active: true, created_at: new Date().toISOString() },
                { id: 2, username: 'John Buyer', email: 'buyer@example.com', phone: '254722222222', password: 'buyer123', role: 'buyer', is_active: true, created_at: new Date().toISOString() },
                { id: 3, username: 'Mary Seller', email: 'seller@example.com', phone: '254733333333', password: 'seller123', role: 'seller', is_active: true, created_at: new Date().toISOString() }
            ]));
        }
        if (!localStorage.getItem('kilimo_products')) {
            localStorage.setItem('kilimo_products', JSON.stringify([
                { id: 101, seller_id: 3, title: 'Fresh Organic Tomatoes', description: 'Farm fresh organic tomatoes', category: 'food', price: 150, location: 'Kiambu', images: '[]', status: 'active', views: 45, created_at: new Date().toISOString() },
                { id: 102, seller_id: 3, title: 'Maize Farming Tools', description: 'Complete farming tools set', category: 'farming', price: 2500, location: 'Nakuru', images: '[]', status: 'active', views: 32, created_at: new Date().toISOString() }
            ]));
        }
        if (!localStorage.getItem('kilimo_payments')) localStorage.setItem('kilimo_payments', '[]');
        if (!localStorage.getItem('kilimo_unlocks')) localStorage.setItem('kilimo_unlocks', '[]');
        if (!localStorage.getItem('kilimo_current_user')) localStorage.setItem('kilimo_current_user', 'null');
    },
    getUsers() { return JSON.parse(localStorage.getItem('kilimo_users') || '[]'); },
    saveUsers(users) { localStorage.setItem('kilimo_users', JSON.stringify(users)); },
    getProducts() { return JSON.parse(localStorage.getItem('kilimo_products') || '[]'); },
    saveProducts(products) { localStorage.setItem('kilimo_products', JSON.stringify(products)); },
    getPayments() { return JSON.parse(localStorage.getItem('kilimo_payments') || '[]'); },
    savePayments(payments) { localStorage.setItem('kilimo_payments', JSON.stringify(payments)); },
    getUnlocks() { return JSON.parse(localStorage.getItem('kilimo_unlocks') || '[]'); },
    saveUnlocks(unlocks) { localStorage.setItem('kilimo_unlocks', JSON.stringify(unlocks)); },
    
    getCurrentUser() {
        const data = localStorage.getItem('kilimo_current_user');
        return (data && data !== 'null') ? JSON.parse(data) : null;
    },
    setCurrentUser(user) { localStorage.setItem('kilimo_current_user', user ? JSON.stringify(user) : 'null'); },
    
    loginUser(identifier, password) {
        const user = this.getUsers().find(u => (u.email === identifier || u.phone === identifier) && u.password === password && u.is_active);
        return user ? { success: true, user } : { success: false, error: 'Invalid credentials' };
    },
    registerUser(data) {
        const users = this.getUsers();
        if (users.find(u => u.email === data.email || u.phone === data.phone)) return { success: false, error: 'User exists' };
        const newUser = { id: Date.now(), ...data, is_active: true, created_at: new Date().toISOString() };
        users.push(newUser);
        this.saveUsers(users);
        return { success: true, user: newUser };
    },
    getProductsWithSeller() {
        const products = this.getProducts();
        const users = this.getUsers();
        return products.map(p => ({ ...p, seller_name: users.find(u => u.id === p.seller_id)?.username || 'Unknown', seller_phone: users.find(u => u.id === p.seller_id)?.phone || '' }));
    },
    addProduct(data) {
        const products = this.getProducts();
        const newProduct = { id: Date.now(), ...data, views: 0, status: 'active', created_at: new Date().toISOString() };
        products.push(newProduct);
        this.saveProducts(products);
        return { success: true, product: newProduct };
    },
    updateProduct(id, updates) {
        const products = this.getProducts();
        const idx = products.findIndex(p => p.id === id);
        if (idx !== -1) { products[idx] = { ...products[idx], ...updates }; this.saveProducts(products); return true; }
        return false;
    },
    deleteProduct(id) { this.saveProducts(this.getProducts().filter(p => p.id !== id)); return true; },
    hasUnlocked(buyerId, productId) { return this.getUnlocks().some(u => u.buyer_id === buyerId && u.product_id === productId); },
    unlockContact(buyerId, productId, phone) {
        const product = this.getProducts().find(p => p.id === productId);
        if (!product) return { success: false };
        const payments = this.getPayments();
        payments.push({ id: Date.now(), buyer_id: buyerId, product_id: productId, amount: 20, phone, mpesa_receipt: `MPESA${Date.now()}`, status: 'completed', created_at: new Date().toISOString() });
        this.savePayments(payments);
        const unlocks = this.getUnlocks();
        unlocks.push({ id: Date.now(), buyer_id: buyerId, product_id: productId, seller_id: product.seller_id, created_at: new Date().toISOString() });
        this.saveUnlocks(unlocks);
        const seller = this.getUsers().find(u => u.id === product.seller_id);
        return { success: true, seller: { name: seller?.username, phone: seller?.phone, email: seller?.email } };
    }
};

KilimoDB.init();

// ==================== HELPER FUNCTIONS ====================
function escapeHtml(text) { if (!text) return ''; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:${type === 'success' ? '#4caf50' : '#f44336'};color:white;padding:12px 24px;border-radius:8px;z-index:10000;font-weight:500;`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ==================== AUTH ====================
function loginUser(identifier, password) {
    const result = KilimoDB.loginUser(identifier, password);
    if (result.success) { KilimoDB.setCurrentUser(result.user); return result; }
    return result;
}
function registerUser(username, email, phone, password, role) {
    if (!/^254[0-9]{9}$/.test(phone)) return { success: false, error: 'Phone: 254XXXXXXXXX' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: 'Invalid email' };
    if (password.length < 6) return { success: false, error: 'Password 6+ characters' };
    return KilimoDB.registerUser({ username, email, phone, password, role });
}
function logoutUser() { KilimoDB.setCurrentUser(null); window.location.replace('index.html'); }

// ==================== BUYER ====================
let buyerCategory = 'all';
let buyerSearchTimeout = null;

function loadBuyerProducts() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    const user = KilimoDB.getCurrentUser();
    let products = KilimoDB.getProductsWithSeller().filter(p => p.status === 'active');
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    if (search) products = products.filter(p => p.title.toLowerCase().includes(search) || p.location.toLowerCase().includes(search));
    if (buyerCategory !== 'all') products = products.filter(p => p.category === buyerCategory);
    const loc = document.getElementById('locationFilter')?.value.toLowerCase() || '';
    if (loc) products = products.filter(p => p.location.toLowerCase().includes(loc));
    const min = parseInt(document.getElementById('minPrice')?.value) || 0;
    const max = parseInt(document.getElementById('maxPrice')?.value) || Infinity;
    products = products.filter(p => p.price >= min && p.price <= max);
    const sort = document.getElementById('sortBy')?.value || 'newest';
    if (sort === 'price_low') products.sort((a, b) => a.price - b.price);
    else if (sort === 'price_high') products.sort((a, b) => b.price - a.price);
    else products.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const countSpan = document.getElementById('productsCount');
    if (countSpan) countSpan.textContent = `${products.length} products`;
    if (products.length === 0) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-box-open"></i><p>No products found</p></div>'; return; }
    grid.innerHTML = products.map(p => {
        const unlocked = user ? KilimoDB.hasUnlocked(user.id, p.id) : false;
        let imgs = []; try { imgs = JSON.parse(p.images || '[]'); } catch(e) {}
        return `<div class="product-card" onclick="showBuyerProduct(${p.id})"><img src="${imgs[0] || 'https://placehold.co/300x200/2e7d32/white?text=Product'}" class="product-image" onerror="this.src='https://placehold.co/300x200/2e7d32/white?text=Product'"><div class="product-info"><div class="product-title">${escapeHtml(p.title)}</div><div class="product-price">KSH ${p.price.toLocaleString()}</div><div class="product-location"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(p.location)}</div>${!unlocked ? '<div class="contact-locked"><i class="fas fa-lock"></i> Pay 20 KSH to unlock</div>' : '<div class="contact-unlocked"><i class="fas fa-unlock-alt"></i> Contact unlocked</div>'}</div></div>`;
    }).join('');
}
function searchBuyerProducts() { if (buyerSearchTimeout) clearTimeout(buyerSearchTimeout); buyerSearchTimeout = setTimeout(() => loadBuyerProducts(), 500); }
function filterBuyerCategory(cat, ev) {
    buyerCategory = cat;
    document.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
    if (ev?.target) { const el = ev.target.closest('.category-item'); if (el) el.classList.add('active'); }
    loadBuyerProducts();
}
function showBuyerProduct(id) {
    const user = KilimoDB.getCurrentUser();
    if (!user) { showToast('Please login first', 'error'); setTimeout(() => window.location.replace('index.html'), 1500); return; }
    const products = KilimoDB.getProductsWithSeller();
    const p = products.find(p => p.id === id);
    if (!p) return;
    const unlocked = KilimoDB.hasUnlocked(user.id, id);
    let imgs = []; try { imgs = JSON.parse(p.images || '[]'); } catch(e) {}
    const modal = document.getElementById('productModal');
    const details = document.getElementById('productDetails');
    if (!modal || !details) return;
    details.innerHTML = `<div class="product-detail"><div class="product-images">${imgs.map(img => `<img src="${img}" class="detail-image">`).join('')}${imgs.length === 0 ? '<img src="https://placehold.co/400x300/2e7d32/white?text=No+Image" class="detail-image">' : ''}</div><div class="product-detail-info"><h2>${escapeHtml(p.title)}</h2><div class="product-price-large">KSH ${p.price.toLocaleString()}</div><div class="product-category">📂 ${p.category}</div><div class="product-location">📍 ${escapeHtml(p.location)}</div><div class="product-description"><h3>Description</h3><p>${escapeHtml(p.description)}</p></div><div class="seller-info"><h3>Seller</h3><div class="seller-detail"><strong>Name:</strong> ${escapeHtml(p.seller_name)}</div>${unlocked ? `<div class="seller-detail"><strong>Phone:</strong> ${p.seller_phone}</div><button class="btn-call" onclick="window.location.href='tel:${p.seller_phone}'">📞 Call</button>` : `<div class="payment-required"><p>🔒 Locked - Pay 20 KSH</p><button class="btn-unlock" onclick="payToUnlock(${p.id})">Pay 20 KSH</button></div>`}</div></div></div>`;
    modal.style.display = 'block';
}
function payToUnlock(productId) {
    const user = KilimoDB.getCurrentUser();
    if (!user) { showToast('Login required', 'error'); return; }
    const phone = prompt('M-Pesa number (254700000000):');
    if (!phone || !/^254[0-9]{9}$/.test(phone)) { showToast('Invalid number', 'error'); return; }
    const result = KilimoDB.unlockContact(user.id, productId, phone);
    if (result.success) {
        showToast(`✅ Unlocked! Seller: ${result.seller.name}, Phone: ${result.seller.phone}`, 'success');
        document.getElementById('productModal').style.display = 'none';
        loadBuyerProducts();
    } else showToast('Payment failed', 'error');
}
function applyBuyerFilters() { loadBuyerProducts(); toggleFilterModal(); }
function resetBuyerFilters() {
    const fields = ['locationFilter', 'minPrice', 'maxPrice', 'searchInput'];
    fields.forEach(f => { const el = document.getElementById(f); if (el) el.value = ''; });
    const sort = document.getElementById('sortBy'); if (sort) sort.value = 'newest';
    buyerCategory = 'all';
    document.querySelectorAll('.category-item').forEach((i, idx) => { i.classList.remove('active'); if (idx === 0) i.classList.add('active'); });
    loadBuyerProducts();
    toggleFilterModal();
}

// ==================== SELLER ====================
let sellerProductsCache = [];
let editProductId = null;
let deleteProductId = null;
let popupFiles = [];

function loadSellerProducts() {
    const user = KilimoDB.getCurrentUser();
    if (!user || user.role !== 'seller') return;
    const products = KilimoDB.getProducts().filter(p => p.seller_id === user.id);
    sellerProductsCache = products;
    const totalSpan = document.getElementById('totalProducts');
    const countSpan = document.getElementById('myProductsCount');
    if (totalSpan) totalSpan.textContent = products.length;
    if (countSpan) countSpan.textContent = products.length;
    const views = products.reduce((s, p) => s + (p.views || 0), 0);
    const viewsSpan = document.getElementById('totalViews');
    const myViewsSpan = document.getElementById('myProductsViews');
    if (viewsSpan) viewsSpan.textContent = views;
    if (myViewsSpan) myViewsSpan.textContent = views;
    const nameSpan = document.getElementById('sellerName');
    const welcomeSpan = document.getElementById('welcomeName');
    if (nameSpan) nameSpan.textContent = user.username;
    if (welcomeSpan) welcomeSpan.textContent = user.username.split(' ')[0];
    renderSellerProducts(products);
}
function renderSellerProducts(prods) {
    const grid = document.getElementById('myProductsGrid');
    if (!grid) return;
    if (prods.length === 0) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-box-open"></i><h3>No Products</h3><button class="btn-primary" onclick="openAddProductPopup()">+ Add Product</button></div>'; return; }
    grid.innerHTML = prods.map(p => { let imgs = []; try { imgs = JSON.parse(p.images || '[]'); } catch(e) {} return `<div class="seller-product-card"><div class="product-image-container"><img src="${imgs[0] || 'https://placehold.co/300x200'}" class="product-image"><div class="product-status-badge ${p.status}">${p.status}</div></div><div class="product-details"><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.description.substring(0, 80))}...</p><div class="product-price">KSH ${p.price}</div><div class="product-meta"><span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(p.location)}</span><span><i class="fas fa-eye"></i> ${p.views || 0}</span></div><div class="product-actions"><button class="btn-edit" onclick="openEditProduct(${p.id})">Edit</button><button class="btn-delete" onclick="confirmDeleteProduct(${p.id})">Delete</button></div></div></div>`; }).join('');
}
function searchSellerProducts() { const term = document.getElementById('searchMyProducts')?.value.toLowerCase() || ''; renderSellerProducts(sellerProductsCache.filter(p => p.title.toLowerCase().includes(term) || p.description.toLowerCase().includes(term))); }
function filterSellerProducts() { const status = document.getElementById('filterProductStatus')?.value || 'all'; renderSellerProducts(status === 'all' ? sellerProductsCache : sellerProductsCache.filter(p => p.status === status)); }
function openEditProduct(id) {
    const p = KilimoDB.getProducts().find(p => p.id === id);
    if (!p) return;
    editProductId = id;
    const title = document.getElementById('editTitle'); if (title) title.value = p.title;
    const desc = document.getElementById('editDescription'); if (desc) desc.value = p.description;
    const price = document.getElementById('editPrice'); if (price) price.value = p.price;
    const loc = document.getElementById('editLocation'); if (loc) loc.value = p.location;
    const status = document.getElementById('editStatus'); if (status) status.value = p.status;
    const modal = document.getElementById('editProductModal'); if (modal) modal.style.display = 'flex';
}
function closeEditModal() { const m = document.getElementById('editProductModal'); if (m) m.style.display = 'none'; editProductId = null; }
function saveEditProduct() {
    if (!editProductId) return;
    const updates = { title: document.getElementById('editTitle').value, description: document.getElementById('editDescription').value, price: parseFloat(document.getElementById('editPrice').value), location: document.getElementById('editLocation').value, status: document.getElementById('editStatus').value };
    if (KilimoDB.updateProduct(editProductId, updates)) { showToast('Updated!'); closeEditModal(); loadSellerProducts(); }
    else showToast('Failed', 'error');
}
function confirmDeleteProduct(id) { deleteProductId = id; const m = document.getElementById('deleteModal'); if (m) m.style.display = 'flex'; }
function closeDeleteModal() { const m = document.getElementById('deleteModal'); if (m) m.style.display = 'none'; deleteProductId = null; }
function executeDeleteProduct() { if (deleteProductId && KilimoDB.deleteProduct(deleteProductId)) { showToast('Deleted'); closeDeleteModal(); loadSellerProducts(); } }
function openAddProductPopup() { const popup = document.getElementById('addProductPopup'); if (popup) popup.classList.add('show'); }
function closeAddProductPopup() { const p = document.getElementById('addProductPopup'); if (p) p.classList.remove('show'); popupFiles = []; const prev = document.getElementById('popupImagePreview'); if (prev) prev.innerHTML = ''; const form = document.getElementById('addProductFormPopup'); if (form) form.reset(); }
function handlePopupImages(e) {
    const files = Array.from(e.target.files);
    if (files.length > 4) { alert('Max 4 images'); e.target.value = ''; popupFiles = []; document.getElementById('popupImagePreview').innerHTML = ''; return; }
    popupFiles = files;
    const preview = document.getElementById('popupImagePreview');
    if (preview) { preview.innerHTML = ''; files.forEach(f => { const reader = new FileReader(); reader.onload = ev => { const img = document.createElement('img'); img.src = ev.target.result; img.className = 'preview-img'; preview.appendChild(img); }; reader.readAsDataURL(f); }); }
}
async function submitSellerProduct(e) {
    e.preventDefault();
    const user = KilimoDB.getCurrentUser();
    if (!user || user.role !== 'seller') { showToast('Login as seller', 'error'); return; }
    const title = document.getElementById('popupProductTitle')?.value.trim();
    const cat = document.getElementById('popupProductCategory')?.value;
    const price = parseFloat(document.getElementById('popupProductPrice')?.value);
    const loc = document.getElementById('popupProductLocation')?.value.trim();
    const desc = document.getElementById('popupProductDescription')?.value.trim();
    if (!title || !cat || !price || !loc || !desc) { showToast('Fill all fields', 'error'); return; }
    if (popupFiles.length === 0) { showToast('Upload 1-4 images', 'error'); return; }
    const images = [];
    for (const f of popupFiles) { images.push(await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(f); })); }
    const result = KilimoDB.addProduct({ seller_id: user.id, title, description: desc, category: cat, price, location: loc, images: JSON.stringify(images) });
    if (result.success) { showToast('Product added!'); closeAddProductPopup(); loadSellerProducts(); }
    else showToast('Failed', 'error');
}
function toggleProductFormVisibility() { const f = document.getElementById('productForm'); if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none'; }

// ==================== ADMIN ====================
let adminUsersCache = [], adminProductsCache = [];

function loadAdminDashboard() {
    const user = KilimoDB.getCurrentUser();
    if (!user || user.role !== 'admin') return;
    const nameSpan = document.getElementById('adminName'); if (nameSpan) nameSpan.textContent = user.username;
    loadAdminStats(); loadAdminUsers(); loadAdminProducts(); loadAdminPayments();
}
function loadAdminStats() {
    const users = KilimoDB.getUsers(), products = KilimoDB.getProducts(), payments = KilimoDB.getPayments();
    const stats = { totalUsers: users.length, activeUsers: users.filter(u => u.is_active).length, totalProducts: products.length, activeProducts: products.filter(p => p.status === 'active').length, totalRevenue: payments.reduce((s, p) => s + (p.amount || 0), 0), totalPayments: payments.length };
    for (const [id, val] of Object.entries(stats)) { const el = document.getElementById(id); if (el) el.textContent = typeof val === 'number' ? (id === 'totalRevenue' ? `KSH ${val.toLocaleString()}` : val) : val; }
}
function loadAdminUsers() { adminUsersCache = KilimoDB.getUsers(); renderAdminUsers(adminUsersCache); }
function renderAdminUsers(users) {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;
    if (users.length === 0) { tbody.innerHTML = '<tr><td colspan="7">No users</td></tr>'; return; }
    tbody.innerHTML = users.map(u => `<tr><td>${u.id}</td><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.email)}</td><td>${u.phone}</td><td><span class="role-badge ${u.role}">${u.role}</span></td><td>${new Date(u.created_at).toLocaleDateString()}</td><td><span class="status-badge ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Active' : 'Inactive'}</span></td><td><button onclick="toggleAdminUser(${u.id}, ${u.is_active})" class="action-btn">${u.is_active ? 'Deactivate' : 'Activate'}</button></td></tr>`).join('');
}
function searchAdminUsers() { const term = document.getElementById('adminUserSearch')?.value.toLowerCase() || ''; renderAdminUsers(adminUsersCache.filter(u => u.username.toLowerCase().includes(term) || u.email.toLowerCase().includes(term))); }
function toggleAdminUser(id, curr) { if (KilimoDB.updateUserStatus(id, !curr)) { loadAdminUsers(); loadAdminStats(); showToast(`User ${!curr ? 'activated' : 'deactivated'}`); } }
function loadAdminProducts() { adminProductsCache = KilimoDB.getProductsWithSeller(); renderAdminProducts(adminProductsCache); }
function renderAdminProducts(prods) {
    const tbody = document.getElementById('adminProductsTableBody');
    if (!tbody) return;
    if (prods.length === 0) { tbody.innerHTML = '<tr><td colspan="7">No products</td></tr>'; return; }
    tbody.innerHTML = prods.map(p => { let imgs = []; try { imgs = JSON.parse(p.images || '[]'); } catch(e) {} return `<tr><td>${p.id}</td><td><img src="${imgs[0] || 'https://placehold.co/40x40'}" style="width:40px;height:40px;object-fit:cover;border-radius:8px;"></td><td>${escapeHtml(p.title)}</td><td>${escapeHtml(p.seller_name)}</td><td>${p.category}</td><td>KSH ${p.price}</td><td>${escapeHtml(p.location)}</td><td><span class="status-badge ${p.status}">${p.status}</span></td><td>${p.views || 0}</td><td><button onclick="deleteAdminProduct(${p.id})" class="action-btn delete">Delete</button></td></tr>`; }).join('');
}
function searchAdminProducts() { const term = document.getElementById('adminProductSearch')?.value.toLowerCase() || ''; renderAdminProducts(adminProductsCache.filter(p => p.title.toLowerCase().includes(term) || (p.seller_name && p.seller_name.toLowerCase().includes(term)))); }
function deleteAdminProduct(id) { if (confirm('Delete product?')) { KilimoDB.deleteProduct(id); loadAdminProducts(); loadAdminStats(); showToast('Deleted'); } }
function loadAdminPayments() {
    const payments = KilimoDB.getPayments();
    const users = KilimoDB.getUsers();
    const tbody = document.getElementById('adminPaymentsTableBody');
    if (!tbody) return;
    if (payments.length === 0) { tbody.innerHTML = '<tr><td colspan="6">No payments</td></tr>'; return; }
    tbody.innerHTML = payments.map(p => `<tr><td>${p.id}</td><td>${escapeHtml(users.find(u => u.id === p.buyer_id)?.username || 'Unknown')}</td><td>${p.phone}</td><td>KSH ${p.amount}</td><td><span class="status-badge completed">${p.status}</span></td><td>${p.mpesa_receipt || 'N/A'}</td><td>${new Date(p.created_at).toLocaleString()}</td></tr>`).join('');
}
function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab, .tab-content').forEach(el => el.classList.remove('active'));
    const ids = { dashboard: 'dashboardTab', users: 'usersTab', products: 'productsTab', payments: 'paymentsTab' };
    if (ids[tab]) document.getElementById(ids[tab])?.classList.add('active');
    const btn = document.querySelector(`.tab-btn[onclick*="${tab}"]`); if (btn) btn.classList.add('active');
    if (tab === 'dashboard') loadAdminStats();
    else if (tab === 'users') loadAdminUsers();
    else if (tab === 'products') loadAdminProducts();
    else if (tab === 'payments') loadAdminPayments();
}
function adminLogin() {
    const id = document.getElementById('adminLoginId')?.value;
    const pwd = document.getElementById('adminPassword')?.value;
    const err = document.getElementById('loginError');
    if (!id || !pwd) { if (err) err.innerText = 'Enter credentials'; return; }
    const user = KilimoDB.getUsers().find(u => (u.email === id || u.phone === id) && u.password === pwd && u.role === 'admin');
    if (!user) { if (err) err.innerText = 'Invalid admin credentials'; return; }
    KilimoDB.setCurrentUser(user);
    document.getElementById('loginOverlay')?.classList.add('hidden');
    document.getElementById('adminPanel').style.display = 'block';
    loadAdminDashboard();
}
function adminLogout() { KilimoDB.setCurrentUser(null); location.reload(); }

// ==================== MODAL CONTROLS ====================
function toggleFilterModal() { const m = document.getElementById('filterModal'); if (m) m.classList.toggle('show'); }
function closeProductModal() { const m = document.getElementById('productModal'); if (m) m.style.display = 'none'; }
function closeResourcesModal() { const m = document.getElementById('resourcesModal'); if (m) m.classList.remove('show'); }
function closeHelpModal() { const m = document.getElementById('helpModal'); if (m) m.style.display = 'none'; }
function showAccountModal() { const m = document.getElementById('accountModal'); if (m) m.classList.add('show'); }
function showResourcesModal() { const m = document.getElementById('resourcesModal'); if (m) m.classList.add('show'); }
function showHelpModal() { const m = document.getElementById('helpModal'); if (m) m.style.display = 'block'; }

// ==================== INIT (NO BLINKING) ====================
let initialized = false;
function initPage() {
    if (initialized) return;
    initialized = true;
    const path = window.location.pathname;
    const user = KilimoDB.getCurrentUser();
    if ((path.includes('index.html') || path === '/' || path.endsWith('/')) && user) { window.location.replace(`${user.role}.html`); return; }
    if (path.includes('buyer.html')) { if (!user || user.role !== 'buyer') { window.location.replace('index.html'); return; } document.getElementById('userName').textContent = user.username; loadBuyerProducts(); }
    else if (path.includes('seller.html')) { if (!user || user.role !== 'seller') { window.location.replace('index.html'); return; } loadSellerProducts(); }
    else if (path.includes('admin.html')) { if (!user || user.role !== 'admin') { document.getElementById('adminPanel').style.display = 'none'; document.getElementById('loginOverlay')?.classList.remove('hidden'); } else { document.getElementById('loginOverlay')?.classList.add('hidden'); document.getElementById('adminPanel').style.display = 'block'; loadAdminDashboard(); } }
}

// Global exports
window.loginUser = loginUser;
window.registerUser = registerUser;
window.logoutUser = logoutUser;
window.loadBuyerProducts = loadBuyerProducts;
window.searchBuyerProducts = searchBuyerProducts;
window.filterBuyerCategory = filterBuyerCategory;
window.showBuyerProduct = showBuyerProduct;
window.payToUnlock = payToUnlock;
window.applyBuyerFilters = applyBuyerFilters;
window.resetBuyerFilters = resetBuyerFilters;
window.loadSellerProducts = loadSellerProducts;
window.searchSellerProducts = searchSellerProducts;
window.filterSellerProducts = filterSellerProducts;
window.openEditProduct = openEditProduct;
window.closeEditModal = closeEditModal;
window.saveEditProduct = saveEditProduct;
window.confirmDeleteProduct = confirmDeleteProduct;
window.closeDeleteModal = closeDeleteModal;
window.executeDeleteProduct = executeDeleteProduct;
window.openAddProductPopup = openAddProductPopup;
window.closeAddProductPopup = closeAddProductPopup;
window.handlePopupImages = handlePopupImages;
window.submitSellerProduct = submitSellerProduct;
window.toggleProductFormVisibility = toggleProductFormVisibility;
window.switchAdminTab = switchAdminTab;
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.toggleAdminUser = toggleAdminUser;
window.deleteAdminProduct = deleteAdminProduct;
window.searchAdminUsers = searchAdminUsers;
window.searchAdminProducts = searchAdminProducts;
window.toggleFilterModal = toggleFilterModal;
window.closeProductModal = closeProductModal;
window.closeResourcesModal = closeResourcesModal;
window.closeHelpModal = closeHelpModal;
window.showAccountModal = showAccountModal;
window.showResourcesModal = showResourcesModal;
window.showHelpModal = showHelpModal;
window.switchMobileTab = function(tab) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const active = document.querySelector(`.nav-item[data-tab="${tab}"]`);
    if (active) active.classList.add('active');
    if (tab === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
    else if (tab === 'account') showAccountModal();
    else if (tab === 'resources') showResourcesModal();
    else if (tab === 'help') showHelpModal();
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPage);
else initPage();