const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const odbc = require('odbc');

// Cache dei pool ODBC aperti per (filePath + password)
const poolsCache = new Map();

/**
 * Ottiene o crea un pool di connessione ODBC per il file Access specificato
 */
async function getPool(filePath, password) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Percorso file database non specificato');
  }

  const normalizedPath = path.normalize(filePath.trim());
  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`Il file specificato non esiste: ${normalizedPath}`);
  }

  const pwd = password ? String(password) : '';
  const cacheKey = `${normalizedPath.toLowerCase()}|${pwd}`;

  if (poolsCache.has(cacheKey)) {
    return poolsCache.get(cacheKey);
  }

  const connStr = `Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=${normalizedPath};Uid=Admin;Pwd=${pwd};`;
  
  try {
    const pool = await odbc.pool({
      connectionString: connStr,
      connectionTimeout: 15,
      loginTimeout: 10,
      reuseConnection: true,
      maxSize: 6
    });

    // Test rapido di query per validare password e file
    await pool.query('SELECT 1');

    poolsCache.set(cacheKey, pool);
    return pool;
  } catch (err) {
    throw new Error(`Errore di connessione ad Access: ${err.message}`);
  }
}

// Mappatura delle categorie per prefisso tabelle Access
const PREFIX_CATEGORIES = {
  'A': 'Trattative e Preventivi Commerciali',
  'A1': 'Formazione e Tutorato',
  'A2': 'Normative CEI',
  'A3': 'Piani Formativi',
  'A4': 'Apprendimenti',
  'A5': 'Procedure Interne',
  'B': 'Ordini Clienti e Gestione Lavori',
  'C': 'Magazzino, Articoli e Ordini Fornitori',
  'C1': 'Fatturazione Elettronica XML',
  'D': 'Fornitori, Schedario Personale e Fatture Passive',
  'F': 'Fatturazione Attiva, Note Credito e Fatture Elettroniche',
  'G': 'Incassi, Modalità Pagamento, Crediti a Perdita e Sopravvenienze',
  'H': 'Telefonate e Comunicazioni Esterne',
  'I': 'Banche, Movimenti Bancari, Saldi e Conti Correnti',
  'J': 'Cespiti, Spese, Budget e Ripartizioni Economiche',
  'L': 'Contratti, Pratiche Legali, Avvocato e Cessioni',
  'M': 'RID e Disposizioni Bancarie SEPA',
  'N': 'Controllo Dipendenti, Ore Lavoro e Costi Addetti',
  'P': 'Clienti, Impianti, Sistemi, Centrali e Dichiarazioni Conformità',
  'Q': 'Comunicazioni da Gestire e Storico Chiamate Tecniche',
  'R': 'Lettere, Solleciti e Documenti FLR',
  'S': 'Log di Sistema, Scheduling e Comunicazioni Interne',
  'S1': 'Attività Periodiche, Appuntamenti e Circolari',
  'S2': 'Regali di Natale e Varie',
  'T': 'Assegnazioni e Trattative',
  'U': 'Automezzi, Beni Strumentali e Chilometri',
  'V': 'Servizi di Vigilanza, Ronde, GPG e Pattuglie',
  'W': 'Clienti Potenziali, Imprese Edili e Mailing List',
  'X': 'Tabelle di Configurazione (CAP, Comuni, Province, ABI/CAB, Aliquote, Sistemi, Tipi Impianto)',
  'Y': 'Proprietari Fondo e Immobili',
  'Z': 'Manuali e Documentazione Tecnica'
};

/**
 * Valida che il nome tabella sia sicuro contro SQL injection
 */
function sanitizeTableName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Nome tabella non valido');
  }
  const clean = name.trim();
  // Solo caratteri ammessi per nomi tabelle Access
  if (!/^[a-zA-Z0-9_\-\.\s\[\]àèéìòùÀÈÉÌÒÙ]+$/.test(clean)) {
    throw new Error('Nome tabella contiene caratteri non ammessi');
  }
  // Vietate parole chiave pericolose
  if (/\b(DROP|ALTER|DELETE|UPDATE|INSERT|TRUNCATE|EXEC|SHUTDOWN)\b/i.test(clean)) {
    throw new Error('Operazione non consentita: sola lettura attiva');
  }
  return clean.replace(/[\[\]]/g, '');
}

/**
 * POST /databrowser/connect
 * Testa la connessione ad un file Access con password e restituisce l'elenco delle tabelle
 */
router.post('/connect', async (req, res) => {
  try {
    const { filePath, password } = req.body;
    const pool = await getPool(filePath, password);
    const conn = await pool.connect();
    let userTables = [];
    try {
      const rawTables = await conn.tables(null, null, null, 'TABLE');
      userTables = rawTables
        .map(t => t.TABLE_NAME)
        .filter(name => name && !name.startsWith('MSys') && !name.startsWith('~'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    } finally {
      await conn.close();
    }

    const formattedTables = userTables.map(t => {
      const match = t.match(/^([A-Z][0-9]?)-/);
      const prefix = match ? match[1] : 'ALTRO';
      const category = PREFIX_CATEGORIES[prefix] || 'Altre tabelle';
      return {
        name: t,
        prefix,
        category
      };
    });

    res.json({
      success: true,
      filePath: path.normalize(filePath),
      totalTables: formattedTables.length,
      tables: formattedTables
    });
  } catch (err) {
    console.error('[DATABROWSER] Errore connessione:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /databrowser/columns
 * Restituisce i dettagli delle colonne della tabella indicata
 */
router.post('/columns', async (req, res) => {
  try {
    const { filePath, password, tableName } = req.body;
    const cleanTable = sanitizeTableName(tableName);
    const pool = await getPool(filePath, password);
    const conn = await pool.connect();
    let formattedCols = [];
    try {
      const cols = await conn.columns(null, null, cleanTable, null);
      formattedCols = cols.map(c => ({
        name: c.COLUMN_NAME,
        type: c.TYPE_NAME,
        size: c.COLUMN_SIZE,
        nullable: c.NULLABLE === 1
      }));
    } finally {
      await conn.close();
    }

    res.json({
      success: true,
      tableName: cleanTable,
      columns: formattedCols
    });
  } catch (err) {
    console.error('[DATABROWSER] Errore recupero colonne:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /databrowser/query
 * Esegue una query paginata in sola lettura con ricerca e ordinamento
 */
router.post('/query', async (req, res) => {
  const startTime = Date.now();
  try {
    const {
      filePath,
      password,
      tableName,
      page = 1,
      limit = 50,
      search = '',
      sortColumn = '',
      sortDirection = 'ASC'
    } = req.body;

    const cleanTable = sanitizeTableName(tableName);
    const pool = await getPool(filePath, password);

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));

    // Recupera colonne della tabella per verifica e ricerca
    const conn = await pool.connect();
    let allColumnNames = [];
    let textColumnNames = [];
    try {
      const rawCols = await conn.columns(null, null, cleanTable, null);
      allColumnNames = rawCols.map(c => c.COLUMN_NAME);
      textColumnNames = rawCols.filter(c => {
        const tn = (c.TYPE_NAME || '').toLowerCase();
        return tn.includes('char') || tn.includes('text') || tn.includes('varchar');
      }).map(c => c.COLUMN_NAME);
    } finally {
      await conn.close();
    }

    // Costruzione clausola WHERE per ricerca
    let whereClause = '';
    const cleanSearch = String(search || '').trim();
    if (cleanSearch !== '') {
      const escapedSearch = cleanSearch.replace(/'/g, "''");
      const searchCols = textColumnNames.length > 0 ? textColumnNames : allColumnNames.slice(0, 10);
      const orConditions = searchCols.map(col => `[${col}] LIKE '%${escapedSearch}%'`);
      if (orConditions.length > 0) {
        whereClause = `WHERE (${orConditions.join(' OR ')})`;
      }
    }

    // Costruzione clausola ORDER BY
    let orderClause = '';
    if (sortColumn && allColumnNames.includes(sortColumn)) {
      const dir = String(sortDirection).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      orderClause = `ORDER BY [${sortColumn}] ${dir}`;
    }

    // 1. Conteggio totale record
    const countSql = `SELECT COUNT(*) AS totalRows FROM [${cleanTable}] ${whereClause}`;
    const countRes = await pool.query(countSql);
    const totalRows = countRes && countRes[0] ? parseInt(countRes[0].totalRows, 10) || 0 : 0;
    const totalPages = Math.ceil(totalRows / pageSize) || 1;

    // 2. Estrazione dati paginati
    let rows = [];
    if (totalRows > 0) {
      const maxRowsToFetch = Math.min(totalRows, currentPage * pageSize);
      const dataSql = `SELECT TOP ${maxRowsToFetch} * FROM [${cleanTable}] ${whereClause} ${orderClause}`;
      const allFetched = await pool.query(dataSql);
      
      const startIndex = (currentPage - 1) * pageSize;
      rows = allFetched.slice(startIndex, startIndex + pageSize);
    }

    const executionTimeMs = Date.now() - startTime;

    res.json({
      success: true,
      tableName: cleanTable,
      columns: allColumnNames,
      rows: rows,
      page: currentPage,
      limit: pageSize,
      totalRows: totalRows,
      totalPages: totalPages,
      executionTimeMs: executionTimeMs
    });
  } catch (err) {
    console.error('[DATABROWSER] Errore query:', err.message);
    res.status(400).json({
      success: false,
      error: err.message,
      executionTimeMs: Date.now() - startTime
    });
  }
});

/**
 * POST /databrowser/export
 * Esporta i dati della tabella in formato CSV
 */
router.post('/export', async (req, res) => {
  try {
    const { filePath, password, tableName, search = '' } = req.body;
    const cleanTable = sanitizeTableName(tableName);
    const pool = await getPool(filePath, password);

    // Recupera colonne
    const conn = await pool.connect();
    let allColumnNames = [];
    let textColumnNames = [];
    try {
      const rawCols = await conn.columns(null, null, cleanTable, null);
      allColumnNames = rawCols.map(c => c.COLUMN_NAME);
      textColumnNames = rawCols.filter(c => {
        const tn = (c.TYPE_NAME || '').toLowerCase();
        return tn.includes('char') || tn.includes('text') || tn.includes('varchar');
      }).map(c => c.COLUMN_NAME);
    } finally {
      await conn.close();
    }

    // Ricerca opzionale
    let whereClause = '';
    const cleanSearch = String(search || '').trim();
    if (cleanSearch !== '') {
      const escapedSearch = cleanSearch.replace(/'/g, "''");
      const searchCols = textColumnNames.length > 0 ? textColumnNames : allColumnNames.slice(0, 10);
      whereClause = `WHERE (${searchCols.map(c => `[${c}] LIKE '%${escapedSearch}%'`).join(' OR ')})`;
    }

    // Limite di sicurezza export: 25.000 righe
    const sql = `SELECT TOP 25000 * FROM [${cleanTable}] ${whereClause}`;
    const rows = await pool.query(sql);

    // Costruzione CSV con separatore punto e virgola
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      let s = String(val).replace(/"/g, '""');
      if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s}"`;
      }
      return s;
    };

    const csvLines = [];
    // Intestazione colonne
    csvLines.push(allColumnNames.map(escapeCsv).join(';'));

    // Righe
    rows.forEach(row => {
      const line = allColumnNames.map(col => escapeCsv(row[col])).join(';');
      csvLines.push(line);
    });

    const csvContent = '\uFEFF' + csvLines.join('\r\n'); // BOM UTF-8 per Excel

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${cleanTable}_export.csv"`);
    res.send(csvContent);
  } catch (err) {
    console.error('[DATABROWSER] Errore export:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
