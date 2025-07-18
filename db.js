const db = require('./Configurations/mariaDbConfig');

async function initializeDatabase() {
  try {
    // Create products table
    await db.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        stock INT NOT NULL,
        image TEXT,
        category VARCHAR(255),
        cost_price DECIMAL(10, 2) DEFAULT 0,
        reorder_threshold INT DEFAULT 10,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    // Create sales table
    await db.query(`
  CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  image VARCHAR(500),
  price DECIMAL(10,2) NOT NULL,
  cost_of_goods_sold DECIMAL(10,2) DEFAULT 0,
  category_id INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

    `);

    // Create users table
 
await db.query(`
  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );
`);


  await  db.query(`
   CREATE TABLE IF NOT EXISTS user_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_email VARCHAR(255) NOT NULL,
  login_time DATETIME NOT NULL,
  logout_time DATETIME DEFAULT NULL,
  duration_minutes INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

    `)
  

    console.log("✅ Database initialized successfully.");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
  }
}

module.exports = initializeDatabase;
