// Admin Panel - Connected to Unified Database

let allUsers = [];
let allProducts = [];
let allPayments = [];

// Check admin auth
function checkAdminAuth() {
    const token = localStorage.getItem('kt_token');
    const user = getCurrentUser();
    
    if (!token || user?.role !== 'admin') {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

// Switch tabs
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(`${tabName}Tab`).classList.add('active');
    event.target.classList.add('active');
    
    if (tabName === 'dashboard') {
        loadDashboardStats();
    } else if (tabName === 'users') {
        loadUsers();
    } else if (tabName === 'products') {
        loadProducts();
    } else if (tabName === 'payments') {
        loadPayments();
    }
}

// Load dashboard statistics
async function loadDashboardStats() {
    const stats = UnifiedDB.getAdminStats();
    
    document.getElementById('totalUsers').textContent = stats.totalUsers || 0;
    document.getElementById('totalProducts').textContent = stats.totalProducts || 0;
    document.getElementById('totalRevenue').textContent = (stats.totalRevenue || 0).toLocaleString();
    document.getElementById('activeProducts').textContent = stats.activeProducts || 0;
}

// Load users
async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    allUsers = UnifiedDB.getAllUsersForAdmin();
    displayUsers(allUsers);
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">No users found</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td>${user.phone}</td>
            <td><span class="role-badge ${user.role}">${user.role}</span></td>
            <td>${new Date(user.created_at).toLocaleDateString()}</td>
            <td>
                <span class="status-badge ${user.is_active ? 'active' : 'inactive'}">
                    ${user.is_active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <button class="delete-btn" onclick="toggleUserStatus(${user.id}, ${user.is_active})">
                    ${user.is_active ? 'Deactivate' : 'Activate'}
                </button>
            </td>
        </tr>
    `).join('');
}

function searchUsers() {
    const searchTerm = document.getElementById('userSearch').value.toLowerCase();
    const filtered = allUsers.filter(user => 
        user.username.toLowerCase().includes(searchTerm) ||
        user.email.toLowerCase().includes(searchTerm) ||
        user.phone.includes(searchTerm)
    );
    displayUsers(filtered);
}

async function toggleUserStatus(userId, currentStatus) {
    const newStatus = !currentStatus;
    const result = UnifiedDB.updateUserStatus(userId, newStatus);
    
    if (result) {
        alert(`User ${newStatus ? 'activated' : 'deactivated'} successfully`);
        loadUsers();
        loadDashboardStats();
    } else {
        alert('Failed to update user status');
    }
}

// Load products
async function loadProducts() {
    const tbody = document.getElementById('productsTableBody');
    allProducts = UnifiedDB.getAllProductsForAdmin();
    displayProducts(allProducts);
}

function displayProducts(products) {
    const tbody = document.getElementById('productsTableBody');
    
    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">No products found</td></tr>';
        return;
    }
    
    tbody.innerHTML = products.map(product => `
        <tr>
            <td>${product.id}</td>
            <td>${product.title}</td>
            <td>${product.seller_name || 'Unknown'}</td>
            <td>${product.category}</td>
            <td>KSH ${parseInt(product.price).toLocaleString()}</td>
            <td>${product.location}</td>
            <td>${new Date(product.created_at).toLocaleDateString()}</td>
            <td>
                <button class="delete-btn" onclick="deleteProduct(${product.id})">Delete</button>
            </td>
        </tr>
    `).join('');
}

function searchProducts() {
    const searchTerm = document.getElementById('productSearch').value.toLowerCase();
    const filtered = allProducts.filter(product => 
        product.title.toLowerCase().includes(searchTerm) ||
        product.seller_name?.toLowerCase().includes(searchTerm) ||
        product.category.toLowerCase().includes(searchTerm)
    );
    displayProducts(filtered);
}

async function deleteProduct(productId) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    const result = UnifiedDB.deleteProduct(productId);
    
    if (result) {
        alert('Product deleted successfully');
        loadProducts();
        loadDashboardStats();
    } else {
        alert('Failed to delete product');
    }
}

// Load payments
async function loadPayments() {
    const tbody = document.getElementById('paymentsTableBody');
    allPayments = UnifiedDB.getPaymentsWithUserDetails();
    displayPayments(allPayments);
}

function displayPayments(payments) {
    const tbody = document.getElementById('paymentsTableBody');
    
    if (payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">No payments found</td></tr>';
        return;
    }
    
    tbody.innerHTML = payments.map(payment => `
        <tr>
            <td>${payment.id}</td>
            <td>${payment.username || 'Unknown'}</td>
            <td>${payment.phone || 'N/A'}</td>
            <td>KSH ${payment.amount}</td>
            <td>
                <span class="status-badge ${payment.status}">
                    ${payment.status}
                </span>
            </td>
            <td>${payment.mpesa_receipt || 'N/A'}</td>
            <td>${new Date(payment.created_at).toLocaleString()}</td>
        </tr>
    `).join('');
}

function logout() {
    unifiedLogout();
}

// Initialize
if (checkAdminAuth()) {
    loadDashboardStats();
}

// CSS styles
const style = document.createElement('style');
style.textContent = `
    .role-badge {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        text-transform: capitalize;
    }
    .role-badge.buyer { background: #e3f2fd; color: #1976d2; }
    .role-badge.seller { background: #e8f5e9; color: #388e3c; }
    .role-badge.admin { background: #f3e5f5; color: #7b1fa2; }
    .status-badge {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
    }
    .status-badge.active, .status-badge.completed { background: #c8e6c9; color: #2e7d32; }
    .status-badge.inactive, .status-badge.failed { background: #ffcdd2; color: #c62828; }
    .status-badge.pending { background: #fff3e0; color: #ef6c00; }
    .delete-btn {
        background: #f44336;
        color: white;
        border: none;
        padding: 5px 10px;
        border-radius: 4px;
        cursor: pointer;
    }
    .loading { text-align: center; padding: 20px; color: #666; }
`;
document.head.appendChild(style);