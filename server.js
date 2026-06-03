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
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'Soko exchange_secret_key_2024';

// M-Pesa Configuration
const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY || 'YOUR_CONSUMER_KEY';
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET || 'YOUR_CONSUMER_SECRET';
const MPESA_PASSKEY = process.env.MPESA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE || '174379';
const MPESA_ENVIRONMENT = process.env.MPESA_ENVIRONMENT || 'sandbox'; // sandbox or production
const MPESA_CALLBACK_URL = process.env.MPESA_CALLBACK_URL || 'https://your-domain.com/api/mpesa-callback';

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
let mpesaTransactions = readJSON('mpesa_transactions.json');

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
    
    const sampleImages = JSON.stringify([
        '/uploads/sample1.jpg',
        '/uploads/sample2.jpg',
        '/uploads/sample3.jpg'
    ]);
    
    products.push({
        id: 1,
        seller_id: 2,
        title: 'Fresh Organic Tomatoes',
        description: 'Fresh farm tomatoes, organic and pesticide-free.',
        category: 'food',
        price: 500,
        quantity: 10,
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
        description: 'High-yield maize seeds, drought-resistant.',
        category: 'farming',
        price: 1200,
        quantity: 25,
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
    writeJSON('mpesa_transactions.json', mpesaTransactions);
    
    console.log('✅ Default data created!');
}

// Create uploads directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Multer configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir); },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { files: 7, fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) return cb(null, true);
        cb(new Error('Only image files are allowed'));
    }
});

// Helper functions
function generateToken(userId, role) {
    return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
    try { return jwt.verify(token, JWT_SECRET); } catch (error) { return null; }
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

// ==================== M-PESA FUNCTIONS ====================

// Get M-Pesa Access Token
async function getMpesaAccessToken() {
    const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');
    const url = MPESA_ENVIRONMENT === 'sandbox' 
        ? 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
        : 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
    
    try {
        const response = await axios.get(url, {
            headers: { Authorization: `Basic ${auth}` }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting M-Pesa token:', error.response?.data || error.message);
        return null;
    }
}

// STK Push (Lipa Na M-Pesa Online)
async function stkPush(phoneNumber, amount, accountReference, transactionDesc) {
    const accessToken = await getMpesaAccessToken();
    if (!accessToken) return { error: 'Failed to get M-Pesa access token' };
    
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64');
    
    // Format phone number (remove leading 0 or +254)
    let formattedPhone = phoneNumber.toString();
    if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.slice(1);
    if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.slice(1);
    if (!formattedPhone.startsWith('254')) formattedPhone = '254' + formattedPhone;
    
    const url = MPESA_ENVIRONMENT === 'sandbox'
        ? 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
        : 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
    
    const data = {
        BusinessShortCode: MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(amount),
        PartyA: formattedPhone,
        PartyB: MPESA_SHORTCODE,
        PhoneNumber: formattedPhone,
        CallBackURL: MPESA_CALLBACK_URL,
        AccountReference: accountReference,
        TransactionDesc: transactionDesc
    };
    
    try {
        const response = await axios.post(url, data, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        return { success: true, data: response.data };
    } catch (error) {
        console.error('STK Push error:', error.response?.data || error.message);
        return { error: error.response?.data || 'STK Push failed' };
    }
}

// M-Pesa Callback Endpoint
app.post('/api/mpesa-callback', async (req, res) => {
    console.log('M-Pesa Callback received:', JSON.stringify(req.body, null, 2));
    
    const { Body } = req.body;
    if (Body && Body.stkCallback) {
        const { ResultCode, ResultDesc, CheckoutRequestID, CallbackMetadata } = Body.stkCallback;
        
        // Find transaction by CheckoutRequestID
        const transactionIndex = mpesaTransactions.findIndex(t => t.checkout_request_id === CheckoutRequestID);
        
        if (transactionIndex !== -1) {
            mpesaTransactions[transactionIndex].result_code = ResultCode;
            mpesaTransactions[transactionIndex].result_desc = ResultDesc;
            mpesaTransactions[transactionIndex].status = ResultCode === '0' ? 'completed' : 'failed';
            mpesaTransactions[transactionIndex].updated_at = new Date().toISOString();
            
            if (CallbackMetadata && CallbackMetadata.Item) {
                const receiptItem = CallbackMetadata.Item.find(item => item.Name === 'MpesaReceiptNumber');
                const amountItem = CallbackMetadata.Item.find(item => item.Name === 'Amount');
                if (receiptItem) mpesaTransactions[transactionIndex].mpesa_receipt = receiptItem.Value;
                if (amountItem) mpesaTransactions[transactionIndex].amount = amountItem.Value;
            }
            
            writeJSON('mpesa_transactions.json', mpesaTransactions);
            
            // If payment successful, complete the order
            if (ResultCode === '0') {
                const transaction = mpesaTransactions[transactionIndex];
                await completeOrder(transaction.order_id, transaction);
            }
        }
    }
    
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
});

// Complete order after successful payment
async function completeOrder(orderId, transaction) {
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;
    
    orders[orderIndex] = {
        ...orders[orderIndex],
        payment_status: 'completed',
        mpesa_receipt: transaction.mpesa_receipt,
        transaction_id: transaction.checkout_request_id,
        updated_at: new Date().toISOString()
    };
    
    writeJSON('orders.json', orders);
    
    // Create payment records for each product
    const items = JSON.parse(orders[orderIndex].items || '[]');
    for (const item of items) {
        const product = products.find(p => p.id === item.productId);
        if (product) {
            const newPayment = {
                id: getNextId(payments),
                buyer_id: orders[orderIndex].buyer_id,
                product_id: item.productId,
                seller_id: product.seller_id,
                amount: item.price * item.quantity,
                buyer_phone: transaction.phone_number,
                mpesa_receipt: transaction.mpesa_receipt,
                transaction_id: transaction.checkout_request_id,
                order_id: orderId,
                status: 'completed',
                created_at: new Date().toISOString()
            };
            payments.push(newPayment);
            
            // Update product stock
            if (product.quantity) {
                const newQuantity = product.quantity - item.quantity;
                if (newQuantity <= 0) {
                    product.status = 'sold';
                    product.quantity = 0;
                } else {
                    product.quantity = newQuantity;
                }
                writeJSON('products.json', products);
            }
        }
    }
    
    writeJSON('payments.json', payments);
    
    console.log(`✅ Order #${orderId} completed with M-Pesa payment: ${transaction.mpesa_receipt}`);
}

// Process images
async function processImages(files) {
    const imagePaths = [];
    for (const file of files) {
        const filename = uuidv4() + '.jpg';
        const outputPath = path.join(uploadDir, filename);
        try {
            await sharp(file.path).resize(800, 600, { fit: 'cover' }).jpeg({ quality: 80 }).toFile(outputPath);
            fs.unlinkSync(file.path);
            imagePaths.push(`/uploads/${filename}`);
        } catch (error) {
            console.error('Error processing image:', error);
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
        username, email, phone,
        password: bcrypt.hashSync(password, 10),
        role, is_active: true,
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
    res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, phone: user.phone, role: user.role } });
});

// Verify token
app.get('/api/verify', authenticate, async (req, res) => {
    const user = users.find(u => u.id === req.userId);
    if (!user || !user.is_active) return res.status(401).json({ valid: false });
    res.json({ valid: true, user: { id: user.id, username: user.username, email: user.email, phone: user.phone, role: user.role } });
});

// Get all products
app.get('/api/products', async (req, res) => {
    const activeProducts = products.filter(p => p.status === 'active' && (p.quantity === undefined || p.quantity > 0));
    const processedProducts = activeProducts.map((product) => {
        const seller = users.find(u => u.id === product.seller_id);
        return {
            id: product.id, title: product.title, description: product.description,
            category: product.category, price: product.price, location: product.location,
            images: product.images, status: product.status, views: product.views || 0,
            quantity: product.quantity || 0,
            seller_name: seller?.username || 'Unknown',
            seller_phone: seller?.phone || '', seller_email: seller?.email || '',
            created_at: product.created_at
        };
    });
    res.json(processedProducts);
});

// Get single product
app.get('/api/products/:id', async (req, res) => {
    const productId = parseInt(req.params.id);
    const productIndex = products.findIndex(p => p.id === productId);
    if (productIndex === -1) return res.status(404).json({ error: 'Product not found' });
    products[productIndex].views = (products[productIndex].views || 0) + 1;
    writeJSON('products.json', products);
    const product = products[productIndex];
    const seller = users.find(u => u.id === product.seller_id);
    res.json({
        id: product.id, title: product.title, description: product.description,
        category: product.category, price: product.price, location: product.location,
        images: product.images, status: product.status, views: product.views,
        quantity: product.quantity || 0,
        seller_name: seller?.username || 'Unknown',
        seller_phone: seller?.phone || '', seller_email: seller?.email || '',
        created_at: product.created_at
    });
});

// Create product
app.post('/api/products', authenticate, upload.array('images', 7), async (req, res) => {
    if (req.userRole !== 'seller') {
        return res.status(403).json({ error: 'Only sellers can post products' });
    }
    const { title, description, category, price, location, quantity } = req.body;
    if (!title || !description || !category || !price || !location) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'At least one image is required' });
    }
    try {
        const imagePaths = await processImages(req.files);
        const newProduct = {
            id: getNextId(products), seller_id: req.userId, title, description,
            category, price: parseFloat(price), location,
            quantity: parseInt(quantity) || 0,
            images: JSON.stringify(imagePaths), status: 'active', views: 0,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        };
        products.push(newProduct);
        writeJSON('products.json', products);
        res.json({ success: true, productId: newProduct.id, message: `Product posted with ${imagePaths.length} images!` });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

// Update product
app.put('/api/products/:id', authenticate, async (req, res) => {
    const productId = parseInt(req.params.id);
    const { title, description, price, location, status, quantity } = req.body;
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
        quantity: quantity !== undefined ? parseInt(quantity) : products[productIndex].quantity,
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
    if (req.userRole !== 'seller') return res.status(403).json({ error: 'Access denied' });
    const sellerProducts = products.filter(p => p.seller_id === req.userId);
    res.json(sellerProducts);
});

// Get seller's orders
app.get('/api/seller/orders', authenticate, async (req, res) => {
    if (req.userRole !== 'seller') return res.status(403).json({ error: 'Access denied' });
    const sellerProductIds = products.filter(p => p.seller_id === req.userId).map(p => p.id);
    const sellerOrders = orders.filter(order => {
        try {
            const items = JSON.parse(order.items || '[]');
            return items.some(item => sellerProductIds.includes(item.productId));
        } catch { return false; }
    }).map(order => ({
        ...order,
        seller_status: order.seller_status || 'pending_delivery',
        buyer_name: users.find(u => u.id === order.buyer_id)?.username || 'Unknown'
    }));
    res.json(sellerOrders);
});

// Mark order as delivered
app.put('/api/seller/orders/:id/deliver', authenticate, async (req, res) => {
    if (req.userRole !== 'seller') return res.status(403).json({ error: 'Access denied' });
    const orderId = parseInt(req.params.id);
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return res.status(404).json({ error: 'Order not found' });
    const sellerProductIds = products.filter(p => p.seller_id === req.userId).map(p => p.id);
    const items = JSON.parse(orders[orderIndex].items || '[]');
    const hasSellerProduct = items.some(item => sellerProductIds.includes(item.productId));
    if (!hasSellerProduct) return res.status(403).json({ error: 'Not your order' });
    orders[orderIndex] = {
        ...orders[orderIndex],
        seller_status: 'delivered',
        delivered_to_soko_at: new Date().toISOString()
    };
    writeJSON('orders.json', orders);
    res.json({ success: true, message: 'Order marked as delivered' });
});

// Cart Payment with M-Pesa STK Push
app.post('/api/cart-pay', authenticate, async (req, res) => {
    const { phoneNumber, items, totalAmount, deliveryInfo } = req.body;
    const buyerId = req.userId;
    const buyer = users.find(u => u.id === buyerId);
    
    if (!phoneNumber || !/^254[0-9]{9}$/.test(phoneNumber)) {
        return res.status(400).json({ error: 'Valid phone number required (254XXXXXXXXX)' });
    }
    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
    }
    
    // Check stock availability
    for (const item of items) {
        const product = products.find(p => p.id === item.productId);
        if (!product) return res.status(404).json({ error: `Product ${item.title} not found` });
        if (product.quantity < item.quantity) {
            return res.status(400).json({ error: `Only ${product.quantity} ${product.title} left in stock` });
        }
    }
    
    const checkoutRequestId = 'SOKO' + Date.now() + Math.random().toString(36).substr(2, 6);
    const transactionId = 'TXN' + Date.now() + uuidv4().substr(0, 6);
    
    // Create pending order
    const newOrder = {
        id: getNextId(orders),
        buyer_id: buyerId,
        buyer_name: buyer?.username || 'Unknown',
        buyer_email: buyer?.email || '',
        buyer_phone: phoneNumber,
        delivery_name: deliveryInfo?.name || buyer?.username || '',
        delivery_phone: deliveryInfo?.phone || phoneNumber,
        delivery_alt_phone: deliveryInfo?.altPhone || '',
        pickup_station: deliveryInfo?.station || 'Not specified',
        delivery_instructions: deliveryInfo?.instructions || '',
        items: JSON.stringify(items),
        total_amount: totalAmount,
        payment_phone: phoneNumber,
        transaction_id: transactionId,
        checkout_request_id: checkoutRequestId,
        payment_status: 'pending',
        seller_status: 'pending_delivery',
        pickup_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    
    orders.push(newOrder);
    writeJSON('orders.json', orders);
    
    // Store M-Pesa transaction
    const mpesaRecord = {
        id: getNextId(mpesaTransactions),
        checkout_request_id: checkoutRequestId,
        phone_number: phoneNumber,
        amount: totalAmount,
        order_id: newOrder.id,
        status: 'pending',
        result_code: null,
        result_desc: null,
        mpesa_receipt: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    mpesaTransactions.push(mpesaRecord);
    writeJSON('mpesa_transactions.json', mpesaTransactions);
    
    // Initiate STK Push
    const stkResult = await stkPush(phoneNumber, totalAmount, `Order${newOrder.id}`, `Payment for Order #${newOrder.id}`);
    
    if (stkResult.error) {
        // Update order as failed
        orders[orders.length - 1].payment_status = 'failed';
        writeJSON('orders.json', orders);
        return res.status(400).json({ error: stkResult.error, message: 'STK Push failed. Please try again.' });
    }
    
    console.log(`📱 STK Push initiated for Order #${newOrder.id}`);
    console.log(`   CheckoutRequestID: ${stkResult.data.CheckoutRequestID}`);
    
    res.json({
        success: true,
        message: 'STK Push sent to your phone. Please enter your PIN to complete payment.',
        checkoutRequestID: stkResult.data.CheckoutRequestID,
        orderId: newOrder.id,
        requiresPayment: true
    });
});

// Check payment status
app.get('/api/payment-status/:checkoutRequestId', authenticate, async (req, res) => {
    const checkoutRequestId = req.params.checkoutRequestId;
    const transaction = mpesaTransactions.find(t => t.checkout_request_id === checkoutRequestId);
    
    if (!transaction) {
        return res.json({ status: 'not_found', message: 'Transaction not found' });
    }
    
    res.json({
        status: transaction.status || 'pending',
        mpesa_receipt: transaction.mpesa_receipt,
        result_code: transaction.result_code,
        result_desc: transaction.result_desc
    });
});

// Single product payment
app.post('/api/pay', authenticate, async (req, res) => {
    const { phoneNumber, productId } = req.body;
    const buyerId = req.userId;
    if (!phoneNumber || !/^254[0-9]{9}$/.test(phoneNumber)) {
        return res.status(400).json({ error: 'Valid phone number required' });
    }
    const product = products.find(p => p.id === productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    
    const checkoutRequestId = 'SOKO' + Date.now() + Math.random().toString(36).substr(2, 6);
    const stkResult = await stkPush(phoneNumber, product.price, `Product${productId}`, `Purchase: ${product.title}`);
    
    if (stkResult.error) {
        return res.status(400).json({ error: stkResult.error });
    }
    
    res.json({ success: true, checkoutRequestID: stkResult.data.CheckoutRequestID });
});

// ==================== ADMIN ROUTES ====================

app.get('/api/admin/users', authenticate, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    res.json(users.map(u => ({ id: u.id, username: u.username, email: u.email, phone: u.phone, role: u.role, is_active: u.is_active, created_at: u.created_at })));
});

app.get('/api/admin/products', authenticate, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const allProducts = products.map(p => ({ ...p, seller_name: users.find(u => u.id === p.seller_id)?.username, image_count: (() => { try { return JSON.parse(p.images || '[]').length; } catch { return 0; } })() }));
    res.json(allProducts);
});

app.get('/api/admin/payments', authenticate, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const allPayments = payments.map(p => ({ ...p, buyer_name: users.find(u => u.id === p.buyer_id)?.username, product_title: products.find(pr => pr.id === p.product_id)?.title, seller_name: users.find(u => u.id === p.seller_id)?.username }));
    res.json(allPayments);
});

app.get('/api/admin/orders', authenticate, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const allOrders = orders.map(o => ({ ...o, buyer_name: users.find(u => u.id === o.buyer_id)?.username || o.buyer_name, items_count: (() => { try { return JSON.parse(o.items || '[]').length; } catch { return 0; } })(), items_list: (() => { try { return JSON.parse(o.items || '[]'); } catch { return []; } })() })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(allOrders);
});

app.get('/api/admin/stats', authenticate, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const completedPayments = payments.filter(p => p.status === 'completed');
    const pendingOrders = orders.filter(o => o.seller_status === 'pending_delivery').length;
    const completedOrders = orders.filter(o => o.pickup_status === 'picked').length;
    const overdueOrders = orders.filter(o => { if (o.seller_status !== 'pending_delivery') return false; const deadline = new Date(o.created_at); deadline.setDate(deadline.getDate() + 3); return new Date() > deadline; }).length;
    res.json({ totalUsers: users.filter(u => u.role !== 'admin').length, totalProducts: products.length, totalRevenue: completedPayments.reduce((sum, p) => sum + p.amount, 0), totalPayments: completedPayments.length, activeProducts: products.filter(p => p.status === 'active' && (p.quantity === undefined || p.quantity > 0)).length, totalOrders: orders.length, pendingOrders: pendingOrders, completedOrders: completedOrders, overdueOrders: overdueOrders });
});

app.post('/api/admin/orders/:id/remind', authenticate, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const orderId = parseInt(req.params.id);
    const order = orders.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    console.log(`📧 Reminder sent for Order #${orderId} to seller`);
    res.json({ success: true, message: 'Reminder sent to seller' });
});

app.put('/api/admin/orders/:id/pickup', authenticate, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const orderId = parseInt(req.params.id);
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return res.status(404).json({ error: 'Order not found' });
    orders[orderIndex] = { ...orders[orderIndex], pickup_status: 'picked', picked_up_at: new Date().toISOString() };
    writeJSON('orders.json', orders);
    res.json({ success: true, message: 'Order marked as picked up' });
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

app.get('/service-worker.js', (req, res) => { res.setHeader('Content-Type', 'application/javascript'); res.sendFile(path.join(__dirname, 'public', 'service-worker.js')); });
app.get('/manifest.json', (req, res) => { res.setHeader('Content-Type', 'application/json'); res.sendFile(path.join(__dirname, 'public', 'manifest.json')); });
app.get('/favicon.png', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'favicon.png')); });
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
    console.log(`🛒 Cart system: Enabled with M-Pesa STK Push`);
    console.log(`💰 M-Pesa Mode: ${MPESA_ENVIRONMENT.toUpperCase()}`);
    console.log(`========================================\n`);
});