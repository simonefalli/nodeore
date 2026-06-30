const express = require('express');
const jwt = require("jsonwebtoken");
const pool = require('../../db')
const router = express.Router();
const secretKey = process.env.JWT_SECRET || "ilTuoSegretoSuperSicuroIngegneriaeSistemi";

router.post("/", (req, res) => {
    utente = req.body.utente;
    password = req.body.password;
  
    pool.getConnection((err, connection) => {
      if (err) throw err;
      connection.query(
        "SELECT * FROM utenti WHERE utente = ? and password = ?",
        [utente, password],
        (err, result) => {
          if (result.length != "1" || err) {
            res.sendStatus(403);
          } else {
            const user = {
              id: result[0].id,
              utente: result[0].utente,
              nome: result[0].nome,
              cognome: result[0].cognome,
              admin: result[0].admin,
              livorno: result[0].livorno,
              calendarGroup: result[0].calendarGroup,
              abilitato: result[0].abilitato,
              idFornitore: result[0].idFornitore,
              idAzienda: result[0].idAzienda,
            };
            jwt.sign(
              { user: user },
              secretKey,
              { expiresIn: "12h" },
              (err, token) => {
                res.json({ token });
              }
            );
          }
  
          connection.release();
        }
      );
    });
  });

  module.exports = router;