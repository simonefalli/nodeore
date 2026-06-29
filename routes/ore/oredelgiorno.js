const express = require("express");
const pool = require("../../db");
const router = express.Router();
const verifyToken = require("../../verifytoken");
const moment = require("moment-timezone");

router.use(verifyToken);

router.post("/", (req, res) => {
  data = req.body.data;
  idUtente = req.body.idUtente;
  
  pool.getConnection((err, connection) => {
    if (err) throw err;

    connection.query(
      "SELECT * FROM `ore` where da like ?  and idutente = ? order by da ",
      [`%${data}%`, idUtente],
      (err, result) => {
        if (err) {
          console.log(err);
        } else {
          res.send(result);
        }

        connection.release();
      }
    );
  });
});

module.exports = router;
