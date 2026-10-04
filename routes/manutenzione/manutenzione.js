const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const dbaccess = require('../../dbaccess');

// Credenziali hardcodate per la manutenzione (sovrascrivibili via .env)
const AUTH_USER = process.env.MANUTENZIONE_USER || 'admin';
const AUTH_PASS = process.env.MANUTENZIONE_PASS || 'oremanutenzione';

// Memorizzazione token attivi in memoria (con scadenza 24h)
const activeTokens = new Map();

function cleanExpiredTokens() {
  const now = Date.now();
  for (const [token, data] of activeTokens.entries()) {
    if (now - data.createdAt > 24 * 60 * 60 * 1000) {
      activeTokens.delete(token);
    }
  }
}

// Middleware di restrizione IP: solo rete 192.168.x.x e loopback locale (127.0.0.1 / ::1)
function ipFilterMiddleware(req, res, next) {
  let ip = req.headers['x-forwarded-for'] 
    ? req.headers['x-forwarded-for'].split(',')[0].trim() 
    : (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress) || req.ip || '';

  // Normalizza prefisso IPv6 ::ffff: (es. ::ffff:192.168.25.10 -> 192.168.25.10)
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  // Verifica se appartiene alla subnet 192.168.x.x oppure loopback locale
  const isAllowed = ip.startsWith('192.168.') || ip === '127.0.0.1' || ip === '::1';

  if (!isAllowed) {
    console.warn(`[MANUTENZIONE] Accesso bloccato per IP non autorizzato: '${ip}'`);
    if (req.path.startsWith('/api')) {
      return res.status(403).json({ 
        error: `Accesso negato: l'indirizzo IP (${ip}) non è autorizzato. Consentiti solo IP 192.168.x.x` 
      });
    }
    return res.status(403).send(`<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>403 Accesso Negato - Rete Non Autorizzata</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #f8fafc; color: #1e293b; margin: 0; }
    .card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px 40px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.06); max-width: 480px; }
    h2 { color: #dc2626; margin-bottom: 12px; font-size: 1.4rem; }
    p { color: #475569; font-size: 0.95rem; line-height: 1.5; margin-bottom: 16px; }
    .ip-box { background: #f1f5f9; padding: 6px 12px; border-radius: 6px; font-family: monospace; font-size: 0.95rem; color: #0f172a; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <h2>🚫 Accesso Negato (403)</h2>
    <p>L'accesso a questo pannello di manutenzione è consentito esclusivamente dalla rete aziendale interna (<strong>192.168.x.x</strong>).</p>
    <div style="margin-top: 15px;">Il tuo indirizzo IP rilevato: <span class="ip-box">\${ip || 'Sconosciuto'}</span></div>
  </div>
</body>
</html>`);
  }

  req.clientIp = ip;
  next();
}

router.use(ipFilterMiddleware);

// Middleware di autenticazione per le API
function requireAuth(req, res, next) {
  cleanExpiredTokens();
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : req.query.token;

  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ error: 'Non autorizzato. Effettua il login per continuare.' });
  }

  req.authData = activeTokens.get(token);
  next();
}

// =========================================================================
// API ENDPOINTS
// =========================================================================

// POST /manutenzione/api/login
router.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Inserisci nome utente e password.' });
  }

  if (username.trim() === AUTH_USER && password === AUTH_PASS) {
    cleanExpiredTokens();
    const token = crypto.randomBytes(32).toString('hex');
    activeTokens.set(token, {
      username: AUTH_USER,
      createdAt: Date.now()
    });

    console.log(`[MANUTENZIONE] Login riuscito per utente '${AUTH_USER}'`);
    return res.json({
      success: true,
      token,
      username: AUTH_USER
    });
  }

  console.warn(`[MANUTENZIONE] Tentativo login fallito per utente '${username}'`);
  return res.status(401).json({ error: 'Credenziali non valide.' });
});

// POST /manutenzione/api/logout
router.post('/api/logout', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : req.query.token;
  if (token) {
    activeTokens.delete(token);
  }
  res.json({ success: true });
});

// GET /manutenzione/api/status
router.get('/api/status', requireAuth, (req, res) => {
  try {
    const status = dbaccess.getSystemStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Errore recupero stato sistema' });
  }
});

// POST /manutenzione/api/disconnect
router.post('/api/disconnect', requireAuth, async (req, res) => {
  const { db, minutes } = req.body || {};
  const duration = parseInt(minutes, 10);
  const durationSafe = isNaN(duration) ? 30 : Math.max(0, duration);

  try {
    console.log(`[MANUTENZIONE] Richiesta disconnessione DB '${db || 'all'}' per ${durationSafe} minuti`);
    const results = await dbaccess.disconnectPool(db || 'all', durationSafe);
    const updatedStatus = dbaccess.getSystemStatus();
    res.json({
      success: true,
      results,
      status: updatedStatus
    });
  } catch (err) {
    console.error('[MANUTENZIONE] Errore durante disconnessione:', err);
    res.status(500).json({ error: err.message || 'Errore durante la disconnessione del database' });
  }
});

// POST /manutenzione/api/reconnect
router.post('/api/reconnect', requireAuth, async (req, res) => {
  const { db } = req.body || {};

  try {
    console.log(`[MANUTENZIONE] Richiesta riconnessione DB '${db || 'all'}'`);
    const results = await dbaccess.reconnectPool(db || 'all');
    const updatedStatus = dbaccess.getSystemStatus();
    res.json({
      success: true,
      results,
      status: updatedStatus
    });
  } catch (err) {
    console.error('[MANUTENZIONE] Errore durante riconnessione:', err);
    res.status(500).json({ error: err.message || 'Errore durante la riconnessione del database' });
  }
});

// =========================================================================
// PAGINA HTML DASHBOARD
// =========================================================================
router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pannello Manutenzione Database Access - Node.js</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --success: #16a34a;
      --warning: #d97706;
      --danger: #dc2626;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-family);
      background-color: var(--bg);
      color: var(--text-main);
      line-height: 1.5;
      padding: 0;
      margin: 0;
    }
    .header {
      background: #0f172a;
      color: white;
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid var(--primary);
    }
    .header-title {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header-title h1 {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .header-user {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 0.85rem;
    }
    .btn-logout {
      background: #334155;
      color: #f1f5f9;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.8rem;
      cursor: pointer;
      font-weight: 600;
      transition: background 0.2s;
    }
    .btn-logout:hover { background: #475569; }

    .container {
      max-width: 1100px;
      margin: 30px auto;
      padding: 0 20px;
    }

    /* CARD LOGIN */
    .login-wrapper {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 60vh;
    }
    .card-login {
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 32px 36px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08);
    }
    .card-login h2 {
      font-size: 1.35rem;
      font-weight: 700;
      margin-bottom: 8px;
      color: #0f172a;
      text-align: center;
    }
    .card-login p {
      font-size: 0.88rem;
      color: var(--text-muted);
      margin-bottom: 24px;
      text-align: center;
    }
    .form-group {
      margin-bottom: 16px;
    }
    .form-group label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 6px;
      color: #334155;
    }
    .form-control {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.95rem;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .form-control:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }
    .btn-primary {
      width: 100%;
      background: var(--primary);
      color: white;
      border: none;
      padding: 12px;
      border-radius: 6px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-primary:hover { background: var(--primary-hover); }

    /* DASHBOARD */
    .top-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .global-buttons {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.2s;
    }
    .btn-danger {
      background: #fee2e2;
      color: #991b1b;
      border-color: #fca5a5;
    }
    .btn-danger:hover {
      background: #fecaca;
    }
    .btn-success {
      background: #dcfce7;
      color: #166534;
      border-color: #86efac;
    }
    .btn-success:hover {
      background: #bbf7d0;
    }
    .btn-outline {
      background: white;
      color: #334155;
      border-color: #cbd5e1;
    }
    .btn-outline:hover {
      background: #f1f5f9;
    }

    .grid-db {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
      gap: 20px;
      margin-bottom: 24px;
    }
    @media (max-width: 600px) {
      .grid-db { grid-template-columns: 1fr; }
    }

    .card-db {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.04);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .card-db-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
      padding-bottom: 14px;
      border-bottom: 1px solid #f1f5f9;
    }
    .card-db-title {
      font-size: 1.15rem;
      font-weight: 700;
      color: #0f172a;
    }
    .card-db-path {
      font-size: 0.78rem;
      color: var(--text-muted);
      word-break: break-all;
      margin-top: 4px;
      font-family: monospace;
    }
    .badges {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 0.76rem;
      font-weight: 700;
    }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .badge-info { background: #e0f2fe; color: #0369a1; }

    .db-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      background: #f8fafc;
      padding: 12px 14px;
      border-radius: 8px;
      margin-bottom: 18px;
      font-size: 0.84rem;
    }
    .stat-label {
      color: var(--text-muted);
      font-size: 0.78rem;
    }
    .stat-value {
      font-weight: 700;
      color: #1e293b;
    }

    .maintenance-banner {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-left: 4px solid #f59e0b;
      padding: 10px 14px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 0.84rem;
      color: #92400e;
    }

    .card-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: auto;
      padding-top: 14px;
      border-top: 1px solid #f1f5f9;
      flex-wrap: wrap;
    }
    .select-minutes {
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.85rem;
      background: white;
      color: #334155;
    }

    /* GUIDA OPERATIVA */
    .guide-box {
      background: white;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px 24px;
      margin-top: 24px;
    }
    .guide-box h3 {
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 12px;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .guide-steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    .step-item {
      background: #f8fafc;
      padding: 12px 14px;
      border-radius: 8px;
      border-left: 3px solid var(--primary);
    }
    .step-num {
      font-size: 0.75rem;
      font-weight: 800;
      color: var(--primary);
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .step-text {
      font-size: 0.85rem;
      color: #334155;
    }

    .alert {
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 0.86rem;
      margin-bottom: 16px;
      display: none;
    }
    .alert-danger { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .alert-success { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    
    .pulse {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #16a34a;
      box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.7);
      animation: pulse 1.6s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(22, 163, 74, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
    }
  </style>
</head>
<body>

  <header class="header">
    <div class="header-title">
      <span style="font-size: 1.5rem;">🗄️</span>
      <div>
        <h1>Pannello Manutenzione Database Access</h1>
        <div style="font-size: 0.75rem; color: #94a3b8;">Controllo Connessioni ODBC & Compattazione Database</div>
      </div>
    </div>
    <div id="header-user-info" class="header-user" style="display: none;">
      <span style="background: #1e293b; padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; color: #94a3b8;">
        IP: <strong style="color: #38bdf8;">${req.clientIp}</strong>
      </span>
      <span>Utente: <strong id="username-display">admin</strong></span>
      <button class="btn-logout" onclick="eseguiLogout()">Esci</button>
    </div>
  </header>

  <div class="container">
    <!-- SEZIONE LOGIN -->
    <div id="view-login" class="login-wrapper">
      <div class="card-login">
        <h2>🔒 Accesso Manutenzione</h2>
        <p>Inserisci le credenziali di amministratore per gestire lo sblocco dei database.</p>
        
        <div id="login-alert" class="alert alert-danger"></div>

        <form onsubmit="eseguiLogin(event)">
          <div class="form-group">
            <label for="input-username">Nome Utente</label>
            <input type="text" id="input-username" class="form-control" required autocomplete="username" placeholder="Es. admin">
          </div>
          <div class="form-group">
            <label for="input-password">Password</label>
            <input type="password" id="input-password" class="form-control" required autocomplete="current-password" placeholder="Password">
          </div>
          <button type="submit" id="btn-login-submit" class="btn-primary">Accedi al Pannello</button>
        </form>
      </div>
    </div>

    <!-- SEZIONE DASHBOARD -->
    <div id="view-dashboard" style="display: none;">
      <div id="dash-alert" class="alert"></div>

      <div class="top-actions">
        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: #475569;">
          <span class="pulse"></span> Aggiornamento automatico attivo &bull; Server: <strong id="server-time">--:--:--</strong>
        </div>
        <div class="global-buttons">
          <button class="btn btn-outline" onclick="caricaStato()" title="Ricarica stato">
            🔄 Aggiorna
          </button>
          <button class="btn btn-danger" onclick="confermaScollegaTutti()">
            ⏸️ Scollega ENTRAMBI
          </button>
          <button class="btn btn-success" onclick="eseguiRiconnetti('all')">
            ▶️ Riconnetti ENTRAMBI
          </button>
        </div>
      </div>

      <!-- GRIGLIA DATABASE -->
      <div class="grid-db">
        <!-- CARD I&S -->
        <div class="card-db" id="card-db-is">
          <div>
            <div class="card-db-header">
              <div>
                <div class="card-db-title">🏢 Database I&S</div>
                <div class="card-db-path" id="is-path">Caricamento percorso...</div>
              </div>
              <div class="badges">
                <span id="is-badge-pool" class="badge badge-info">Verifica pool...</span>
                <span id="is-badge-lock" class="badge badge-info">Verifica lock...</span>
              </div>
            </div>

            <div id="is-maint-box" class="maintenance-banner" style="display: none;">
              ⚠️ <strong>Manutenzione attiva:</strong> Il pool ODBC è scollegato per consentire la compattazione in Access.
              <div id="is-maint-timer" style="margin-top: 4px; font-weight: 700;"></div>
            </div>

            <div class="db-stats">
              <div>
                <div class="stat-label">Dimensione File:</div>
                <div class="stat-value" id="is-size">--</div>
              </div>
              <div>
                <div class="stat-label">Ultima Modifica:</div>
                <div class="stat-value" id="is-mtime">--</div>
              </div>
              <div>
                <div class="stat-label">File Lock (.laccdb):</div>
                <div class="stat-value" id="is-lock-status">--</div>
              </div>
              <div>
                <div class="stat-label">Stato Connessione:</div>
                <div class="stat-value" id="is-conn-status">--</div>
              </div>
            </div>
          </div>

          <div class="card-actions" id="is-actions">
            <!-- Pulsanti dinamici -->
          </div>
        </div>

        <!-- CARD CIESSE -->
        <div class="card-db" id="card-db-ciesse">
          <div>
            <div class="card-db-header">
              <div>
                <div class="card-db-title">🏢 Database CIESSE</div>
                <div class="card-db-path" id="ciesse-path">Caricamento percorso...</div>
              </div>
              <div class="badges">
                <span id="ciesse-badge-pool" class="badge badge-info">Verifica pool...</span>
                <span id="ciesse-badge-lock" class="badge badge-info">Verifica lock...</span>
              </div>
            </div>

            <div id="ciesse-maint-box" class="maintenance-banner" style="display: none;">
              ⚠️ <strong>Manutenzione attiva:</strong> Il pool ODBC è scollegato per consentire la compattazione in Access.
              <div id="ciesse-maint-timer" style="margin-top: 4px; font-weight: 700;"></div>
            </div>

            <div class="db-stats">
              <div>
                <div class="stat-label">Dimensione File:</div>
                <div class="stat-value" id="ciesse-size">--</div>
              </div>
              <div>
                <div class="stat-label">Ultima Modifica:</div>
                <div class="stat-value" id="ciesse-mtime">--</div>
              </div>
              <div>
                <div class="stat-label">File Lock (.laccdb):</div>
                <div class="stat-value" id="ciesse-lock-status">--</div>
              </div>
              <div>
                <div class="stat-label">Stato Connessione:</div>
                <div class="stat-value" id="ciesse-conn-status">--</div>
              </div>
            </div>
          </div>

          <div class="card-actions" id="ciesse-actions">
            <!-- Pulsanti dinamici -->
          </div>
        </div>
      </div>

      <!-- GUIDA OPERATIVA -->
      <div class="guide-box">
        <h3>💡 Istruzioni Operative per la Compattazione del Database</h3>
        <div class="guide-steps">
          <div class="step-item">
            <div class="step-num">Passo 1</div>
            <div class="step-text">Clicca sul pulsante <strong>"Scollega per Compattazione"</strong> del database desiderato.</div>
          </div>
          <div class="step-item">
            <div class="step-num">Passo 2</div>
            <div class="step-text">Verifica che il badge del lock diventi <strong>"Lock Rilasciato"</strong> (verde).</div>
          </div>
          <div class="step-item">
            <div class="step-num">Passo 3</div>
            <div class="step-text">Apri <strong>Microsoft Access</strong> ed esegui <em>Strumenti database &gt; Compatta e ripristina</em>.</div>
          </div>
          <div class="step-item">
            <div class="step-num">Passo 4</div>
            <div class="step-text">Terminata la compattazione, clicca <strong>"Riconnetti Adesso"</strong> (o si riaprirà da solo alla fine del timer).</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let authToken = localStorage.getItem("nodeore_maint_token");
    let timerPolling = null;

    document.addEventListener("DOMContentLoaded", () => {
      if (authToken) {
        mostraDashboard();
      } else {
        mostraLogin();
      }
    });

    function mostraLogin() {
      if (timerPolling) clearInterval(timerPolling);
      document.getElementById("view-login").style.display = "flex";
      document.getElementById("view-dashboard").style.display = "none";
      document.getElementById("header-user-info").style.display = "none";
    }

    function mostraDashboard() {
      document.getElementById("view-login").style.display = "none";
      document.getElementById("view-dashboard").style.display = "block";
      document.getElementById("header-user-info").style.display = "flex";
      caricaStato();
      if (timerPolling) clearInterval(timerPolling);
      timerPolling = setInterval(caricaStato, 3000);
    }

    async function eseguiLogin(e) {
      e.preventDefault();
      const u = document.getElementById("input-username").value.trim();
      const p = document.getElementById("input-password").value;
      const alertBox = document.getElementById("login-alert");
      const btn = document.getElementById("btn-login-submit");

      alertBox.style.display = "none";
      btn.disabled = true;
      btn.textContent = "Accesso in corso...";

      try {
        const res = await fetch("/manutenzione/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();

        btn.disabled = false;
        btn.textContent = "Accedi al Pannello";

        if (res.ok && data.success) {
          authToken = data.token;
          localStorage.setItem("nodeore_maint_token", authToken);
          document.getElementById("username-display").textContent = data.username || u;
          mostraDashboard();
        } else {
          alertBox.textContent = data.error || "Credenziali non corrette.";
          alertBox.style.display = "block";
        }
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Accedi al Pannello";
        alertBox.textContent = "Errore di connessione con il server Node.js.";
        alertBox.style.display = "block";
      }
    }

    async function eseguiLogout() {
      if (authToken) {
        try {
          await fetch("/manutenzione/api/logout", {
            method: "POST",
            headers: { "Authorization": "Bearer " + authToken }
          });
        } catch(e) {}
      }
      authToken = null;
      localStorage.removeItem("nodeore_maint_token");
      mostraLogin();
    }

    async function caricaStato() {
      if (!authToken) return;

      try {
        const res = await fetch("/manutenzione/api/status", {
          headers: { "Authorization": "Bearer " + authToken }
        });

        if (res.status === 401) {
          eseguiLogout();
          return;
        }

        const data = await res.json();
        renderDashboard(data);
      } catch (err) {
        console.error("Errore polling stato:", err);
      }
    }

    function renderDashboard(data) {
      if (!data || !data.databases) return;

      document.getElementById("server-time").textContent = data.serverTime || "--:--:--";

      renderCardDb("is", data.databases.is);
      renderCardDb("ciesse", data.databases.ciesse);
    }

    function renderCardDb(key, db) {
      if (!db) return;

      document.getElementById(key + "-path").textContent = db.path || "-";
      
      const badgePool = document.getElementById(key + "-badge-pool");
      const badgeLock = document.getElementById(key + "-badge-lock");
      const maintBox = document.getElementById(key + "-maint-box");
      const maintTimer = document.getElementById(key + "-maint-timer");
      const sizeVal = document.getElementById(key + "-size");
      const mtimeVal = document.getElementById(key + "-mtime");
      const lockVal = document.getElementById(key + "-lock-status");
      const connVal = document.getElementById(key + "-conn-status");
      const actionsBox = document.getElementById(key + "-actions");

      // Dimensione e Modifica
      if (db.file && db.file.exists) {
        sizeVal.textContent = db.file.sizeMb + " MB (" + db.file.sizeGb + " GB)";
        mtimeVal.textContent = formatDataOra(db.file.mtime);
      } else {
        sizeVal.textContent = "File non trovato";
        mtimeVal.textContent = "-";
      }

      // Stato Lock
      if (db.isLocked) {
        badgeLock.className = "badge badge-danger";
        badgeLock.textContent = "🔴 Lock Attivo (.laccdb)";
        lockVal.innerHTML = "<span style='color: #dc2626; font-weight: 700;'>Presente su disco (Occupato)</span>";
      } else {
        badgeLock.className = "badge badge-success";
        badgeLock.textContent = "🟢 Lock Rilasciato";
        lockVal.innerHTML = "<span style='color: #16a34a; font-weight: 700;'>Nessun lock (Pronto per compattare)</span>";
      }

      // Stato Manutenzione / Pool
      if (db.inMaintenance) {
        badgePool.className = "badge badge-warning";
        badgePool.textContent = "🟡 In Manutenzione";
        connVal.textContent = "Scollegato da Node.js";
        maintBox.style.display = "block";
        maintTimer.textContent = db.remainingMinutes > 0 
          ? "Riapertura automatica tra circa " + db.remainingMinutes + " minuti."
          : "Nessun timer automatico (riapertura manuale richiesta).";

        actionsBox.innerHTML = \`
          <button class="btn btn-success" style="width: 100%; justify-content: center; padding: 10px;" onclick="eseguiRiconnetti('\${key}')">
            ▶️ Riconnetti \${db.name} Adesso (Fine Manutenzione)
          </button>
        \`;
      } else {
        badgePool.className = "badge badge-success";
        badgePool.textContent = "🟢 Connesso";
        connVal.textContent = "Attivo (Pool ODBC aperto)";
        maintBox.style.display = "none";

        actionsBox.innerHTML = \`
          <select id="\${key}-select-min" class="select-minutes">
            <option value="15">Timer: 15 min</option>
            <option value="30" selected>Timer: 30 min (Consigliato)</option>
            <option value="60">Timer: 60 min</option>
            <option value="0">Senza timer (Manuale)</option>
          </select>
          <button class="btn btn-danger" style="flex: 1; justify-content: center; padding: 9px;" onclick="eseguiScollega('\${key}')">
            ⏸️ Scollega \${db.name} per Compattazione
          </button>
        \`;
      }
    }

    async function eseguiScollega(key) {
      const selectMin = document.getElementById(key + "-select-min");
      const minutes = selectMin ? parseInt(selectMin.value, 10) : 30;

      const confirmMsg = "Vuoi scollegare il database " + key.toUpperCase() + " per consentire la compattazione?\\n\\n" +
        "Durante la manutenzione le query verso questo database risponderanno temporaneamente con messaggio di attesa.\\n" +
        (minutes > 0 ? "Le connessioni si riapriranno automaticamente dopo " + minutes + " minuti." : "La riapertura dovrà essere effettuata manualmente.");

      if (!confirm(confirmMsg)) return;

      mostraAlertDash("Disconnessione in corso...", "warning");

      try {
        const res = await fetch("/manutenzione/api/disconnect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + authToken
          },
          body: JSON.stringify({ db: key, minutes: minutes })
        });
        const data = await res.json();
        if (data.success) {
          mostraAlertDash("✓ Database " + key.toUpperCase() + " scollegato con successo. Ora puoi procedere con la compattazione in Access!", "success");
          caricaStato();
        } else {
          mostraAlertDash("Errore: " + (data.error || "Impossibile scollegare il database"), "danger");
        }
      } catch (err) {
        mostraAlertDash("Errore durante la chiamata di disconnessione.", "danger");
      }
    }

    async function eseguiRiconnetti(key) {
      mostraAlertDash("Riconnessione in corso...", "info");

      try {
        const res = await fetch("/manutenzione/api/reconnect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + authToken
          },
          body: JSON.stringify({ db: key })
        });
        const data = await res.json();
        if (data.success) {
          mostraAlertDash("✓ Database " + key.toUpperCase() + " riconnesso e operativo!", "success");
          caricaStato();
        } else {
          mostraAlertDash("Errore: " + (data.error || "Impossibile riconnettere il database"), "danger");
        }
      } catch (err) {
        mostraAlertDash("Errore durante la chiamata di riconnessione.", "danger");
      }
    }

    function confermaScollegaTutti() {
      if (!confirm("Vuoi scollegare ENTRAMBI i database (I&S e CIESSE) per manutenzione?\\n\\nTimer di sicurezza: 30 minuti.")) return;

      mostraAlertDash("Disconnessione di tutti i database in corso...", "warning");
      fetch("/manutenzione/api/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + authToken
        },
        body: JSON.stringify({ db: "all", minutes: 30 })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          mostraAlertDash("✓ Tutti i database scollegati. Procedi con la compattazione in Access!", "success");
          caricaStato();
        } else {
          mostraAlertDash("Errore: " + (data.error || "Errore disconnessione"), "danger");
        }
      })
      .catch(() => mostraAlertDash("Errore di connessione.", "danger"));
    }

    function mostraAlertDash(msg, type) {
      const b = document.getElementById("dash-alert");
      b.className = "alert " + (type === "success" ? "alert-success" : (type === "warning" ? "alert-warning" : "alert-danger"));
      b.textContent = msg;
      b.style.display = "block";
      setTimeout(() => { b.style.display = "none"; }, 8000);
    }

    function formatDataOra(isoStr) {
      if (!isoStr) return "-";
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString("it-IT") + " " + d.toLocaleTimeString("it-IT");
    }
  </script>
</body>
</html>`);
});

module.exports = router;
