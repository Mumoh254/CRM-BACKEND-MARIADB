// stk-push.js or wherever you're initiating the payment
/*const stkPushRequest = {
  BusinessShortCode: process.env.MPESA_SHORTCODE,
  Password: password,
  Timestamp: timestamp,
  TransactionType: "CustomerPayBillOnline",
  Amount: amount,
  PartyA: phone,
  PartyB: process.env.MPESA_SHORTCODE,
  PhoneNumber: phone,
  CallBackURL: "https://d2a4-102-89-2-31.ngrok-free.app/api/mpesa/callback", // ⚠️ Replace with your public endpoint
  AccountReference: "StockLink",
  TransactionDesc: "Payment for goods"
};
*/
const response = await axios.post(
  'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
  {
    BusinessShortCode: process.env.SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: amount,
    PartyA: phone,
    PartyB: process.env.SHORTCODE,
    PhoneNumber: phone,
    CallBackURL: "https://f3d1-102-89-14-24.ngrok-free.app/api/mpesa/stk-callback", // <== Important!
    AccountReference: "StockLink",
    TransactionDesc: "Payment for goods",
  },
  {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  }
);