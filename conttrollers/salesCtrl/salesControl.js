// controllers/salesController.js
const db = require('../../Configurations/mariaDbConfig'); // Assuming this correctly imports your MariaDB connection pool
const NodeCache = require('node-cache');
const nodemailer = require('nodemailer');
// const { generateReceiptPDF } = require('../../utils/receipt'); // Uncomment if these utilities exist and are needed
// const { sendEmailWithAttachment, sendReceiptEmail } = require('../../utils/email'); // Uncomment if these utilities exist and are needed
// const fs = require('fs'); // Uncomment if file system operations are needed
// const path = require('path'); // Uncomment if path operations are needed
// const { print } = require('pdf-to-printer'); // Uncomment if direct printing is needed

const myCache = new NodeCache({ stdTTL: 60 }); // Cache for 60 seconds

// Basic email validation regex
const isValidEmail = (email) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());

// Nodemailer transporter setup
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
        userEmail, 
        cashAmount, 
        mpesaAmount 
    } = req.body;

    // Validate incoming data
    if (!Array.isArray(items) || items.length === 0 || !items.every((item) => item.id && item.qty > 0)) {
        return res.status(400).json({ error: 'Invalid items provided in the sale.' });
    }

    if (typeof total !== 'number' || total <= 0) {
        return res.status(400).json({ error: 'Invalid total amount for the sale.' });
    }

    const conn = await db.getConnection(); // Get a connection from the pool
    try {
        await conn.beginTransaction(); // Start transaction

        const itemsWithDetails = [];
        for (const item of items) {
            // Fetch product details to validate and get current price/stock
            const [products] = await conn.query('SELECT id, name, price, stock_quantity FROM products WHERE id = ?', [item.id]);
            const product = products[0];

            if (!product) {
                throw new Error(`Product with ID ${item.id} not found.`);
            }
            if (product.stock_quantity < item.qty) { // Use stock_quantity from schema
                throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock_quantity}, Requested: ${item.qty}.`);
            }

            itemsWithDetails.push({
                productId: product.id,
                name: product.name,
                price: parseFloat(product.price),
                qty: item.qty,
                total: parseFloat(product.price) * item.qty,
            });
        }

        // Recalculate total on backend to prevent tampering
        const calculatedTotal = itemsWithDetails.reduce((sum, item) => sum + item.total, 0);
        if (Math.abs(calculatedTotal - total) > 0.01) { // Allow small float deviation
            throw new Error(`Total mismatch. Calculated: ${calculatedTotal.toFixed(2)}, Received: ${total.toFixed(2)}.`);
        }

        // Determine the final payment method string for the sales record
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

        // Insert into the sales table
        const [saleResult] = await conn.query(
            `INSERT INTO sales (
                items, total, payment_method, customer_email, customer_name,
                customer_phone, customer_latitude, customer_longitude,
                amount_tendered, sale_date, user_email
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                JSON.stringify(itemsWithDetails), // Store items as JSON string
                total,
                finalPaymentMethod,
                customerEmail || null,
                customerName || null,
                customerPhone || null,
                customerLatitude || null,
                customerLongitude || null,
                finalAmountTendered, // Store the total amount tendered for the sale
                new Date().toISOString().slice(0, 19).replace('T', ' '), // Format to 'YYYY-MM-DD HH:MM:SS' for MariaDB TIMESTAMP
                userEmail || null
            ]
        );

        // Update product stock quantities
        for (const item of items) {
            await conn.query('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?', [item.qty, item.id]);
        }

        await conn.commit(); // Commit the transaction

        res.json({
            success: true,
            saleId: saleResult.insertId,
            total,
            change: paymentMethod === 'cash' && amountTendered ? amountTendered - total : 0,
            message: 'Order processed successfully!'
        });
    } catch (err) {
        await conn.rollback(); // Rollback on error
        console.error('Sale Transaction Error:', err.message);
        res.status(400).json({ error: err.message });
    } finally {
        conn.release(); // Release the connection back to the pool
    }
};

// ======================
// Controller Function: Initiate M-Pesa STK Push
// POST /api/sales/stkpush
// ======================
exports.initiateStkPush = async (req, res) => {
    const { amount, mpesaPhoneNumber, customerEmail, customerName, customerPhone, userEmail, items, total } = req.body;

    // Validate inputs
    if (!amount || amount <= 0 || !mpesaPhoneNumber || mpesaPhoneNumber.length < 9) {
        return res.status(400).json({ error: 'Invalid amount or M-Pesa phone number provided.' });
    }

    // --- Placeholder for actual M-Pesa API integration ---
    // In a real application, you would make an API call to Safaricom's Daraja API here.
    // This would involve:
    // 1. Getting an OAuth token from Daraja.
    // 2. Making a STK Push (Lipa Na M-Pesa Online) request.
    // 3. Handling the response and potentially storing the CheckoutRequestID for callback validation.
    // 4. You might also need a callback URL (C2B URL) configured in Daraja to receive payment confirmation.

    console.log(`Simulating M-Pesa STK Push for ${mpesaPhoneNumber} with amount ${amount}`);
    console.log('Customer Details:', { customerEmail, customerName, customerPhone });
    console.log('Items:', items);
    console.log('Total:', total);
    console.log('User making sale:', userEmail);

    try {
        // Simulate a delay for the API call
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Simulate a successful STK push response
        res.json({
            success: true,
            message: 'STK Push initiated successfully. Please check your phone to complete the payment.',
            checkoutRequestID: 'ws_CO_DMZ_XXXX_XXXX_SIMULATED' // Example simulated ID
        });

    } catch (error) {
        console.error('STK Push Initiation Error:', error.message);
        res.status(500).json({ error: 'Failed to initiate STK Push. Please try again later.' });
    }
};

// ======================
// Controller Function: Get Analytics
// GET /api/sales/analytics
// ======================


exports.getAnalytics = async (req, res) => {
  const { range = 'daily' } = req.query;
  let dateCondition = '';
  let groupByDateFormat = '';
  let dateFormat = '';

  switch (range) {
    case 'daily':
      dateCondition = 'DATE(sale_date) = CURDATE()';
      groupByDateFormat = 'DATE(sale_date)';
      dateFormat = '%Y-%m-%d';
      break;
    case 'weekly':
      dateCondition = 'sale_date >= CURDATE() - INTERVAL 7 DAY';
      groupByDateFormat = 'YEARWEEK(sale_date, 1)';
      dateFormat = '%Y-W%U';
      break;
    case 'monthly':
      dateCondition =
        'MONTH(sale_date) = MONTH(CURDATE()) AND YEAR(sale_date) = YEAR(CURDATE())';
      groupByDateFormat = 'DATE_FORMAT(sale_date, "%Y-%m")';
      dateFormat = '%Y-%m';
      break;
    default:
      dateCondition = 'DATE(sale_date) = CURDATE()';
      groupByDateFormat = 'DATE(sale_date)';
      dateFormat = '%Y-%m-%d';
  }

  try {
    const todaySales = await getQuery(`
      SELECT
        IFNULL(SUM(total), 0) AS totalSales,
        COUNT(*) AS transactions
      FROM sales
      WHERE ${dateCondition}
    `);

    const totalItemsSoldResult = await getQuery(`
      SELECT
        IFNULL(SUM(item.qty), 0) AS totalItemsSold
      FROM sales
      JOIN JSON_TABLE(items, '$[*]' COLUMNS (
        qty INT PATH '$.qty'
      )) AS item
      WHERE ${dateCondition}
    `);

    const topProducts = await allQuery(`
      SELECT
        p.id,
        p.name,
        p.image,
        SUM(item.qty * p.price) AS revenue,
        SUM(item.qty) AS totalSold
      FROM sales s
      JOIN JSON_TABLE(s.items, '$[*]' COLUMNS (
        id INT PATH '$.productId',
        qty INT PATH '$.qty'
      )) AS item
      JOIN products p ON p.id = item.id
      WHERE ${dateCondition}
      GROUP BY p.id, p.name, p.image
      ORDER BY revenue DESC
      LIMIT 5
    `);

    const paymentMethods = await allQuery(`
      SELECT payment_method, COUNT(*) AS transactions, SUM(total) AS totalRevenue
      FROM sales
      WHERE ${dateCondition}
      GROUP BY payment_method
      ORDER BY totalRevenue DESC
    `);

    const repeatCustomers = await allQuery(`
      SELECT
        s.customer_email,
        COUNT(s.id) AS transactionCount,
        SUM(s.total) AS lifetimeValue,
        SUM(item.qty) AS totalProducts
      FROM sales s
      JOIN JSON_TABLE(s.items, '$[*]' COLUMNS (
        qty INT PATH '$.qty'
      )) AS item
      WHERE s.customer_email IS NOT NULL
        AND s.sale_date >= CURDATE() - INTERVAL 90 DAY
      GROUP BY s.customer_email
      HAVING transactionCount > 1
      ORDER BY lifetimeValue DESC
    `);

    const revenueTrends = await allQuery(`
      SELECT
        DATE_FORMAT(sale_date, '${dateFormat}') AS date,
        SUM(total) AS revenue
      FROM sales
      WHERE ${dateCondition}
      GROUP BY ${groupByDateFormat}
      ORDER BY MIN(sale_date) ASC
    `);

    const productSalesTrendsRaw = await allQuery(`
      SELECT
        p.id,
        p.name,
        DATE_FORMAT(s.sale_date, '${dateFormat}') AS date,
        SUM(item.qty) AS units_sold
      FROM sales s
      JOIN JSON_TABLE(s.items, '$[*]' COLUMNS (
        id INT PATH '$.productId',
        qty INT PATH '$.qty'
      )) AS item
      JOIN products p ON p.id = item.id
      WHERE ${dateCondition}
      GROUP BY p.id, p.name, date
      ORDER BY p.name, date ASC
    `);

    const productSalesTrends = [];
    const productMap = new Map();
    productSalesTrendsRaw.forEach(row => {
      if (!productMap.has(row.id)) {
        productMap.set(row.id, {
          id: row.id,
          name: row.name,
          salesData: []
        });
      }
      productMap.get(row.id).salesData.push({
        date: row.date,
        units_sold: row.units_sold
      });
    });
    productSalesTrends.push(...productMap.values());

    const customerGrowth = await allQuery(`
      SELECT
        DATE_FORMAT(sale_date, '${dateFormat}') AS period,
        COUNT(DISTINCT customer_email) AS count
      FROM sales
      WHERE customer_email IS NOT NULL
        AND ${dateCondition}
      GROUP BY ${groupByDateFormat}
      ORDER BY period ASC
    `);

    const peakHour = await getQuery(`
      SELECT
        HOUR(sale_date) AS hour,
        SUM(total) AS revenue,
        COUNT(*) AS transactions
      FROM sales
      WHERE ${dateCondition}
      GROUP BY hour
      ORDER BY revenue DESC
      LIMIT 1
    `);

    const costAnalysis = await allQuery(`
      SELECT
        p.category AS category_name,
        SUM(p.price * item.qty) AS totalRevenue
      FROM sales s
      JOIN JSON_TABLE(s.items, '$[*]' COLUMNS (
        id INT PATH '$.productId',
        qty INT PATH '$.qty'
      )) AS item
      JOIN products p ON p.id = item.id
      WHERE ${dateCondition}
      GROUP BY p.category
      ORDER BY totalRevenue DESC
    `);

    const productMovement = await allQuery(`
      SELECT
        p.name AS product_name,
        SUM(item.qty) AS units_sold
      FROM sales s
      JOIN JSON_TABLE(s.items, '$[*]' COLUMNS (
        id INT PATH '$.productId',
        qty INT PATH '$.qty'
      )) AS item
      JOIN products p ON p.id = item.id
      WHERE ${dateCondition}
      GROUP BY p.name
      ORDER BY units_sold DESC
    `);

    const analytics = {
      todaySales: {
        ...todaySales,
        totalItemsSold: totalItemsSoldResult.totalItemsSold || 0
      },
      topProducts,
      paymentMethods,
      repeatCustomers,
      revenueTrends,
      productSalesTrends,
      customerGrowth,
      peakHour: peakHour || { hour: 0, revenue: 0, transactions: 0 },
      costAnalysis,
      productMovement
    };

    res.json(analytics);
  } catch (error) {
    console.error('Analytics Fetch Error:', error.message);
    res.status(500).json({ error: 'Failed to generate analytics data.' });
  }
};


// ======================
// Controller Function: Update Stock
// PATCH /api/sales/stock/:id
// ======================
exports.updateStock = async (req, res) => {
    const { id } = req.params;
    const { quantity } = req.body;

    // Validate quantity
    if (typeof quantity !== 'number' || !Number.isInteger(quantity)) {
        return res.status(400).json({ error: 'Quantity must be an integer number.' });
    }

    try {
        // Update stock_quantity column as per schema
        await runQuery('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?', [quantity, id]);
        const product = await getQuery('SELECT id, name, stock_quantity FROM products WHERE id = ?', [id]); // Fetch updated stock_quantity

        if (!product) return res.status(404).json({ error: 'Product not found.' });

        myCache.del('products'); // Invalidate product cache
        res.json({ message: 'Stock updated successfully!', product });
    } catch (err) {
        console.error('Stock Update Error:', err.message);
        res.status(500).json({ error: 'Stock update failed.' });
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

        // Parse JSON items back into objects for each sale
        const formattedSales = sales.map(sale => ({
            ...sale,
            items: JSON.parse(sale.items) // Ensure 'items' is parsed correctly
        }));

        res.json({ success: true, sales: formattedSales });
    } catch (err) {
        console.error('Sales Fetch Error:', err.message);
        res.status(500).json({ error: 'Failed to retrieve sales records.' });
    } finally {
        conn.release();
    }
};

// ======================
// Controller Function: Get Discounts (for products available for discount)
// GET /api/products (Renamed from /api/sales/discounts to be more semantic)
// ======================
exports.getProductsForDiscount = async (req, res) => { // Renamed function
    try {
        // Fetch products that are active and could potentially be discounted
        const products = await allQuery('SELECT id, name, price, image FROM products WHERE is_active = TRUE');
        res.json(products);
    } catch (err) {
        console.error('Error loading products for discounts:', err.message);
        res.status(500).json({ error: 'Failed to load products for discount management.' });
    }
};


// ======================
// Controller Function: Notify Discounts
// POST /api/sales/discounts/notify
// ======================
exports.notifyDiscounts = async (req, res) => {
    // Frontend sends productIds, emailSubject, emailBody
    const { productIds, emailSubject, emailBody } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ error: 'No products selected for discount notification.' });
    }
    if (!emailSubject || !emailBody) {
        return res.status(400).json({ error: 'Email subject and body are required.' });
    }

    try {
        // Fetch details of the selected products
        const products = await allQuery(
            `SELECT id, name, price, image FROM products WHERE id IN (?)`,
            [productIds]
        );

        if (products.length === 0) {
            return res.status(404).json({ message: 'No selected products found for discount notification.' });
        }

        // Fetch loyal customers (e.g., those with more than 1 transaction in the last 90 days)
        const loyalCustomers = await allQuery(
            `SELECT DISTINCT customer_email
             FROM sales
             WHERE customer_email IS NOT NULL
             AND sale_date >= CURDATE() - INTERVAL 90 DAY
             GROUP BY customer_email
             HAVING COUNT(id) >= 2 -- Example: customers with at least 2 transactions
             ORDER BY COUNT(id) DESC`
        );

        if (loyalCustomers.length === 0) {
            return res.status(200).json({ message: 'No loyal customers to notify with discounts.', sentCount: 0 });
        }

        // Define a color for the email template (since 'colors' object is not available here)
        const emailPrimaryColor = '#FF4532'; // Jikoni Red from your frontend palette

        // Generate HTML for discounted products
        const productDetailsHtml = products.map(product => `
            <div style="border: 1px solid #eee; padding: 10px; margin-bottom: 10px; border-radius: 8px; text-align: center;">
                <h4 style="margin: 0; color: #333;">${product.name}</h4>
                <p style="margin: 5px 0;">Original Price: Ksh ${parseFloat(product.price).toFixed(2)}</p>
                <p style="margin: 5px 0; color: ${emailPrimaryColor}; font-weight: bold;">Special Discount Available!</p>
                ${product.image ? `<img src="http://localhost:5001/uploads/${encodeURIComponent(product.image)}" style="max-width: 150px; height: auto; border-radius: 4px; display: block; margin: 10px auto;" alt="${product.name}" />` : ''}
                <p style="font-size: 0.9em; color: #666;">(Discount applied at checkout)</p>
            </div>
        `).join('');

        let sentCount = 0;
        const mailPromises = loyalCustomers.map(customer => {
            if (isValidEmail(customer.customer_email)) {
                return transporter.sendMail({
                    from: `"Store Discounts" <${process.env.EMAIL_USER}>`,
                    to: customer.customer_email,
                    subject: emailSubject,
                    html: `
                        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                            <h2 style="color: ${emailPrimaryColor}; text-align: center;">Special Discounts Just for You!</h2>
                            <p>${emailBody}</p>
                            <p>Here are some exclusive offers on products you might love:</p>
                            <div style="display:flex; flex-wrap:wrap; justify-content: center; gap: 15px; margin-top: 20px;">
                                ${productDetailsHtml}
                            </div>
                            <p style="text-align: center; margin-top: 30px;">Visit our store to grab these amazing deals!</p>
                            <p style="text-align: center; font-size: 0.9em; color: #777;">Best regards,<br/>The Store Team</p>
                        </div>
                    `,
                })
                .then(() => {
                    sentCount++;
                    console.log(`Discount email sent to ${customer.customer_email}`);
                })
                .catch(emailErr => {
                    console.error(`Failed to send discount email to ${customer.customer_email}:`, emailErr.message);
                });
            } else {
                console.warn(`Skipping invalid email for discount notification: ${customer.customer_email}`);
                return Promise.resolve(); // Resolve for invalid emails to not block Promise.allSettled
            }
        });

        await Promise.allSettled(mailPromises); // Wait for all emails to attempt sending

        res.json({ success: true, message: 'Discount email notifications initiated.', sentCount });
    } catch (error) {
        console.error('Failed to send discount emails:', error.message);
        res.status(500).json({ error: 'Failed to send discount emails. Server error.' });
    }
};