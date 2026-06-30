const express = require('express');
const router = express.Router();
const { aggiornaDb, getProgress } = require('../aggiornaDb');

// Avvia l’aggiornamento
router.get('/start', async (req, res) => {
  try {
    console.log('aggiornadb');
    aggiornaDb(); // non uso await -> parte in background e aggiorna entrambe le aziende
    res.json({ message: 'Aggiornamento avviato' });
  } catch (err) {
    console.error('Errore aggiornamento DB:', err);
    res.status(500).json({ message: 'Errore aggiornamento DB' });
  }
});

// Restituisce la percentuale
router.get('/progress', (req, res) => {
  res.json({ progress: getProgress() });
});

module.exports = router;
