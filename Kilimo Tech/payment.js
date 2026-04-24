const axios = require('axios');
const { getDatabase } = require('./db');

// M-Pesa Configuration
const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const PASSKEY = process.env.MPESA_PASSKEY;
const SHORTCODE = process.env.MPESA_SHORTCODE;
const ENVIRONMENT = process.env.MPESA_ENVIRONMENT || 'sandbox';

const BASE_URL = ENVIRONMENT === 'production' 
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

async function getAccessToken() {
  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  
  try {
    const response = await axios.get(
      `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${auth}`
        }
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting M-Pesa token:', error.response?.data || error.message);
    throw new Error('Failed to get M-Pesa access token');
  }
}

async function initiateSTKPush(phoneNumber, amount, accountReference, transactionDesc) {
  const token = await getAccessToken();
  
  // Format phone number (remove 0 or +254, add 254)
  let formattedPhone = phoneNumber.toString().replace(/\D/g, '');
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '254' + formattedPhone.substring(1);
  } else if (formattedPhone.startsWith('+')) {
    formattedPhone = formattedPhone.substring(1);
  }
  
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');
  
  const data = {
    BusinessShortCode: SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: formattedPhone,
    PartyB: SHORTCODE,
    PhoneNumber: formattedPhone,
    CallBackURL: `${process.env.CALLBACK_URL || 'https://your-domain.com'}/api/mpesa/callback`,
    AccountReference: accountReference,
    TransactionDesc: transactionDesc
  };
  
  try {
    const response = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return {
      success: true,
      checkoutRequestID: response.data.CheckoutRequestID,
      responseCode: response.data.ResponseCode,
      responseDesc: response.data.ResponseDescription
    };
  } catch (error) {
    console.error('STK Push error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.errorMessage || 'Payment initiation failed'
    };
  }
}

async function handleMpesaCallback(callbackData) {
  const db = getDatabase();
  const { Body: { stkCallback } } = callbackData;
  
  const { ResultCode, ResultDesc, CheckoutRequestID, CallbackMetadata } = stkCallback;
  
  if (ResultCode === 0) {
    // Payment successful
    const metadata = {};
    CallbackMetadata.Item.forEach(item => {
      metadata[item.Name] = item.Value;
    });
    
    // Update payment record
    await db.run(
      `UPDATE payments 
       SET status = 'completed', 
           transaction_date = CURRENT_TIMESTAMP,
           mpesa_receipt = ?
       WHERE checkout_request_id = ?`,
      [metadata.MpesaReceiptNumber, CheckoutRequestID]
    );
    
    // Get payment details
    const payment = await db.get(
      'SELECT buyer_id FROM payments WHERE checkout_request_id = ?',
      [CheckoutRequestID]
    );
    
    if (payment) {
      // Grant access to all products? Or specific product? For now, grant access to view seller details
      // This will be handled by the access check in the API
      console.log(`Payment successful for buyer ${payment.buyer_id}`);
    }
    
    return { success: true, message: 'Payment processed successfully' };
  } else {
    // Payment failed
    await db.run(
      'UPDATE payments SET status = ? WHERE checkout_request_id = ?',
      ['failed', CheckoutRequestID]
    );
    
    return { success: false, message: ResultDesc };
  }
}

async function recordPayment(buyerId, checkoutRequestID) {
  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO payments (buyer_id, checkout_request_id, amount, status) 
     VALUES (?, ?, 20.00, 'pending')`,
    [buyerId, checkoutRequestID]
  );
  return result.lastID;
}

async function checkPaymentStatus(checkoutRequestID) {
  const db = getDatabase();
  const payment = await db.get(
    'SELECT * FROM payments WHERE checkout_request_id = ?',
    [checkoutRequestID]
  );
  return payment;
}

async function hasAccessToSellerDetails(buyerId, productId) {
  const db = getDatabase();
  
  // Check if buyer has made any successful payment
  const payment = await db.get(
    `SELECT p.* FROM payments p
     WHERE p.buyer_id = ? 
     AND p.status = 'completed'
     ORDER BY p.created_at DESC
     LIMIT 1`,
    [buyerId]
  );
  
  // For now, any completed payment gives access to view seller details
  // You can modify this to be product-specific if needed
  return payment !== null;
}

module.exports = {
  initiateSTKPush,
  handleMpesaCallback,
  recordPayment,
  checkPaymentStatus,
  hasAccessToSellerDetails
};