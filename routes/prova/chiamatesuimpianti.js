const express = require('express');
const router = express.Router();
const verifyToken = require('../../verifytoken');
const ADODB = require('node-adodb');
const dbAccess = require('../../dbaccess');
const connection = ADODB.open(dbAccess);


//router.use(verifyToken);

router.get('/:impianto', (req, res) => {
    impianto = req.params.impianto;
    //impianto = impianto.replace(/_/g, "\\_").replace(/%/g, "\\%");
    impianto = impianto.toLowerCase();
    
    const query = `SELECT * FROM [Q-01-T-COMUNICAZIONIDAGESTIRE] WHERE  [Q-01-T-COMUNICAZIONIDAGESTIRE].[NUMEROIMPIANTO] = ${impianto};`;
   
   // [Q-01-T-COMUNICAZIONIDAGESTIRE].[NUMEROCOMUNICAZIONE], [Q-01-T-COMUNICAZIONIDAGESTIRE].[NOMECLIENTE]
    //const query = `SELECT [Q-01-T-COMUNICAZIONIDAGESTIRE].[NUMEROIMPIANTO] , [Q-01-T-COMUNICAZIONIDAGESTIRE].[NUMEROCOMUNICAZIONE],  [Q-01-T-COMUNICAZIONIDAGESTIRE].[NOMECLIENTE] , [Q-01-T-COMUNICAZIONIDAGESTIRE].[MOTIVOCHIAMATA]  FROM [Q-01-T-COMUNICAZIONIDAGESTIRE] WHERE LCASE ([Q-01-T-COMUNICAZIONIDAGESTIRE].[NOMECLIENTE]) LIKE '%${impianto}%';`;
  
    connection
      .query(query)
      .then(data => {
        if (Object.keys(data).length === 0){
          
          
          res.json({});
      

          }
          else {
            // Manutenzione programmata x ENGIE
            //
            
            res.json(data);
            
          }
      })
      .catch(err => {
        console.error(err);
        res.status(500).json({ error: 'Errore nell\'esecuzione della query' });
      });
  });


  
  
module.exports = router;