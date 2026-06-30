const dbaccess = require("./dbaccess");
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

async function aggiornaDbSingola(azienda, startProgress, endProgress) {
  const connection = dbaccess.getConnection(azienda);
  
  // Determina il nome della tabella MySQL in base all'azienda
  let tableName = "impianti";
  let companyName = "";
  if (azienda && typeof azienda === "object") {
    companyName =
      azienda.headers["x-azienda"] ||
      azienda.query.azienda ||
      azienda.body.azienda ||
      (azienda.user && (azienda.user.azienda || azienda.user.idAzienda)) ||
      "";
  } else if (typeof azienda === "string" || typeof azienda === "number") {
    companyName = String(azienda);
  }

  if (companyName && (companyName.toLowerCase() === "ciesse" || companyName === "2")) {
    tableName = "impiantiCiesse";
  }

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

  // Query di UPDATE
  const updateQuery = `
    UPDATE ${tableName}
    SET nome=?, note=?, numerotelefono=?, ragionesociale=?, 
        luogoimpianto=?, localita=?, provincia=?, tipoimpianto=?, 
        tipocontratto=?, ciframensile=?, partitaiva=?, codicefiscale=? 
    WHERE numeroimpianto=?
  `;

  // Query di INSERT
  const insertQuery = `
    INSERT INTO ${tableName}
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
      FROM ${tableName}
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
        console.log("Impianto", numeroImpianto, "diverso → UPDATE su", tableName);
        await queryMySQL(updateQuery, [
          impianto["NOME"],
          impianto["NOTE"],
          impianto["NUMEROTELEFONO"],
          impianto["RAGIONE SOCIALE"],
          impianto["LUOGO IMPIANTO"],
          impianto["LOCALITA"],
          impianto["PROVINCIA"],
          impianto["SISTEMA"],
          impianto["TIPO IMPIANTO"],
          impianto["CIFRAMENSILE€"],
          impianto["PARTITA IVA"],
          impianto["CODICE FISCALE"],
          numeroImpianto
        ]);
      }
    } else {
      console.log("Impianto", numeroImpianto, "non trovato → INSERT su", tableName);
      await queryMySQL(insertQuery, [
        numeroImpianto,
        impianto["NOME"],
        impianto["NOTE"],
        impianto["NUMEROTELEFONO"],
        impianto["RAGIONE SOCIALE"],
        impianto["LUOGO IMPIANTO"],
        impianto["LOCALITA"],
        impianto["PROVINCIA"],
        impianto["SISTEMA"],
        impianto["TIPO IMPIANTO"],
        impianto["CIFRAMENSILE€"],
        impianto["PARTITA IVA"],
        impianto["CODICE FISCALE"]
      ]);
    }

    // aggiorna la percentuale
    const range = endProgress - startProgress;
    progress = startProgress + Math.floor((count / total) * range);
  }
}

async function aggiornaDb() {
  try {
    progress = 0; // reset subito
    console.log("Inizio aggiornamento globale per I&S...");
    await aggiornaDbSingola("I&S", 0, 50);

    console.log("Inizio aggiornamento globale per Ciesse...");
    await aggiornaDbSingola("ciesse", 50, 100);

    progress = 100;

    // Dopo un po’ resetto a 0
    setTimeout(() => {
      progress = 0;
    }, 5000);

    return "Aggiornamento completato con successo per entrambe le aziende";
  } catch (err) {
    console.error("Errore durante l'aggiornamento:", err);
    progress = -1;
    return "Errore durante l'aggiornamento DB";
  }
}

module.exports = { aggiornaDb, getProgress };
