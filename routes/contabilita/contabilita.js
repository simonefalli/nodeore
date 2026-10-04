const express = require("express");
const router = express.Router();
const verifyToken = require("../../verifytoken");
const dbaccess = require("../../dbaccess");

router.use(verifyToken);

/**
 * GET /contabilita/aziende
 * Restituisce l'elenco completo di tutte le aziende del gruppo configurate in memoria
 */
router.get("/aziende", async (req, res) => {
  try {
    const aziende = dbaccess.getAllAziendeConfig();
    res.json(aziende);
  } catch (err) {
    res.status(500).json({ error: err.message || "Errore recupero configurazione aziende" });
  }
});

/**
 * GET /contabilita/clienti
 * Ricerca clienti per ragione sociale o ID CAF
 * Query: ?q=testo&azienda=ies|ciesse
 */
router.get("/clienti", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  const q = (req.query.q || "").trim();

  if (!q) {
    return res.json([]);
  }

  // Sanitizzazione semplice per query Access
  const cleanQ = q.replace(/'/g, "''");
  const isNum = /^\d+$/.test(cleanQ);

  const sql = `
    SELECT DISTINCT TOP 30
      C.[ID CAF] AS IDCAF,
      C.[RAGIONE SOCIALE] AS RAGIONESOCIALE,
      C.[PARTITA IVA] AS PARTITAIVA,
      C.[CODICE FISCALE] AS CODICEFISCALE,
      C.[LOCALITA' LEGALE] AS LOCALITA,
      C.TELEFONO
    FROM [P-04-T-CLIENTI] AS C
    LEFT JOIN [P-07-T-IMPIANTI] AS I ON C.[ID CAF] = I.[NUMERO CAF]
    WHERE C.[ID CAF] > 0 AND (
      C.[RAGIONE SOCIALE] LIKE '%${cleanQ}%'
      OR I.[NOME] LIKE '%${cleanQ}%'
      ${isNum ? `OR C.[ID CAF] = ${cleanQ}` : ''}
    )
    ORDER BY C.[RAGIONE SOCIALE] ASC
  `;

  try {
    const clients = await connection.query(sql);
    res.json(clients);
  } catch (err) {
    console.error("[CONTABILITA] Errore ricerca clienti:", err.message || err);
    res.status(500).json({ error: err.message || "Errore esecuzione ricerca" });
  }
});

/**
 * GET /contabilita/impianti
 * Ricerca impianti per nome impianto, numero impianto o ragione sociale cliente
 * Query: ?q=testo&azienda=ies|ciesse
 */
router.get("/impianti", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  const q = (req.query.q || "").trim();

  if (!q) {
    return res.json([]);
  }

  const cleanQ = q.replace(/'/g, "''");
  const isNum = /^\d+$/.test(cleanQ);

  const sql = `
    SELECT TOP 30
      I.[NUMERO IMPIANTO] AS IDIMPIANTO,
      I.[NOME] AS NOMEIMPIANTO,
      I.[NUMERO CAF] AS IDCAF,
      C.[RAGIONE SOCIALE] AS RAGIONESOCIALE,
      I.[LUOGO IMPIANTO] AS INDIRIZZO,
      I.[NUMEROTELEFONO] AS TELEFONO
    FROM [P-07-T-IMPIANTI] AS I
    LEFT JOIN [P-04-T-CLIENTI] AS C ON I.[NUMERO CAF] = C.[ID CAF]
    WHERE I.[NUMERO IMPIANTO] > 0 AND (
      I.[NOME] LIKE '%${cleanQ}%'
      OR C.[RAGIONE SOCIALE] LIKE '%${cleanQ}%'
      ${isNum ? `OR I.[NUMERO IMPIANTO] = ${cleanQ}` : ''}
    )
    ORDER BY I.[NOME] ASC
  `;

  try {
    const plants = await connection.query(sql);
    res.json(plants);
  } catch (err) {
    console.error("[CONTABILITA] Errore ricerca impianti:", err.message || err);
    res.status(500).json({ error: err.message || "Errore esecuzione ricerca impianti" });
  }
});

/**
 * GET /contabilita/situazione/:idcaf
 * Estrae la situazione contabile completa per il cliente
 * Query opzionale: ?data=YYYY-MM-DD (Data situazione di riferimento)
 */
router.get("/situazione/:idcaf", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  const idCaf = parseInt(req.params.idcaf, 10);

  if (isNaN(idCaf) || idCaf <= 0) {
    return res.status(400).json({ error: "ID CAF non valido" });
  }

  // Data situazione: default oggi
  const dataRif = req.query.data || new Date().toISOString().substring(0, 10);

  try {
    // 1. Dati anagrafici cliente
    const sqlCliente = `
      SELECT 
        [ID CAF] AS IDCAF,
        [RAGIONE SOCIALE] AS RAGIONESOCIALE,
        [PARTITA IVA] AS PARTITAIVA,
        [CODICE FISCALE] AS CODICEFISCALE,
        [LUOGO LEGALE] AS LUOGOLEGALE,
        [LOCALITA' LEGALE] AS LOCALITA,
        [CAP LEGALE] AS CAP,
        TELEFONO,
        [SALDOINIZIALE€] AS SALDOINIZIALE,
        [ARROTONDAMENTO€] AS ARROTONDAMENTO,
        [ARROTONDAMENTOPERSPESELEGALI€] AS ARROTONDAMENTOSPESELEGALI
      FROM [P-04-T-CLIENTI]
      WHERE [ID CAF] = ${idCaf}
    `;
    const clientRows = await connection.query(sqlCliente);
    const cliente = clientRows.length > 0 ? clientRows[0] : null;

    if (!cliente) {
      return res.status(404).json({ error: "Cliente non trovato" });
    }

    // 2. FATTURE (con fallback se esiste tabella pre-2010)
    let sqlFatture = `
      SELECT IDPROGRESSIVO, DATAFATTURA, NUMEROFATTURA, TIPODOCUMENTO, [TOTALEAPAGARE€] AS TOTALE, PAGATA, NUMEROIMPIANTO
      FROM [F-01-T-TUTTEFATTURE]
      WHERE NUMEROCAF = ${idCaf}
      UNION ALL
      SELECT IDPROGRESSIVO, DATAFATTURA, NUMEROFATTURA, TIPODOCUMENTO, [TOTALEAPAGARE€] AS TOTALE, PAGATA, NUMEROIMPIANTO
      FROM [F-01-T-TUTTEFATTUREPRIMA2010]
      WHERE NUMEROCAF = ${idCaf}
      ORDER BY DATAFATTURA DESC, IDPROGRESSIVO DESC
    `;

    let fatture = [];
    try {
      fatture = await connection.query(sqlFatture);
    } catch (eF) {
      // Se F-01-T-TUTTEFATTUREPRIMA2010 non esiste (es. in Ciesse), query solo sulla tabella principale
      const sqlFattureSingle = `
        SELECT IDPROGRESSIVO, DATAFATTURA, NUMEROFATTURA, TIPODOCUMENTO, [TOTALEAPAGARE€] AS TOTALE, PAGATA, NUMEROIMPIANTO
        FROM [F-01-T-TUTTEFATTURE]
        WHERE NUMEROCAF = ${idCaf}
        ORDER BY DATAFATTURA DESC, IDPROGRESSIVO DESC
      `;
      fatture = await connection.query(sqlFattureSingle);
    }

    // 3. MOVIMENTI BANCA
    const sqlBanca = `
      SELECT 
        D.IDFATTURA,
        D.IDPAGAMENTO,
        D.[ENTRATE€] AS ENTRATE,
        D.[USCITE€] AS USCITE,
        M.DATAVALUTA,
        M.DESCRIZIONEMOVIMENTO,
        M.IDMOVIMENTO,
        M.IDMOVIMENTOGENERALE,
        I.NUMEROFATTURA,
        I.[5MODOPAGAMENTO] AS MODOPAGAMENTO,
        C.DESCRIZIONECONTO
      FROM ((([I-02-T-TUTTIDETTAGLIMOVIMENTIBANCA] AS D
      INNER JOIN [I-09-T-TUTTIMOVIMENTIBANCA] AS M ON D.IDMOVIMENTOGENERALE = M.IDMOVIMENTOGENERALE)
      LEFT JOIN [G-01-T-INCASSI] AS I ON D.IDPAGAMENTO = I.[ID PAGAMENTO])
      LEFT JOIN [I-20-T-IDCONTO] AS C ON M.IDCONTO = C.IDCONTO)
      WHERE D.IDCLIENTE = ${idCaf}
      ORDER BY M.DATAVALUTA DESC, M.IDMOVIMENTO DESC
    `;
    const banca = await connection.query(sqlBanca);

    // 4. INCASSI APERTI (Scaduti + Futuri)
    const sqlIncassi = `
      SELECT 
        IDPROGRESSIVOFATTURA,
        [ID PAGAMENTO] AS IDPAGAMENTO,
        DATAPAGAMENTO,
        NUMEROFATTURA,
        [TOTALE€] AS TOTALE,
        [5MODOPAGAMENTO] AS MODOPAGAMENTO,
        INSOLUTO,
        INCASSATA,
        IDPAGAMENTOGENERALE
      FROM [G-01-T-INCASSI]
      WHERE NUMEROCAF = ${idCaf} AND (INCASSATA = '0' OR INCASSATA IS NULL OR INCASSATA = '')
      ORDER BY DATAPAGAMENTO ASC
    `;
    const incassiAperti = await connection.query(sqlIncassi);

    // 5. Crediti a perdita e sopravvenienze attive
    let creditiPerdita = [];
    try {
      creditiPerdita = await connection.query(`
        SELECT IDCREDITOSOFFERENZA, ANNOPORTATOAPERDITA, IMPORTOCREDITOSOFFERENZA, NUMEROIMPIANTODEBITORE, IDPAGAMENTOCREDITO
        FROM [G-21-T-CREDITISOFFERENZAPORTATIAPERDITA]
        WHERE IDCAFDEBITORE = ${idCaf}
        ORDER BY ANNOPORTATOAPERDITA DESC, IDCREDITOSOFFERENZA DESC
      `);
    } catch (eCP) {
      creditiPerdita = [];
    }

    let sopravvenienze = [];
    try {
      sopravvenienze = await connection.query(`
        SELECT IDSOPRAVVENIENZAATTIVA, ANNOPORTATOASOPRAVVENIENZA, IMPORTOCREDITOSOPRAVVENIENZA, NUMEROIMPIANTODEBITOREATTIVO, IDPAGAMENTOCREDITOSOPRAVVENIENZA
        FROM [G-22-T-SOPRAVVENIENZEATTIVE]
        WHERE IDCAFDEBITOREATTIVO = ${idCaf}
        ORDER BY ANNOPORTATOASOPRAVVENIENZA DESC, IDSOPRAVVENIENZAATTIVA DESC
      `);
    } catch (eSop) {
      sopravvenienze = [];
    }

    // Calcoli totali e partizionamento Scaduti vs Futuri
    let totFattureLordo = 0;
    let totNoteCredito = 0;
    let conteggioFatturePositive = 0;
    let conteggioNoteCredito = 0;

    fatture.forEach((f) => {
      const imp = Number(f.TOTALE) || 0;
      const isNC = parseInt(f.TIPODOCUMENTO, 10) === 2;
      f.isNotaCredito = isNC;
      f.tipoDocumentoLabel = isNC ? "NC" : "FT";

      if (isNC) {
        totNoteCredito += imp;
        conteggioNoteCredito++;
      } else {
        totFattureLordo += imp;
        conteggioFatturePositive++;
      }
    });

    const totFattureNetto = totFattureLordo - totNoteCredito;

    const totEntrateBanca = banca.reduce((acc, b) => acc + (Number(b.ENTRATE) || 0), 0);
    const totUsciteBanca = banca.reduce((acc, b) => acc + (Number(b.USCITE) || 0), 0);
    const nettoBanca = totEntrateBanca - totUsciteBanca;

    const scaduti = [];
    const futuri = [];
    let totScaduti = 0;
    let totFuturi = 0;

    incassiAperti.forEach((inc) => {
      const dStr = inc.DATAPAGAMENTO ? inc.DATAPAGAMENTO.substring(0, 10) : "";
      const imp = Number(inc.TOTALE) || 0;
      if (dStr && dStr <= dataRif) {
        scaduti.push(inc);
        totScaduti += imp;
      } else {
        futuri.push(inc);
        totFuturi += imp;
      }
    });

    const differenzaFattureBanca = totFattureNetto - nettoBanca;
    const totCreditiPerdita = creditiPerdita.reduce((acc, c) => acc + (Number(c.IMPORTOCREDITOSOFFERENZA) || 0), 0);
    const totSopravvenienze = sopravvenienze.reduce((acc, s) => acc + (Number(s.IMPORTOCREDITOSOPRAVVENIENZA) || 0), 0);

    // DARE EFFETTIVO (Soldi da Avere): Differenza Fatture-Banca stornando i Crediti a Perdita e sommando le Sopravvenienze
    const dareEffettivo = differenzaFattureBanca - totCreditiPerdita + totSopravvenienze;

    res.json({
      cliente,
      dataRiferimento: dataRif,
      riepilogo: {
        totaleFatture: totFattureNetto,
        totaleFattureLordo: totFattureLordo,
        totaleNoteCredito: totNoteCredito,
        totaleFattureNetto: totFattureNetto,
        conteggioFatture: fatture.length,
        conteggioFatturePositive: conteggioFatturePositive,
        conteggioNoteCredito: conteggioNoteCredito,
        totaleBanca: nettoBanca,
        conteggioBanca: banca.length,
        differenzaFattureBanca,
        totaleCreditiPerdita: totCreditiPerdita,
        conteggioCreditiPerdita: creditiPerdita.length,
        totaleSopravvenienze: totSopravvenienze,
        conteggioSopravvenienze: sopravvenienze.length,
        dareEffettivo,
        totaleScaduti: totScaduti,
        conteggioScaduti: scaduti.length,
        totaleFuturi: totFuturi,
        conteggioFuturi: futuri.length,
        avereEffettivo: dareEffettivo,
        saldoIniziale: Number(cliente.SALDOINIZIALE) || 0,
        arrotondamento: Number(cliente.ARROTONDAMENTO) || 0,
        arrotondamentoSpeseLegali: Number(cliente.ARROTONDAMENTOSPESELEGALI) || 0
      },
      fatture,
      banca,
      scaduti,
      futuri,
      creditiPerdita,
      sopravvenienze
    });
  } catch (err) {
    console.error("[CONTABILITA] Errore estrazione situazione:", err.message || err);
    res.status(500).json({ error: err.message || "Errore estrazione dati contabili" });
  }
});

/**
 * GET /contabilita/situazione-impianto/:idImpianto
 * Estrae la situazione contabile completa per un singolo impianto (maschera g-31)
 * Query opzionale: ?data=YYYY-MM-DD (Data situazione di riferimento)
 */
router.get("/situazione-impianto/:idImpianto", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  const idImpianto = parseInt(req.params.idImpianto, 10);

  if (isNaN(idImpianto) || idImpianto <= 0) {
    return res.status(400).json({ error: "ID Impianto non valido o assente" });
  }

  const dataRif = req.query.data ? req.query.data.substring(0, 10) : new Date().toISOString().substring(0, 10);

  try {
    // 1. Dati Impianto e Cliente proprietario
    const sqlImp = `
      SELECT 
        I.[NUMERO IMPIANTO] AS IDIMPIANTO,
        I.[NOME] AS NOMEIMPIANTO,
        I.[NUMERO CAF] AS IDCAF,
        I.[LUOGO IMPIANTO] AS INDIRIZZO,
        I.[CIVICO],
        I.[LOCALITA' IMPIANTO] AS LOCALITA,
        I.[CAP IMPIANTO] AS CAP,
        I.[NUMEROTELEFONO] AS TELEFONO,
        C.[RAGIONE SOCIALE] AS RAGIONESOCIALE,
        C.[PARTITA IVA] AS PARTITAIVA,
        C.[CODICE FISCALE] AS CODICEFISCALE,
        C.[LUOGO LEGALE] AS LUOGOLEGALE,
        C.[SALDOINIZIALE€] AS SALDOINIZIALE,
        C.[ARROTONDAMENTO€] AS ARROTONDAMENTO,
        C.[ARROTONDAMENTOPERSPESELEGALI€] AS ARROTONDAMENTOSPESELEGALI
      FROM [P-07-T-IMPIANTI] AS I
      LEFT JOIN [P-04-T-CLIENTI] AS C ON I.[NUMERO CAF] = C.[ID CAF]
      WHERE I.[NUMERO IMPIANTO] = ${idImpianto}
    `;
    const impRows = await connection.query(sqlImp);
    if (impRows.length === 0) {
      return res.status(404).json({ error: `Impianto #${idImpianto} non trovato` });
    }
    const impianto = impRows[0];

    // 2. FATTURE DELL'IMPIANTO (con fallback se esiste tabella pre-2010)
    let sqlFatture = `
      SELECT IDPROGRESSIVO, DATAFATTURA, NUMEROFATTURA, TIPODOCUMENTO, [TOTALEAPAGARE€] AS TOTALE, PAGATA, NUMEROIMPIANTO
      FROM [F-01-T-TUTTEFATTURE]
      WHERE NUMEROIMPIANTO = ${idImpianto}
      UNION ALL
      SELECT IDPROGRESSIVO, DATAFATTURA, NUMEROFATTURA, TIPODOCUMENTO, [TOTALEAPAGARE€] AS TOTALE, PAGATA, NUMEROIMPIANTO
      FROM [F-01-T-TUTTEFATTUREPRIMA2010]
      WHERE NUMEROIMPIANTO = ${idImpianto}
      ORDER BY DATAFATTURA ASC, NUMEROFATTURA ASC
    `;

    let fatture = [];
    try {
      fatture = await connection.query(sqlFatture);
    } catch (eUnion) {
      const sqlFattureSingle = `
        SELECT IDPROGRESSIVO, DATAFATTURA, NUMEROFATTURA, TIPODOCUMENTO, [TOTALEAPAGARE€] AS TOTALE, PAGATA, NUMEROIMPIANTO
        FROM [F-01-T-TUTTEFATTURE]
        WHERE NUMEROIMPIANTO = ${idImpianto}
        ORDER BY DATAFATTURA ASC, NUMEROFATTURA ASC
      `;
      fatture = await connection.query(sqlFattureSingle);
    }

    // 3. MOVIMENTI BANCA DELL'IMPIANTO (collegati tramite G-01-T-INCASSI.NUMEROIMPIANTO)
    const sqlBanca = `
      SELECT 
        D.IDFATTURA,
        D.IDPAGAMENTO,
        D.[ENTRATE€] AS ENTRATE,
        D.[USCITE€] AS USCITE,
        M.DATAVALUTA,
        M.DESCRIZIONEMOVIMENTO,
        M.IDMOVIMENTO,
        M.IDMOVIMENTOGENERALE,
        I.NUMEROFATTURA,
        I.[5MODOPAGAMENTO] AS MODOPAGAMENTO,
        C.DESCRIZIONECONTO
      FROM ((([I-02-T-TUTTIDETTAGLIMOVIMENTIBANCA] AS D
      INNER JOIN [I-09-T-TUTTIMOVIMENTIBANCA] AS M ON D.IDMOVIMENTOGENERALE = M.IDMOVIMENTOGENERALE)
      LEFT JOIN [G-01-T-INCASSI] AS I ON D.IDPAGAMENTO = I.[ID PAGAMENTO])
      LEFT JOIN [I-20-T-IDCONTO] AS C ON M.IDCONTO = C.IDCONTO)
      WHERE I.NUMEROIMPIANTO = ${idImpianto}
      ORDER BY M.DATAVALUTA ASC, M.IDMOVIMENTO ASC
    `;
    const banca = await connection.query(sqlBanca);

    // 4. INCASSI APERTI DELL'IMPIANTO (Scaduti + Futuri)
    const sqlIncassi = `
      SELECT 
        IDPROGRESSIVOFATTURA,
        [ID PAGAMENTO] AS IDPAGAMENTO,
        DATAPAGAMENTO,
        NUMEROFATTURA,
        [TOTALE€] AS TOTALE,
        [5MODOPAGAMENTO] AS MODOPAGAMENTO,
        INSOLUTO,
        INCASSATA,
        IDPAGAMENTOGENERALE,
        NUMEROIMPIANTO
      FROM [G-01-T-INCASSI]
      WHERE NUMEROIMPIANTO = ${idImpianto} AND (INCASSATA = '0' OR INCASSATA IS NULL OR INCASSATA = '')
      ORDER BY DATAPAGAMENTO ASC
    `;
    const incassiAperti = await connection.query(sqlIncassi);

    // 5. Crediti a perdita e sopravvenienze attive dell'impianto
    let creditiPerdita = [];
    try {
      creditiPerdita = await connection.query(`
        SELECT IDCREDITOSOFFERENZA, ANNOPORTATOAPERDITA, IMPORTOCREDITOSOFFERENZA, NUMEROIMPIANTODEBITORE, IDPAGAMENTOCREDITO
        FROM [G-21-T-CREDITISOFFERENZAPORTATIAPERDITA]
        WHERE NUMEROIMPIANTODEBITORE = ${idImpianto}
        ORDER BY ANNOPORTATOAPERDITA DESC, IDCREDITOSOFFERENZA DESC
      `);
    } catch (eCP) {
      creditiPerdita = [];
    }

    let sopravvenienze = [];
    try {
      sopravvenienze = await connection.query(`
        SELECT IDSOPRAVVENIENZAATTIVA, ANNOPORTATOASOPRAVVENIENZA, IMPORTOCREDITOSOPRAVVENIENZA, NUMEROIMPIANTODEBITOREATTIVO, IDPAGAMENTOCREDITOSOPRAVVENIENZA
        FROM [G-22-T-SOPRAVVENIENZEATTIVE]
        WHERE NUMEROIMPIANTODEBITOREATTIVO = ${idImpianto}
        ORDER BY ANNOPORTATOASOPRAVVENIENZA DESC, IDSOPRAVVENIENZAATTIVA DESC
      `);
    } catch (eSop) {
      sopravvenienze = [];
    }

    // Calcoli totali e partizionamento Scaduti vs Futuri
    let totFattureLordo = 0;
    let totNoteCredito = 0;
    let conteggioFatturePositive = 0;
    let conteggioNoteCredito = 0;

    fatture.forEach((f) => {
      const tipo = parseInt(f.TIPODOCUMENTO, 10);
      const imp = Number(f.TOTALE) || 0;
      if (tipo === 2) {
        totNoteCredito += imp;
        conteggioNoteCredito++;
        f.isNotaCredito = true;
        f.tipoDocumentoLabel = "NC";
      } else {
        totFattureLordo += imp;
        conteggioFatturePositive++;
        f.isNotaCredito = false;
        f.tipoDocumentoLabel = "FT";
      }
    });
    const totFattureNetto = totFattureLordo - totNoteCredito;

    const totEntrateBanca = banca.reduce((acc, b) => acc + (Number(b.ENTRATE) || 0), 0);
    const totUsciteBanca = banca.reduce((acc, b) => acc + (Number(b.USCITE) || 0), 0);
    const nettoBanca = totEntrateBanca - totUsciteBanca;

    const scaduti = [];
    const futuri = [];
    let totScaduti = 0;
    let totFuturi = 0;

    incassiAperti.forEach((inc) => {
      const dStr = inc.DATAPAGAMENTO ? inc.DATAPAGAMENTO.substring(0, 10) : "";
      const imp = Number(inc.TOTALE) || 0;
      if (dStr && dStr <= dataRif) {
        scaduti.push(inc);
        totScaduti += imp;
      } else {
        futuri.push(inc);
        totFuturi += imp;
      }
    });

    const totCreditiPerdita = creditiPerdita.reduce((acc, c) => acc + (Number(c.IMPORTOCREDITOSOFFERENZA) || 0), 0);
    const totSopravvenienze = sopravvenienze.reduce((acc, s) => acc + (Number(s.IMPORTOCREDITOSOPRAVVENIENZA) || 0), 0);

    const diffFattureBanca = totFattureNetto - nettoBanca;
    // Nel form Access g-31: DARE = (Fatture - Banca) - CreditiPerdita + Sopravvenienze - IncassiFuturi (o rate aperte)
    const dareEffettivo = diffFattureBanca - totCreditiPerdita + totSopravvenienze - totFuturi;

    res.json({
      impianto,
      dataRiferimento: dataRif,
      riepilogo: {
        totaleFatture: totFattureNetto,
        totaleFattureLordo: totFattureLordo,
        totaleNoteCredito: totNoteCredito,
        totaleFattureNetto: totFattureNetto,
        conteggioFatture: fatture.length,
        conteggioFatturePositive,
        conteggioNoteCredito,
        totaleBanca: nettoBanca,
        conteggioBanca: banca.length,
        differenzaFattureBanca: diffFattureBanca,
        totaleCreditiPerdita: totCreditiPerdita,
        conteggioCreditiPerdita: creditiPerdita.length,
        totaleSopravvenienze: totSopravvenienze,
        conteggioSopravvenienze: sopravvenienze.length,
        dareEffettivo,
        totaleScaduti: totScaduti,
        conteggioScaduti: scaduti.length,
        totaleFuturi: totFuturi,
        conteggioFuturi: futuri.length,
        avereEffettivo: dareEffettivo
      },
      fatture,
      banca,
      scaduti,
      futuri,
      creditiPerdita,
      sopravvenienze
    });
  } catch (err) {
    console.error("[CONTABILITA] Errore estrazione situazione impianto:", err.message || err);
    res.status(500).json({ error: err.message || "Errore estrazione dati contabili impianto" });
  }
});

/**
 * GET /contabilita/fattura/:idProgressivo
 * Estrae i dettagli completi di una singola fattura per la stampa di cortesia in PDF
 * Query opzionale: ?azienda=ies|ciesse&numero=...&anno=...
 */
router.get("/fattura/:idProgressivo", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  const idProgressivo = parseInt(req.params.idProgressivo, 10);
  const azienda = (req.query.azienda || "ies").toLowerCase();

  try {
    let rows = [];
    if (!isNaN(idProgressivo) && idProgressivo > 0) {
      // 1. Cerca per IDPROGRESSIVO nella tabella principale
      rows = await connection.query(`SELECT * FROM [F-01-T-TUTTEFATTURE] WHERE IDPROGRESSIVO = ${idProgressivo}`);

      // Fallback tabella pre-2010 se non trovata
      if (rows.length === 0) {
        try {
          rows = await connection.query(`SELECT * FROM [F-01-T-TUTTEFATTUREPRIMA2010] WHERE IDPROGRESSIVO = ${idProgressivo}`);
        } catch (ePre) {}
      }
    }

    // 2. Se non trovata o idProgressivo non valido, prova ricerca per numero e anno se forniti
    if (rows.length === 0 && req.query.numero) {
      const numFt = parseInt(req.query.numero, 10);
      const annoFt = parseInt(req.query.anno, 10) || new Date().getFullYear();
      if (!isNaN(numFt) && numFt > 0) {
        rows = await connection.query(`SELECT * FROM [F-01-T-TUTTEFATTURE] WHERE NUMEROFATTURA = ${numFt} AND ANNOFATTURA = ${annoFt}`);
        if (rows.length === 0) {
          try {
            rows = await connection.query(`SELECT * FROM [F-01-T-TUTTEFATTUREPRIMA2010] WHERE NUMEROFATTURA = ${numFt} AND ANNOFATTURA = ${annoFt}`);
          } catch (ePre) {}
        }
      }
    }

    if (rows.length === 0) {
      return res.status(404).json({ error: "Fattura non trovata" });
    }

    const fattura = rows[0];
    const actualIdProgressivo = fattura.IDPROGRESSIVO;

    // 3. Dati anagrafici cliente
    let cliente = null;
    if (fattura.NUMEROCAF) {
      try {
        const cliRows = await connection.query(`SELECT * FROM [P-04-T-CLIENTI] WHERE [ID CAF] = ${fattura.NUMEROCAF}`);
        if (cliRows.length > 0) cliente = cliRows[0];
      } catch (eCli) {}
    }

    // 4. Dati impianto
    let impianto = null;
    if (fattura.NUMEROIMPIANTO) {
      try {
        const impRows = await connection.query(`SELECT * FROM [P-07-T-IMPIANTI] WHERE [NUMERO IMPIANTO] = ${fattura.NUMEROIMPIANTO}`);
        if (impRows.length > 0) impianto = impRows[0];
      } catch (eImp) {}
    }

    // 5. Riferimento normativo
    let rifNormativo = null;
    if (fattura.IDRIFNORMATIVO) {
      try {
        const rifRows = await connection.query(`SELECT * FROM [F-21-T-RIFERIMENTONORMATIVO] WHERE IDRIFERIMENTONORMATIVO = ${fattura.IDRIFNORMATIVO}`);
        if (rifRows.length > 0) rifNormativo = rifRows[0];
      } catch (eRif) {}
    }

    // 6. Risoluzione CAP / Località / Provincia
    const capIds = [fattura.CAPPOSTALE, fattura.CAPLEGALE, fattura.CAPIMPIANTO]
      .map(v => parseInt(v, 10))
      .filter(v => !isNaN(v) && v > 0);

    const mapCap = {};
    if (capIds.length > 0) {
      try {
        const uniqueIds = Array.from(new Set(capIds)).join(",");
        const capRows = await connection.query(`SELECT IDCAP, CAP, LOCALITA, PROVINCIA FROM [X-05-T-CAP] WHERE IDCAP IN (${uniqueIds})`);
        capRows.forEach(c => {
          mapCap[c.IDCAP] = {
            cap: c.CAP || "",
            localita: c.LOCALITA || "",
            provincia: c.PROVINCIA || ""
          };
        });
      } catch (eCap) {}
    }

    // 7. Rate / Incassi collegati
    let incassi = [];
    if (actualIdProgressivo) {
      try {
        const sqlIncassi = `
          SELECT [ID PAGAMENTO] AS IDPAGAMENTO, IDPROGRESSIVOFATTURA, NUMEROFATTURA,
                 DATAPAGAMENTO, [TOTALE€] AS TOTALE, [5MODOPAGAMENTO] AS MODOPAGAMENTO,
                 BANCA, CODABI, CAB, NUMERORID, CONTOCORRENTE, INSOLUTO, INCASSATA
          FROM [G-01-T-INCASSI]
          WHERE IDPROGRESSIVOFATTURA = ${actualIdProgressivo}
          ORDER BY DATAPAGAMENTO ASC, [ID PAGAMENTO] ASC
        `;
        incassi = await connection.query(sqlIncassi);
      } catch (eInc) {}
    }

    // 8. Dettagli righe interventi / articoli
    let dettagli = [];
    if (actualIdProgressivo) {
      try {
        const sqlDettagli = `
          SELECT IDGENERALEDETTAGLIFATTURE, IDPROGRESSIVOFATTURA, IDORDINAMENTOCORPOFATTURA,
                 DESCRIZIONE, QUANTITADETTAGLIO, PREZZODETTAGLIO, IDSERIALE, IDBOLLA, DATABOLLA, DESCRIZIONEARTICOLO
          FROM [F-01-T-DETTAGLITUTTEFATTURE]
          WHERE IDPROGRESSIVOFATTURA = ${actualIdProgressivo}
          ORDER BY IDORDINAMENTOCORPOFATTURA ASC, IDGENERALEDETTAGLIFATTURE ASC
        `;
        dettagli = await connection.query(sqlDettagli);
      } catch (eDet) {}
    }

    // 9. Informazioni Azienda emittente (recuperate dalle costanti societarie in RAM)
    const azConfig = await dbaccess.getAziendaConfig(azienda);
    const viaCivico = (azConfig && azConfig.via ? (azConfig.via.trim() + (azConfig.civico ? " " + azConfig.civico.trim() : "")) : "").trim();
    const cciaaVal = (azConfig && (azConfig.cciaa || azConfig.numeroRea)) || "";
    const iscrTribVal = (azConfig && azConfig.iscrizioneTribunale) || "";

    const aziendaInfo = {
      codice: (azConfig && azConfig.codice) || azienda,
      idAzienda: (azConfig && azConfig.idAzienda) || (azienda === "ciesse" ? 15000 : 4000),
      nome: (azConfig && (azConfig.denominazione || azConfig.nome)) || (azienda === "ciesse" ? "CIESSE S.R.L." : "Ingegneria e Sistemi srl"),
      ragioneSociale: (azConfig && (azConfig.denominazione || azConfig.nome)) || (azienda === "ciesse" ? "CIESSE S.R.L." : "Ingegneria e Sistemi srl"),
      sede: (azConfig && azConfig.sede) || "",
      indirizzo: viaCivico || (azConfig && azConfig.sede) || (azienda === "ciesse" ? "Via Luigi Galvani 36" : "Via Caduti Di Nassiriya N.67-69"),
      via: (azConfig && azConfig.via) || "",
      civico: (azConfig && azConfig.civico) || "",
      cap: (azConfig && azConfig.cap) || (azienda === "ciesse" ? "20019" : "50018"),
      citta: (azConfig && (azConfig.comune || azConfig.citta)) || (azienda === "ciesse" ? "SETTIMO MILANESE" : "SCANDICCI"),
      provincia: (azConfig && azConfig.provincia) || (azienda === "ciesse" ? "MI" : "FI"),
      telefono: (azConfig && azConfig.telefono) || "",
      fax: (azConfig && azConfig.fax) || "",
      email: (azConfig && azConfig.email) || "",
      sito: (azConfig && azConfig.sito) || "",
      pec: (azConfig && azConfig.pec) || "",
      partitaIva: (azConfig && azConfig.partitaIva) || "",
      codiceFiscale: (azConfig && (azConfig.codiceFiscale || azConfig.partitaIva)) || "",
      legaleRappresentante: (azConfig && azConfig.legaleRappresentante) || "",
      cfLegaleRappresentante: (azConfig && azConfig.cfLegaleRappresentante) || "",
      cuc: (azConfig && azConfig.cuc) || "",
      codiceSDI: (azConfig && azConfig.codiceSDI) || "",
      codiceMittente: (azConfig && azConfig.codiceMittente) || "",
      cciaa: cciaaVal,
      numeroRea: (azConfig && azConfig.numeroRea) || "",
      ufficio: (azConfig && azConfig.ufficioRegistroDitte) || "",
      iscrizioneTribunale: iscrTribVal,
      tribunale: iscrTribVal,
      registroDitte: (azConfig && azConfig.registroDitte) || "",
      capitaleSociale: (azConfig && azConfig.capitaleSociale) || 0,
      datiBancari: (azConfig && azConfig.datiBancari) || "",
      iban: (azConfig && azConfig.iban) || (azienda === "ciesse" ? "IT63D0306909563100000060355" : "IT63X0103038083000000688202"),
      nomeBanca: (azConfig && azConfig.nomeBanca) || "",
      contoCorrente: (azConfig && azConfig.contoCorrente) || "",
      cab: (azConfig && azConfig.cab) || "",
      abi: (azConfig && azConfig.abi) || "",
      identificativoCreditore: (azConfig && azConfig.identificativoCreditore) || "",
      logo: (azConfig && azConfig.logo) || (azienda === "ciesse" ? "logo_ciesse.png" : "logo.png")
    };

    res.json({
      fattura,
      cliente,
      impianto,
      rifNormativo,
      mapCap,
      incassi,
      dettagli,
      aziendaInfo
    });

  } catch (err) {
    console.error("[CONTABILITA] Errore estrazione fattura:", err.message || err);
    res.status(500).json({ error: err.message || "Errore estrazione dati fattura" });
  }
});


/**
 * GET /contabilita/banca/conti
 * Restituisce i conti correnti / casse con l'ultimo saldo registrato
 */
router.get("/banca/conti", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  try {
    const conti = await connection.query(`
      SELECT IDCONTO, DESCRIZIONECONTO, CAUSALECONTOCONTABILITA
      FROM [I-20-T-IDCONTO]
      ORDER BY IDCONTO ASC
    `);

    // Determina l'anno contabile attivo (il più recente presente nei movimenti)
    const maxAnnoRes = await connection.query(`SELECT MAX(ANNOMOVIMENTO) AS MAXANNO FROM [I-09-T-TUTTIMOVIMENTIBANCA]`);
    const activeYear = (maxAnnoRes.length > 0 && maxAnnoRes[0].MAXANNO) ? maxAnnoRes[0].MAXANNO : new Date().getFullYear();

    // Per ogni conto, calcola il saldo reale (Entrate - Uscite dell'anno attivo, comprensivo del riporto iniziale)
    const contiConSaldo = await Promise.all(
      conti.map(async (c) => {
        try {
          const saldoRes = await connection.query(`
            SELECT 
              SUM(d.[ENTRATE€]) AS TOT_ENTRATE, 
              SUM(d.[USCITE€]) AS TOT_USCITE,
              SUM(d.[ENTRATE€]) - SUM(d.[USCITE€]) AS SALDO
            FROM [I-09-T-TUTTIMOVIMENTIBANCA] AS m
            INNER JOIN [I-02-T-TUTTIDETTAGLIMOVIMENTIBANCA] AS d ON m.IDMOVIMENTOGENERALE = d.IDMOVIMENTOGENERALE
            WHERE m.IDCONTO = ${c.IDCONTO} AND m.ANNOMOVIMENTO = ${activeYear}
          `);

          const ultDataRes = await connection.query(`
            SELECT TOP 1 DATAVALUTA
            FROM [I-09-T-TUTTIMOVIMENTIBANCA]
            WHERE IDCONTO = ${c.IDCONTO} AND ANNOMOVIMENTO = ${activeYear}
            ORDER BY DATAVALUTA DESC, IDMOVIMENTO DESC
          `);

          const saldoCalcolato = (saldoRes.length > 0 && saldoRes[0].SALDO !== null)
            ? Math.round(Number(saldoRes[0].SALDO) * 100) / 100
            : 0;

          return {
            idConto: c.IDCONTO,
            descrizioneConto: c.DESCRIZIONECONTO,
            causaleContoContabilita: c.CAUSALECONTOCONTABILITA,
            ultimoSaldo: saldoCalcolato,
            dataUltimoSaldo: ultDataRes.length > 0 ? ultDataRes[0].DATAVALUTA : null,
            annoRiferimento: activeYear
          };
        } catch (e) {
          return {
            idConto: c.IDCONTO,
            descrizioneConto: c.DESCRIZIONECONTO,
            causaleContoContabilita: c.CAUSALECONTOCONTABILITA,
            ultimoSaldo: 0,
            dataUltimoSaldo: null,
            annoRiferimento: activeYear
          };
        }
      })
    );

    res.json(contiConSaldo);
  } catch (err) {
    console.error("[CONTABILITA] Errore elenco conti:", err.message || err);
    res.status(500).json({ error: err.message || "Errore estrazione conti" });
  }
});

/**
 * GET /contabilita/banca/movimenti
 * Estrae l'elenco dei movimenti bancari e di cassa con filtri e paginazione
 */
router.get("/banca/movimenti", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  try {
    const idConto = req.query.idconto ? parseInt(req.query.idconto) : null;
    const idFornitore = req.query.idfornitore ? parseInt(req.query.idfornitore) : null;
    const idCliente = req.query.idcliente ? parseInt(req.query.idcliente) : null;
    const dataDa = req.query.data_da ? req.query.data_da.trim() : null;
    const dataA = req.query.data_a ? req.query.data_a.trim() : null;
    const tipo = req.query.tipo ? req.query.tipo.trim().toLowerCase() : null; // 'entrate', 'uscite', 'tutti'
    const q = req.query.q ? req.query.q.trim().replace(/'/g, "''") : null;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(250, Math.max(10, parseInt(req.query.limit) || 50));

    const whereClauses = [];

    if (idConto && idConto > 0) {
      whereClauses.push(`m.IDCONTO = ${idConto}`);
    }
    if (idFornitore && idFornitore > 0) {
      whereClauses.push(`d.IDFORNITORE = ${idFornitore}`);
    }
    if (idCliente && idCliente > 0) {
      whereClauses.push(`d.IDCLIENTE = ${idCliente}`);
    }
    if (dataDa && /^\d{4}-\d{2}-\d{2}$/.test(dataDa)) {
      whereClauses.push(`m.DATAVALUTA >= #${dataDa}#`);
    }
    if (dataA && /^\d{4}-\d{2}-\d{2}$/.test(dataA)) {
      whereClauses.push(`m.DATAVALUTA <= #${dataA}#`);
    }
    if (tipo === 'entrate') {
      whereClauses.push(`(d.[ENTRATE€] > 0)`);
    } else if (tipo === 'uscite') {
      whereClauses.push(`(d.[USCITE€] > 0)`);
    }
    if (q) {
      const isNum = /^\d+$/.test(q);
      const searchParts = [
        `m.DESCRIZIONEMOVIMENTO LIKE '%${q}%'`,
        `f.NOME LIKE '%${q}%'`,
        `f.RAGIONE_SO LIKE '%${q}%'`,
        `c.[RAGIONE SOCIALE] LIKE '%${q}%'`
      ];
      if (isNum) {
        searchParts.push(`m.IDMOVIMENTOGENERALE = ${q}`);
        searchParts.push(`m.IDMOVIMENTO = ${q}`);
        searchParts.push(`d.IDFORNITORE = ${q}`);
      }
      whereClauses.push(`(${searchParts.join(' OR ')})`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Calcolo KPI aggregati (Totale Entrate, Totale Uscite, Conteggio)
    const aggSql = `
      SELECT 
        SUM(d.[ENTRATE€]) AS TOT_ENTRATE,
        SUM(d.[USCITE€]) AS TOT_USCITE,
        COUNT(*) AS TOT_RIGHE
      FROM (((([I-09-T-TUTTIMOVIMENTIBANCA] AS m
      INNER JOIN [I-02-T-TUTTIDETTAGLIMOVIMENTIBANCA] AS d ON m.IDMOVIMENTOGENERALE = d.IDMOVIMENTOGENERALE)
      LEFT JOIN [I-20-T-IDCONTO] AS co ON m.IDCONTO = co.IDCONTO)
      LEFT JOIN [D-13-T-FORNITORI] AS f ON d.IDFORNITORE = f.[ID FORNITORE])
      LEFT JOIN [P-04-T-CLIENTI] AS c ON d.IDCLIENTE = c.[ID CAF])
      ${whereSql}
    `;

    const aggResult = await connection.query(aggSql);
    const totEntrate = aggResult.length > 0 && aggResult[0].TOT_ENTRATE ? Number(aggResult[0].TOT_ENTRATE) : 0;
    const totUscite = aggResult.length > 0 && aggResult[0].TOT_USCITE ? Number(aggResult[0].TOT_USCITE) : 0;
    const totRighe = aggResult.length > 0 && aggResult[0].TOT_RIGHE ? parseInt(aggResult[0].TOT_RIGHE) : 0;

    // Recupera i record per la pagina richiesta usando SELECT TOP ${page * limit}
    const maxTop = page * limit;
    const listSql = `
      SELECT TOP ${maxTop}
        m.IDMOVIMENTOGENERALE,
        m.IDMOVIMENTO,
        m.ANNOMOVIMENTO,
        m.IDCONTO,
        co.DESCRIZIONECONTO,
        m.DATAVALUTA,
        m.DESCRIZIONEMOVIMENTO,
        m.SALDO,
        d.IDPROGRESSIVOGENERALE,
        d.IDFORNITORE,
        f.NOME AS NOMEFORNITORE,
        f.RAGIONE_SO AS RAGIONESOCIALEFORNITORE,
        d.IDCLIENTE,
        c.[RAGIONE SOCIALE] AS NOMECLIENTE,
        d.[ENTRATE€] AS ENTRATE,
        d.[USCITE€] AS USCITE,
        d.IDPAGAMENTO,
        d.IDFATTURAFORNITORE
      FROM (((([I-09-T-TUTTIMOVIMENTIBANCA] AS m
      INNER JOIN [I-02-T-TUTTIDETTAGLIMOVIMENTIBANCA] AS d ON m.IDMOVIMENTOGENERALE = d.IDMOVIMENTOGENERALE)
      LEFT JOIN [I-20-T-IDCONTO] AS co ON m.IDCONTO = co.IDCONTO)
      LEFT JOIN [D-13-T-FORNITORI] AS f ON d.IDFORNITORE = f.[ID FORNITORE])
      LEFT JOIN [P-04-T-CLIENTI] AS c ON d.IDCLIENTE = c.[ID CAF])
      ${whereSql}
      ORDER BY m.IDMOVIMENTOGENERALE DESC, d.IDPROGRESSIVOGENERALE DESC
    `;

    const allRows = await connection.query(listSql);
    const startIdx = (page - 1) * limit;
    const pageRows = allRows.slice(startIdx, startIdx + limit);

    // Saldo attuale del conto selezionato (o somma di tutti i conti) per l'anno contabile attivo
    let saldoAttualeConto = null;
    try {
      const maxAnnoRes = await connection.query(`SELECT MAX(ANNOMOVIMENTO) AS MAXANNO FROM [I-09-T-TUTTIMOVIMENTIBANCA]`);
      const activeYear = (maxAnnoRes.length > 0 && maxAnnoRes[0].MAXANNO) ? maxAnnoRes[0].MAXANNO : new Date().getFullYear();

      const contoClause = (idConto && idConto > 0) ? `m.IDCONTO = ${idConto} AND` : '';
      const s = await connection.query(`
        SELECT SUM(d.[ENTRATE€]) - SUM(d.[USCITE€]) AS SALDO
        FROM [I-09-T-TUTTIMOVIMENTIBANCA] AS m
        INNER JOIN [I-02-T-TUTTIDETTAGLIMOVIMENTIBANCA] AS d ON m.IDMOVIMENTOGENERALE = d.IDMOVIMENTOGENERALE
        WHERE ${contoClause} m.ANNOMOVIMENTO = ${activeYear}
      `);
      if (s.length > 0 && s[0].SALDO !== null) {
        saldoAttualeConto = Math.round(Number(s[0].SALDO) * 100) / 100;
      }
    } catch (e) {}

    res.json({
      kpi: {
        totaleEntrate: Math.round(totEntrate * 100) / 100,
        totaleUscite: Math.round(totUscite * 100) / 100,
        saldoPeriodo: Math.round((totEntrate - totUscite) * 100) / 100,
        saldoAttualeConto: saldoAttualeConto !== null ? Math.round(saldoAttualeConto * 100) / 100 : null,
        conteggio: totRighe
      },
      page,
      limit,
      totalPages: Math.ceil(totRighe / limit) || 1,
      rows: pageRows.map(r => ({
        idMovGen: r.IDMOVIMENTOGENERALE,
        idMov: r.IDMOVIMENTO,
        anno: r.ANNOMOVIMENTO,
        idConto: r.IDCONTO,
        nomeConto: r.DESCRIZIONECONTO || 'Altro',
        dataValuta: r.DATAVALUTA,
        descrizione: r.DESCRIZIONEMOVIMENTO || '',
        saldo: r.SALDO !== null ? Number(r.SALDO) : null,
        idDettaglio: r.IDPROGRESSIVOGENERALE,
        idFornitore: r.IDFORNITORE && r.IDFORNITORE > 0 ? r.IDFORNITORE : null,
        nomeFornitore: r.RAGIONESOCIALEFORNITORE || r.NOMEFORNITORE || null,
        idCliente: r.IDCLIENTE && r.IDCLIENTE > 0 ? r.IDCLIENTE : null,
        nomeCliente: r.NOMECLIENTE || null,
        entrate: Number(r.ENTRATE) || 0,
        uscite: Number(r.USCITE) || 0,
        idPagamento: r.IDPAGAMENTO && r.IDPAGAMENTO > 0 ? r.IDPAGAMENTO : null,
        idFatturaFornitore: r.IDFATTURAFORNITORE && r.IDFATTURAFORNITORE > 0 ? r.IDFATTURAFORNITORE : null
      }))
    });
  } catch (err) {
    console.error("[CONTABILITA] Errore movimenti banca:", err.message || err);
    res.status(500).json({ error: err.message || "Errore estrazione movimenti bancari" });
  }
});

/**
 * GET /contabilita/banca/opzioni-incasso
 * Estrae le opzioni per la registrazione incassi (modi pagamento e causali chiusura)
 */
router.get("/banca/opzioni-incasso", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  try {
    const [modi, causali] = await Promise.all([
      connection.query(`SELECT [CODICE PAGAMENTO] AS id, [PAGAMENTO] AS nome FROM [G-15-T-MODOPAGAMENTO] ORDER BY [CODICE PAGAMENTO] ASC`),
      connection.query(`SELECT [IDCAUSALECHIUSURA] AS id, [DESCRIZIONECAUSALE] AS nome FROM [G-05-T-CAUSALECHIUSURAINCASSI] ORDER BY [IDCAUSALECHIUSURA] ASC`)
    ]);

    res.json({
      modiPagamento: (modi || []).map(m => ({ id: m.id, nome: m.nome })),
      causaliChiusura: (causali || []).map(c => ({ id: c.id, nome: c.nome }))
    });
  } catch (err) {
    console.error("[CONTABILITA] Errore opzioni incasso:", err.message || err);
    res.status(500).json({ error: err.message || "Errore estrazione opzioni incasso" });
  }
});

/**
 * GET /contabilita/banca/cliente-dettagli/:idcaf
 * Estrae anagrafica cliente, impianti e fatture aperte non ancora incassate
 */
router.get("/banca/cliente-dettagli/:idcaf", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  const idCaf = parseInt(req.params.idcaf, 10);
  if (!idCaf || idCaf <= 0) {
    return res.status(400).json({ error: "ID CAF non valido" });
  }

  try {
    // 1. Anagrafica cliente
    const sqlCliente = `
      SELECT 
        [ID CAF] AS idCaf,
        [RAGIONE SOCIALE] AS ragioneSociale,
        [PARTITA IVA] AS partitaIva,
        [CODICE FISCALE] AS codiceFiscale,
        [LUOGO POSTALE] AS luogoPostale,
        [LUOGO LEGALE] AS luogoLegale,
        [CAP POSTALE] AS capPostale,
        [CAP LEGALE] AS capLegale,
        [CONTO CORRENTE] AS contoCorrente,
        CODICEIBAN AS iban,
        [CODICE BANCA] AS codiceBanca,
        NUMERO_RID AS rid
      FROM [P-04-T-CLIENTI]
      WHERE [ID CAF] = ${idCaf}
    `;
    const clientRows = await connection.query(sqlCliente);
    const cliente = clientRows.length > 0 ? clientRows[0] : null;

    if (!cliente) {
      return res.status(404).json({ error: "Cliente non trovato" });
    }

    // 2. Impianti cliente
    const sqlImpianti = `
      SELECT 
        [NUMERO IMPIANTO] AS idImpianto,
        [NOME] AS nomeImpianto,
        [LUOGO IMPIANTO] AS indirizzo
      FROM [P-07-T-IMPIANTI]
      WHERE [NUMERO CAF] = ${idCaf}
      ORDER BY [NUMERO IMPIANTO] ASC
    `;
    const impianti = await connection.query(sqlImpianti);

    // 3. Fatture/Incassi aperti (INCASSATA = '0' o NULL)
    const sqlOpen = `
      SELECT 
        [ID PAGAMENTO],
        IDPAGAMENTOGENERALE,
        NUMEROFATTURA,
        DATAFATTURA,
        DATAPAGAMENTO,
        [TOTALE€],
        [5MODOPAGAMENTO],
        ID5MODOPAGAMENTO,
        NUMEROIMPIANTO
      FROM [G-01-T-INCASSI]
      WHERE NUMEROCAF = ${idCaf} AND (INCASSATA = '0' OR INCASSATA IS NULL)
      ORDER BY NUMEROFATTURA DESC, [ID PAGAMENTO] DESC
    `;
    const openRows = await connection.query(sqlOpen);

    res.json({
      cliente: {
        idCaf: cliente.idCaf,
        ragioneSociale: cliente.ragioneSociale,
        partitaIva: cliente.partitaIva || '',
        codiceFiscale: cliente.codiceFiscale || '',
        luogo: cliente.luogoPostale || cliente.luogoLegale || '',
        cap: cliente.capPostale || cliente.capLegale || '',
        contoCorrente: cliente.contoCorrente || '',
        iban: cliente.iban || '',
        codiceBanca: cliente.codiceBanca || '',
        rid: cliente.rid || ''
      },
      impianti: (impianti || []).map(i => ({
        idImpianto: i.idImpianto,
        nome: i.nomeImpianto,
        indirizzo: i.indirizzo || ''
      })),
      fattureAperte: (openRows || []).map(f => ({
        idPagamento: f['ID PAGAMENTO'],
        idPagamentoGenerale: f.IDPAGAMENTOGENERALE,
        numeroFattura: f.NUMEROFATTURA,
        dataFattura: f.DATAFATTURA,
        dataScadenza: f.DATAPAGAMENTO,
        totale: Number(f['TOTALE€']) || 0,
        modoPagamento: f['5MODOPAGAMENTO'] || '',
        idModoPagamento: f.ID5MODOPAGAMENTO || null,
        numeroImpianto: f.NUMEROIMPIANTO || 0
      }))
    });
  } catch (err) {
    console.error("[CONTABILITA] Errore cliente dettagli incasso:", err.message || err);
    res.status(500).json({ error: err.message || "Errore recupero dettagli cliente" });
  }
});

/**
 * POST /contabilita/banca/incassi
 * Registra un nuovo incasso bancario / cassa:
 * - Crea record testata in [I-09-T-TUTTIMOVIMENTIBANCA]
 * - Crea riga dettaglio in [I-02-T-TUTTIDETTAGLIMOVIMENTIBANCA]
 * - Aggiorna lo stato in [G-01-T-INCASSI] se collegato a fattura aperta
 * - Gestisce transazione atomica (commit / rollback)
 */
router.post("/banca/incassi", async (req, res) => {
  let connection = null;
  try {
    const {
      idConto,
      dataValuta,
      importo,
      idCaf,
      ragioneSociale,
      causaleChiusura = 3,
      idModoPagamento,
      modoPagamentoDesc,
      numeroFattura,
      idPagamento,
      descrizioneMovimento
    } = req.body;

    const parsedIdConto = parseInt(idConto, 10);
    const parsedImporto = Math.round(parseFloat(importo) * 100) / 100;
    const parsedIdCaf = idCaf ? parseInt(idCaf, 10) : 0;
    const parsedCausaleChiusura = parseInt(causaleChiusura, 10) || 3;
    const cleanRagione = (ragioneSociale || '').trim().replace(/'/g, "''");

    if (!parsedIdConto || parsedIdConto <= 0) {
      return res.status(400).json({ error: "Conto obbligatorio non valido." });
    }
    if (!cleanRagione) {
      return res.status(400).json({ error: "Cliente / Ragione sociale obbligatoria." });
    }
    if (isNaN(parsedImporto) || parsedImporto <= 0) {
      return res.status(400).json({ error: "Importo non valido (deve essere maggiore di zero)." });
    }
    if (!dataValuta || !/^\d{4}-\d{2}-\d{2}$/.test(dataValuta)) {
      return res.status(400).json({ error: "Data valuta non valida (formato AAAA-MM-GG)." });
    }

    // Default causale uscita banca e prefisso descrizione in base al conto
    let defaultCausaleUscita = 6; // Bonifico da cliente
    let defaultDescPrefix = 'Accredito Bonifico da Cliente';
    let defaultModoId = 8; // BONIFICO BANCARIO
    let defaultModoNome = 'BONIFICO BANCARIO';

    if (parsedIdConto === 2) { // CASSA
      defaultCausaleUscita = 2; // Incasso FATTURA contanti
      defaultDescPrefix = 'Incasso FATTURA contanti';
      defaultModoId = 3; // RIM.DIR.
      defaultModoNome = 'RIM.DIR.';
    } else if (parsedIdConto === 3) { // POSTA
      defaultCausaleUscita = 22; // Incasso C/Postale
      defaultDescPrefix = 'Incasso C/Postale';
      defaultModoId = 7; // BOLLETTINO POST
      defaultModoNome = 'BOLLETTINO POST';
    }

    const finalModoId = idModoPagamento ? parseInt(idModoPagamento, 10) : defaultModoId;
    const finalModoDesc = (modoPagamentoDesc || defaultModoNome).trim().replace(/'/g, "''");
    const autoDesc = `${defaultDescPrefix}-${parsedIdCaf || ''}-${cleanRagione}`;
    const finalDesc = (descrizioneMovimento || autoDesc).trim().replace(/'/g, "''");

    const anno = new Date(dataValuta).getFullYear();
    const nowIso = new Date().toISOString();
    const dateValutaFmt = `${dataValuta} 00:00:00`;
    const dateInserimentoFmt = `${nowIso.substring(0, 10)} ${nowIso.substring(11, 19)}`;

    connection = await dbaccess.getRawConnection(req);
    await connection.beginTransaction();

    try {
      // 1. Calcola next IDMOVIMENTOGENERALE
      const maxGenRes = await connection.query(`SELECT MAX(IDMOVIMENTOGENERALE) AS max_gen FROM [I-09-T-TUTTIMOVIMENTIBANCA]`);
      const nextIdMovGenerale = ((maxGenRes.length > 0 && maxGenRes[0].max_gen) ? parseInt(maxGenRes[0].max_gen) : 0) + 1;

      // 2. Calcola next IDMOVIMENTO per questo conto e anno
      const maxMovRes = await connection.query(`SELECT MAX(IDMOVIMENTO) AS max_mov FROM [I-09-T-TUTTIMOVIMENTIBANCA] WHERE IDCONTO = ${parsedIdConto} AND ANNOMOVIMENTO = ${anno}`);
      const nextIdMovimento = ((maxMovRes.length > 0 && maxMovRes[0].max_mov) ? parseInt(maxMovRes[0].max_mov) : 0) + 1;

      // 3. Calcola previous SALDO per questo conto
      const lastSaldoRes = await connection.query(`SELECT TOP 1 SALDO FROM [I-09-T-TUTTIMOVIMENTIBANCA] WHERE IDCONTO = ${parsedIdConto} ORDER BY IDMOVIMENTOGENERALE DESC`);
      const prevSaldo = (lastSaldoRes.length > 0 && lastSaldoRes[0].SALDO !== null) ? Number(lastSaldoRes[0].SALDO) : 0;
      const newSaldo = Math.round((prevSaldo + parsedImporto) * 100) / 100;

      // 4. Inserimento testata movimento [I-09-T-TUTTIMOVIMENTIBANCA]
      const sqlInsertI09 = `
        INSERT INTO [I-09-T-TUTTIMOVIMENTIBANCA] (
          IDMOVIMENTOGENERALE,
          IDMOVIMENTO,
          ANNOMOVIMENTO,
          IDCONTO,
          DATAVALUTA,
          DESCRIZIONEMOVIMENTO,
          CONTROLLATO,
          CONTROLLOCC,
          SALDO,
          DATAINSERIMENTOMOVIMENTO,
          NONESPORTARE
        ) VALUES (
          ${nextIdMovGenerale},
          ${nextIdMovimento},
          ${anno},
          ${parsedIdConto},
          #${dateValutaFmt}#,
          '${finalDesc}',
          '0',
          '0',
          ${newSaldo},
          #${dateInserimentoFmt}#,
          0
        )
      `;
      await connection.query(sqlInsertI09);

      // 5. Inserimento riga dettaglio [I-02-T-TUTTIDETTAGLIMOVIMENTIBANCA]
      const parsedIdPagamento = idPagamento ? parseInt(idPagamento, 10) : 0;
      const parsedNumFattura = numeroFattura ? parseInt(numeroFattura, 10) : 0;

      const sqlInsertI02 = `
        INSERT INTO [I-02-T-TUTTIDETTAGLIMOVIMENTIBANCA] (
          IDMOVIMENTOGENERALE,
          IDMOVIMENTO,
          IDCLIENTE,
          IDFATTURA,
          IDFORNITORE,
          IDFATTURAFORNITORE,
          ENTRATE,
          [ENTRATE€],
          USCITE,
          [USCITE€],
          CAUSALEUSCITABANCA,
          IDPAGAMENTO,
          CONTROLLOESEGUITO,
          SELEZIONATO
        ) VALUES (
          ${nextIdMovGenerale},
          ${nextIdMovimento},
          ${parsedIdCaf},
          ${parsedNumFattura},
          0,
          0,
          0,
          ${parsedImporto},
          0,
          0,
          ${defaultCausaleUscita},
          ${parsedIdPagamento},
          0,
          0
        )
      `;
      await connection.query(sqlInsertI02);

      // 6. Recupero IDPROGRESSIVOGENERALE generato dal contatore
      const identityRes = await connection.query(`SELECT @@IDENTITY AS ID`);
      const idProgressivoGenerale = (identityRes.length > 0 && identityRes[0].ID) ? parseInt(identityRes[0].ID, 10) : 0;

      // 7. Se è collegato a un incasso esistente in [G-01-T-INCASSI], aggiorniamo lo stato
      if (parsedIdPagamento > 0) {
        let sqlUpdateG01 = `
          UPDATE [G-01-T-INCASSI]
          SET 
            INCASSATA = 'SI',
            DATAPAGAMENTO = #${dateValutaFmt}#,
            CAUSALECHIUSURAINCASSO = ${parsedCausaleChiusura},
            IDMOVIMENTOBANCA = ${idProgressivoGenerale}
        `;
        if (finalModoId) {
          sqlUpdateG01 += `, ID5MODOPAGAMENTO = ${finalModoId}, [5MODOPAGAMENTO] = '${finalModoDesc}'`;
        }
        if (parsedCausaleChiusura === 5) {
          sqlUpdateG01 += `, PAGATOPARZIALMENTE = 1, CIFRAPAGAMENTOPARZIALE = ${parsedImporto}`;
        }
        sqlUpdateG01 += ` WHERE [ID PAGAMENTO] = ${parsedIdPagamento}`;

        await connection.query(sqlUpdateG01);
      }

      await connection.commit();

      res.json({
        success: true,
        message: "Incasso registrato con successo",
        dati: {
          idMovimentoGenerale: nextIdMovGenerale,
          idMovimento: nextIdMovimento,
          idDettaglio: idProgressivoGenerale,
          idPagamento: parsedIdPagamento,
          idConto: parsedIdConto,
          importo: parsedImporto,
          saldoAggiornato: newSaldo
        }
      });
    } catch (txErr) {
      if (connection) {
        try { await connection.rollback(); } catch(rbErr) {}
      }
      throw txErr;
    } finally {
      if (connection) {
        try { await connection.close(); } catch(clErr) {}
      }
    }
  } catch (err) {
    console.error("[CONTABILITA] Errore inserimento incasso:", err.message || err);
    res.status(500).json({ error: err.message || "Errore durante il salvataggio dell'incasso" });
  }
});

/**
 * GET /contabilita/fornitori
 * Ricerca e consultazione anagrafica fornitori
 */
router.get("/fornitori", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  try {
    const q = req.query.q ? req.query.q.trim().replace(/'/g, "''") : '';
    const soloAttivi = req.query.solo_attivi === '1';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 30));

    const whereClauses = [
      `f.[ID FORNITORE] > 0`,
      `(f.NOME IS NOT NULL OR f.RAGIONE_SO IS NOT NULL)`
    ];

    if (soloAttivi) {
      whereClauses.push(`f.ATTIVO = '1'`);
    }

    if (q) {
      const isNum = /^\d+$/.test(q);
      const searchParts = [
        `f.NOME LIKE '%${q}%'`,
        `f.RAGIONE_SO LIKE '%${q}%'`,
        `f.[PARTITA IVA] LIKE '%${q}%'`,
        `f.[CODICE FISCALE] LIKE '%${q}%'`,
        `f.LUOGO LIKE '%${q}%'`,
        `f.TELEFONO LIKE '%${q}%'`,
        `f.EMAIL LIKE '%${q}%'`
      ];
      if (isNum) {
        searchParts.push(`f.[ID FORNITORE] = ${q}`);
      }
      whereClauses.push(`(${searchParts.join(' OR ')})`);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    // Conteggio totale
    const countRes = await connection.query(`
      SELECT COUNT(*) AS c FROM [D-13-T-FORNITORI] AS f ${whereSql}
    `);
    const totalRows = countRes.length > 0 ? parseInt(countRes[0].c) : 0;

    const maxTop = page * limit;
    const listSql = `
      SELECT TOP ${maxTop}
        f.[ID FORNITORE] AS IDFORNITORE,
        f.NOME,
        f.RAGIONE_SO,
        f.[PARTITA IVA] AS PARTITAIVA,
        f.[CODICE FISCALE] AS CODICEFISCALE,
        f.VIA,
        f.LUOGO,
        f.PROVINCIA,
        f.CAP,
        f.TELEFONO,
        f.FAX,
        f.EMAIL,
        f.PECFORNITORE,
        f.IBAN,
        f.BANCA,
        f.PAGAMENTO,
        f.[SISTEMA PAGAMENTO] AS SISTEMAPAGAMENTO,
        f.ATTIVO
      FROM [D-13-T-FORNITORI] AS f
      ${whereSql}
      ORDER BY f.NOME ASC, f.[ID FORNITORE] ASC
    `;

    const allRows = await connection.query(listSql);
    const startIdx = (page - 1) * limit;
    const pageRows = allRows.slice(startIdx, startIdx + limit);

    res.json({
      totalRows,
      page,
      limit,
      totalPages: Math.ceil(totalRows / limit) || 1,
      rows: pageRows.map(f => ({
        idFornitore: f.IDFORNITORE,
        nome: f.NOME || '',
        ragioneSociale: f.RAGIONE_SO || f.NOME || '',
        partitaIva: f.PARTITAIVA || '',
        codiceFiscale: f.CODICEFISCALE || '',
        via: f.VIA || '',
        luogo: f.LUOGO || '',
        provincia: f.PROVINCIA || '',
        cap: f.CAP || '',
        telefono: f.TELEFONO || '',
        fax: f.FAX || '',
        email: f.EMAIL || '',
        pec: f.PECFORNITORE || '',
        iban: f.IBAN || '',
        banca: f.BANCA || '',
        pagamento: f.PAGAMENTO || '',
        sistemaPagamento: f.SISTEMAPAGAMENTO || '',
        attivo: String(f.ATTIVO) === '1'
      }))
    });
  } catch (err) {
    console.error("[CONTABILITA] Errore ricerca fornitori:", err.message || err);
    res.status(500).json({ error: err.message || "Errore estrazione fornitori" });
  }
});

/**
 * GET /contabilita/fornitori/:idfornitore
 * Dettaglio fornitore + statistiche pagamenti / movimenti
 */
router.get("/fornitori/:idfornitore", async (req, res) => {
  const connection = dbaccess.getConnection(req);
  try {
    const idFornitore = parseInt(req.params.idfornitore);
    if (!idFornitore) {
      return res.status(400).json({ error: "ID Fornitore non valido" });
    }

    const rows = await connection.query(`
      SELECT TOP 1
        f.[ID FORNITORE] AS IDFORNITORE,
        f.NOME,
        f.RAGIONE_SO,
        f.[PARTITA IVA] AS PARTITAIVA,
        f.[CODICE FISCALE] AS CODICEFISCALE,
        f.VIA,
        f.LUOGO,
        f.PROVINCIA,
        f.CAP,
        f.TELEFONO,
        f.FAX,
        f.EMAIL,
        f.PECFORNITORE,
        f.IBAN,
        f.BANCA,
        f.PAGAMENTO,
        f.[SISTEMA PAGAMENTO] AS SISTEMAPAGAMENTO,
        f.ATTIVO
      FROM [D-13-T-FORNITORI] AS f
      WHERE f.[ID FORNITORE] = ${idFornitore}
    `);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Fornitore non trovato" });
    }

    const f = rows[0];

    // Recupera statistiche pagamenti e ultimi 10 movimenti bancari per questo fornitore
    let stats = { totalePagato: 0, conteggioMovimenti: 0, ultimoPagamento: null };
    let ultimiMovimenti = [];

    try {
      const statsRes = await connection.query(`
        SELECT 
          SUM(d.[USCITE€]) AS TOTALE_PAGATO,
          COUNT(*) AS CONTEGGIO
        FROM [I-02-T-TUTTIDETTAGLIMOVIMENTIBANCA] AS d
        WHERE d.IDFORNITORE = ${idFornitore}
      `);
      if (statsRes.length > 0) {
        stats.totalePagato = Math.round((Number(statsRes[0].TOTALE_PAGATO) || 0) * 100) / 100;
        stats.conteggioMovimenti = parseInt(statsRes[0].CONTEGGIO) || 0;
      }

      const ultMovRes = await connection.query(`
        SELECT TOP 10
          m.IDMOVIMENTOGENERALE,
          m.IDMOVIMENTO,
          m.DATAVALUTA,
          m.DESCRIZIONEMOVIMENTO,
          co.DESCRIZIONECONTO,
          d.[USCITE€] AS USCITE,
          d.[ENTRATE€] AS ENTRATE,
          d.IDPAGAMENTO,
          d.IDFATTURAFORNITORE
        FROM (([I-09-T-TUTTIMOVIMENTIBANCA] AS m
        LEFT JOIN [I-20-T-IDCONTO] AS co ON m.IDCONTO = co.IDCONTO)
        INNER JOIN [I-02-T-TUTTIDETTAGLIMOVIMENTIBANCA] AS d ON m.IDMOVIMENTOGENERALE = d.IDMOVIMENTOGENERALE)
        WHERE d.IDFORNITORE = ${idFornitore}
        ORDER BY m.DATAVALUTA DESC, m.IDMOVIMENTOGENERALE DESC
      `);
      ultimiMovimenti = ultMovRes.map(m => ({
        idMovGen: m.IDMOVIMENTOGENERALE,
        idMov: m.IDMOVIMENTO,
        dataValuta: m.DATAVALUTA,
        descrizione: m.DESCRIZIONEMOVIMENTO,
        nomeConto: m.DESCRIZIONECONTO,
        uscite: Number(m.USCITE) || 0,
        entrate: Number(m.ENTRATE) || 0,
        idPagamento: m.IDPAGAMENTO,
        idFatturaFornitore: m.IDFATTURAFORNITORE
      }));
      if (ultMovRes.length > 0) {
        stats.ultimoPagamento = ultMovRes[0].DATAVALUTA;
      }
    } catch (eStats) {
      console.warn("[CONTABILITA] Statistiche fornitore non disponibili:", eStats.message);
    }

    res.json({
      fornitore: {
        idFornitore: f.IDFORNITORE,
        nome: f.NOME || '',
        ragioneSociale: f.RAGIONE_SO || f.NOME || '',
        partitaIva: f.PARTITAIVA || '',
        codiceFiscale: f.CODICEFISCALE || '',
        via: f.VIA || '',
        luogo: f.LUOGO || '',
        provincia: f.PROVINCIA || '',
        cap: f.CAP || '',
        telefono: f.TELEFONO || '',
        fax: f.FAX || '',
        email: f.EMAIL || '',
        pec: f.PECFORNITORE || '',
        iban: f.IBAN || '',
        banca: f.BANCA || '',
        pagamento: f.PAGAMENTO || '',
        sistemaPagamento: f.SISTEMAPAGAMENTO || '',
        attivo: String(f.ATTIVO) === '1'
      },
      stats,
      ultimiMovimenti
    });
  } catch (err) {
    console.error("[CONTABILITA] Errore dettaglio fornitore:", err.message || err);
    res.status(500).json({ error: err.message || "Errore estrazione dettaglio fornitore" });
  }
});

/**
 * GET /contabilita/aziende
 * Restituisce l'elenco di tutte le aziende configurate nella tabella connessioni principale
 */
router.get("/aziende", async (req, res) => {
  try {
    const aziende = await dbaccess.getDatiAziende();
    res.json(aziende);
  } catch (err) {
    console.error("[CONTABILITA] Errore elenco aziende:", err.message || err);
    res.status(500).json({ error: err.message || "Errore estrazione aziende" });
  }
});

module.exports = router;


