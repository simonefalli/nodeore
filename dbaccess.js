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

// Pre-initialize both connections at startup
const connectionIS = ADODB.open(`Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${pathIS};Persist Security Info=False;Jet OLEDB:Database Password=${passwordIS};`, is64Bit);
const connectionCiesse = ADODB.open(`Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${pathCiesse};Persist Security Info=False;Jet OLEDB:Database Password=${passwordCiesse};`, is64Bit);

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