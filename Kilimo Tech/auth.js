const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'kilimo_tech_secret_key_2024';

async function registerUser(userData) {
  const db = getDatabase();
  const { username, email, phone, password, role } = userData;
  
  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);
  
  try {
    const result = await db.run(
      'INSERT INTO users (username, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
      [username, email, phone, hashedPassword, role]
    );
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: result.lastID, role: role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    return { success: true, token, userId: result.lastID };
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return { success: false, error: 'Username, email, or phone already exists' };
    }
    return { success: false, error: error.message };
  }
}

async function loginUser(identifier, password) {
  const db = getDatabase();
  
  // Check if identifier is email or phone
  const user = await db.get(
    'SELECT * FROM users WHERE email = ? OR phone = ?',
    [identifier, identifier]
  );
  
  if (!user) {
    return { success: false, error: 'User not found' };
  }
  
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return { success: false, error: 'Invalid password' };
  }
  
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  return { 
    success: true, 
    token, 
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role
    }
  };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

async function getUserById(userId) {
  const db = getDatabase();
  return await db.get(
    'SELECT id, username, email, phone, role, created_at FROM users WHERE id = ?',
    [userId]
  );
}

module.exports = { registerUser, loginUser, verifyToken, getUserById };