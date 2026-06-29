
const mysql = require('mysql');


// Database connection



const pool = mysql.createPool({
    host: "192.168.25.99",
    user: "ies",
    password: "Qazwsx12.",
    database: "ore",
  });


  module.exports = pool