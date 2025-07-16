const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});
async function sendReceiptEmail(receiptData, customerEmail) {
  try {
    if (!receiptData.pdfBuffer || receiptData.pdfBuffer.length === 0) {
      throw new Error('PDF buffer is empty, cannot send email.');
    }

    const mailOptions = {
      from: `"Welt Tallis POS" <${process.env.EMAIL_USER}>`,
      to: customerEmail,
      subject: `Your Purchase Receipt #${receiptData.receiptId}`,
      text: `Thank you for your purchase!\nReceipt ID: ${receiptData.receiptId}\nTotal: KSH ${receiptData.total}`,
      attachments: [{
        filename: `receipt-${receiptData.receiptId}.pdf`,
        content: receiptData.pdfBuffer,
        contentType: 'application/pdf'
      }]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return info;
  } catch (error) {
    console.error('Failed to send email:', error);
    throw new Error(`Email sending failed: ${error.message}`);
  }
}


module.exports = { sendReceiptEmail };