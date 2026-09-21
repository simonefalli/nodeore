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

module.exports = router;
