console.log(`--- Backend Server START at ${new Date().toISOString()} ---`);
console.log(`Backend PID: ${process.pid}`);
console.log(`Node Version: ${process.version}`);
console.log(`Platform: ${process.platform} ${process.arch}`);

// Core Modules
const path = require('path');
const fs = require('fs');
const http = require('http');

// Load Environment Variables
require('dotenv').config();

// NPM Modules
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const axios = require('axios');
const moment = require('moment');

// Express App Initialization
const app = express();
const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || '0.0.0.0';


const cookieParser = require('cookie-parser');
app.use(cookieParser());

// CORS Options
const corsOptions = {
  origin: 'http://localhost:3000', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};



// Middleware
app.use(cors(corsOptions));
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

console.log('✅ Middleware configured');

// uploads directory 
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log('✅ Created uploads directory');
}
app.use('/uploads', express.static(UPLOADS_DIR));

// --- M-Pesa STK Push ---
app.post("/api/mpesa/stk-push", async (req, res) => {
  const { phone, amount } = req.body;

  console.log("🔥 STK Push requested to:", phone, "for", amount);

  if (!phone || !amount) {
    return res.status(400).json({ error: "Missing phone or amount" });
  }

  const consumerKey = process.env.DARAJA_CONSUMER_KEY;
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
  const shortcode = "174379"; // Sandbox
  const passkey = process.env.DARAJA_PASSKEY;

  const timestamp = moment().format("YYYYMMDDHHmmss");
  const password = Buffer.from(shortcode + passkey + timestamp).toString("base64");
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  try {
    // Get access token
    const tokenRes = await axios.get(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      { headers: { Authorization: `Basic ${auth}` } }
    );
    const access_token = tokenRes.data.access_token;

    // Send STK Push
    const stkRes = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: "https://your-ngrok-url.ngrok.io/api/mpesa/stk-callback", // Replace with your URL
        AccountReference: "StockLink",
        TransactionDesc: "Stock purchase",
      },
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    console.log("✅ STK Push Success:", stkRes.data);
    res.status(200).json(stkRes.data);
  } catch (error) {
    console.error("❌ STK Push Failed:", error.response?.data || error.message);
    res.status(500).json({ error: "STK Push failed" });
  }
});

// M-Pesa Callback
app.post("/api/mpesa/stk-callback", (req, res) => {
  console.log("📬 STK Callback received:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// Optional: Token Caching Example
const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const MPESA_AUTH_URL = 'https://sandbox.safaricom.co.ke/oauth/v1/generate';
let cachedAccessToken = null;
let tokenExpiryTime = 0;

const getAccessToken = async () => {
  if (cachedAccessToken && Date.now() < tokenExpiryTime) {
    console.log('Using cached M-Pesa access token.');
    return cachedAccessToken;
  }

  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');

  try {
    const response = await axios.get(MPESA_AUTH_URL, {
      headers: { Authorization: `Basic ${auth}` },
      params: { grant_type: 'client_credentials' }
    });

    const { access_token, expires_in } = response.data;
    cachedAccessToken = access_token;
    tokenExpiryTime = Date.now() + (expires_in * 1000) - (60 * 1000);
    console.log('✅ New M-Pesa access token generated');
    return access_token;
  } catch (error) {
    console.error('❌ Failed to get M-Pesa token:', error.response?.data || error.message);
    throw new Error('Failed to get access token.');
  }
};


const initializeDatabase  = require('./db');

(async () => {
  await initializeDatabase();

})();


// Routes
try {
  const mpesaRoutes = require('./routes/mpesa');
  const productRoutes = require('./routes/products');
  const salesRoutes = require('./routes/sales');
  const authRoutes = require('./routes/auth');
  const  userSesionRoutes   =  require('./routes/userSessionsRoute')

  app.use('/api/mpesa', mpesaRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/sales', salesRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/auth',userSesionRoutes );

  app.get('/api/status', (req, res) => {
    res.json({
      status: 'running',
      pid: process.pid,
      uploadsDir: UPLOADS_DIR,
    });
  });

  console.log('✅ Routes loaded');
} catch (e) {
  console.error(`❌ Route loading error: ${e.message}`);
  process.exit(1);
}

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(`❌ Server error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

// Start HTTP Server
const server = http.createServer(app);

server.listen(PORT, HOST, () => {
  console.log(`✅ Server running at http://${HOST}:${PORT}`);
});

server.on('error', (e) => {
  console.error(`❌ Server error: ${e.code} - ${e.message}`);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('⚠️ Backend: Shutting down');
  server.close(() => process.exit(0));
});

console.log('--- ✅ Backend initialization complete ---');
