const express = require("express");
const router = express.Router();
const verifyToken = require("../../verifytoken");
const dbaccess = require("../../dbaccess");

router.use(verifyToken);

router.get("/", (req, res) => {
  const connection = dbaccess.getConnection(req);
  const id = req.params.id;

  const query = "SELECT * FROM [Q-01-T-COMUNICAZIONIDAGESTIRE]";

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

// Rotta per aggiungere una chiamata
router.post("/", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  const motivochiamata = req.body.data.motivochiamata; // Sostituisci con i nomi dei tuoi campi
  const assegnataa = req.body.data.assegnataa;
  const numeroImpianto = req.body.numeroImpianto;
  
  const query1 =
    "SELECT TOP 1 NUMEROCOMUNICAZIONE FROM [Q-02-T-COMUNICAZIONI] ORDER BY [NUMEROCOMUNICAZIONE] DESC";
  const data1 = await connection.query(query1);
  const num1 = data1.length > 0 ? data1[0].NUMEROCOMUNICAZIONE : 0;

  // Query per la seconda tabella
  const query2 =
    "SELECT TOP 1 NUMEROCOMUNICAZIONE FROM [Q-01-T-COMUNICAZIONIDAGESTIRE] ORDER BY [NUMEROCOMUNICAZIONE] DESC";
  const data2 = await connection.query(query2);
  const num2 = data2.length > 0 ? data2[0].NUMEROCOMUNICAZIONE : 0;

  // Determina il numero più alto
  const numeroComunicazioneNuovo = Math.max(num1, num2) + 1;

  const sqlimpianto = `SELECT * FROM [P-07-T-IMPIANTI] WHERE [NUMERO IMPIANTO] = ${numeroImpianto}`;
  await connection
    .query(sqlimpianto)
    .then((data) => {
      res.json(data);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: "Errore nell'esecuzione della query" });
    });

});

// Rotta per modificare una chiamata
router.put("/:id", (req, res) => {
  const connection = dbaccess.getConnection(req);
  const id = req.params.id;
  const { campo1, campo2, campo3 } = req.body; // Sostituisci con i nomi dei tuoi campi

  const query = `UPDATE [Q-01-T-COMUNICAZIONIDAGESTIRE] SET campo1 = '${campo1}', campo2 = '${campo2}', campo3 = '${campo3}' WHERE ID = ${id}`;

  connection
    .execute(query)
    .then(() => {
      res.json({ message: "Chiamata modificata con successo" });
    })
    .catch((err) => {
      console.error(err);
      res
        .status(500)
        .json({ error: "Errore nell'esecuzione della query di modifica" });
    });
});

// Get chimate impianto
router.get("/:id", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  try {
    const id = req.params.id;

    const query1 = `
      SELECT 
        [Q-02-T-COMUNICAZIONI].*, 
        [D-13-T-FORNITORI].[RAGIONE_SO] AS NOME 
      FROM 
        [Q-02-T-COMUNICAZIONI]
      LEFT JOIN 
        [D-13-T-FORNITORI] 
      ON 
        [Q-02-T-COMUNICAZIONI].[TECNICORIPARATORE] = [D-13-T-FORNITORI].[ID FORNITORE]
      WHERE 
        [Q-02-T-COMUNICAZIONI].[NUMEROIMPIANTO] = ${id}
      ORDER BY 
        [Q-02-T-COMUNICAZIONI].[NUMEROCOMUNICAZIONE] DESC;
    `;

    const query2 = `
      SELECT * 
      FROM [Q-01-T-COMUNICAZIONIDAGESTIRE] 
      WHERE [NUMEROIMPIANTO] = ${id} 
      ORDER BY [NUMEROCOMUNICAZIONE] DESC
    `;

    const result1 = await connection.query(query1);
    const result2 = await connection.query(query2);

    res.json({
      comunicazioni: result1,
      comunicazioniDaGestire: result2,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore nell'esecuzione delle query" });
  }
});


// DESCRIZIONE CHIAMATA
router.get("/descrizionechiamata/:id", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  try {
    const id = req.params.id;

    const query1 = `
      SELECT 
        [NUMEROCOMUNICAZIONE],
        [DESCRIZIONEINTERVENTO]
      FROM 
        [Q-02-T-COMUNICAZIONI]
      WHERE 
        [NUMEROCOMUNICAZIONE] = ${id};
    `;

    const result1 = await connection.query(query1);

    res.json({
      descrizione: result1,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore nell'esecuzione delle query" });
  }
});


// Rotta Bulk per velocizzare PHP
router.get("/descrizioni-bulk/:ids", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  try {
    const ids = req.params.ids; // Esempio: "101,102,103"
    // Validazione basica per evitare SQL Injection su Access
    if(!/^[0-9,]+$/.test(ids)) return res.status(400).json({error: "ID non validi"});

    const query = `
      SELECT [NUMEROCOMUNICAZIONE], [DESCRIZIONEINTERVENTO]
      FROM [Q-02-T-COMUNICAZIONI]
      WHERE [NUMEROCOMUNICAZIONE] IN (${ids})
    `;

    const result = await connection.query(query);
    
    // Trasformiamo l'array in un oggetto { id: descrizione } per accesso rapido
    const mappa = {};
    result.forEach(item => {
      mappa[item.NUMEROCOMUNICAZIONE] = item.DESCRIZIONEINTERVENTO;
    });

    res.json(mappa);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
