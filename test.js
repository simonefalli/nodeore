const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const dbaccess = require('./dbaccess');

async function eseguiTest() {
  console.log('--- TEST CONNESSIONE DBACCESS (ODBC) ---');
  const t0 = Date.now();
  try {
    const connIS = dbaccess.connectionIS;
    console.log("Tentativo di esecuzione query su I&S...");
    
    const t1 = Date.now();
    const r1 = await connIS.query('SELECT TOP 1 [NUMERO IMPIANTO], [NOME] FROM [P-07-T-IMPIANTI]');
    console.log(`✅ Query 1 (impianti) completata in: ${((Date.now() - t1) / 1000).toFixed(3)}s`);
    console.log('   Risultato:', r1[0]);

    const t2 = Date.now();
    const r2 = await connIS.query('SELECT TOP 1 [IDORDINE] FROM [B-05-T-ORDINI]');
    console.log(`✅ Query 2 (ordini) completata in: ${((Date.now() - t2) / 1000).toFixed(3)}s`);
    console.log('   Risultato:', r2[0]);

    const t3 = Date.now();
    const r3 = await connIS.query("SELECT [Q-01-T-COMUNICAZIONIDAGESTIRE].[NUMEROIMPIANTO], [Q-01-T-COMUNICAZIONIDAGESTIRE].[NUMEROCOMUNICAZIONE], [Q-01-T-COMUNICAZIONIDAGESTIRE].[NOMECLIENTE] FROM [Q-01-T-COMUNICAZIONIDAGESTIRE] WHERE LCASE([Q-01-T-COMUNICAZIONIDAGESTIRE].[NOMECLIENTE]) LIKE '%bartoli%'");
    console.log(`✅ Query 3 (manutenzioniengie) completata in: ${((Date.now() - t3) / 1000).toFixed(3)}s`);
    console.log('   Trovati record:', r3.length);

    console.log('----------------------------------------');
    console.log(`✅ TUTTO RIUSCITO in: ${((Date.now() - t0) / 1000).toFixed(3)}s`);
  } catch (error) {
    console.error("❌ ERRORE DURANTE LA CONNESSIONE:");
    console.error(error);
  }
}

eseguiTest();