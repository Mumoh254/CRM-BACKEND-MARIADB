const express = require('express');
const router = express.Router();

/*
router.post("/stk-push", async (req, res) => {
console.log("📦 Full req.body:", req.body);

const phone = req.body?.phone;
const amount = req.body?.amount;

if (!phone || !amount) {
  return res.status(400).json({ error: "Phone or amount missing" });
}

  console.log("🔥 Received STK Push request:", phone, amount);
  res.status(200).json({ message: 'M-Pesa STK route is working!' });
});

*/


router.post("/stk-push", async (req, res) => {
  const { phone, amount } = req.body;
  console.log("📦 Full req.body:", req.body);
  console.log(`🔥 Received STK Push request: ${phone} ${amount}`);

  try {
    // Simulate success response (or call actual Daraja logic)
    return res.json({
      ResponseCode: "0", // ✅ indicates success
      ResponseDescription: "Success. Request accepted for processing",
      CustomerMessage: "Success. STK push sent"
    });
  } catch (error) {
    console.error("❌ STK Push error:", error);
    return res.status(500).json({
      ResponseCode: "1",
      errorMessage: "STK push failed due to server error"
    });
  }
});


// routes/mpesa.js

router.post('/stk-callback', (req, res) => {
    console.log("✅ STK Callback Received!");
    console.log("📦 Callback Body:", JSON.stringify(req.body, null, 2));

    // You can extract and save to DB here if needed
    const callbackData = req.body.Body.stkCallback;

    const resultCode = callbackData.ResultCode;
    const resultDesc = callbackData.ResultDesc;
    const checkoutRequestID = callbackData.CheckoutRequestID;

    console.log(`✅ STK Result: ${resultDesc} (Code: ${resultCode})`);

    // Example: handle success (code 0 = success)
    if (resultCode === 0) {
        const amount = callbackData.CallbackMetadata.Item.find(i => i.Name === 'Amount')?.Value;
        const phone = callbackData.CallbackMetadata.Item.find(i => i.Name === 'PhoneNumber')?.Value;
        console.log(`💰 Paid: KES ${amount} from ${phone}`);
        // Save this to your DB if needed
    }

    // Always send back a 200 OK
    res.json({ message: "✅ Callback received successfully" });
});




module.exports = router;