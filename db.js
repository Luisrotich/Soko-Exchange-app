// db.js - SQLite Database Module for Soko exchange Tech
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'Soko exchange.db');
let db = null;

// Initialize database and create tables
async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DB_PATH, async (err) => {
            if (err) {
                console.error('Error opening database:', err);
                reject(err);
                return;
            }
            
            console.log('Connected to SQLite database');
            
            // Create tables
            const tables = [
                `CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    phone TEXT NOT NULL,
                    password TEXT NOT NULL,
                    role TEXT CHECK(role IN ('buyer', 'seller', 'admin')) DEFAULT 'buyer',
                    is_active INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
                
                `CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    seller_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    category TEXT NOT NULL,
                    price REAL NOT NULL,
                    location TEXT NOT NULL,
                    images TEXT,
                    status TEXT DEFAULT 'active',
                    views INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
                )`,
                
                `CREATE TABLE IF NOT EXISTS payments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    buyer_id INTEGER NOT NULL,
                    product_id INTEGER,
                    checkout_request_id TEXT UNIQUE,
                    mpesa_receipt TEXT,
                    amount REAL NOT NULL,
                    status TEXT DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completed_at DATETIME,
                    FOREIGN KEY (buyer_id) REFERENCES users(id),
                    FOREIGN KEY (product_id) REFERENCES products(id)
                )`,
                
                `CREATE TABLE IF NOT EXISTS product_access (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    buyer_id INTEGER NOT NULL,
                    product_id INTEGER NOT NULL,
                    payment_id INTEGER,
                    accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (buyer_id) REFERENCES users(id),
                    FOREIGN KEY (product_id) REFERENCES products(id),
                    FOREIGN KEY (payment_id) REFERENCES payments(id),
                    UNIQUE(buyer_id, product_id)
                )`,
                
                `CREATE TABLE IF NOT EXISTS contacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER NOT NULL,
                    buyer_id INTEGER NOT NULL,
                    seller_id INTEGER NOT NULL,
                    message TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (product_id) REFERENCES products(id),
                    FOREIGN KEY (buyer_id) REFERENCES users(id),
                    FOREIGN KEY (seller_id) REFERENCES users(id)
                )`,
                
                `CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id)`,
                `CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)`,
                `CREATE INDEX IF NOT EXISTS idx_payments_buyer ON payments(buyer_id)`,
                `CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)`,
                `CREATE INDEX IF NOT EXISTS idx_product_access_buyer ON product_access(buyer_id)`,
                `CREATE INDEX IF NOT EXISTS idx_product_access_product ON product_access(product_id)`
            ];
            
            try {
                for (const tableSql of tables) {
                    await runQuery(tableSql);
                }
                
                // Create default admin user if not exists
                const adminCheck = await getQuery('SELECT * FROM users WHERE username = ?', ['admin']);
                if (!adminCheck) {
                    const bcrypt = require('bcryptjs');
                    const hashedPassword = await bcrypt.hash('admin123', 10);
                    await runQuery(
                        'INSERT INTO users (username, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
                        ['admin', 'admin@kilimoo.com', '0700000000', hashedPassword, 'admin']
                    );
                    console.log('Default admin user created: admin / admin123');
                }
                
                console.log('Database tables created successfully');
                resolve();
            } catch (error) {
                console.error('Error creating tables:', error);
                reject(error);
            }
        });
    });
}

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getDatabase() {
    return {
        run: runQuery,
        get: getQuery,
        all: allQuery
    };
}

module.exports = {
    initializeDatabase,
    getDatabase,
    runQuery,
    getQuery,
    allQuery
};