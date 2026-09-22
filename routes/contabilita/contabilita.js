const express = require("express");
const router = express.Router();
const verifyToken = require("../../verifytoken");
const dbaccess = require("../../dbaccess");

router.use(verifyToken);

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

    // 5. Crediti a perdita e sopravvenienze
    let creditiPerdita = [];
    try {
      creditiPerdita = await connection.query(`
        SELECT IDCREDITOSOFFERENZA, ANNOPORTATOAPERDITA, IMPORTOCREDITOSOFFERENZA, NUMEROIMPIANTODEBITORE
        FROM [G-21-T-CREDITISOFFERENZAPORTATIAPERDITA]
        WHERE IDCAFDEBITORE = ${idCaf}
      `);
    } catch (eCP) {
      creditiPerdita = [];
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
        totaleScaduti: totScaduti,
        conteggioScaduti: scaduti.length,
        totaleFuturi: totFuturi,
        conteggioFuturi: futuri.length,
        avereEffettivo: totScaduti,
        totaleCreditiPerdita: totCreditiPerdita,
        saldoIniziale: Number(cliente.SALDOINIZIALE) || 0,
        arrotondamento: Number(cliente.ARROTONDAMENTO) || 0,
        arrotondamentoSpeseLegali: Number(cliente.ARROTONDAMENTOSPESELEGALI) || 0
      },
      fatture,
      banca,
      scaduti,
      futuri,
      creditiPerdita
    });
  } catch (err) {
    console.error("[CONTABILITA] Errore estrazione situazione:", err.message || err);
    res.status(500).json({ error: err.message || "Errore estrazione dati contabili" });
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

    // 8. Informazioni Azienda emittente
    const aziendaInfo = azienda === "ciesse" ? {
      codice: "ciesse",
      nome: "Ciesse srl",
      indirizzo: "Via Galvani 36",
      cap: "20019",
      citta: "Settimo Milanese",
      provincia: "MI",
      telefono: "0233512408",
      fax: "",
      email: "info@ciessesicurezza.it",
      sito: "www.ciessesicurezza.it",
      pec: "ciessesrl@pec.it",
      partitaIva: "08180660154",
      codiceFiscale: "08180660154",
      cciaa: "",
      tribunale: "",
      iban: "IT 63 X 01030 38083 000000688202",
      logo: "logo_ciesse.png"
    } : {
      codice: "ies",
      nome: "Ingegneria e Sistemi srl",
      indirizzo: "Via Caduti Di Nassiriya N.67-69",
      cap: "50018",
      citta: "SCANDICCI",
      provincia: "FI",
      telefono: "055-7356766",
      fax: "055-7357276",
      email: "info@iesingegneria.it",
      sito: "www.iesingegneria.it",
      pec: "ingegneriaesistemi@pec.it",
      partitaIva: "05788780483",
      codiceFiscale: "05788780483",
      cciaa: "575362",
      tribunale: "Firenze",
      iban: "IT 63 X 01030 38083 000000688202",
      logo: "logo.png"
    };

    res.json({
      fattura,
      cliente,
      impianto,
      rifNormativo,
      mapCap,
      incassi,
      aziendaInfo
    });

  } catch (err) {
    console.error("[CONTABILITA] Errore estrazione fattura:", err.message || err);
    res.status(500).json({ error: err.message || "Errore estrazione dati fattura" });
  }
});

module.exports = router;

