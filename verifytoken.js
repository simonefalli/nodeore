const jwt = require('jsonwebtoken');
const secretKey = process.env.JWT_SECRET || "ilTuoSegretoSuperSicuroIngegneriaeSistemi";

// Definiamo una whitelist di IP autorizzati
const IP_WHITELIST = [
  '127.0.0.1', // localhost IPv4
  '::1',       // localhost IPv6
  '192.168.25.99', // ip di UBUNTU
  '192.168.25.210',
  '192.168.25.1'
];

function verifyToken(req, res, next) {
  // Ottieni l'IP del client (gestendo eventuali proxy come Nginx)
  let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
// Rimuove il prefisso ::ffff: se presente per normalizzare l'IP a IPv4
  if (clientIp.startsWith('::ffff:')) {
    clientIp = clientIp.replace('::ffff:', '');
  }



  // Verifica se l'IP è in whitelist (usiamo .includes o un controllo manuale)
  if (IP_WHITELIST.includes(clientIp) || clientIp === '::ffff:127.0.0.1') {
    
    return next(); // Bypass: l'IP è autorizzato, passa al middleware successivo
  }

  const bearerHeader = req.headers["authorization"];
  
  if (typeof bearerHeader !== "undefined") {
    const bearerToken = bearerHeader.split(" ")[1];
    
    jwt.verify(bearerToken, secretKey, (err, decoded) => {
      if (err) {
        return res.sendStatus(403);
      }
      
      const expirationTime = decoded.exp;
      const currentTime = Math.floor(Date.now() / 1000);

      // Nota: jwt.verify controlla già la scadenza se il campo exp è presente.
      // Questo controllo manuale è un ulteriore livello di sicurezza.
      if (currentTime < expirationTime) {
        req.token = bearerToken;
        req.user = decoded ? decoded.user : null; // Allega l'utente alla richiesta
        next();
      } else {
        res.sendStatus(403);
      }
    });
  } else {
    res.sendStatus(403);
  }
}

module.exports = verifyToken;