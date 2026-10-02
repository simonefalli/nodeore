const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../costanti'), 'utf-8');
const lines = content.split(/\r?\n/);

const companies = {
  1000: { key: 'pratoallarmi', suffixes: ['PRATOALLARMI', 'pratoallarmi'], logo: 'logo_pratoallarmi.png' },
  2000: { key: 'sentinel', suffixes: ['SENTINEL', 'sentinel'], logo: 'logo_sentinel.png' },
  3000: { key: 'edison', suffixes: ['EDISON', 'edison'], logo: 'logo_edison.png' },
  4000: { key: 'ies', suffixes: ['IES', 'ies'], logo: 'logo.png' },
  5000: { key: 'sentinelvigilanza', suffixes: ['SENTINELVIGILANZA', 'SENTINELvigilanza', 'sentinelvigilanza'], logo: 'logo_sentinelvigilanza.png' },
  6000: { key: 'valdelsaallarmi', suffixes: ['VALDELSAALLARMI', 'valdelsaallarmi'], logo: 'logo_valdelsaallarmi.png' },
  7000: { key: 'vigilanzatoscana', suffixes: ['VIGILANZATOSCANA', 'vigilanzatoscana'], logo: 'logo_vigilanzatoscana.png' },
  8000: { key: 'areavigilanza', suffixes: ['AREAVIGILANZA', 'areavigilanza'], logo: 'logo_areavigilanza.png' },
  9000: { key: 'pratopol', suffixes: ['PRATOPOL', 'pratopol'], logo: 'logo_pratopol.png' },
  10000: { key: 'pratoallarmiced', suffixes: ['PRATOALLARMICED', 'pratoallarmiCED', 'pratoallarmiced'], logo: 'logo_pratoallarmiced.png' },
  11000: { key: 'sistemiesicurezza', suffixes: ['SISTEMIESICUREZZA', 'SISTEMI E SICUREZZA', 'sistemiesicurezza'], logo: 'logo_sistemiesicurezza.png' },
  13000: { key: 'toninelli', suffixes: ['TONINELLI', 'toninelli'], logo: 'logo_toninelli.png' },
  14000: { key: 'caratelli', suffixes: ['CARATELLI', 'caratelli'], logo: 'logo_caratelli.png' },
  15000: { key: 'ciesse', suffixes: ['CIESSE', 'ciesse'], logo: 'logo_ciesse.png' },
  16000: { key: 'toscanaallarmievigilanza', suffixes: ['TOSCANAALLARMIEVIGILANZA', 'toscanaallarmievigilanza'], logo: 'logo_toscanaallarmievigilanza.png' }
};

const prefixMap = {
  'DENOMINAZIONEIMPRESA': 'denominazione',
  'VECCHIADENOMINAZIONEIMPRESA': 'vecchiaDenominazione',
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
  'SITO': 'sito',
  'IDENTIFICATIVOCREDITORE': 'identificativoCreditore'
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
    sito: '',
    identificativoCreditore: '',
    logo: info.logo
  };
}

for (const rawLine of lines) {
  let line = rawLine.trim();
  const m = line.match(/^(?:Global|Public)?\s*Const\s+([A-Za-z0-9_]+)\s*=\s*(.+)$/i);
  if (!m) continue;

  const varName = m[1];
  let rawVal = m[2].trim();

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

  const upperVar = varName.toUpperCase();
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
    let finalVal = cleanVal.trim();
    if (matchedPrefix === 'capitaleSociale') {
      finalVal = parseFloat(cleanVal) || 0;
    }
    result[matchedComp][matchedPrefix] = finalVal;
  }
}

// Ensure defaults if some string is missing or formatting tweaks
for (const [k, az] of Object.entries(result)) {
  // If nome is empty, fallback to denominazione
  if (!az.nome) az.nome = az.denominazione;
  if (!az.denominazione) az.denominazione = az.nome;
  
  // Specific tweaks for IES and CIESSE
  if (k === 'ies') {
    if (!az.email) az.email = 'info@iesingegneria.it';
    if (!az.sito) az.sito = 'https://www.iesingegneria.it/';
    if (!az.logo) az.logo = 'logo.png';
  }
  if (k === 'ciesse') {
    if (!az.email) az.email = 'info@ciessesicurezza.it';
    if (!az.sito) az.sito = 'https://www.ciessesicurezza.it/';
    if (!az.logo) az.logo = 'logo_ciesse.png';
  }
}

const configDir = path.join(__dirname, '../config');
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

const targetPath = path.join(configDir, 'aziende.json');
fs.writeFileSync(targetPath, JSON.stringify(result, null, 2), 'utf-8');
console.log('Saved config/aziende.json successfully with', Object.keys(result).length, 'companies.');
