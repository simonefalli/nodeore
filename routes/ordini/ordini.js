const express = require("express");
const router = express.Router();
const verifyToken = require("../../verifytoken");
const dbAccess = require("../../dbaccess");
const ADODB = require("node-adodb");
const connection = ADODB.open(dbAccess);

router.use(verifyToken);

router.get('/aperti', async (req, res) => {
    
    const sql = `
        SELECT 
            O.IDORDINE, 
            O.DATAORDINE, 
            O.NOMEORDINE, 
            O.[IMPORTOORDINE€], 
            C.[RAGIONE SOCIALE] as CLIENTE,
            I.NOME as IMPIANTO,
            I.[NUMERO IMPIANTO] as NUMEROIMPIANTO
        FROM (([B-05-T-ORDINI] as O
        LEFT JOIN [P-04-T-CLIENTI] as C ON O.[ID CLIENTE] = C.[ID CAF])
        LEFT JOIN [P-07-T-IMPIANTI] as I ON O.[ID IMPIANTO] = I.[NUMERO IMPIANTO])
        WHERE (O.ESEGUITO IS NULL OR O.ESEGUITO <= #1970-01-01#) 
          AND (O.ANNULLATOIL IS NULL OR O.ANNULLATOIL <= #1970-01-01#)
        ORDER BY O.IDORDINE DESC
    `;

    try {
        const orders = await connection.query(sql);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Rotta 2: Dettaglio Ordine e Materiali
 */
router.get('/:id', async (req, res) => {
    const orderId = req.params.id;

    try {
        // 1. Recupero testata ordine
        const orderSql = `
            SELECT O.*, C.[RAGIONE SOCIALE] as CLIENTE, I.NOME as IMPIANTO
            FROM (([B-05-T-ORDINI] as O
            LEFT JOIN [P-04-T-CLIENTI] as C ON O.[ID CLIENTE] = C.[ID CAF])
            LEFT JOIN [P-07-T-IMPIANTI] as I ON O.[ID IMPIANTO] = I.[NUMERO IMPIANTO])
            WHERE O.IDORDINE = ${orderId}
        `;
        const orderResults = await connection.query(orderSql);

        if (orderResults.length === 0) {
            return res.status(404).json({ error: 'Ordine non trovato' });
        }

        const order = orderResults[0];

        // 2. Recupero materiali dal preventivo di riferimento
        let materiali = [];
        if (order.IDPREVENTIVORIFERIMENTO) {
            const materialsSql = `
                SELECT NOMEARTICOLO, QUANTITA, DESCRIZIONE, PREZZOU
                FROM [A-03-T-DETTAGLIPREVENTIVI]
                WHERE IDPREVENTIVO = ${order.IDPREVENTIVORIFERIMENTO}
            `;
            materiali = await connection.query(materialsSql);
        }

        res.json({
            ordine: order,
            materiali: materiali
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



module.exports = router;