const express = require("express");
const router = express.Router();
const verifyToken = require("../../verifytoken");
const dbaccess = require("../../dbaccess");

router.use(verifyToken);

/**
 * GET /preventivi/trattative
 * Restituisce l'elenco delle trattative con relativi preventivi.
 * Parametri query:
 *   - azienda: 'ies' (default) o 'ciesse'
 *   - aperte: '1' per sole trattative aperte (TRATTATIVACHIUSA = 0), altrimenti tutte
 *   - idimpianto: per filtrare su un singolo impianto
 *   - limit: numero massimo di record (default 100)
 */
router.get("/trattative", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  const aperte = req.query.aperte === "1";
  const idimpianto = req.query.idimpianto ? parseInt(req.query.idimpianto, 10) : null;
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;

  let whereClauses = ["1=1"];
  if (aperte) {
    whereClauses.push("(T.TRATTATIVACHIUSA = 0 OR T.TRATTATIVACHIUSA IS NULL)");
  }
  if (idimpianto && !isNaN(idimpianto)) {
    whereClauses.push(`T.IDIMPIANTO = ${idimpianto}`);
  }

  const whereStr = whereClauses.join(" AND ");

  const sql = `
    SELECT TOP ${limit}
      T.IDTRATTATIVA,
      T.DATAINIZIOTRATTATIVA,
      T.IDIMPIANTO,
      T.TRATTATIVACHIUSA,
      T.ESITOTRATTATIVA,
      T.NOMETRATTATIVA,
      ASS.[NOTE] AS NOTETRATTATIVA,
      ASS.IDTIPOTRATTATIVA,
      TT.TIPOTRATTATIVA,
      P.IDPREVENTIVO,
      P.DATA AS DATAPREVENTIVO,
      P.[IMPORTO€] AS IMPORTO,
      I.NOME AS NOMEIMPIANTO,
      I.[NUMERO IMPIANTO] AS NUMEROIMPIANTO,
      C.[RAGIONE SOCIALE] AS CLIENTE,
      O.IDORDINE,
      O.DATAORDINE,
      O.[IMPORTOORDINE€] AS IMPORTOORDINE,
      O.ESEGUITO AS ORDINEESEGUITO
    FROM (((((([A-01-T-TRATTATIVE] AS T
    LEFT JOIN [A-02-T-PREVENTIVI] AS P ON T.IDTRATTATIVA = P.IDTRATTATIVA)
    LEFT JOIN [P-07-T-IMPIANTI] AS I ON T.IDIMPIANTO = I.[NUMERO IMPIANTO])
    LEFT JOIN [P-04-T-CLIENTI] AS C ON T.IDCLIENTE = C.[ID CAF])
    LEFT JOIN [B-05-T-ORDINI] AS O ON P.IDPREVENTIVO = O.IDPREVENTIVORIFERIMENTO)
    LEFT JOIN [T-01-T-ASSEGNAZIONI] AS ASS ON T.IDASSEGNAZIONE = ASS.IDASSEGNAZIONE)
    LEFT JOIN [T-02-T-TIPOTRATTATIVA] AS TT ON ASS.IDTIPOTRATTATIVA = TT.IDCAUSALETRATTATIVA)
    WHERE ${whereStr}
    ORDER BY T.DATAINIZIOTRATTATIVA DESC, P.IDPREVENTIVO DESC
  `;

  try {
    const results = await connection.query(sql);
    res.json(results);
  } catch (error) {
    console.error("[PREVENTIVI] Errore query trattative:", error.message || error);
    res.status(500).json({ error: error.message || "Errore esecuzione query" });
  }
});

/**
 * GET /preventivi/impianto/:id
 * Restituisce tutte le trattative e preventivi di un dato impianto
 */
router.get("/impianto/:id", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  const idimpianto = parseInt(req.params.id, 10);

  if (isNaN(idimpianto)) {
    return res.status(400).json({ error: "ID impianto non valido" });
  }

  const sql = `
    SELECT 
      T.IDTRATTATIVA,
      T.DATAINIZIOTRATTATIVA,
      T.IDIMPIANTO,
      T.TRATTATIVACHIUSA,
      T.ESITOTRATTATIVA,
      T.NOMETRATTATIVA,
      ASS.[NOTE] AS NOTETRATTATIVA,
      P.IDPREVENTIVO,
      P.DATA AS DATAPREVENTIVO,
      P.[IMPORTO€] AS IMPORTO,
      I.NOME AS NOMEIMPIANTO
    FROM ((([A-01-T-TRATTATIVE] AS T
    LEFT JOIN [A-02-T-PREVENTIVI] AS P ON T.IDTRATTATIVA = P.IDTRATTATIVA)
    LEFT JOIN [P-07-T-IMPIANTI] AS I ON T.IDIMPIANTO = I.[NUMERO IMPIANTO])
    LEFT JOIN [T-01-T-ASSEGNAZIONI] AS ASS ON T.IDASSEGNAZIONE = ASS.IDASSEGNAZIONE)
    WHERE T.IDIMPIANTO = ${idimpianto}
    ORDER BY T.DATAINIZIOTRATTATIVA DESC, P.IDPREVENTIVO DESC
  `;

  try {
    const results = await connection.query(sql);
    res.json(results);
  } catch (error) {
    console.error("[PREVENTIVI] Errore impianto:", error.message || error);
    res.status(500).json({ error: error.message || "Errore esecuzione query" });
  }
});

/**
 * GET /preventivi/:id
 * Dettaglio completo di un singolo preventivo e relativi articoli/materiali
 */
router.get("/:id", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  const idpreventivo = parseInt(req.params.id, 10);

  if (isNaN(idpreventivo)) {
    return res.status(400).json({ error: "ID preventivo non valido" });
  }

  try {
    // 1. Dati preventivo e trattativa
    const prevSql = `
      SELECT 
        P.IDPREVENTIVO,
        P.DATA AS DATAPREVENTIVO,
        P.[IMPORTO€] AS IMPORTO,
        P.IDTRATTATIVA,
        T.DATAINIZIOTRATTATIVA,
        T.TRATTATIVACHIUSA,
        T.ESITOTRATTATIVA,
        T.NOMETRATTATIVA,
        T.VIATRATTATIVA,
        T.IDIMPIANTO,
        ASS.[NOTE] AS NOTETRATTATIVA,
        I.NOME AS NOMEIMPIANTO,
        C.[RAGIONE SOCIALE] AS CLIENTE,
        O.IDORDINE,
        O.DATAORDINE,
        O.[IMPORTOORDINE€] AS IMPORTOORDINE,
        O.NOMEORDINE
      FROM ((((([A-02-T-PREVENTIVI] AS P
      LEFT JOIN [A-01-T-TRATTATIVE] AS T ON P.IDTRATTATIVA = T.IDTRATTATIVA)
      LEFT JOIN [P-07-T-IMPIANTI] AS I ON T.IDIMPIANTO = I.[NUMERO IMPIANTO])
      LEFT JOIN [P-04-T-CLIENTI] AS C ON T.IDCLIENTE = C.[ID CAF])
      LEFT JOIN [B-05-T-ORDINI] AS O ON P.IDPREVENTIVO = O.IDPREVENTIVORIFERIMENTO)
      LEFT JOIN [T-01-T-ASSEGNAZIONI] AS ASS ON T.IDASSEGNAZIONE = ASS.IDASSEGNAZIONE)
      WHERE P.IDPREVENTIVO = ${idpreventivo}
    `;

    const prevRows = await connection.query(prevSql);
    if (prevRows.length === 0) {
      return res.status(404).json({ error: "Preventivo non trovato" });
    }

    const preventivo = prevRows[0];

    // 2. Articoli / Materiali del preventivo
    const itemsSql = `
      SELECT NOMEARTICOLO, DESCRIZIONE, QUANTITA, PREZZOU
      FROM [A-03-T-DETTAGLIPREVENTIVI]
      WHERE IDPREVENTIVO = ${idpreventivo}
      ORDER BY IDDETTAGLIPREVENTIVO ASC
    `;

    const materiali = await connection.query(itemsSql);

    res.json({
      preventivo,
      materiali
    });
  } catch (error) {
    console.error("[PREVENTIVI] Errore dettaglio:", error.message || error);
    res.status(500).json({ error: error.message || "Errore esecuzione query" });
  }
});

module.exports = router;
