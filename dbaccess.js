const odbc = require('odbc');

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

// Inizializzazione anticipata dei pool backend
getPoolIS().catch(() => {});
getPoolCiesse().catch(() => {});

// Dizionario anagrafiche e costanti societarie in memoria
const aziendeCostanti = require('./config/aziende.json');

/**
 * Restituisce il dizionario completo di tutte le aziende configurate in memoria
 */
function getAllAziendeConfig() {
  return aziendeCostanti;
}

/**
 * Cerca l'azienda per codice mnemonico ('ies', 'ciesse', 'pratoallarmi'), per ID ('4000', '15000') o per nome.
 * Ritorna l'anagrafica completa con indirizzo, partita IVA, dati bancari, PEC, ecc.
 */
async function getAziendaConfig(nomeAzienda) {
  if (!nomeAzienda) return aziendeCostanti['ies'] || null;
  const target = String(nomeAzienda).trim().toLowerCase();
  
  // 1. Chiave diretta (es. 'ies', 'ciesse', 'pratoallarmi')
  if (aziendeCostanti[target]) {
    return aziendeCostanti[target];
  }

  // 2. Alias frequenti
  if (target === 'i&s' || target === '4000') return aziendeCostanti['ies'];
  if (target === '15000') return aziendeCostanti['ciesse'];

  // 3. Ricerca per idAzienda o match parziale su nome/denominazione
  const entries = Object.values(aziendeCostanti);
  const found = entries.find(a => {
    return String(a.idAzienda) === target ||
           (a.codice && a.codice.toLowerCase() === target) ||
           (a.denominazione && a.denominazione.toLowerCase().includes(target)) ||
           (a.nome && a.nome.toLowerCase().includes(target));
  });

  return found || aziendeCostanti['ies'] || null;
}

/**
 * Restituisce la connessione in base al parametro azienda (stringa/numero o oggetto req).
 * Se 'ciesse' restituisce CIESSE-BASEDATI.accdb, altrimenti fallback su I&S-BASEDATI.accdb.
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

  const cleanName = (name || '').toLowerCase().trim();

  if (cleanName === 'ciesse' || cleanName === '2') {
    return connectionCiesse;
  }
  
  return connectionIS;
}

module.exports = {
  getConnection,
  connectionIS,
  connectionCiesse,
  getAziendaConfig,
  getAllAziendeConfig
};