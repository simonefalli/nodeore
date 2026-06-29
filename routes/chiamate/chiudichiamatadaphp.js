const express = require("express");
const router = express.Router();
const ADODB = require("node-adodb");
const dbAccess = require("../../dbaccess");
const fs = require("fs");
const path = require("path");

// Connessione al database
const connection = ADODB.open(dbAccess);

const truncate = (str, maxLen) => str && typeof str === "string" ? str.substring(0, maxLen) : str;

// Funzione per formattare i valori
const formatValue = (value, type) => {
  if (value === null || value === undefined) return "NULL";
  switch (type) {
    case "string":
      return `'${String(value).replace(/\u0000/g, "").replace(/'/g, "''")}'`;
    case "number":
      return Number.isNaN(Number(value)) ? "NULL" : value;
    case "boolean":
      return value ? 1 : 0;
    case "datetime":
      const datetime = new Date(value);
      const formattedDatetime = datetime.toISOString().replace("T", " ").substring(0, 19);
      return `#${formattedDatetime}#`;
    case "date":
      const date = new Date(value);
      const formattedDate = date.toISOString().replace("T", " ").substring(0, 10);
      return `#${formattedDate}#`;
    default:
      return `'${String(value).replace(/\u0000/g, "").replace(/'/g, "''")}'`;
  }
};

router.post("/", async (req, res) => {

  let isNuova = false;

  try {
    const comunicazione = req.body[0];
    if (!comunicazione || comunicazione.NUMEROCOMUNICAZIONE == null) {
      return res.status(400).json({ error: "Dati mancanti o non validi" });
    }

    if (isNaN(comunicazione.TEMPOTOTALEAIUTANTE)) {
      comunicazione.TEMPOTOTALEAIUTANTE = 0;
    }

    if (comunicazione.NUMEROCOMUNICAZIONE === 0) {
      isNuova = true;

      const queryImpianto = `SELECT * FROM [P-07-T-IMPIANTI] WHERE [NUMERO IMPIANTO] = ${comunicazione.NUMEROIMPIANTO}`;
      const impianto = await connection.query(queryImpianto);



      if (!Array.isArray(impianto) || impianto.length === 0 || !impianto[0]["TIPO CONTRATTO"]) {
        return res.status(404).json({ error: "Impianto non trovato " });
      }




      const query1 = "SELECT TOP 1 NUMEROCOMUNICAZIONE FROM [Q-02-T-COMUNICAZIONI] ORDER BY NUMEROCOMUNICAZIONE DESC";
      const data1 = await connection.query(query1);
      const num1 = data1.length > 0 ? data1[0].NUMEROCOMUNICAZIONE : 0;

      const query2 = "SELECT TOP 1 NUMEROCOMUNICAZIONE FROM [Q-01-T-COMUNICAZIONIDAGESTIRE] ORDER BY NUMEROCOMUNICAZIONE DESC";
      const data2 = await connection.query(query2);
      const num2 = data2.length > 0 ? data2[0].NUMEROCOMUNICAZIONE : 0;

      comunicazione.NUMEROCOMUNICAZIONE = Math.max(num1, num2) + 1;
      comunicazione.TIPOCONTRATTO = impianto[0]["TIPO CONTRATTO"];
      comunicazione.MONTATOIL = impianto[0]["MONTATO_IL"];
    }

    const queryIdfornitore = `SELECT * FROM [D-13-T-FORNITORI] WHERE [ID FORNITORE] = ${formatValue(comunicazione.TECNICORIPARATORE, "number")}`;
    const dataFornitore = await connection.query(queryIdfornitore);

    if (!dataFornitore || dataFornitore.length === 0) {
      return res.status(404).json({ error: "Fornitore non trovato" });
    }

    const idUnivocoFornitore = dataFornitore[0]["IDUNIVOCOFORNITORI"];
    const numeroComunicazione = formatValue(comunicazione.NUMEROCOMUNICAZIONE, "number");

    comunicazione.NOMECLIENTE = truncate(comunicazione.NOMECLIENTE, 89);
    comunicazione.RICHIEDENTE = truncate(comunicazione.RICHIEDENTE, 149);

    const insertQuery = `
      INSERT INTO [Q-02-T-COMUNICAZIONI] (
        NUMEROCOMUNICAZIONE, DATACOMUNICAZIONE, NUMEROIMPIANTO, NOMECLIENTE, LUOGOIMPIANTO, LOCALITA, TIPOIMPIANTO, MOTIVOCHIAMATA,
        MONTATOIL, DATAINTERVENTO, DESCRIZIONEINTERVENTO, TELEFONO, TECNICORIPARATORE, POSTODILAVORO, STAMPATA,
        TIPOCONTRATTO, ESEGUITO, STIMATEMPOESECUZIONE, TIPOURGENZA, ASSEGNATAA, FISSATAIL, FISSATACOMEPROMEMORIA,
        ABILITATADAUFFICIO, TEMPOTOTALERIPARAZIONI, AIUTANTE, TEMPOTOTALEAIUTANTE, RICHIEDENTE, IDCAUSALERIPARAZIONE,
        IDCAUSALECHIUSURARIPARAZIONE, IDAZIENDACOMUNICAZIONE, NOMETECNICO, IDUNIVOCOFORNITORE
      ) VALUES (
        ${numeroComunicazione},
        ${formatValue(comunicazione.DATACOMUNICAZIONE, "datetime")},
        ${formatValue(comunicazione.NUMEROIMPIANTO, "number")},
        ${formatValue(comunicazione.NOMECLIENTE, "string")},
        ${formatValue(comunicazione.LUOGOIMPIANTO, "string")},
        ${formatValue(comunicazione.LOCALITA, "string")},
        ${formatValue(comunicazione.TIPOIMPIANTO, "string")},
        ${formatValue(comunicazione.MOTIVOCHIAMATA, "string")},
        ${formatValue(comunicazione.MONTATOIL, "date")},
        ${formatValue(comunicazione.DATAINTERVENTO, "date")},
        ${formatValue(comunicazione.DESCRIZIONEINTERVENTO, "string")},
        ${formatValue(comunicazione.TELEFONO, "string")},
        ${formatValue(comunicazione.TECNICORIPARATORE, "number")},
        ${formatValue(comunicazione.POSTODILAVORO, "string")},
        ${formatValue(comunicazione.STAMPATA, "boolean")},
        ${formatValue(comunicazione.TIPOCONTRATTO, "number")},
        1,
        ${formatValue(comunicazione.STIMATEMPOESECUZIONE, "number")},
        ${formatValue(comunicazione.TIPOURGENZA, "string")},
        ${formatValue(comunicazione.TECNICORIPARATORE, "number")},
        ${formatValue(comunicazione.FISSATAIL, "date")},
        ${formatValue(comunicazione.FISSATACOMEPROMEMORIA, "boolean")},
        ${formatValue(comunicazione.ABILITATADAUFFICIO, "boolean")},
        ${formatValue(comunicazione.TEMPOTOTALERIPARAZIONI, "number")},
        ${formatValue(comunicazione.AIUTANTE, "number")},
        ${formatValue(comunicazione.TEMPOTOTALEAIUTANTE, "number")},
        ${formatValue(comunicazione.RICHIEDENTE, "string")},
        ${formatValue(comunicazione.IDCAUSALERIPARAZIONE, "number")},
        0,
        ${formatValue(comunicazione.IDAZIENDACOMUNICAZIONE, "number")},
        ${formatValue(comunicazione.NOMETECNICO, "string")},
        ${idUnivocoFornitore}
      )
    `;

    await connection.execute(insertQuery);

    if (!isNuova) {
      const deleteQuery = `DELETE FROM [Q-01-T-COMUNICAZIONIDAGESTIRE] WHERE NUMEROCOMUNICAZIONE = ${numeroComunicazione}`;
      await connection.execute(deleteQuery);
    }

    const filePath = "C:/Monica/chiamatechiuse.txt";
    const now = new Date();
    const formattedNow = now.toISOString().replace("T", " ").substring(0, 19);
    const logLine = `${formattedNow} - NUMEROCOMUNICAZIONE: ${comunicazione.NUMEROCOMUNICAZIONE}\r\n`;

    fs.appendFile(filePath, logLine, (err) => {
      if (err) {
        console.error("Errore durante la scrittura del file:", err);
      }
    });

    res.json({
      success: true,
      numeroComunicazione: comunicazione.NUMEROCOMUNICAZIONE,
      message: "Success!!",
    });
  } catch (error) {
    console.error("Errore:", error);
    res.status(500).json({
      error: error.message || "Errore interno del server",
    });
  }
});

module.exports = router;
