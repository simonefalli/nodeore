const mysql = require('mysql');


// Database connection



const pool = mysql.createPool({
    host: process.env.DB_HOST || "192.168.1.200",
    user: process.env.DB_USER || "ies",
    password: process.env.DB_PASSWORD || process.env.DB_PASS || "Qazwsx12.",
    database: process.env.DB_NAME || "ore",
  });


  module.exports = pool