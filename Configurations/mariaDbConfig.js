// db.js
const mysql = require('mysql2/promise');
const { URL } = require('url');

const dbUrl = 'mariadb://CRMSOFTWARE_chickenits:a5910489a329f3872117e9e71ad8fc593c1e4ee0@lmq-zm.h.filess.io:3305/CRMSOFTWARE_chickenits';

const parsedUrl = new URL(dbUrl);

const pool = mysql.createPool({
  host: parsedUrl.hostname,
  port: parseInt(parsedUrl.port),
  user: parsedUrl.username,
  password: parsedUrl.password,
  database: parsedUrl.pathname.slice(1),
  waitForConnections: true,
  connectionLimit: 2,
  queueLimit: 0
});

module.exports = pool;
