const odbc = require('odbc');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pathIS = process.env.ACCESS_PATH_IS || 'C:\\TUTTEBASIDATIATTIVE\\BASIDATI\\I&S-BASEDATI.accdb';
const passwordIS = process.env.ACCESS_PASSWORD_IS || 'celinedarma';

const connectionString = `Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=${pathIS};Uid=Admin;Pwd=${passwordIS};`;

async function run() {
  console.log('--- TEST CONNESSIONE NATIVA ODBC A 64-BIT ---');
  console.log('Percorso Database:', pathIS);
  console.log('---------------------------------------------');

  const t0 = Date.now();
  try {
    console.log('Tentativo di connessione con Microsoft Access Driver (ODBC)...');
    const connection = await odbc.connect(connectionString);
    console.log(`✅ Connessione stabilita in: ${((Date.now() - t0) / 1000).toFixed(3)}s`);

    // Test 1: Query impianti
    const t1 = Date.now();
    const r1 = await connection.query('SELECT TOP 1 [NUMERO IMPIANTO], [NOME] FROM [P-07-T-IMPIANTI]');
    console.log(`⚡ Query 1 (impianti) completata in: ${((Date.now() - t1) / 1000).toFixed(3)}s`);
    console.log('   Risultato:', r1[0]);

    // Test 2: Query ordini (immediatamente dopo, per testare la concorrenza)
    const t2 = Date.now();
    const r2 = await connection.query('SELECT TOP 1 [IDORDINE] FROM [B-05-T-ORDINI]');
    console.log(`⚡ Query 2 (ordini) completata in: ${((Date.now() - t2) / 1000).toFixed(3)}s`);
    console.log('   Risultato:', r2[0]);

    // Test 3: Query manutenzioniengie reale
    const t3 = Date.now();
    const r3 = await connection.query("SELECT [Q-01-T-COMUNICAZIONIDAGESTIRE].[NUMEROIMPIANTO], [Q-01-T-COMUNICAZIONIDAGESTIRE].[NUMEROCOMUNICAZIONE], [Q-01-T-COMUNICAZIONIDAGESTIRE].[NOMECLIENTE] FROM [Q-01-T-COMUNICAZIONIDAGESTIRE] WHERE LCASE([Q-01-T-COMUNICAZIONIDAGESTIRE].[NOMECLIENTE]) LIKE '%bartoli%'");
    console.log(`⚡ Query 3 (manutenzioniengie) completata in: ${((Date.now() - t3) / 1000).toFixed(3)}s`);
    console.log('   Trovati record:', r3.length);

    // Test 4: Query ordiniaperti reale
    const t4 = Date.now();
    const r4 = await connection.query('SELECT IDORDINE, [ID IMPIANTO], ESEGUITO, ANNULLATOIL FROM [B-05-T-ORDINI] WHERE [ID IMPIANTO] = 10334');
    console.log(`⚡ Query 4 (ordiniaperti) completata in: ${((Date.now() - t4) / 1000).toFixed(3)}s`);
    console.log('   Trovati record:', r4.length);

    await connection.close();
    console.log('---------------------------------------------');
    console.log(`✅ TUTTI I TEST COMPLETATI in: ${((Date.now() - t0) / 1000).toFixed(3)}s (totale)`);
  } catch (err) {
    console.error('❌ Errore durante il test ODBC:');
    console.error(err);
  }
}

run();
