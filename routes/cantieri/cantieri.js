const express = require('express');
const pool = require('../../db')
const router = express.Router();
const verifyToken = require('../../verifytoken');

router.use(verifyToken);



  // Fetch a single user
  router.get("/:id", (req, res) => {
    pool.getConnection((err, connection) => {
      if (err) throw err;
      connection.query(
        "SELECT * FROM cantieri WHERE id = ?",
        [req.params.id],
        (err, rows) => {
          connection.release();
          if (!err) {
            res.send(rows);
          } else {
            console.log(err);
          }
        }
      );
    });
  });


// Fetch all users
router.get("/", (req, res) => {
  
    pool.getConnection((err, connection) => {
      if (err) throw err;
      connection.query("SELECT * FROM cantieri", (err, rows) => {
        connection.release();
        if (!err) {
          res.send(rows);
        } else {
          console.log(err);
        }
      });
    });
  });
  

  
  // Add a new user
  router.post("/", (req, res) => {
    pool.getConnection((err, connection) => {
      if (err) throw err;
      const params = req.body;
      connection.query("INSERT INTO cantieri SET ?", params, (err, result) => {
        connection.release();
        if (!err) {
          res.send(result);
        } else {
          console.log(err);
        }
      });
    });
  });
  
  // Update a user
  router.put("/:id", (req, res) => {
    pool.getConnection((err, connection) => {
      if (err) throw err;
      const params = req.body;
      connection.query(
        "UPDATE cantieri SET ? WHERE id = ?",
        [params, req.params.id],
        (err, result) => {
          connection.release();
          if (!err) {
            res.send(result);
          } else {
            console.log(err);
          }
        }
      );
    });
  });
  
  // Delete a user
  router.delete("/:id" , (req, res) => {
    pool.getConnection((err, connection) => {
      if (err) throw err;
      connection.query(
        "DELETE FROM cantieri WHERE id = ?",
        [req.params.id],
        (err, result) => {
          connection.release();
          if (!err) {
            res.send(result);
          } else {
            console.log(err);
          }
        }
      );
    });
  });

  module.exports = router;