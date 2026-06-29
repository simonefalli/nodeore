const express = require("express");
const pool = require("../../db");
const router = express.Router();

// GET /api/ore/giorno?anno=2026&mese=1
router.get("/", (req, res) => {
  const { anno, mese , id} = req.query;

  // Validazione parametri
  if (!anno || !mese) {
    return res.status(400).json({
      error: "I parametri anno e mese sono obbligatori"
    });
  }

  const annoNum = Number(anno);
  const meseNum = Number(mese);

  if (
    isNaN(annoNum) ||
    isNaN(meseNum) ||
    meseNum < 1 ||
    meseNum > 12
  ) {
    return res.status(400).json({
      error: "Parametri non validi"
    });
  }

  pool.getConnection((err, connection) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Errore connessione DB" });
    }

    const sql = `
      SELECT *
      FROM ore
      WHERE MONTH(da) = ?
        AND YEAR(da) = ?
      ORDER BY idutente, da ASC
    `;

    connection.query(sql, [meseNum, annoNum], (err, rows) => {
      connection.release();

      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Errore query DB" });
      }

      const grouped = {};
      const output = [];

      rows.forEach(r => {
        const da = new Date(r.da);
        const a = new Date(r.a);
        const data = da.toISOString().slice(0, 10);

        // 🔴 FERIE → giornata intera
        if (r.ferie === 1) {
          output.push({
            id_utente: r.idutente,
            data,
            tipo: "ferie",
            ferie: 1,
            permesso: 0,
            RepeTrasf: 0,
            ora_inizio: null,
            pausa_inizio: null,
            pausa_fine: null,
            ora_fine: null
          });
          return;
        }

        // 🟠 PERMESSO → con orari
        if (r.permesso === 1) {
          output.push({
            id_utente: r.idutente,
            data,
            tipo: "permesso",
            ferie: 0,
            permesso: 1,
            RepeTrasf: 0,
            ora_inizio: da.toISOString().slice(11, 16),
            pausa_inizio: null,
            pausa_fine: null,
            ora_fine: a.toISOString().slice(11, 16)
          });
          return;
        }

        // 🟢 LAVORO → raggruppamento per utente + giorno
        const key = `${r.idutente}_${data}`;

        if (!grouped[key]) {
          grouped[key] = {
            id_utente: r.idutente,
            data,
            ora_inizio: da,
            ora_fine: a,
            pausa: null,
            hasReperibilita: false,
            hasTrasferta: false
          };
        }

        // flag reperibilità / trasferta
        if (r.reperibilita === 1) {
          grouped[key].hasReperibilita = true;
        }

        if (r.trasferta && r.trasferta !== 0) {
          grouped[key].hasTrasferta = true;
        }

        // prima pausa trovata
        if (!grouped[key].pausa && grouped[key].ora_fine < da) {
          grouped[key].pausa = {
            pausa_inizio: new Date(grouped[key].ora_fine),
            pausa_fine: new Date(da)
          };
        }

        grouped[key].ora_fine = a;
      });

      // 🧾 Output giorni lavorativi
      const groupedOutput = Object.values(grouped).map(g => {
        let RepeTrasf = 0;

        if (g.hasTrasferta) {
          RepeTrasf = 2;
        } else if (g.hasReperibilita) {
          RepeTrasf = 1;
        }

        return {
          id_utente: g.id_utente,
          data: g.data,
          tipo: "lavoro",
          ferie: 0,
          permesso: 0,
          RepeTrasf,
          ora_inizio: g.ora_inizio.toISOString().slice(11, 16),
          pausa_inizio: g.pausa
            ? g.pausa.pausa_inizio.toISOString().slice(11, 16)
            : null,
          pausa_fine: g.pausa
            ? g.pausa.pausa_fine.toISOString().slice(11, 16)
            : null,
          ora_fine: g.ora_fine.toISOString().slice(11, 16)
        };
      });

      // 🔃 Output finale
      res.json([...output, ...groupedOutput]);
    });
  });
});

module.exports = router;
