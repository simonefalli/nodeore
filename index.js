require('dotenv').config();
const express = require("express");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const mysql = require("mysql");
const app = express();
const cors = require("cors");
//const morgan = require('morgan'); // da usare per debug
const pool = require("./db");
const cron = require("node-cron");
const { aggiornaDb } = require("./aggiornaDb");


const apiRoutes = require("./routes/prova/api");
const utentiRoutes = require("./routes/utenti/utenti");
const utentiAttiviRoutes = require("./routes/utenti/utentiattivi");
const utentiLiberaRoutes = require("./routes/utenti/utentilibera");
const loginRoutes = require("./routes/login/login");
const oredelgiornoRoutes = require("./routes/ore/oredelgiorno");
const oredelmesebasilicoRoutes = require("./routes/ore/oredelmesebasilico");
const oreRoutes = require("./routes/ore/ore");
const cantieriRoutes = require("./routes/cantieri/cantieri");
const cantieriAttiviRoutes = require("./routes/cantieri/cantieriattivi");
const impiantiRoutes = require("./routes/impianti/impianti");
const chiamateRoutes = require("./routes/chiamate/chiamate");
const getchiamatasingola = require("./routes/chiamate/getchiamatasingola");
const uploadRoutes = require("./routes/rimborsi/upload");
const manutenzionEngie = require("./routes/prova/manutenzioniengie");
const chiamatesuimpianti = require("./routes/prova/chiamatesuimpianti");
const chiudichiamatadaphp = require("./routes/chiamate/chiudichiamatadaphp");
const aggiornaDbRoute = require("./routes/aggiornaDbRoute");
const ordiniRoute = require('./routes/ordini/ordini');
app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); //qui
//app.use(morgan('combined')); // da usare per debug

app.use("/api", apiRoutes);
app.use("/utenti", utentiRoutes);
app.use("/utentiattivi", utentiAttiviRoutes);
app.use("/utentilibera", utentiLiberaRoutes);
app.use("/cantieri", cantieriRoutes);
app.use("/cantieriattivi", cantieriAttiviRoutes);
app.use("/login", loginRoutes);
app.use("/oredelgiorno", oredelgiornoRoutes);
app.use("/oredelmesebasilico", oredelmesebasilicoRoutes);
app.use("/ore", oreRoutes);
app.use("/impianti", impiantiRoutes);
app.use("/chiamate", chiamateRoutes);
app.use("/getchiamatasingola", getchiamatasingola);
app.use("/upload", uploadRoutes);
app.use("/manutenzioniengie", manutenzionEngie);
app.use("/chiamatesuimpianti", chiamatesuimpianti);
app.use("/chiudichiamatadaphp", chiudichiamatadaphp);
app.use("/aggiorna", aggiornaDbRoute);
app.use("/ordini" , ordiniRoute);
/*

app.post('/upload', upload.single('photo'), (req, res ,next) => {
  const file = req.file;

  if(!file){
    const error = new Error('Please upload a file');
    error.httStatusCode = 400
    return next(error);
  }

  res.send(file);
});

*/
app.use(bodyParser.urlencoded({ extended: true }));
//app.set('case sensitive routing', true);

const PORT = process.env.PORT || 5000;
app.listen(PORT, (req, res) => {
  console.log("Avvio del server sulla porta " + PORT);

  // Esegue aggiornaDb() ogni giorno alle 23:00
  cron.schedule("0 21 * * *", async () => {
    console.log("Esecuzione aggiornaDb() programmata alle 23:00");
    try {
      await aggiornaDb();
      console.log("Aggiornamento database completato con successo per entrambe le aziende");
    } catch (err) {
      console.error("Errore nell’aggiornamento programmato:", err);
    }
  });
});
