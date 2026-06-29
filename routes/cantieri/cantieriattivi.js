const express = require('express');
const pool = require('../../db')
const router = express.Router();
const verifyToken = require('../../verifytoken');

router.use(verifyToken);




  router.get("/", (req, res) => {
    pool.getConnection((err, connection) => {
      if (err) throw err;
      connection.query("SELECT * FROM cantieri WHERE libero = ''", (err, rows) => {
        connection.release();
        if (!err) {
          const nuovoElemento = {id:0, nome:'No' }
          rows.unshift(nuovoElemento);
          res.send(rows);
        } else {
          console.log(err);
        }
      });
    });
  });
  

  module.exports = router;