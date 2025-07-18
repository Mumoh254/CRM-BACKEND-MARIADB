const express = require('express');
const router = express.Router();
const db = require('../Configurations/mariaDbConfig'); // MariaDB pool or connection
const multer = require('multer');
const path = require('path');
const NodeCache = require('node-cache');

// Cache setup
const myCache = new NodeCache({ stdTTL: 60 }); // 60 seconds TTL

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

router.get('/', async (req, res) => {
  try {
    const cached = myCache.get('products');
    if (cached) return res.json(cached);

    const [rows] = await db.query('SELECT * FROM products');

    // Map over products and create full image URLs
    const productsWithFullImageUrl = rows.map(product => ({
      ...product,
      imageUrl: product.image 
        ? `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 5001}/uploads/${encodeURIComponent(product.image)}`
        : null, // or a default image URL
    }));

    myCache.set('products', productsWithFullImageUrl);
    res.json(productsWithFullImageUrl);
  } catch (err) {
    console.error('GET /products error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});



// GET single product by ID
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true, product: rows[0] });
  } catch (err) {
    console.error('GET /products/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});


// CREATE a new product
router.post('/create', upload.single('image'), async (req, res) => {
  const { name, price, stock, category } = req.body;
  const image = req.file ? req.file.filename : '';

  if (!name || !price || !stock) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO products (name, category, price, stock, image) VALUES (?, ?, ?, ?, ?)`,
      [name, category, parseFloat(price), parseInt(stock), image]
    );
    myCache.del('products');
    res.json({ id: result.insertId, name, category, price, stock, image });
  } catch (err) {
    console.error('POST /products/create error:', err);
    res.status(500).json({ error: 'Error creating product' });
  }
});


// UPDATE a product

router.put('/:id', async (req, res) => {
  const { price, stock } = req.body;
  const id = req.params.id;

  // Require at least one field
  if (price === undefined && stock === undefined) {
    return res.status(400).json({ error: 'Provide at least one field: price or stock' });
  }

  const fields = [];
  const values = [];

  if (price !== undefined) {
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice)) {
      return res.status(400).json({ error: 'Invalid price format' });
    }
    fields.push('price = ?');
    values.push(parsedPrice);
  }

  if (stock !== undefined) {
    const parsedStock = parseInt(stock);
    if (isNaN(parsedStock)) {
      return res.status(400).json({ error: 'Invalid stock format' });
    }
    fields.push('stock = ?');
    values.push(parsedStock);
  }

  values.push(id); // for WHERE clause

  const query = `UPDATE products SET ${fields.join(', ')} WHERE id = ?`;

  try {
    const [result] = await db.query(query, values);
    myCache.del('products');

    res.json({ success: true, updatedFields: fields.map(f => f.split(' ')[0]) });
  } catch (err) {
    console.error('PUT /products/:id error:', err);
    res.status(500).json({ error: 'Error updating product' });
  }
});


// DELETE a product
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    myCache.del('products');
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /products/:id error:', err);
    res.status(500).json({ error: 'Error deleting product' });
  }
});

module.exports = router;
