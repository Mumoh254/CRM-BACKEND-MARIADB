// controllers/mpesaController.js
const axios = require('axios');
const moment = require('moment');
require('dotenv').config(); // Ensure dotenv is loaded here if not globally

// M-Pesa access token caching (optional, but good practice)
let cachedAccessToken = null;
let tokenExpiryTime = 0;

const getAccessToken = async () => {
    if (cachedAccessToken && Date.now() < tokenExpiryTime) {
        console.log('Using cached M-Pesa access token.');
        return cachedAccessToken;
    }

    const CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY; // Ensure these env vars are correctly named
    const CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET;
    const MPESA_AUTH_URL = 'https://sandbox.safaricom.co.ke/oauth/v1/generate';

    const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');

    try {
        const response = await axios.get(MPESA_AUTH_URL, {
            headers: { Authorization: `Basic ${auth}` },
            params: { grant_type: 'client_credentials' }
        });

        const { access_token, expires_in } = response.data;
        cachedAccessToken = access_token;
        // Set expiry slightly before actual expiry to avoid using expired token
        tokenExpiryTime = Date.now() + (expires_in * 1000) - (60 * 1000); // 1 minute buffer
        console.log('✅ New M-Pesa access token generated');
        return access_token;
    } catch (error) {
        console.error('❌ Failed to get M-Pesa token:', error.response?.data || error.message);
        throw new Error('Failed to get access token.');
    }
};

/**
 * Initiates an M-Pesa STK Push transaction.
 * This function will be called by your /api/mpesa/stkpush route.
 */
exports.initiateStkPush = async (req, res) => {
    // Extract phone and amount from the request body sent by the frontend
    const { phone, amount } = req.body;

    // Log the incoming request from the frontend
    console.log(`🔥 [M-PESA STK Push Request] Received for phone: ${phone}, amount: ${amount}`);


    // Basic validation
    if (!phone || !amount) {
        console.error('❌ [M-PESA STK Push Error] Missing phone or amount in request body.');
        return res.status(400).json({ error: "Missing phone or amount" });
    }

    // Safaricom Daraja API credentials and parameters
    // It's recommended to pull these from environment variables
    const shortcode = process.env.DARAJA_SHORTCODE || "174379"; // Your M-Pesa Paybill/Till number
    const passkey = process.env.DARAJA_PASSKEY; // M-Pesa Daraja Passkey
    // This is the URL M-Pesa will call back to after the transaction
    const callbackUrl = process.env.MPESA_CALLBACK_URL || "https://f3d1-102-89-14-24.ngrok-free.app/api/mpesa/stk-callback"; // **IMPORTANT: Replace with your actual Ngrok URL or public domain**

    // Generate Timestamp and Password as required by Daraja API
    const timestamp = moment().format("YYYYMMDDHHmmss");
    const password = Buffer.from(shortcode + passkey + timestamp).toString("base64");

    try {
        // Get the M-Pesa access token
        const access_token = await getAccessToken();

         console.log('➡️ [M-PESA STK Push Outgoing] Sending request to Daraja API with payload:');
        // Construct the STK Push request payload
        const stkPushPayload = {
            BusinessShortCode: shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline", // Or "CustomerBuyGoodsOnline" for Till numbers
            Amount: amount,
            PartyA: phone, // Customer's phone number
            PartyB: shortcode, // Your Business Shortcode
            PhoneNumber: phone, // Customer's phone number again
            CallBackURL: callbackUrl,
            AccountReference: "StockLink", // A unique identifier for the transaction on your end
            TransactionDesc: "Payment for goods", // Description of the transaction
        };

        // Make the POST request to the M-Pesa STK Push endpoint
        const stkRes = await axios.post(
            'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', // Sandbox URL
            stkPushPayload,
            {
                headers: {
                    Authorization: `Bearer ${access_token}`,
                    'Content-Type': 'application/json', // Ensure content type is JSON
                },
            }
        );
        // Log the successful response from Safaricom
        console.log('✅ [M-PESA STK Push Success] Safaricom response:', JSON.stringify(stkRes.data, null, 2));
        console.log("✅ STK Push Success:", stkRes.data);
        res.status(200).json(stkRes.data); // Send the M-Pesa response back to the frontend

    } catch (error) {
        console.error('❌ [M-PESA STK Push Failed] Error:', error.response?.data ? JSON.stringify(error.response.data, null, 2) : error.message);
        console.error("❌ STK Push Failed:", error.response?.data || error.message);
        // Provide a more descriptive error if possible from M-Pesa's response
        const errorMessage = error.response?.data?.CustomerMessage || error.response?.data?.errorMessage || "STK Push failed";
        res.status(500).json({ error: errorMessage });
    }
};

/**
 * Handles the M-Pesa STK Push callback from Safaricom.
 * This function will be called by M-Pesa's servers to your CallBackURL.
 */
exports.stkCallback = (req, res) => {
     // Log the full callback body received from Safaricom
    console.log("📬 [M-PESA Callback Received] Full payload:", JSON.stringify(req.body, null, 2));


     // You might want to extract specific details and log them
    const { Body: { stkCallback: { ResultCode, ResultDesc, CallbackMetadata } } } = req.body;
    console.log(`[M-PESA Callback Summary] Result Code: ${ResultCode}, Description: ${ResultDesc}`);

    if (CallbackMetadata && CallbackMetadata.Item) {
        const amount = CallbackMetadata.Item.find(item => item.Name === 'Amount')?.Value;
        const mpesaReceiptNumber = CallbackMetadata.Item.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
        const transactionDate = CallbackMetadata.Item.find(item => item.Name === 'TransactionDate')?.Value;
        const phoneNumber = CallbackMetadata.Item.find(item => item.Name === 'PhoneNumber')?.Value;

        console.log(`[M-PESA Callback Details] Amount: ${amount}, Receipt: ${mpesaReceiptNumber}, Date: ${transactionDate}, Phone: ${phoneNumber}`);
    }

    // **IMPORTANT:**
    // 1. Parse and validate the callback data.
    // 2. Update your database with the transaction status (success/failure).
    // 3. You might want to emit a WebSocket event to the frontend to notify about payment completion.

    // Always send a 200 OK status to M-Pesa to acknowledge receipt of the callback.
    res.sendStatus(200);
};