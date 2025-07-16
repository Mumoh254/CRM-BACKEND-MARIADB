// controllers/salesController.js
const db = require('../../Configurations/mariaDbConfig'); 
const NodeCache = require('node-cache');
const nodemailer = require('nodemailer');
const { generateReceiptPDF } = require('../../utils/receipt');
const { sendEmailWithAttachment, sendReceiptEmail } = require('../../utils/email'); 
const fs = require('fs'); 
const path = require('path'); 
const { print } = require('pdf-to-printer');

const myCache = new NodeCache({ stdTTL: 60 });

const isValidEmail = (email) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Helper functions for MariaDB queries
const runQuery = async (query, params = []) => {
    const [result] = await db.query(query, params);
    return result;
};

const getQuery = async (query, params = []) => {
    const [rows] = await db.query(query, params);
    return rows[0] || null;
};

const allQuery = async (query, params = []) => {
    const [rows] = await db.query(query, params);
    return rows;
};

// ======================
// Controller Function: Create Sale
// POST /api/sales/
// ======================
exports.createSale = async (req, res) => {
    const {
        items,
        total,
        paymentMethod,
        customerEmail,
        customerName,
        customerPhone,
        customerLatitude,
        customerLongitude,
        amountTendered,
        userEmail, // The email of the logged-in user making the sale
        mpesaPhoneNumber, // For M-Pesa payments
        cashAmount, // For split payments
        mpesaAmount // For split payments
    } = req.body;

    if (!Array.isArray(items) || items.length === 0 || !items.every((item) => item.id && item.qty > 0)) {
        return res.status(400).json({ error: 'Invalid items' });
    }

    if (typeof total !== 'number' || total <= 0) {
        return res.status(400).json({ error: 'Invalid total amount' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const itemsWithDetails = [];
        for (const item of items) {
            const [products] = await conn.query('SELECT id, name, price, stock FROM products WHERE id = ?', [item.id]);
            const product = products[0];
            if (!product) throw new Error(`Product ${item.name || item.id} not found`);
            if (product.stock < item.qty) throw new Error(`Insufficient stock for ${product.name}`);

            itemsWithDetails.push({
                productId: product.id,
                name: product.name,
                price: parseFloat(product.price),
                qty: item.qty,
                total: parseFloat(product.price) * item.qty,
            });
        }

        const calculatedTotal = itemsWithDetails.reduce((sum, item) => sum + item.total, 0);
        if (Math.abs(calculatedTotal - total) > 0.01) throw new Error('Total mismatch'); // Allow small float deviation

        const saleDate = new Date().toISOString(); // Store in UTC

        // Determine the final payment method and tendered amount for the sales record
        let finalPaymentMethod = paymentMethod;
        let finalAmountTendered = null;

        if (paymentMethod === 'cash') {
            finalAmountTendered = parseFloat(amountTendered) || total;
        } else if (paymentMethod === 'mpesa') {
            finalAmountTendered = total; // M-Pesa usually pays exact amount
        } else if (paymentMethod === 'split') {
            finalPaymentMethod = `split_cash_mpesa`; // Indicate split payment in DB
            finalAmountTendered = (parseFloat(cashAmount || 0) + parseFloat(mpesaAmount || 0));
        }

        const [saleResult] = await conn.query(
            `INSERT INTO sales (
                items, total, payment_method, customer_email, customer_name,
                customer_phone, customer_latitude, customer_longitude,
                amount_tendered, sale_date, user_email
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                JSON.stringify(itemsWithDetails),
                total,
                finalPaymentMethod,
                customerEmail || null,
                customerName || null,
                customerPhone || null,
                customerLatitude || null,
                customerLongitude || null,
                finalAmountTendered, // Store the total amount tendered for the sale
                saleDate,
                userEmail || null
            ]
        );

        for (const item of items) {
            await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [item.qty, item.id]);
        }

        await conn.commit();

        res.json({
            success: true,
            saleId: saleResult.insertId,
            total,
            change: paymentMethod === 'cash' && amountTendered ? amountTendered - total : 0,
            message: 'Order processed successfully!'
        });
    } catch (err) {
        await conn.rollback();
        console.error('Sale Error:', err.message);
        res.status(400).json({ error: err.message });
    } finally {
        conn.release();
    }
};

// ======================
// Controller Function: Initiate M-Pesa STK Push
// POST /api/sales/stkpush (New endpoint for M-Pesa)
// ======================
exports.initiateStkPush = async (req, res) => {
    const { amount, mpesaPhoneNumber, customerEmail, customerName, customerPhone, userEmail, items, total } = req.body;

    if (!amount || amount <= 0 || !mpesaPhoneNumber || mpesaPhoneNumber.length < 9) {
        return res.status(400).json({ error: 'Invalid amount or M-Pesa phone number.' });
    }

    // You would integrate with your M-Pesa API here
    // This is a placeholder for the actual STK push logic
    console.log(`Simulating STK Push for ${mpesaPhoneNumber} with amount ${amount}`);
    console.log('Customer Details:', { customerEmail, customerName, customerPhone });
    console.log('Items:', items);
    console.log('Total:', total);
    console.log('User making sale:', userEmail);

    try {
        // In a real application, you'd call the M-Pesa API here.
        // On successful STK push initiation, you might record a pending transaction in your DB
        // and then confirm it via a M-Pesa callback (webhooks).
        // For this example, we'll just simulate success.

        // Simulate M-Pesa API call delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        // If STK push is for a split payment, the actual sale record might be created
        // by the createSale controller, or you might have a separate transaction table
        // that gets updated by the M-Pesa callback.
        // For simplicity, if this is a direct M-Pesa payment, you might want to record the sale here
        // or have the frontend call createSale after successful STK push confirmation.
        // For now, we'll just send success response.

        res.json({
            success: true,
            message: 'STK Push initiated successfully. Please check your phone.',
            checkoutRequestID: 'ws_CO_DMZ_XXXX_XXXX' // Example ID from M-Pesa
        });

    } catch (error) {
        console.error('STK Push Error:', error.message);
        res.status(500).json({ error: 'Failed to initiate STK Push.' });
    }
};


// ======================
// Controller Function: Get Analytics
// GET /api/sales/analytics
// ======================
exports.getAnalytics = async (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10); // Today date string formatted for MariaDB (YYYY-MM-DD)

        const todaySales = await getQuery(
            `SELECT
                IFNULL(SUM(total),0) AS totalSales,
                COUNT(*) AS transactions
            FROM sales
            WHERE DATE(sale_date) = ?`,
            [today]
        );

        const totalItemsSoldResult = await getQuery(
            `SELECT
                IFNULL(SUM(JSON_EXTRACT(item.value, '$.qty')), 0) AS totalItemsSold
               FROM sales
               JOIN JSON_TABLE(sales.items, '$[*]' COLUMNS (
                 qty INT PATH '$.qty'
               )) AS item
               WHERE DATE(sale_date) = ?`,
            [today]
        );

        const topProducts = await allQuery(
            `SELECT
                p.id, p.name, p.image,
                SUM(JSON_EXTRACT(item.value, '$.qty')) AS totalSold,
                SUM(JSON_EXTRACT(item.value, '$.qty') * JSON_EXTRACT(item.value, '$.price')) AS revenue
            FROM sales s
            JOIN JSON_TABLE(s.items, '$[*]' COLUMNS (
                productId INT PATH '$.productId',
                qty INT PATH '$.qty',
                price DECIMAL(10,2) PATH '$.price'
            )) AS item
            JOIN products p ON p.id = item.productId
            WHERE DATE(s.sale_date) = ?
            GROUP BY p.id, p.name, p.image
            ORDER BY totalSold DESC
            LIMIT 5`,
            [today]
        );

        const paymentMethods = await allQuery(
            `SELECT payment_method, COUNT(*) AS transactions, SUM(total) AS totalRevenue
            FROM sales
            WHERE DATE(sale_date) = ?
            GROUP BY payment_method`,
            [today]
        );

        const repeatCustomers = await allQuery(
            `SELECT customer_email, COUNT(*) AS transactionCount, SUM(total) AS lifetimeValue
            FROM sales
            WHERE customer_email IS NOT NULL
            GROUP BY customer_email
            HAVING transactionCount > 1
            ORDER BY lifetimeValue DESC`
        );

        const analytics = {
            todaySales: {
                ...todaySales,
                totalItemsSold: totalItemsSoldResult.totalItemsSold || 0,
            },
            topProducts,
            paymentMethods,
            repeatCustomers,
        };

        res.json(analytics);
    } catch (error) {
        console.error('Analytics error:', error.message);
        res.status(500).json({ error: 'Failed to generate analytics' });
    }
};

// ======================
// Controller Function: Update Stock
// PATCH /api/sales/stock/:id
// ======================
exports.updateStock = async (req, res) => {
    const { id } = req.params;
    const { quantity } = req.body;

    if (typeof quantity !== 'number') {
        return res.status(400).json({ error: 'Quantity must be a number' });
    }

    try {
        await runQuery('UPDATE products SET stock = stock + ? WHERE id = ?', [quantity, id]);
        const product = await getQuery('SELECT id, name, stock FROM products WHERE id = ?', [id]);

        if (!product) return res.status(404).json({ error: 'Product not found' });

        myCache.del('products'); // Invalidate product cache
        res.json({ message: 'Stock updated', product });
    } catch (err) {
        console.error('Stock update error:', err.message);
        res.status(500).json({ error: 'Stock update failed' });
    }
};

// ======================
// Controller Function: Get All Sales
// GET /api/sales/sales
// ======================
exports.getSales = async (req, res) => {
    const conn = await db.getConnection();
    try {
        const [sales] = await conn.query(`
            SELECT
                id,
                sale_date,
                total,
                payment_method,
                customer_email,
                customer_name,
                customer_phone,
                customer_latitude,
                customer_longitude,
                amount_tendered,
                user_email,
                items
            FROM sales
            ORDER BY sale_date DESC
        `);

        // Parse JSON items back into objects
        const formattedSales = sales.map(sale => ({
            ...sale,
            items: JSON.parse(sale.items)
        }));

        res.json({ success: true, sales: formattedSales });
    } catch (err) {
        console.error('Sales Fetch Error:', err.message);
        res.status(500).json({ error: 'Failed to retrieve sales' });
    } finally {
        conn.release();
    }
};

// ======================
// Controller Function: Get Discounts
// GET /api/sales/discounts
// ======================
exports.getDiscounts = async (req, res) => {
    try {
        const discounts = await allQuery('SELECT * FROM discounts');
        res.json(discounts);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load discounts' });
    }
};

// ======================
// Controller Function: Notify Discounts
// POST /api/sales/discounts/notify
// ======================
exports.notifyDiscounts = async (req, res) => {
    const { discounts, emailTemplate } = req.body;

    try {
        const customers = await allQuery('SELECT DISTINCT customer_email FROM sales WHERE customer_email IS NOT NULL');

        let sentCount = 0;
        for (const customer of customers) {
            if (isValidEmail(customer.customer_email)) { // Basic email validation
                await transporter.sendMail({
                    from: `"Store Discounts" <${process.env.EMAIL_USER}>`,
                    to: customer.customer_email,
                    subject: emailTemplate.subject,
                    html: `
                        <h2>Special Discounts Just for You!</h2>
                        <p>${emailTemplate.body}</p>
                        <div style="display:flex;flex-wrap:wrap">
                            ${discounts
                                .map(
                                    (product) => `
                                <div style="width:200px;margin:10px;text-align:center">
                                    <img src="http://localhost:5000/uploads/${product.image}" style="width:100px;height:100px; object-fit: cover; border-radius: 8px;" alt="${product.name}" />
                                    <h3>${product.name}</h3>
                                    <p style="font-weight: bold; color: ${colors.primary};">Ksh ${parseFloat(product.discountedPrice).toFixed(2)}</p>
                                </div>
                            `
                                )
                                .join('')}
                        </div>
                    `,
                });
                sentCount++;
            } else {
                console.warn(`Skipping invalid email: ${customer.customer_email}`);
            }
        }

        res.json({ success: true, sentCount });
    } catch (error) {
        console.error('Failed to send discount emails:', error);
        res.status(500).json({ error: 'Failed to send discount emails' });
    }
};