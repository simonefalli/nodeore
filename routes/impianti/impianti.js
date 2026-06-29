const express = require("express");
const router = express.Router();
const verifyToken = require("../../verifytoken");
const ADODB = require("node-adodb");
const dbAccess = require("../../dbaccess");
const connection = ADODB.open(dbAccess);

router.use(verifyToken);

router.get("/ordini", (req, res) => {
  const query = "SELECT * FROM [B-05-T-ORDINI] WHERE 1=1";

  connection
    .query(query)
    .then((data) => {
      res.json(data);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: "Errore nell'esecuzione della query" });
    });
});

// GET IMPIANTO SINGOLO

router.get("/:id", (req, res) => {
  const id = req.params.id;

  const query =
    "SELECT [P-07-T-IMPIANTI].[NUMERO IMPIANTO], [P-07-T-IMPIANTI].[NOME],[P-07-T-IMPIANTI].[NOTE],  [P-07-T-IMPIANTI].[NUMEROTELEFONO],  [P-04-T-CLIENTI].[RAGIONE SOCIALE], [P-07-T-IMPIANTI].[LUOGO IMPIANTO], [X-05-T-CAP].[LOCALITA], [X-05-T-CAP].[PROVINCIA] ,[P-09-T-SISTEMA].[SISTEMA],[X-02-T-TIPOIMPIANTO].[TIPO IMPIANTO] , [P-07-T-IMPIANTI].[CIFRAMENSILE€] ,   [P-04-T-CLIENTI].[PARTITA IVA] ,  [P-04-T-CLIENTI].[CODICE FISCALE] FROM (((([P-07-T-IMPIANTI] LEFT JOIN [P-04-T-CLIENTI] ON [P-04-T-CLIENTI].[ID CAF] = [P-07-T-IMPIANTI].[NUMERO CAF]) LEFT JOIN [X-05-T-CAP] ON [X-05-T-CAP].[IDCAP] = [P-07-T-IMPIANTI].[CAP IMPIANTO])LEFT JOIN [P-09-T-SISTEMA] ON [P-09-T-SISTEMA].[IDSISTEMA] = [P-07-T-IMPIANTI].[SISTEMA] ) LEFT JOIN [X-02-T-TIPOIMPIANTO] ON [X-02-T-TIPOIMPIANTO].[ID TABELLA]=[P-07-T-IMPIANTI].[TIPO CONTRATTO]) WHERE  [P-07-T-IMPIANTI].[NUMERO IMPIANTO] = " +
    id +
    "";

  connection
    .query(query)
    .then((data) => {
      res.json(data[0]); // Restituisce solo il primo risultato (se presente)
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: "Errore nell'esecuzione della query" });
    });
});

// RICERCA IMPIANTO

router.post("/", (req, res) => {
  const params = req.body.data;

  const parolaRicerca = params.ricerca;
  const arrayRicerca = parolaRicerca.split(" ");

  let query = `
    SELECT [P-07-T-IMPIANTI].[NUMERO IMPIANTO], 
    [P-07-T-IMPIANTI].[NOME],
    [P-07-T-IMPIANTI].[NOTE],  
    [P-07-T-IMPIANTI].[NUMEROTELEFONO],  
    [P-04-T-CLIENTI].[RAGIONE SOCIALE], 
    [P-07-T-IMPIANTI].[LUOGO IMPIANTO], 
    [X-05-T-CAP].[LOCALITA], 
    [X-05-T-CAP].[PROVINCIA],
    [P-09-T-SISTEMA].[SISTEMA],
    [X-02-T-TIPOIMPIANTO].[TIPO IMPIANTO], 
    [P-07-T-IMPIANTI].[CIFRAMENSILE€],
    [P-04-T-CLIENTI].[PARTITA IVA],
    [P-04-T-CLIENTI].[CODICE FISCALE] 
    FROM (((([P-07-T-IMPIANTI] LEFT JOIN [P-04-T-CLIENTI] ON [P-04-T-CLIENTI].[ID CAF] = [P-07-T-IMPIANTI].[NUMERO CAF]) LEFT JOIN [X-05-T-CAP] ON [X-05-T-CAP].[IDCAP] = [P-07-T-IMPIANTI].[CAP IMPIANTO])LEFT JOIN [P-09-T-SISTEMA] ON [P-09-T-SISTEMA].[IDSISTEMA] = [P-07-T-IMPIANTI].[SISTEMA] ) LEFT JOIN [X-02-T-TIPOIMPIANTO] ON [X-02-T-TIPOIMPIANTO].[ID TABELLA]=[P-07-T-IMPIANTI].[TIPO CONTRATTO])
    WHERE  ([P-07-T-IMPIANTI].[NOME]  LIKE '%${arrayRicerca[0]}%' OR [P-04-T-CLIENTI].[RAGIONE SOCIALE] LIKE '%${arrayRicerca[0]}%' OR [P-07-T-IMPIANTI].[NUMERO IMPIANTO] LIKE '%${arrayRicerca[0]}%' OR [P-07-T-IMPIANTI].[LUOGO IMPIANTO] LIKE '%${arrayRicerca[0]}%') `;

  for (let i = 1; i < arrayRicerca.length; i++) {
    query += ` AND ([P-07-T-IMPIANTI].[NOME]  LIKE '%${arrayRicerca[i]}%' OR [P-04-T-CLIENTI].[RAGIONE SOCIALE] LIKE '%${arrayRicerca[i]}%' OR [P-07-T-IMPIANTI].[NUMERO IMPIANTO] LIKE '%${arrayRicerca[i]}%' OR [P-07-T-IMPIANTI].[LUOGO IMPIANTO] LIKE '%${arrayRicerca[i]}%')`;
  }
  query += ` AND [X-02-T-TIPOIMPIANTO].[TIPO IMPIANTO]  <> 'NIENTE'`;

  connection
    .query(query)
    .then((data) => {
      res.json(data);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: "Errore nell'esecuzione della query" });
    });
  //res.sendStatus(200);
});
router.get("/:id", (req, res) => {
  const id = req.params.id;

  const query =
    "SELECT [P-07-T-IMPIANTI].[NUMERO IMPIANTO], [P-07-T-IMPIANTI].[NOME],[P-07-T-IMPIANTI].[NOTE],  [P-07-T-IMPIANTI].[NUMEROTELEFONO],  [P-04-T-CLIENTI].[RAGIONE SOCIALE], [P-07-T-IMPIANTI].[LUOGO IMPIANTO], [X-05-T-CAP].[LOCALITA], [X-05-T-CAP].[PROVINCIA] ,[P-09-T-SISTEMA].[SISTEMA],[X-02-T-TIPOIMPIANTO].[TIPO IMPIANTO] , [P-07-T-IMPIANTI].[CIFRAMENSILE€] ,   [P-04-T-CLIENTI].[PARTITA IVA] ,  [P-04-T-CLIENTI].[CODICE FISCALE] FROM (((([P-07-T-IMPIANTI] LEFT JOIN [P-04-T-CLIENTI] ON [P-04-T-CLIENTI].[ID CAF] = [P-07-T-IMPIANTI].[NUMERO CAF]) LEFT JOIN [X-05-T-CAP] ON [X-05-T-CAP].[IDCAP] = [P-07-T-IMPIANTI].[CAP IMPIANTO])LEFT JOIN [P-09-T-SISTEMA] ON [P-09-T-SISTEMA].[IDSISTEMA] = [P-07-T-IMPIANTI].[SISTEMA] ) LEFT JOIN [X-02-T-TIPOIMPIANTO] ON [X-02-T-TIPOIMPIANTO].[ID TABELLA]=[P-07-T-IMPIANTI].[TIPO CONTRATTO]) WHERE  [P-07-T-IMPIANTI].[NUMERO IMPIANTO] = " +
    id +
    "";

  connection
    .query(query)
    .then((data) => {
      res.json(data[0]); // Restituisce solo il primo risultato (se presente)
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: "Errore nell'esecuzione della query" });
    });
});

// RICERCA IMPIANTO

router.post("/", (req, res) => {
  const params = req.body.data;

  const parolaRicerca = params.ricerca;
  const arrayRicerca = parolaRicerca.split(" ");

  let query = `
    SELECT [P-07-T-IMPIANTI].[NUMERO IMPIANTO], 
    [P-07-T-IMPIANTI].[NOME],
    [P-07-T-IMPIANTI].[NOTE],  
    [P-07-T-IMPIANTI].[NUMEROTELEFONO],  
    [P-04-T-CLIENTI].[RAGIONE SOCIALE], 
    [P-07-T-IMPIANTI].[LUOGO IMPIANTO], 
    [X-05-T-CAP].[LOCALITA], 
    [X-05-T-CAP].[PROVINCIA],
    [P-09-T-SISTEMA].[SISTEMA],
    [X-02-T-TIPOIMPIANTO].[TIPO IMPIANTO], 
    [P-07-T-IMPIANTI].[CIFRAMENSILE€],
    [P-04-T-CLIENTI].[PARTITA IVA],
    [P-04-T-CLIENTI].[CODICE FISCALE] 
    FROM (((([P-07-T-IMPIANTI] LEFT JOIN [P-04-T-CLIENTI] ON [P-04-T-CLIENTI].[ID CAF] = [P-07-T-IMPIANTI].[NUMERO CAF]) LEFT JOIN [X-05-T-CAP] ON [X-05-T-CAP].[IDCAP] = [P-07-T-IMPIANTI].[CAP IMPIANTO])LEFT JOIN [P-09-T-SISTEMA] ON [P-09-T-SISTEMA].[IDSISTEMA] = [P-07-T-IMPIANTI].[SISTEMA] ) LEFT JOIN [X-02-T-TIPOIMPIANTO] ON [X-02-T-TIPOIMPIANTO].[ID TABELLA]=[P-07-T-IMPIANTI].[TIPO CONTRATTO])
    WHERE  ([P-07-T-IMPIANTI].[NOME]  LIKE '%${arrayRicerca[0]}%' OR [P-04-T-CLIENTI].[RAGIONE SOCIALE] LIKE '%${arrayRicerca[0]}%' OR [P-07-T-IMPIANTI].[NUMERO IMPIANTO] LIKE '%${arrayRicerca[0]}%' OR [P-07-T-IMPIANTI].[LUOGO IMPIANTO] LIKE '%${arrayRicerca[0]}%') `;

  for (let i = 1; i < arrayRicerca.length; i++) {
    query += ` AND ([P-07-T-IMPIANTI].[NOME]  LIKE '%${arrayRicerca[i]}%' OR [P-04-T-CLIENTI].[RAGIONE SOCIALE] LIKE '%${arrayRicerca[i]}%' OR [P-07-T-IMPIANTI].[NUMERO IMPIANTO] LIKE '%${arrayRicerca[i]}%' OR [P-07-T-IMPIANTI].[LUOGO IMPIANTO] LIKE '%${arrayRicerca[i]}%')`;
  }
  query += ` AND [X-02-T-TIPOIMPIANTO].[TIPO IMPIANTO]  <> 'NIENTE'`;

  connection
    .query(query)
    .then((data) => {
      res.json(data);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: "Errore nell'esecuzione della query" });
    });
  //res.sendStatus(200);
});

router.get("/ordiniaperti/:id", (req, res) => {
  const id = req.params.id;
  // Aggiungiamo i controlli per ESEGUITO e ANNULLATOIL direttamente in SQL
  const query = `
             SELECT IDORDINE, [ID IMPIANTO], ESEGUITO, ANNULLATOIL 
             FROM [B-05-T-ORDINI] 
             WHERE [ID IMPIANTO] = ${id}
               AND (ESEGUITO IS NULL OR ESEGUITO <= #1970-01-01#)
               AND (ANNULLATOIL IS NULL OR ANNULLATOIL <= #1970-01-01#)
        `;
  connection
    .query(query)
    .then((data) => {
      res.json(data);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: "Errore nell'esecuzione della query" });
    });
});

module.exports = router;
