const express = require('express');
const pool = require('../../db')
const router = express.Router();
//const verifyToken = require('../../verifytoken');

//router.use(verifyToken);

  router.get("/", (req, res) => {
    pool.getConnection((err, connection) => {
      if (err) throw err;
      connection.query("SELECT id , utente , nome , cognome , idFornitore , idAzienda FROM utenti where abilitato = 1 and id != 1 and oraripa!=0  order by nome", (err, rows) => {
        connection.release();
        if (!err) {
          //const nuovoElemento = { id: 0, nome: 'Nessuno' , idFornitore : 1};
         // rows.unshift(nuovoElemento);
    
          res.send(rows);
        } else {
          console.log(err);
        }
      });
    });
  });
  

  module.exports = router;