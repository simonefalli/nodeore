const express = require("express");
const router = express.Router();
//const verifyToken = require('../../verifytoken');
const ADODB = require("node-adodb");
const dbAccess = require("../../dbaccess");
const connection = ADODB.open(dbAccess);

//router.use(verifyToken);

router.get("/:id", (req, res) => {
  let id = req.params.id;
  
  const query = `SELECT * FROM [Q-01-T-COMUNICAZIONIDAGESTIRE] WHERE  [Q-01-T-COMUNICAZIONIDAGESTIRE].[NUMEROCOMUNICAZIONE] = ${id};`;

  connection
    .query(query)
    .then((data) => {
      if (Object.keys(data).length === 0) {
        res.json({});
      } else {
         res.json(data);
    
      }
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: "Errore nell'esecuzione della query" });
    });
});

module.exports = router;
