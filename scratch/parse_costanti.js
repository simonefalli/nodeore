const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../costanti'), 'utf-8');
const lines = content.split(/\r?\n/);

const companies = {
  1000: { key: 'pratoallarmi', suffixes: ['PRATOALLARMI', 'pratoallarmi'] },
  2000: { key: 'sentinel', suffixes: ['SENTINEL', 'sentinel'] },
  3000: { key: 'edison', suffixes: ['EDISON', 'edison'] },
  4000: { key: 'ies', suffixes: ['IES', 'ies'] },
  5000: { key: 'sentinelvigilanza', suffixes: ['SENTINELVIGILANZA', 'SENTINELvigilanza', 'sentinelvigilanza'] },
  6000: { key: 'valdelsaallarmi', suffixes: ['VALDELSAALLARMI', 'valdelsaallarmi'] },
  7000: { key: 'vigilanzatoscana', suffixes: ['VIGILANZATOSCANA', 'vigilanzatoscana'] },
  8000: { key: 'areavigilanza', suffixes: ['AREAVIGILANZA', 'areavigilanza'] },
  9000: { key: 'pratopol', suffixes: ['PRATOPOL', 'pratopol'] },
  10000: { key: 'pratoallarmiced', suffixes: ['PRATOALLARMICED', 'pratoallarmiCED', 'pratoallarmiced'] },
  11000: { key: 'sistemiesicurezza', suffixes: ['SISTEMIESICUREZZA', 'SISTEMI E SICUREZZA', 'sistemiesicurezza'] },
  13000: { key: 'toninelli', suffixes: ['TONINELLI', 'toninelli'] },
  14000: { key: 'caratelli', suffixes: ['CARATELLI', 'caratelli'] },
  15000: { key: 'ciesse', suffixes: ['CIESSE', 'ciesse'] },
  16000: { key: 'toscanaallarmievigilanza', suffixes: ['TOSCANAALLARMIEVIGILANZA', 'toscanaallarmievigilanza'] }
};

// Also map by key
const byKey = {};
for (const [id, c] of Object.entries(companies)) {
  byKey[c.key] = {
    idAzienda: parseInt(id, 10),
    codice: c.key,
    ...c
  };
}

// Prefix mappings to property names
const prefixMap = {
  'DENOMINAZIONEIMPRESA': 'denominazione',
  'NOMEIMPRESA': 'nome',
  'LEGALERAPPRESENTANTE': 'legaleRappresentante',
  'CODIFEFISCALELEGALERAPPRESENTANTE': 'cfLegaleRappresentante',
  'CUC': 'cuc',
  'SEDEIMPRESA': 'sede',
  'DESTINAZIONEMERCE': 'destinazioneMerce',
  'VIA': 'via',
  'CIVICO': 'civico',
  'COMUNE': 'comune',
  'PROVINCIA': 'provincia',
  'CAP': 'cap',
  'ATTIVITA': 'attivita',
  'TELEFONO': 'telefono',
  'FAX': 'fax',
  'PARTITAIVA': 'partitaIva',
  'CF': 'codiceFiscale',
  'REGISTRODITTE': 'registroDitte',
  'UFFICIOREGISTRODITTE': 'ufficioRegistroDitte',
  'NUMEROREAREGISTRODITTE': 'numeroRea',
  'CAPITALESOCIALE': 'capitaleSociale',
  'SOCIOUNICO': 'socioUnico',
  'LIQUIDAZIONE': 'liquidazione',
  'ISCRIZIONETRIBUNALE': 'iscrizioneTribunale',
  'CCIAA': 'cciaa',
  'ALBOPROVINCIALE': 'alboProvinciale',
  'DATIBANCARI': 'datiBancari',
  'IBAN': 'iban',
  'NOMEBANCA': 'nomeBanca',
  'CC': 'contoCorrente',
  'CAB': 'cab',
  'CODABI': 'abi',
  'CODICEMITTENTE': 'codiceMittente',
  'CODICESDI': 'codiceSDI',
  'EMAIL': 'email',
  'PEC': 'pec',
  'SITO': 'sito'
};

const result = {};
for (const [id, info] of Object.entries(companies)) {
  result[info.key] = {
    idAzienda: parseInt(id, 10),
    codice: info.key,
    denominazione: '',
    nome: '',
    legaleRappresentante: '',
    cfLegaleRappresentante: '',
    cuc: '',
    sede: '',
    destinazioneMerce: '',
    via: '',
    civico: '',
    comune: '',
    cap: '',
    provincia: '',
    attivita: '',
    telefono: '',
    fax: '',
    partitaIva: '',
    codiceFiscale: '',
    registroDitte: '',
    ufficioRegistroDitte: '',
    numeroRea: '',
    capitaleSociale: 0,
    socioUnico: 'NO',
    liquidazione: 'NO',
    iscrizioneTribunale: '',
    cciaa: '',
    alboProvinciale: '',
    datiBancari: '',
    iban: '',
    nomeBanca: '',
    contoCorrente: '',
    cab: '',
    abi: '',
    codiceMittente: '',
    codiceSDI: '',
    email: '',
    pec: '',
    sito: ''
  };
}

for (const rawLine of lines) {
  let line = rawLine.trim();
  // Strip trailing comments
  const commentIdx = line.indexOf("'");
  // Be careful if apostrophe is inside quotes
  // Check if line matches Const
  const m = line.match(/^(?:Global|Public)?\s*Const\s+([A-Za-z0-9_]+)\s*=\s*(.+)$/i);
  if (!m) continue;

  const varName = m[1];
  let rawVal = m[2].trim();

  // If there's an inline comment outside of quotes
  let inQuote = false;
  let cleanVal = '';
  for (let i = 0; i < rawVal.length; i++) {
    const ch = rawVal[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === "'" && !inQuote) break;
    cleanVal += ch;
  }
  cleanVal = cleanVal.trim();
  if (cleanVal.startsWith('"') && cleanVal.endsWith('"')) {
    cleanVal = cleanVal.slice(1, -1);
  }

  // Find which company and which prefix this belongs to
  const upperVar = varName.toUpperCase();

  // Match company suffix
  let matchedComp = null;
  let matchedPrefix = null;

  for (const [id, comp] of Object.entries(companies)) {
    for (const suff of comp.suffixes) {
      if (upperVar.endsWith(suff.toUpperCase())) {
        const potentialPrefix = upperVar.slice(0, -suff.length);
        if (prefixMap[potentialPrefix]) {
          matchedComp = comp.key;
          matchedPrefix = prefixMap[potentialPrefix];
          break;
        }
      }
    }
    if (matchedComp) break;
  }

  if (matchedComp && matchedPrefix) {
    let finalVal = cleanVal;
    if (matchedPrefix === 'capitaleSociale') {
      finalVal = parseFloat(cleanVal) || 0;
    }
    result[matchedComp][matchedPrefix] = finalVal;
  }
}

console.log(JSON.stringify(result, null, 2));
