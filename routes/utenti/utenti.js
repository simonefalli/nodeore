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
        "SELECT * FROM utenti WHERE id = ?",
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
      connection.query("SELECT * FROM utenti", (err, rows) => {
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
      connection.query("INSERT INTO users SET ?", params, (err, result) => {
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
        "UPDATE users SET ? WHERE id = ?",
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
        "DELETE FROM users WHERE id = ?",
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