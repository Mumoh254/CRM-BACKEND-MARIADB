// db.js
const mysql = require('mysql2/promise');
const { URL } = require('url');

const dbUrl = 'mariadb://CRMSOFTWARE_chickenits:a5910489a329f3872117e9e71ad8fc593c1e4ee0@lmq-zm.h.filess.io:3305/CRMSOFTWARE_chickenits';

const parsedUrl = new URL(dbUrl);

const db = mysql.createPool({
  host: parsedUrl.hostname,              // lmq-zm.h.filess.io
  port: parseInt(parsedUrl.port),        // 3305
  user: parsedUrl.username,              // CRMSOFTWARE_chickenits
  password: parsedUrl.password,          // your secure password
  database: parsedUrl.pathname.slice(1), // removes the leading '/'
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = db;
