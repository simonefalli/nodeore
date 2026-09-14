const ADODB = require('node-adodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const is64Bit = process.env.ACCESS_64BIT !== 'false';
const pathIS = process.env.ACCESS_PATH_IS || 'C:\\Users\\simone\\Desktop\\datiditest\\TUTTEBASIDATIATTIVE\\I&S-BASEDATI.accdb';
const passwordIS = process.env.ACCESS_PASSWORD_IS || 'celinedarma';

async function testConfig(name, connStr) {
  console.log(`\n========================================`);
  console.log(`Test: ${name}`);
  console.log(`========================================`);
  const conn = ADODB.open(connStr, is64Bit);

  const t0 = Date.now();
  try {
    const q1Start = Date.now();
    await conn.query("SELECT TOP 1 [NUMERO IMPIANTO] FROM [P-07-T-IMPIANTI]");
    const q1Time = (Date.now() - q1Start) / 1000;
    console.log(`  Query 1: completata in ${q1Time}s`);

    // Piccola pausa di 200ms
    await new Promise(r => setTimeout(r, 200));

    const q2Start = Date.now();
    await conn.query("SELECT TOP 1 [IDORDINE] FROM [B-05-T-ORDINI]");
    const q2Time = (Date.now() - q2Start) / 1000;
    console.log(`  Query 2: completata in ${q2Time}s`);

    console.log(`  --> Tempo totale: ${(Date.now() - t0) / 1000}s`);
  } catch (err) {
    console.error(`  ❌ Errore:`, err.process || err.message || err);
  }
}

async function run() {
  console.log('Avvio benchmark configurazioni OLE DB Access su:', pathIS);
  console.log('Modalità 64-bit:', is64Bit);

  // 1. Configurazione attuale
  const c1 = `Provider=Microsoft.ACE.OLEDB.16.0;Data Source=${pathIS};Mode=Share Deny None;Persist Security Info=False;Jet OLEDB:Database Password=${passwordIS};`;
  await testConfig('1. Attuale (Default Page-Level Locking)', c1);

  await new Promise(r => setTimeout(r, 1000));

  // 2. Con Database Locking Mode = 1 (Record-level locking)
  const c2 = `Provider=Microsoft.ACE.OLEDB.16.0;Data Source=${pathIS};Mode=Share Deny None;Jet OLEDB:Database Locking Mode=1;Persist Security Info=False;Jet OLEDB:Database Password=${passwordIS};`;
  await testConfig('2. Con Jet OLEDB:Database Locking Mode=1', c2);

  await new Promise(r => setTimeout(r, 1000));

  // 3. Con Locking Mode = 1 + OLE DB Services = -4 (Disabilita pooling/leasing residuo)
  const c3 = `Provider=Microsoft.ACE.OLEDB.16.0;Data Source=${pathIS};Mode=Share Deny None;Jet OLEDB:Database Locking Mode=1;OLE DB Services=-4;Persist Security Info=False;Jet OLEDB:Database Password=${passwordIS};`;
  await testConfig('3. Con Locking Mode=1 + OLE DB Services=-4', c3);
}

run();
