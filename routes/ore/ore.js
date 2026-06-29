const express = require("express");
const pool = require("../../db");
const router = express.Router();
const verifyToken = require("../../verifytoken");

router.use(verifyToken);

// get ora singola
router.get("/:id", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    connection.query(
      "SELECT * FROM ore WHERE id = ?",
      [req.params.id],
      (err, rows) => {
        connection.release();
        if (!err) {
          res.send(rows);
        } else {
          console.log(err);
        }
      }
    );
  });
});


// Add ora
router.post("/", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    var risultatoCheck1;
    var risultatoCheck2;
    var risultatoCheck3;
    const params = req.body;
    const idutente = params.idUtente;
    const da = params.data.dataDaInserire + " " + params.data.dalle + ":00";
    let a;
    if (params.data.alle == "24:00") {
      // Converti la stringa in un oggetto Date
      let currentDate = new Date(params.data.dataDaInserire);

      // Aggiungi un giorno alla data
      currentDate.setDate(currentDate.getDate() + 1);

      // Formatta la nuova data come stringa nel formato YYYY-MM-DD
      let nextDayString = currentDate.toISOString().split("T")[0];

      a = nextDayString + " 00:00:00 ";
    } else {
      a = params.data.dataDaInserire + " " + params.data.alle + ":00";
    }
    const daData = new Date(da);
    const aData = new Date(a);
    
    if (daData >= aData) {
      res.send({ errore: "Errore inserimento dati" });
      return;
    }
    var viaggio;
    if (params.data.viaggio) viaggio = 1;
    else viaggio = 0;
    const descrizione = params.data.descrizione;
    const con = params.data.compagno;
    const cantiere = params.data.cantiere;
    const trasferta = params.data.trasferta;
    var reperibilita;
    if (params.data.reperibilita) reperibilita = 1;
    else reperibilita = 0;
    var intervento;
    if (params.data.intervento) intervento = 1;
    else intervento = 0;
    const nonmodifica = 0;
    var ferie;
    if (params.data.ferie) ferie = 1;
    else ferie = 0;
    var permesso;
    if (params.data.permesso) permesso = 1;
    else permesso = 0;
    const importato = 0;
    const idOrdine = params.data.numeroordine;
    const idRiparazione = params.data.numeroriparazione;

    const sqlCheck1 =
      "SELECT count(*) as contorighe FROM `ore` where idutente = ? and da <= ? and a > ?";
    const sqlCheck2 =
      "SELECT count(*) as contorighe FROM `ore` where idutente = ? and da < ? and a > ?";
    const sqlCheck3 =
      "SELECT count(*) as contorighe FROM `ore` where idutente = ? and da > ? and a < ?";

    // Funzione per eseguire una query con una Promise
    const eseguiQuery = (query, params) => {
      return new Promise((resolve, reject) => {
        connection.query(query, params, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
    };
   
    // Esegui le tre query in parallelo
    Promise.all([
      eseguiQuery(sqlCheck1, [idutente, da, da]),
      eseguiQuery(sqlCheck2, [idutente, a, a]),
      eseguiQuery(sqlCheck3, [idutente, da, a]),
    ])
      .then(([resultCheck1, resultCheck2, resultCheck3]) => {
        risultatoCheck1 = resultCheck1[0].contorighe;
        risultatoCheck2 = resultCheck2[0].contorighe;
        risultatoCheck3 = resultCheck3[0].contorighe;

        if (risultatoCheck1 > 0 || risultatoCheck2 > 0 || risultatoCheck3 > 0) {
          res.send({ errore: "Errore di sovrapposizione fascia oraria" });
          connection.release();
        } else {

          const query =
            "INSERT INTO `ore`  (`id`, `idutente`, `da`, `a`, `viaggio`, `descrizione`, `con`, `cantiere`, `trasferta`, `reperibilita`, `intervento`, `nonmodifica`, `ferie`, `permesso`, `importato`, `idOrdine`, `idRiparazione`) VALUES (NULL, ? , ? , ? , ? , ? , ? , ? , ? , ? , ? , ? , ? ,  ? , ? , ? , ?)";
          parametriQuery = [
            idutente,
            da,//da,
            a,//a,
            viaggio,
            descrizione,
            con,
            cantiere,
            trasferta,
            reperibilita,
            intervento,
            nonmodifica,
            ferie,
            permesso,
            importato,
            idOrdine,
            idRiparazione,
         
          ];

          connection.query(query, parametriQuery, (err, result) => {
            connection.release();
            if (!err) {
              res.send(result);
            } else {
              console.log(err);
            }
          });
        }
      })
      .catch((err) => {
        console.error(err);
        res.sendStatus(500);
        connection.release();
        return;
      });
  });
});

// Update a ora
router.put("/:id", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;
    var risultatoCheck1;
    var risultatoCheck2;
    var risultatoCheck3;
    const idOra = req.params.id;
    const params = req.body;
    const idutente = params.idUtente;
    const da = params.data.dataDaInserire + " " + params.data.dalle + ":00";
    let a;
    if (params.data.alle == "24:00") {
      // Converti la stringa in un oggetto Date
      let currentDate = new Date(params.data.dataDaInserire);

      // Aggiungi un giorno alla data
      currentDate.setDate(currentDate.getDate() + 1);

      // Formatta la nuova data come stringa nel formato YYYY-MM-DD
      let nextDayString = currentDate.toISOString().split("T")[0];

      a = nextDayString + " 00:00:00 ";
    } else {
      a = params.data.dataDaInserire + " " + params.data.alle + ":00";
    }
    
    const daData = new Date(da);
    const aData = new Date(a);
    if (daData >= aData) {
      res.send({ errore: "Errore inserimento dati" });  
      return;
    }
    var viaggio;
    if (params.data.viaggio) viaggio = 1;
    else viaggio = 0;
    const descrizione = params.data.descrizione;
    const con = params.data.compagno;
    const cantiere = params.data.cantiere;
    const trasferta = params.data.trasferta;
    var reperibilita;
    if (params.data.reperibilita) reperibilita = 1;
    else reperibilita = 0;
    var intervento;
    if (params.data.intervento) intervento = 1;
    else intervento = 0;
    const nonmodifica = 0;
    var ferie;
    if (params.data.ferie) ferie = 1;
    else ferie = 0;
    var permesso;
    if (params.data.permesso) permesso = 1;
    else permesso = 0;
    const importato = 0;
    const idOrdine = params.data.numeroordine;
    const idRiparazione = params.data.numeroriparazione;

    const sqlCheck1 =
      "SELECT count(*) as contorighe FROM `ore` where idutente = ? and da <= ? and a > ? and id !=?";
    const sqlCheck2 =
      "SELECT count(*) as contorighe FROM `ore` where idutente = ? and da < ? and a > ? and id !=?";
    const sqlCheck3 =
      "SELECT count(*) as contorighe FROM `ore` where idutente = ? and da > ? and a < ? and id !=?";

    // Funzione per eseguire una query con una Promise
    const eseguiQuery = (query, params) => {
      return new Promise((resolve, reject) => {
        connection.query(query, params, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
    };

    // Esegui le tre query in parallelo
    Promise.all([
      eseguiQuery(sqlCheck1, [idutente, da, da , idOra]),
      eseguiQuery(sqlCheck2, [idutente, a, a , idOra]),
      eseguiQuery(sqlCheck3, [idutente, da, a , idOra]),
    ])
      .then(([resultCheck1, resultCheck2, resultCheck3]) => {
        risultatoCheck1 = resultCheck1[0].contorighe;
        risultatoCheck2 = resultCheck2[0].contorighe;
        risultatoCheck3 = resultCheck3[0].contorighe;

        if (risultatoCheck1 > 0 || risultatoCheck2 > 0 || risultatoCheck3 > 0) {
          res.send({ errore: "Errore di sovrapposizione fascia oraria" });
          connection.release();
        } else {
          const query =
            "UPDATE `ore` SET  `da` = ? , `a` = ? , `viaggio` = ? , `descrizione` = ? , `con` = ? , `cantiere` = ? , `trasferta` = ? , `reperibilita` = ? , `intervento` = ? , `nonmodifica` = ? , `ferie` = ? , `permesso` = ? , `importato` = ? , `idOrdine` = ? , `idRiparazione` = ?  where id = ?";
          parametriQuery = [
            da,
            a,
            viaggio,
            descrizione,
            con,
            cantiere,
            trasferta,
            reperibilita,
            intervento,
            nonmodifica,
            ferie,
            permesso,
            importato,
            idOrdine,
            idRiparazione,
            idOra,
          ];

          connection.query(query, parametriQuery, (err, result) => {
            connection.release();
            if (!err) {
              res.send(result);
            } else {
              console.log(err);
            }
          });
        }
      })
      .catch((err) => {
        console.error(err);
        res.sendStatus(500);
        connection.release();
        return;
      });
  });
});

// Delete ore
router.delete("/:id", (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) throw err;

    connection.query(
      "DELETE FROM ore WHERE id = ?",
      [req.params.id],
      (err, result) => {
        connection.release();
        if (!err) {
          res.send(result);
        } else {
          console.log(err);
        }
      }
    );
  });
});

module.exports = router;
