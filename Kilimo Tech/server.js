const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const { initializeDatabase, getDatabase } = require('./db');
const { registerUser, loginUser, verifyToken, getUserById } = require('./auth');
const { 
  initiateSTKPush, 
  handleMpesaCallback, 
  recordPayment, 
  hasAccessToSellerDetails 
} = require('./payment');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'kilimo_session_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { files: 4, fileSize: 5 * 1024 * 1024 }, // 5MB per file
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WEBP images are allowed.'));
    }
  }
});

// Authentication middleware
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const decoded = require('./auth').verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  req.userId = decoded.userId;
  req.userRole = decoded.role;
  next();
};

// ==================== API ROUTES ====================

// Health check
app.get('/api/message', (req, res) => {
  res.json({ message: 'Kilimo Tech is live 🚀' });
});

// Get all products (limited info for non-paying users)
app.get('/api/products', async (req, res) => {
  const db = getDatabase();
  const token = req.headers.authorization?.split(' ')[1];
  let userId = null;
  
  if (token) {
    const decoded = require('./auth').verifyToken(token);
    if (decoded) userId = decoded.userId;
  }
  
  try {
    let query = `
      SELECT p.*, u.username as seller_name, u.phone as seller_phone, u.email as seller_email
      FROM products p
      JOIN users u ON p.seller_id = u.id
      WHERE p.status = 'active'
      ORDER BY p.created_at DESC
    `;
    
    const products = await db.all(query);
    
    // Filter sensitive info based on payment status
    const processedProducts = await Promise.all(products.map(async (product) => {
      if (userId) {
        const hasAccess = await hasAccessToSellerDetails(userId, product.id);
        if (hasAccess) {
          return product; // Full access
        }
      }
      
      // Limited access (no seller contact info)
      const { seller_phone, seller_email, ...limitedProduct } = product;
      return {
        ...limitedProduct,
        seller_phone: 'hidden - pay 20 KSH to unlock',
        seller_email: 'hidden - pay 20 KSH to unlock',
        contact_locked: true
      };
    }));
    
    res.json(processedProducts);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get single product
app.get('/api/products/:id', async (req, res) => {
  const db = getDatabase();
  const productId = req.params.id;
  const token = req.headers.authorization?.split(' ')[1];
  let userId = null;
  
  if (token) {
    const decoded = require('./auth').verifyToken(token);
    if (decoded) userId = decoded.userId;
  }
  
  try {
    const product = await db.get(
      `SELECT p.*, u.username as seller_name, u.phone as seller_phone, u.email as seller_email
       FROM products p
       JOIN users u ON p.seller_id = u.id
       WHERE p.id = ?`,
      [productId]
    );
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Check access
    let hasAccess = false;
    if (userId) {
      hasAccess = await hasAccessToSellerDetails(userId, productId);
    }
    
    if (!hasAccess) {
      // Hide seller info
      product.seller_phone = 'hidden - pay 20 KSH to unlock';
      product.seller_email = 'hidden - pay 20 KSH to unlock';
      product.contact_locked = true;
    } else {
      product.contact_locked = false;
    }
    
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Create product (seller only)
app.post('/api/products', authenticate, upload.array('images', 4), async (req, res) => {
  if (req.userRole !== 'seller') {
    return res.status(403).json({ error: 'Only sellers can post products' });
  }
  
  const db = getDatabase();
  const { title, description, category, price, location } = req.body;
  
  // Validate required fields
  if (!title || !description || !category || !price || !location) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  // Process images
  const imagePaths = req.files.map(file => `/uploads/${file.filename}`);
  const imagesJson = JSON.stringify(imagePaths);
  
  try {
    const result = await db.run(
      `INSERT INTO products (seller_id, title, description, category, price, location, images)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, title, description, category, price, location, imagesJson]
    );
    
    res.json({ 
      success: true, 
      productId: result.lastID,
      message: 'Product posted successfully!' 
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Get user's products
app.get('/api/my-products', authenticate, async (req, res) => {
  const db = getDatabase();
  
  try {
    const products = await db.all(
      'SELECT * FROM products WHERE seller_id = ? ORDER BY created_at DESC',
      [req.userId]
    );
    res.json(products);
  } catch (error) {
    console.error('Error fetching user products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Register
app.post('/api/register', async (req, res) => {
  const { username, email, phone, password, role } = req.body;
  
  if (!username || !email || !phone || !password || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  if (!['buyer', 'seller'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  
  const result = await registerUser({ username, email, phone, password, role });
  
  if (result.success) {
    res.json({ success: true, token: result.token, userId: result.userId, role: role });
  } else {
    res.status(400).json({ error: result.error });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { identifier, password } = req.body;
  
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Identifier and password are required' });
  }
  
  const result = await loginUser(identifier, password);
  
  if (result.success) {
    res.json({ success: true, token: result.token, user: result.user });
  } else {
    res.status(401).json({ error: result.error });
  }
});

// Initiate payment
app.post('/api/pay', authenticate, async (req, res) => {
  const { phoneNumber, productId } = req.body;
  
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number is required' });
  }
  
  // Check if user already has access
  const hasAccess = await hasAccessToSellerDetails(req.userId, productId);
  if (hasAccess) {
    return res.status(400).json({ error: 'You already have access to seller details' });
  }
  
  const accountReference = `KILIMO${Date.now()}`;
  const transactionDesc = `Access to seller details - Kilimo Tech`;
  
  const result = await initiateSTKPush(phoneNumber, 20, accountReference, transactionDesc);
  
  if (result.success) {
    // Record payment in database
    await recordPayment(req.userId, result.checkoutRequestID);
    res.json({ 
      success: true, 
      checkoutRequestID: result.checkoutRequestID,
      message: 'Payment initiated. Please check your phone to complete transaction.' 
    });
  } else {
    res.status(500).json({ error: result.error || 'Payment initiation failed' });
  }
});

// M-Pesa callback endpoint
app.post('/api/mpesa/callback', async (req, res) => {
  console.log('M-Pesa callback received:', JSON.stringify(req.body, null, 2));
  
  const result = await handleMpesaCallback(req.body);
  res.json(result);
});

// Check payment status
app.get('/api/payment-status/:checkoutRequestId', authenticate, async (req, res) => {
  const { checkoutRequestId } = req.params;
  const payment = await require('./payment').checkPaymentStatus(checkoutRequestId);
  
  if (payment) {
    res.json({ 
      status: payment.status,
      receipt: payment.mpesa_receipt,
      amount: payment.amount 
    });
  } else {
    res.status(404).json({ error: 'Payment not found' });
  }
});

// Check if user has access
app.get('/api/check-access', authenticate, async (req, res) => {
  const { productId } = req.query;
  const hasAccess = await hasAccessToSellerDetails(req.userId, productId);
  res.json({ hasAccess });
});

// ==================== ADMIN ROUTES ====================

// Get all users (admin)
app.get('/api/admin/users', authenticate, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const db = getDatabase();
  try {
    const users = await db.all(
      `SELECT id, username, email, phone, role, created_at, is_active 
       FROM users 
       ORDER BY created_at DESC`
    );
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get all products with seller info (admin)
app.get('/api/admin/products', authenticate, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const db = getDatabase();
  try {
    const products = await db.all(
      `SELECT p.*, u.username as seller_name, u.phone as seller_phone 
       FROM products p
       JOIN users u ON p.seller_id = u.id
       ORDER BY p.created_at DESC`
    );
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get all payments (admin)
app.get('/api/admin/payments', authenticate, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const db = getDatabase();
  try {
    const payments = await db.all(
      `SELECT p.*, u.username, u.email, u.phone 
       FROM payments p
       JOIN users u ON p.buyer_id = u.id
       ORDER BY p.created_at DESC`
    );
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Get dashboard stats (admin)
app.get('/api/admin/stats', authenticate, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const db = getDatabase();
  try {
    const totalUsers = await db.get('SELECT COUNT(*) as count FROM users');
    const totalProducts = await db.get('SELECT COUNT(*) as count FROM products');
    const totalPayments = await db.get('SELECT COUNT(*) as count, SUM(amount) as total FROM payments WHERE status = "completed"');
    const activeProducts = await db.get('SELECT COUNT(*) as count FROM products WHERE status = "active"');
    
    res.json({
      totalUsers: totalUsers.count,
      totalProducts: totalProducts.count,
      totalRevenue: totalPayments.total || 0,
      totalPayments: totalPayments.count || 0,
      activeProducts: activeProducts.count
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Delete product (admin)
app.delete('/api/admin/products/:id', authenticate, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const db = getDatabase();
  try {
    await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Toggle user status (admin)
app.put('/api/admin/users/:id/toggle', authenticate, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const db = getDatabase();
  const { is_active } = req.body;
  
  try {
    await db.run('UPDATE users SET is_active = ? WHERE id = ?', [is_active, req.params.id]);
    res.json({ success: true, message: 'User status updated' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Serve HTML pages
app.get('/buyer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'buyer.html'));
});

app.get('/seller', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'seller.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
async function startServer() {
  await initializeDatabase();
  
  app.listen(PORT, () => {
    console.log(`🚀 Kilimo Tech server running on port ${PORT}`);
    console.log(`📱 Access the app at: http://localhost:${PORT}`);
    console.log(`🛒 Buyer portal: http://localhost:${PORT}/buyer`);
    console.log(`🏪 Seller portal: http://localhost:${PORT}/seller`);
    console.log(`👑 Admin panel: http://localhost:${PORT}/admin`);
  });
}

startServer().catch(console.error);