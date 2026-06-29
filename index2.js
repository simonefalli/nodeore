const express = require('express');
const app = express();
const ADODB = require('node-adodb');
const cors = require('cors');

//const connection = ADODB.open('Provider=Microsoft.ACE.OLEDB.12.0;Data Source=C:\\TUTTEBASIDATIATTIVE\\I&S-BASEDATI.accdb;Persist Security Info=False;Jet OLEDB:Database Password=celinedarma;');
const connection = ADODB.open('Provider=Microsoft.ACE.OLEDB.12.0;Data Source=C:\\Users\\simone\\Desktop\\Lavoro\\TUTTEBASIDATIATTIVE\\I&S-BASEDATI.accdb;Persist Security Info=False;Jet OLEDB:Database Password=celinedarma;');
app.use(express.json());
app.use(cors());

// Rotta per ottenere tutti i dati
app.get('/api/dati', (req, res) => {
  connection
    .query('SELECT top 100 * FROM [P-07-T-IMPIANTI];')
    .then(data => {
      res.json(data);
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: 'Errore nell\'esecuzione della query' });
    });
});

// Rotta per ottenere un dato specifico
app.get('/api/dati/:id', (req, res) => {
  const id = req.params.id;
 
  const query = 'SELECT * FROM [P-07-T-IMPIANTI] WHERE [NUMERO IMPIANTO] = ' + id;


  connection
    .query(query)
    .then(data => {
      res.json(data[0]); // Restituisce solo il primo risultato (se presente)
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: 'Errore nell\'esecuzione della query' });
    });
});



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
});
