const odbc = require('odbc');

// In local dev, load paths from env or use default fallback. In production, load from env.
const pathIS = process.env.ACCESS_PATH_IS || 'C:\\Users\\simone\\Desktop\\datiditest\\TUTTEBASIDATIATTIVE\\I&S-BASEDATI.accdb';
const pathCiesse = process.env.ACCESS_PATH_CIESSE || 'C:\\Users\\Simone\\Desktop\\datiditest\\TUTTEBASIDATIATTIVE\\CIESSE-BASEDATI.accdb';

const passwordIS = process.env.ACCESS_PASSWORD_IS || 'celinedarma';
const passwordCiesse = process.env.ACCESS_PASSWORD_CIESSE || 'celinedarma';

const connStrIS = `Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=${pathIS};Uid=Admin;Pwd=${passwordIS};`;
const connStrCiesse = `Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=${pathCiesse};Uid=Admin;Pwd=${passwordCiesse};`;

console.log('--- ODBC ACCESS CONFIG ---');
console.log('Path I&S:', pathIS);
console.log('Path Ciesse:', pathCiesse);
console.log('--------------------------');

let poolIS = null;
let poolPromiseIS = null;
let poolCiesse = null;
let poolPromiseCiesse = null;

async function getPoolIS() {
  if (poolIS) return poolIS;
  if (!poolPromiseIS) {
    poolPromiseIS = odbc.pool(connStrIS)
      .then(p => {
        poolIS = p;
        console.log('[ODBC] Pool I&S connesso con successo');
        return p;
      })
      .catch(err => {
        poolPromiseIS = null;
        console.error('[ODBC] Errore connessione pool I&S:', err.message || err);
        throw err;
      });
  }
  return poolPromiseIS;
}

async function getPoolCiesse() {
  if (poolCiesse) return poolCiesse;
  if (!poolPromiseCiesse) {
    poolPromiseCiesse = odbc.pool(connStrCiesse)
      .then(p => {
        poolCiesse = p;
        console.log('[ODBC] Pool CIESSE connesso con successo');
        return p;
      })
      .catch(err => {
        poolPromiseCiesse = null;
        console.error('[ODBC] Errore connessione pool CIESSE:', err.message || err);
        throw err;
      });
  }
  return poolPromiseCiesse;
}

// Inizializzazione anticipata dei pool in background all'avvio
getPoolIS().catch(() => {});
getPoolCiesse().catch(() => {});

function createConnectionWrapper(getPool) {
  return {
    query: async (sql) => {
      const pool = await getPool();
      return pool.query(sql);
    },
    execute: async (sql) => {
      const pool = await getPool();
      return pool.query(sql);
    }
  };
}

const connectionIS = createConnectionWrapper(getPoolIS);
const connectionCiesse = createConnectionWrapper(getPoolCiesse);

/**
 * Restituisce la connessione in base al parametro azienda (stringa/numero o oggetto req).
 * Se non viene specificata l'azienda o non corrisponde a 'ciesse', fa fallback su 'I&S'.
 * @param {string|number|object} azienda 
 * @returns {object} Connessione ODBC
 */
function getConnection(azienda) {
  let name = '';
  
  if (azienda && typeof azienda === 'object') {
    // Estrazione da headers, query, body o token JWT (req.user)
    name = (azienda.headers && azienda.headers['x-azienda']) || 
           (azienda.query && azienda.query.azienda) || 
           (azienda.body && azienda.body.azienda) || 
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