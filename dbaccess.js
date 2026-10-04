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

// Stato della modalità di manutenzione per ciascun database
const maintenance = {
  is: {
    inMaintenance: false,
    since: null,
    timer: null,
    durationMinutes: 30
  },
  ciesse: {
    inMaintenance: false,
    since: null,
    timer: null,
    durationMinutes: 30
  }
};

async function getPoolIS() {
  if (maintenance.is.inMaintenance) {
    throw new Error("Il database I&S è temporaneamente scollegato per manutenzione/compattazione. Riprovare a breve.");
  }
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
  if (maintenance.ciesse.inMaintenance) {
    throw new Error("Il database CIESSE è temporaneamente scollegato per manutenzione/compattazione. Riprovare a breve.");
  }
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

/**
 * Restituisce una connessione ODBC diretta dal pool (supporta beginTransaction, commit, rollback)
 * NOTA: la connessione deve essere chiusa dal chiamante con conn.close()
 */
async function getRawConnection(azienda) {
  let name = '';
  if (azienda && typeof azienda === 'object') {
    name = (azienda.query && azienda.query.azienda) || 
           (azienda.body && azienda.body.azienda) || 
           (azienda.user && (azienda.user.azienda || azienda.user.idAzienda)) || 
           '';
  } else if (typeof azienda === 'string' || typeof azienda === 'number') {
    name = String(azienda);
  }

  const cleanName = (name || '').toLowerCase().trim();
  const pool = (cleanName === 'ciesse' || cleanName === '2') ? await getPoolCiesse() : await getPoolIS();
  return pool.connect();
}

const fs = require('fs');

/**
 * Scollega il pool ODBC specificato ('is', 'ciesse' o 'all') per consentire la compattazione manuale in Access.
 * Imposta un timer di riapertura automatica (default 30 minuti).
 */
async function disconnectPool(target = 'all', minutes = 30) {
  const tStr = String(target || 'all').toLowerCase();
  const targets = (tStr === 'all') ? ['is', 'ciesse'] : [tStr];
  const results = {};

  for (const t of targets) {
    if (t === 'is') {
      if (maintenance.is.timer) clearTimeout(maintenance.is.timer);
      maintenance.is.inMaintenance = true;
      maintenance.is.since = new Date();
      maintenance.is.durationMinutes = minutes;

      if (poolIS) {
        try {
          await poolIS.close();
          console.log('[ODBC] Pool I&S chiuso per manutenzione');
        } catch (e) {
          console.error('[ODBC] Errore chiusura pool I&S:', e);
        }
      }
      poolIS = null;
      poolPromiseIS = null;

      if (minutes > 0) {
        maintenance.is.timer = setTimeout(() => {
          console.log('[ODBC] Timer manutenzione I&S scaduto. Riapertura automatica...');
          reconnectPool('is').catch(err => console.error('[ODBC] Errore auto-riconnessione I&S:', err));
        }, minutes * 60 * 1000);
      }
      results.is = { status: 'disconnected', minutes };
    } else if (t === 'ciesse') {
      if (maintenance.ciesse.timer) clearTimeout(maintenance.ciesse.timer);
      maintenance.ciesse.inMaintenance = true;
      maintenance.ciesse.since = new Date();
      maintenance.ciesse.durationMinutes = minutes;

      if (poolCiesse) {
        try {
          await poolCiesse.close();
          console.log('[ODBC] Pool CIESSE chiuso per manutenzione');
        } catch (e) {
          console.error('[ODBC] Errore chiusura pool CIESSE:', e);
        }
      }
      poolCiesse = null;
      poolPromiseCiesse = null;

      if (minutes > 0) {
        maintenance.ciesse.timer = setTimeout(() => {
          console.log('[ODBC] Timer manutenzione CIESSE scaduto. Riapertura automatica...');
          reconnectPool('ciesse').catch(err => console.error('[ODBC] Errore auto-riconnessione CIESSE:', err));
        }, minutes * 60 * 1000);
      }
      results.ciesse = { status: 'disconnected', minutes };
    }
  }

  return results;
}

/**
 * Riapre il pool ODBC specificato ('is', 'ciesse' o 'all') terminando la modalità di manutenzione.
 */
async function reconnectPool(target = 'all') {
  const tStr = String(target || 'all').toLowerCase();
  const targets = (tStr === 'all') ? ['is', 'ciesse'] : [tStr];
  const results = {};

  for (const t of targets) {
    if (t === 'is') {
      if (maintenance.is.timer) clearTimeout(maintenance.is.timer);
      maintenance.is.timer = null;
      maintenance.is.inMaintenance = false;
      maintenance.is.since = null;
      try {
        await getPoolIS();
        results.is = { status: 'connected' };
      } catch (err) {
        results.is = { status: 'error', error: err.message };
      }
    } else if (t === 'ciesse') {
      if (maintenance.ciesse.timer) clearTimeout(maintenance.ciesse.timer);
      maintenance.ciesse.timer = null;
      maintenance.ciesse.inMaintenance = false;
      maintenance.ciesse.since = null;
      try {
        await getPoolCiesse();
        results.ciesse = { status: 'connected' };
      } catch (err) {
        results.ciesse = { status: 'error', error: err.message };
      }
    }
  }

  return results;
}

/**
 * Restituisce le statistiche e lo stato del database specificato ('is' o 'ciesse')
 */
function getDbInfo(dbKey) {
  const filePath = (dbKey === 'ciesse') ? pathCiesse : pathIS;
  const laccdbPath = filePath.replace(/\.accdb$/i, '.laccdb');
  const maint = (dbKey === 'ciesse') ? maintenance.ciesse : maintenance.is;
  const isConnected = (dbKey === 'ciesse') ? (poolCiesse !== null) : (poolIS !== null);

  let fileStats = { exists: false };
  let laccdbStats = { exists: false };

  try {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      fileStats = {
        exists: true,
        sizeBytes: stat.size,
        sizeMb: (stat.size / (1024 * 1024)).toFixed(2),
        sizeGb: (stat.size / (1024 * 1024 * 1024)).toFixed(2),
        mtime: stat.mtime
      };
    }
  } catch (e) {
    fileStats = { exists: false, error: e.message };
  }

  try {
    if (fs.existsSync(laccdbPath)) {
      const stat = fs.statSync(laccdbPath);
      laccdbStats = {
        exists: true,
        sizeBytes: stat.size,
        mtime: stat.mtime
      };
    }
  } catch (e) {
    laccdbStats = { exists: false, error: e.message };
  }

  let remainingMinutes = 0;
  if (maint.inMaintenance && maint.since && maint.durationMinutes) {
    const elapsedMs = Date.now() - new Date(maint.since).getTime();
    const remainingMs = (maint.durationMinutes * 60 * 1000) - elapsedMs;
    remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
  }

  return {
    key: dbKey,
    name: (dbKey === 'ciesse') ? 'CIESSE' : 'I&S',
    path: filePath,
    laccdbPath: laccdbPath,
    file: fileStats,
    lock: laccdbStats,
    isLocked: laccdbStats.exists,
    poolConnected: isConnected,
    inMaintenance: maint.inMaintenance,
    maintenanceSince: maint.since,
    durationMinutes: maint.durationMinutes,
    remainingMinutes: remainingMinutes
  };
}

/**
 * Restituisce una panoramica di tutti i database per la dashboard
 */
function getSystemStatus() {
  return {
    timestamp: new Date(),
    serverTime: new Date().toLocaleTimeString('it-IT'),
    databases: {
      is: getDbInfo('is'),
      ciesse: getDbInfo('ciesse')
    }
  };
}

module.exports = {
  getConnection,
  getRawConnection,
  connectionIS,
  connectionCiesse,
  getAziendaConfig,
  getAllAziendeConfig,
  disconnectPool,
  reconnectPool,
  getSystemStatus,
  getDbInfo
};