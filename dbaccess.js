const ADODB = require('node-adodb');

// In local dev, load paths from env or use default fallback. In production, load from env.
const pathIS = process.env.ACCESS_PATH_IS || 'C:\\Users\\simone\\Desktop\\datiditest\\TUTTEBASIDATIATTIVE\\I&S-BASEDATI.accdb';
const pathCiesse = process.env.ACCESS_PATH_CIESSE || 'C:\\Users\\Simone\\Desktop\\datiditest\\TUTTEBASIDATIATTIVE\\CIESSE-BASEDATI.accdb';

const passwordIS = process.env.ACCESS_PASSWORD_IS || 'celinedarma';
const passwordCiesse = process.env.ACCESS_PASSWORD_CIESSE || 'celinedarma';

// Check if 64-bit connection is requested via env (default to false to preserve server setup)
const is64Bit = process.env.ACCESS_64BIT === 'true';
console.log('--- DEBUG ADODB CONFIG ---');
console.log('ACCESS_64BIT env value:', process.env.ACCESS_64BIT);
console.log('Resolved is64Bit:', is64Bit);
console.log('--------------------------');

// 1. Aggiunto "Mode=Share Deny None;" per allentare i blocchi sul file Access
const rawConnectionIS = ADODB.open(`Provider=Microsoft.ACE.OLEDB.16.0;Data Source=${pathIS};Mode=Share Deny None;Persist Security Info=False;Jet OLEDB:Database Password=${passwordIS};`, is64Bit);
const rawConnectionCiesse = ADODB.open(`Provider=Microsoft.ACE.OLEDB.16.0;Data Source=${pathCiesse};Mode=Share Deny None;Persist Security Info=False;Jet OLEDB:Database Password=${passwordCiesse};`, is64Bit);

// 2. Vigile per la Coda (Mutex). Forza Node.js ad eseguire una query Access alla volta.
let dbLock = Promise.resolve();

function safeConnection(adodbConn) {
  return {
    query: (sql) => {
      // Accoda la query attuale finché quella precedente non ha finito
      const p = dbLock.then(() => adodbConn.query(sql));
      // Evita che un errore in una query blocchi per sempre la coda
      dbLock = p.catch(() => {}); 
      return p; // Restituisce la promise originale alla rotta che l'ha chiamata
    },
    execute: (sql) => {
      const p = dbLock.then(() => adodbConn.execute(sql));
      dbLock = p.catch(() => {});
      return p;
    }
  };
}

// Avvolgiamo le connessioni raw nel nostro sistema a coda
const connectionIS = safeConnection(rawConnectionIS);
const connectionCiesse = safeConnection(rawConnectionCiesse);

/**
 * Restituisce la connessione in base al parametro azienda (stringa/numero o oggetto req).
 * Se non viene specificata l'azienda o non corrisponde a 'ciesse', fa fallback su 'I&S'.
 * @param {string|number|object} azienda 
 * @returns {object} Connessione ADODB
 */
function getConnection(azienda) {
  let name = '';
  
  if (azienda && typeof azienda === 'object') {
    // Estrazione da headers, query, body o token JWT (req.user)
    name = azienda.headers['x-azienda'] || 
           azienda.query.azienda || 
           azienda.body.azienda || 
           (azienda.user && (azienda.user.azienda || azienda.user.idAzienda)) || 
           '';
  } else if (typeof azienda === 'string' || typeof azienda === 'number') {
    name = String(azienda);
  }

  // Se 'ciesse' o '2' (immaginando idAzienda = 2), restituisce la connessione CIESSE.
  // Altrimenti fallback su I&S.
  if (name && (name.toLowerCase() === 'ciesse' || name === '2')) {
    return connectionCiesse;
  }
  
  return connectionIS;
}

module.exports = {
  getConnection,
  connectionIS,
  connectionCiesse
};