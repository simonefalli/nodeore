const ADODB = require("node-adodb");
const dbAccess = require("./dbaccess");
const connection = ADODB.open(dbAccess);
const pool = require("./db"); // importa il pool MySQL
const { PassThrough } = require("stream");

// variabile globale per progress
let progress = 0;

function confrontoCampi(a, b) {
  // Normalizza null / undefined / stringhe vuote
  if (a == null || a === "") a = null;
  if (b == null || b === "") b = null;

  // Se entrambi null => uguali
  if (a === null && b === null) return true;

  // Se entrambi numerici (gestione virgole decimali)
  const numA = parseFloat(String(a).replace(",", "."));
  const numB = parseFloat(String(b).replace(",", "."));
  if (!isNaN(numA) && !isNaN(numB)) {
    return numA === numB;
  }

  // Confronto stringhe "ripulite"
  return String(a).trim() === String(b).trim();
}

function getProgress() {
  return progress;
}

// Funzione wrapper per usare pool.query con async/await
function queryMySQL(sql, params = []) {
  return new Promise((resolve, reject) => {
    pool.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

async function aggiornaDb() {
  try {
    const query = `
      SELECT [P-07-T-IMPIANTI].[NUMERO IMPIANTO], [P-07-T-IMPIANTI].[NOME],
             [P-07-T-IMPIANTI].[NOTE], [P-07-T-IMPIANTI].[NUMEROTELEFONO],
             [P-04-T-CLIENTI].[RAGIONE SOCIALE], [P-07-T-IMPIANTI].[LUOGO IMPIANTO],
             [X-05-T-CAP].[LOCALITA], [X-05-T-CAP].[PROVINCIA],
             [P-09-T-SISTEMA].[SISTEMA],[X-02-T-TIPOIMPIANTO].[TIPO IMPIANTO],
             [P-07-T-IMPIANTI].[CIFRAMENSILE€], [P-04-T-CLIENTI].[PARTITA IVA],
             [P-04-T-CLIENTI].[CODICE FISCALE]
      FROM (((([P-07-T-IMPIANTI]
      LEFT JOIN [P-04-T-CLIENTI] ON [P-04-T-CLIENTI].[ID CAF] = [P-07-T-IMPIANTI].[NUMERO CAF])
      LEFT JOIN [X-05-T-CAP] ON [X-05-T-CAP].[IDCAP] = [P-07-T-IMPIANTI].[CAP IMPIANTO])
      LEFT JOIN [P-09-T-SISTEMA] ON [P-09-T-SISTEMA].[IDSISTEMA] = [P-07-T-IMPIANTI].[SISTEMA])
      LEFT JOIN [X-02-T-TIPOIMPIANTO] ON [X-02-T-TIPOIMPIANTO].[ID TABELLA]=[P-07-T-IMPIANTI].[TIPO CONTRATTO])
      WHERE 1=1
    `;

    const data = await connection.query(query);
    let count = 0;
    const total = data.length;
    progress = 0; // reset subito

    // Query di UPDATE
    const updateQuery = `
      UPDATE impianti
      SET nome=?, note=?, numerotelefono=?, ragionesociale=?, 
          luogoimpianto=?, localita=?, provincia=?, tipoimpianto=?, 
          tipocontratto=?, ciframensile=?, partitaiva=?, codicefiscale=? 
      WHERE numeroimpianto=?
    `;

    // Query di INSERT
    const insertQuery = `
      INSERT INTO impianti
      (numeroimpianto, nome, note, numerotelefono, ragionesociale, 
       luogoimpianto, localita, provincia, tipoimpianto, tipocontratto, 
       ciframensile, partitaiva, codicefiscale) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const impianto of data) {
      count++;
      const numeroImpianto = impianto["NUMERO IMPIANTO"];
      const checkQuery = `
        SELECT numeroimpianto, nome, note, numerotelefono, ragionesociale, 
               luogoimpianto, localita, provincia, tipoimpianto, tipocontratto, 
               ciframensile, partitaiva, codicefiscale 
        FROM impianti
        WHERE numeroimpianto=?
      `;
      const impiantomySql = await queryMySQL(checkQuery, [numeroImpianto]);

      if (impiantomySql.length > 0) {
        if (
          confrontoCampi(impiantomySql[0].nome, impianto["NOME"]) &&
          confrontoCampi(impiantomySql[0].note, impianto["NOTE"]) &&
          confrontoCampi(impiantomySql[0].numerotelefono, impianto["NUMEROTELEFONO"]) &&
          confrontoCampi(impiantomySql[0].ragionesociale, impianto["RAGIONE SOCIALE"]) &&
          confrontoCampi(impiantomySql[0].luogoimpianto, impianto["LUOGO IMPIANTO"]) &&
          confrontoCampi(impiantomySql[0].localita, impianto["LOCALITA"]) &&
          confrontoCampi(impiantomySql[0].provincia, impianto["PROVINCIA"]) &&
          confrontoCampi(impiantomySql[0].tipoimpianto, impianto["SISTEMA"]) &&
          confrontoCampi(impiantomySql[0].tipocontratto, impianto["TIPO IMPIANTO"]) &&
          confrontoCampi(impiantomySql[0].ciframensile, impianto["CIFRAMENSILE€"]) &&
          confrontoCampi(impiantomySql[0].partitaiva, impianto["PARTITA IVA"]) &&
          confrontoCampi(impiantomySql[0].codicefiscale, impianto["CODICE FISCALE"])
        ) {
          // Identici → non fare nulla
        } else {
          console.log("Impianto", numeroImpianto, "diverso → UPDATE");
          await queryMySQL(updateQuery, [
            impianto["NOME"],
            impianto["NOTE"],
            impianto["NUMEROTELEFONO"],
            impianto["RAGIONE SOCIALE"],
            impianto["LUOGO IMPIANTO"],
            impianto["LOCALITA"],
            impianto["PROVINCIA"],
            impianto["SISTEMA"],       // era tipoimpianto
            impianto["TIPO IMPIANTO"], // era tipocontratto
            impianto["CIFRAMENSILE€"],
            impianto["PARTITA IVA"],
            impianto["CODICE FISCALE"],
            numeroImpianto
          ]);
        }
      } else {
        console.log("Impianto", numeroImpianto, "non trovato → INSERT");
        await queryMySQL(insertQuery, [
          numeroImpianto,
          impianto["NOME"],
          impianto["NOTE"],
          impianto["NUMEROTELEFONO"],
          impianto["RAGIONE SOCIALE"],
          impianto["LUOGO IMPIANTO"],
          impianto["LOCALITA"],
          impianto["PROVINCIA"],
          impianto["SISTEMA"],       // era tipoimpianto
          impianto["TIPO IMPIANTO"], // era tipocontratto
          impianto["CIFRAMENSILE€"],
          impianto["PARTITA IVA"],
          impianto["CODICE FISCALE"]
        ]);
      }

      // aggiorna la percentuale
      progress = Math.floor((count / total) * 100);
    }

    progress = 100;

    // Dopo un po’ resetto a 0
    setTimeout(() => {
      progress = 0;
    }, 5000);

    return "Aggiornamento completato con successo";
  } catch (err) {
    console.error("Errore durante l'aggiornamento:", err);
    progress = -1;
    return "Errore durante l'aggiornamento DB";
  }
}

module.exports = { aggiornaDb, getProgress };
