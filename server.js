const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'Soko exchange_secret_key_2024';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Session setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'Soko exchange_session_secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ==================== JSON FILE STORAGE ====================
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON(filename) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJSON(filename, data) {
    fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

// Load data
let users = readJSON('users.json');
let products = readJSON('products.json');
let payments = readJSON('payments.json');
let orders = readJSON('orders.json');

function getNextId(items) {
    return items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1;
}

// Create default data if empty
if (users.length === 0) {
    console.log('\n📝 Creating default data...');
    
    users.push({
        id: 1,
        username: 'Admin User',
        email: 'admin@kilimo.com',
        phone: '254700000000',
        password: bcrypt.hashSync('admin123', 10),
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString()
    });
    
    users.push({
        id: 2,
        username: 'Luis Seller',
        email: 'luisrotich1@gmail.com',
        phone: '254745972345',
        password: bcrypt.hashSync('seller123', 10),
        role: 'seller',
        is_active: true,
        created_at: new Date().toISOString()
    });
    
    users.push({
        id: 3,
        username: 'John Buyer',
        email: 'buyer@test.com',
        phone: '254711223344',
        password: bcrypt.hashSync('buyer123', 10),
        role: 'buyer',
        is_active: true,
        created_at: new Date().toISOString()
    });
    
    // Sample product with multiple images
    const sampleImages = JSON.stringify([
        '/uploads/sample1.jpg',
        '/uploads/sample2.jpg',
        '/uploads/sample3.jpg'
    ]);
    
    products.push({
        id: 1,
        seller_id: 2,
        title: 'Fresh Organic Tomatoes',
        description: 'Fresh farm tomatoes, organic and pesticide-free. Grown naturally with compost manure.',
        category: 'food',
        price: 500,
        location: 'Nairobi',
        images: sampleImages,
        status: 'active',
        views: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });
    
    products.push({
        id: 2,
        seller_id: 2,
        title: 'Premium Maize Seeds',
        description: 'High-yield maize seeds, drought-resistant, certified by KEPHIS.',
        category: 'farming',
        price: 1200,
        location: 'Kitale',
        images: JSON.stringify(['/uploads/sample4.jpg']),
        status: 'active',
        views: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });
    
    writeJSON('users.json', users);
    writeJSON('products.json', products);
    writeJSON('payments.json', payments);
    writeJSON('orders.json', orders);
    
    console.log('✅ Default data created!');
}

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Multer for image uploads - Support up to 7 images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { files: 7, fileSize: 5 * 1024 * 1024 }, // 7 files max, 5MB each
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Helper functions
function generateToken(userId, role) {
    return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

const authenticate = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Invalid token' });
    
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
};

async function hasAccessToSellerDetails(buyerId, productId) {
    // Check if buyer has paid for this product's contact
    return payments.some(p => p.buyer_id === buyerId && p.product_id === productId && p.status === 'completed');
}

// Process and optimize images
async function processImages(files) {
    const imagePaths = [];
    for (const file of files) {
        const filename = uuidv4() + '.jpg';
        const outputPath = path.join(uploadDir, filename);
        
        try {
            await sharp(file.path)
                .resize(800, 600, { fit: 'cover', position: 'centre' })
                .jpeg({ quality: 80 })
                .toFile(outputPath);
            
            // Delete original file
            fs.unlinkSync(file.path);
            imagePaths.push(`/uploads/${filename}`);
        } catch (error) {
            console.error('Error processing image:', error);
            // Fallback to original file
            imagePaths.push(`/uploads/${file.filename}`);
        }
    }
    return imagePaths;
}

// ==================== API ROUTES ====================

// Register
app.post('/api/register', async (req, res) => {
    const { username, email, phone, password, role } = req.body;
    
    if (!username || !email || !phone || !password || !role) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'Email already registered' });
    }
    
    const newUser = {
        id: getNextId(users),
        username,
        email,
        phone,
        password: bcrypt.hashSync(password, 10),
        role,
        is_active: true,
        created_at: new Date().toISOString()
    };
    
    users.push(newUser);
    writeJSON('users.json', users);
    
    const token = generateToken(newUser.id, role);
    res.json({ success: true, token, userId: newUser.id, role });
});

// Login
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;
    const user = users.find(u => u.email === identifier || u.phone === identifier);
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (!user.is_active) {
        return res.status(401).json({ error: 'Account is deactivated' });
    }
    
    const token = generateToken(user.id, user.role);
    res.json({ 
        success: true, 
        token, 
        user: { 
            id: user.id, 
            username: user.username, 
            email: user.email, 
            phone: user.phone, 
            role: user.role 
        } 
    });
});

// Verify token
app.get('/api/verify', authenticate, async (req, res) => {
    const user = users.find(u => u.id === req.userId);
    if (!user || !user.is_active) return res.status(401).json({ valid: false });
    res.json({ 
        valid: true, 
        user: { 
            id: user.id, 
            username: user.username, 
            email: user.email, 
            phone: user.phone, 
            role: user.role 
        } 
    });
});

// Get all products
app.get('/api/products', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    let userId = null;
    if (token) {
        const decoded = verifyToken(token);
        if (decoded) userId = decoded.userId;
    }
    
    const activeProducts = products.filter(p => p.status === 'active');
    
    const processedProducts = activeProducts.map((product) => {
        const seller = users.find(u => u.id === product.seller_id);
        
        const responseProduct = {
            id: product.id,
            title: product.title,
            description: product.description,
            category: product.category,
            price: product.price,
            location: product.location,
            images: product.images,
            status: product.status,
            views: product.views || 0,
            seller_name: seller?.username || 'Unknown',
            seller_phone: seller?.phone || '',
            seller_email: seller?.email || '',
            created_at: product.created_at
        };
        
        return responseProduct;
    });
    
    res.json(processedProducts);
});

// Get single product
app.get('/api/products/:id', async (req, res) => {
    const productId = parseInt(req.params.id);
    const token = req.headers.authorization?.split(' ')[1];
    let userId = null;
    if (token) {
        const decoded = verifyToken(token);
        if (decoded) userId = decoded.userId;
    }
    
    const productIndex = products.findIndex(p => p.id === productId);
    if (productIndex === -1) return res.status(404).json({ error: 'Product not found' });
    
    // Increment view count
    products[productIndex].views = (products[productIndex].views || 0) + 1;
    writeJSON('products.json', products);
    
    const product = products[productIndex];
    const seller = users.find(u => u.id === product.seller_id);
    
    const responseProduct = {
        id: product.id,
        title: product.title,
        description: product.description,
        category: product.category,
        price: product.price,
        location: product.location,
        images: product.images,
        status: product.status,
        views: product.views,
        seller_name: seller?.username || 'Unknown',
        seller_phone: seller?.phone || '',
        seller_email: seller?.email || '',
        created_at: product.created_at
    };
    
    res.json(responseProduct);
});

// Create product - Updated for up to 7 images
app.post('/api/products', authenticate, upload.array('images', 7), async (req, res) => {
    if (req.userRole !== 'seller') {
        return res.status(403).json({ error: 'Only sellers can post products' });
    }
    
    const { title, description, category, price, location } = req.body;
    
    if (!title || !description || !category || !price || !location) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'At least one image is required' });
    }
    
    try {
        // Process and optimize images
        const imagePaths = await processImages(req.files);
        
        const newProduct = {
            id: getNextId(products),
            seller_id: req.userId,
            title,
            description,
            category,
            price: parseFloat(price),
            location,
            images: JSON.stringify(imagePaths),
            status: 'active',
            views: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        products.push(newProduct);
        writeJSON('products.json', products);
        
        res.json({ 
            success: true, 
            productId: newProduct.id, 
            message: `Product posted successfully with ${imagePaths.length} images!` 
        });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

// Update product
app.put('/api/products/:id', authenticate, async (req, res) => {
    const productId = parseInt(req.params.id);
    const { title, description, price, location, status } = req.body;
    const productIndex = products.findIndex(p => p.id === productId);
    
    if (productIndex === -1) return res.status(404).json({ error: 'Product not found' });
    if (products[productIndex].seller_id !== req.userId && req.userRole !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    products[productIndex] = { 
        ...products[productIndex], 
        title: title || products[productIndex].title,
        description: description || products[productIndex].description,
        price: price ? parseFloat(price) : products[productIndex].price,
        location: location || products[productIndex].location,
        status: status || products[productIndex].status,
        updated_at: new Date().toISOString() 
    };
    writeJSON('products.json', products);
    res.json({ success: true });
});

// Delete product
app.delete('/api/products/:id', authenticate, async (req, res) => {
    const productId = parseInt(req.params.id);
    const productIndex = products.findIndex(p => p.id === productId);
    
    if (productIndex === -1) return res.status(404).json({ error: 'Product not found' });
    if (products[productIndex].seller_id !== req.userId && req.userRole !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    products.splice(productIndex, 1);
    writeJSON('products.json', products);
    res.json({ success: true });
});

// Get seller's products
app.get('/api/my-products', authenticate, async (req, res) => {
    if (req.userRole !== 'seller') {
        return res.status(403).json({ error: 'Access denied' });
    }
    const sellerProducts = products.filter(p => p.seller_id === req.userId);
    res.json(sellerProducts);
});

// Cart Payment - NEW endpoint for cart checkout
app.post('/api/cart-pay', authenticate, async (req, res) => {
    const { phoneNumber, items, totalAmount } = req.body;
    const buyerId = req.userId;
    
    if (!phoneNumber || !/^254[0-9]{9}$/.test(phoneNumber)) {
        return res.status(400).json({ error: 'Valid phone number required (254XXXXXXXXX)' });
    }
    
    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
    }
    
    const transactionId = 'TXN' + Date.now() + uuidv4().substr(0, 6);
    
    // Create order record
    const newOrder = {
        id: getNextId(orders),
        buyer_id: buyerId,
        items: JSON.stringify(items),
        total_amount: totalAmount,
        phone_number: phoneNumber,
        transaction_id: transactionId,
        status: 'completed',
        created_at: new Date().toISOString()
    };
    
    orders.push(newOrder);
    writeJSON('orders.json', orders);
    
    // Create payment records for each product (for contact unlock)
    for (const item of items) {
        const product = products.find(p => p.id === item.productId);
        if (product) {
            const existingPayment = payments.find(p => p.buyer_id === buyerId && p.product_id === item.productId);
            if (!existingPayment) {
                const newPayment = {
                    id: getNextId(payments),
                    buyer_id: buyerId,
                    product_id: item.productId,
                    seller_id: product.seller_id,
                    amount: item.price * item.quantity,
                    buyer_phone: phoneNumber,
                    mpesa_receipt: 'MPESA' + Date.now(),
                    transaction_id: transactionId,
                    status: 'completed',
                    created_at: new Date().toISOString()
                };
                payments.push(newPayment);
            }
        }
    }
    
    writeJSON('payments.json', payments);
    
    res.json({ 
        success: true, 
        transactionId: transactionId,
        message: `Payment successful! Order #${newOrder.id} completed.`
    });
});

// Single product payment (for backward compatibility)
app.post('/api/pay', authenticate, async (req, res) => {
    const { phoneNumber, productId } = req.body;
    const buyerId = req.userId;
    
    if (!phoneNumber || !/^254[0-9]{9}$/.test(phoneNumber)) {
        return res.status(400).json({ error: 'Valid phone number required (254XXXXXXXXX)' });
    }
    
    const product = products.find(p => p.id === productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    
    const transactionId = 'TXN' + Date.now() + uuidv4().substr(0, 6);
    
    const newPayment = {
        id: getNextId(payments),
        buyer_id: buyerId,
        product_id: productId,
        seller_id: product.seller_id,
        amount: product.price,
        buyer_phone: phoneNumber,
        mpesa_receipt: 'MPESA' + Date.now(),
        transaction_id: transactionId,
        status: 'completed',
        created_at: new Date().toISOString()
    };
    
    payments.push(newPayment);
    writeJSON('payments.json', payments);
    
    res.json({ success: true, checkoutRequestID: transactionId });
});

// ==================== ADMIN ROUTES ====================

app.get('/api/admin/users', authenticate, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    res.json(users.map(u => ({ 
        id: u.id, 
        username: u.username, 
        email: u.email, 
        phone: u.phone, 
        role: u.role, 
        is_active: u.is_active, 
        created_at: u.created_at 
    })));
});

app.get('/api/admin/products', authenticate, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const allProducts = products.map(p => ({ 
        ...p, 
        seller_name: users.find(u => u.id === p.seller_id)?.username,
        image_count: (() => {
            try {
                const images = JSON.parse(p.images || '[]');
                return images.length;
            } catch { return 0; }
        })()
    }));
    res.json(allProducts);
});

app.get('/api/admin/payments', authenticate, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const allPayments = payments.map(p => ({ 
        ...p, 
        buyer_name: users.find(u => u.id === p.buyer_id)?.username,
        product_title: products.find(pr => pr.id === p.product_id)?.title,
        seller_name: users.find(u => u.id === p.seller_id)?.username
    }));
    res.json(allPayments);
});

app.get('/api/admin/orders', authenticate, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const allOrders = orders.map(o => ({ 
        ...o, 
        buyer_name: users.find(u => u.id === o.buyer_id)?.username,
        items_count: (() => {
            try {
                const items = JSON.parse(o.items || '[]');
                return items.length;
            } catch { return 0; }
        })()
    }));
    res.json(allOrders);
});

app.get('/api/admin/stats', authenticate, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const completedPayments = payments.filter(p => p.status === 'completed');
    res.json({
        totalUsers: users.filter(u => u.role !== 'admin').length,
        totalProducts: products.length,
        totalRevenue: completedPayments.reduce((sum, p) => sum + p.amount, 0),
        totalPayments: completedPayments.length,
        activeProducts: products.filter(p => p.status === 'active').length,
        totalOrders: orders.length
    });
});

app.delete('/api/admin/products/:id', authenticate, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const index = products.findIndex(p => p.id === parseInt(req.params.id));
    if (index !== -1) products.splice(index, 1);
    writeJSON('products.json', products);
    res.json({ success: true });
});

app.put('/api/admin/users/:id/toggle', authenticate, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const user = users.find(u => u.id === parseInt(req.params.id) && u.role !== 'admin');
    if (user) user.is_active = req.body.is_active;
    writeJSON('users.json', users);
    res.json({ success: true });
});

// ==================== SERVE HTML FILES ====================

// Service Worker and PWA files
app.get('/service-worker.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'service-worker.js'));
});

app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

app.get('/favicon.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favicon.png'));
});

// Serve HTML pages
app.get('/buyer', (req, res) => res.sendFile(path.join(__dirname, 'public', 'buyer.html')));
app.get('/seller', (req, res) => res.sendFile(path.join(__dirname, 'public', 'seller.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ==================== START SERVER ====================

app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`========================================`);
    console.log(`📱 Access the app:`);
    console.log(`   Buyer:  http://localhost:${PORT}/buyer`);
    console.log(`   Seller: http://localhost:${PORT}/seller`);
    console.log(`   Admin:  http://localhost:${PORT}/admin`);
    console.log(`========================================`);
    console.log(`👑 Admin:   admin@kilimo.com / admin123`);
    console.log(`🛒 Seller:  luisrotich1@gmail.com / seller123`);
    console.log(`👤 Buyer:   buyer@test.com / buyer123`);
    console.log(`========================================`);
    console.log(`📸 Image upload: Up to 7 images per product`);
    console.log(`🛒 Cart system: Enabled with M-Pesa payment`);
    console.log(`========================================\n`);
});