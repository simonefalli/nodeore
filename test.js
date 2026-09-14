const ADODB = require('node-adodb');
const path = require('path');

// Forza esplicitamente l'uso del motore a 64-bit di Windows
ADODB.PATH = 'C:\\Windows\\System32\\cscript.exe';

// Percorso assoluto al file di test appena creato
const dbPath = path.join(__dirname, 'test.accdb');

// Stringa di connessione (Driver 16.0 a 64-bit, niente password)
const connectionString = `Provider=Microsoft.ACE.OLEDB.16.0;Data Source=${dbPath};Persist Security Info=False;`;

console.log('--- TEST CONNESSIONE NODE-ADODB ---');
console.log('Percorso DB:', dbPath);
console.log('Eseguibile CScript:', ADODB.PATH);
console.log('-----------------------------------');

const connection = ADODB.open(connectionString , true);

async function eseguiTest() {
  try {
    console.log("Tentativo di connessione e lettura dello schema...");
    
    // Il numero 20 indica 'adSchemaTables', interroga il DB per avere la lista delle tabelle
    // È il metodo più sicuro per testare la connessione senza sapere i nomi delle tabelle
    const tables = await connection.schema(20); 
    
    console.log("✅ CONNESSIONE RIUSCITA!");
    console.log(`✅ Il motore OLE DB a 64-bit ha letto il file correttamente.`);
    console.log(`Trovate ${tables.length} tabelle di sistema/utente nel database.`);
    
  } catch (error) {
    console.error("❌ ERRORE DURANTE LA CONNESSIONE:");
    console.error(error);
  }
}

eseguiTest();