const mysql = require('mysql');

// Database connection parameters
const host = process.env.DB_HOST || "127.0.0.1";
const user = process.env.DB_USER || "root";
const database = process.env.DB_NAME || "ore";

console.log(`[MySQL Connection Config] Host: ${host}, User: ${user}, Database: ${database}`);

const pool = mysql.createPool({
    host: host,
    user: user,
    password: process.env.DB_PASSWORD || process.env.DB_PASS || "Qazwsx12.",
    database: database,
});

module.exports = pool;