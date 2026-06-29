const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const ADODB = require('node-adodb');
const path = require('path');

const app = express();
const port = 3000;

// Connessione al database .mdb (occhio al path corretto)
const connection = ADODB.open('Provider=Microsoft.Jet.OLEDB.4.0;Data Source=./database.mdb;');

app.get('/pdf/:idChiamata', async (req, res) => {
  const idChiamata = req.params.idChiamata;
  const doc = new PDFDocument({ margin: 30 });
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=chiamata_${idChiamata}.pdf`);
  doc.pipe(res);

  try {
    // Esempio: recupera dati da chiamate
    const chiamate = await connection.query(`SELECT * FROM chiamate WHERE id = ${idChiamata}`);
    const chiamata = chiamate[0];

    const impianti = await connection.query(`SELECT * FROM impianti WHERE numeroimpianto = ${chiamata.idimpianto}`);
    const impianto = impianti[0];

    const utenti = await connection.query(`SELECT * FROM utenti`);
    const chiamateOre = await connection.query(`SELECT * FROM chiamateore WHERE idchiamata = ${idChiamata}`);
    const materiali = await connection.query(`SELECT * FROM chiamatemateriale WHERE idchiamata = ${idChiamata}`);
    const libere = await connection.query(`SELECT * FROM chiamatelibere WHERE idchiamata = ${idChiamata}`);

    const array_utenti = utenti;

    // --- HEADER ---
    doc.image('templates/logo.png', 30, 20, { width: 100 });
    doc.fontSize(10).text('Via Caduti di Nassiriya, 67/69 - 50018 Scandicci Firenze', { align: 'right' });
    doc.text('Tel. 055 7356766 - Fax 0557357276', { align: 'right' });
    doc.text('assistenza@iesingegneria.it - www.iesingegneria.it', { align: 'right' });
    doc.text('P.Iva e C.Fisc. 05788780483', { align: 'right' });
    doc.moveDown();

    doc.moveTo(30, doc.y).lineTo(570, doc.y).stroke();

    // --- CLIENTE ---
    doc.moveDown();
    const cliente = impianto?.numeroimpianto === 0 ? libere[0]?.ragionesociale : impianto?.ragionesociale;
    doc.font('Helvetica-Bold').text(`Cliente: ${cliente}`, { continued: true });
    doc.font('Helvetica').text(`   Numero impianto: ${impianto?.numeroimpianto || '-'}`, { align: 'right' });

    const indirizzo = impianto?.numeroimpianto === 0
      ? libere[0]?.indirizzo
      : `${impianto?.luogoimpianto} ${impianto?.localita} ${impianto?.provincia}`;
    doc.text(indirizzo);

    doc.text(`Contratto: ${impianto?.tipocontratto || ''}`, { align: 'right' });

    const telefono = impianto?.numeroimpianto === 0 ? libere[0]?.telefono : impianto?.numerotelefono;
    doc.text(`Telefono: ${telefono}`);
    doc.text(`Impianto: ${impianto?.tipoimpianto || ''}`, { align: 'right' });

    // Extra info
    if (impianto?.numeroimpianto === 0) {
      let extra = '';
      if (libere[0]?.email) extra += `${libere[0]?.email} `;
      if (libere[0]?.piva) extra += `P.IVA: ${libere[0]?.piva} `;
      if (libere[0]?.sdi) extra += `SDI: ${libere[0]?.sdi} `;
      if (libere[0]?.codicefiscale) extra += `C.F.: ${libere[0]?.codicefiscale}`;
      doc.text(extra);
    }

    const utenteChiusura = array_utenti.find(u => u.id == chiamata.chiusada);
    doc.text(`Numero chiamata: ${chiamata.id} del ${new Date(chiamata.aperta).toLocaleDateString()} inserita da ${utenteChiusura?.nome || ''} ${utenteChiusura?.cognome || ''}`, { align: 'right' });

    doc.text(`ID interno: ${chiamata.idinterno}`, { align: 'right' });

    doc.moveDown();
    doc.moveTo(30, doc.y).lineTo(570, doc.y).stroke();
    doc.moveDown();

    // --- MOTIVO ---
    doc.font('Helvetica-Bold').text("Motivo della chiamata:");
    doc.font('Helvetica').text(chiamata.testo || '');

    // --- DESCRIZIONE ---
    doc.moveDown();
    doc.font('Helvetica-Bold').text("Descrizione intervento:");
    doc.font('Helvetica').text(chiamata.testochiusura || '');

    // --- ORE ---
    doc.moveDown();
    doc.font('Helvetica-Bold').text("Ore:");
    doc.moveDown(0.5);

    const oreTableHeaders = ['Tecnico', 'Dalle', 'Alle', 'Note', 'Totale'];
    const tableWidths = [100, 70, 70, 150, 50];

    doc.font('Helvetica-Bold');
    oreTableHeaders.forEach((h, i) => doc.text(h, { continued: i !== oreTableHeaders.length - 1, width: tableWidths[i], align: 'left' }));
    doc.moveDown();

    let totOre = 0;
    doc.font('Helvetica');
    chiamateOre.forEach(ore => {
      const da = new Date(ore.da);
      const a = new Date(ore.a);
      const diffMs = a - da;
      const diffH = (diffMs / (1000 * 60 * 60)).toFixed(2);
      totOre += parseFloat(diffH);

      const row = [
        ore.nomeutente,
        da.toLocaleString(),
        a.toLocaleString(),
        ore.note,
        diffH
      ];
      row.forEach((val, i) => doc.text(val, { continued: i !== row.length - 1, width: tableWidths[i] }));
      doc.moveDown();
    });

    doc.font('Helvetica-Bold').text("Totale ore:", { continued: true, width: 390 });
    doc.font('Helvetica').text(totOre.toFixed(2));

    // --- MATERIALI ---
    if (materiali.length > 0) {
      doc.moveDown().font('Helvetica-Bold').text("Materiali:");
      const matHeader = ['Descrizione', 'Quantità', 'Cod. magazzino'];
      const matWidths = [250, 70, 100];
      matHeader.forEach((h, i) => doc.text(h, { continued: i !== matHeader.length - 1, width: matWidths[i] }));
      doc.moveDown();

      doc.font('Helvetica');
      materiali.forEach(mat => {
        const row = [mat.descrizione, mat.quantita, mat.codicemagazzino];
        row.forEach((val, i) => doc.text(String(val), { continued: i !== row.length - 1, width: matWidths[i] }));
        doc.moveDown();
      });
    }

    // Firma
    if (chiamata.nomefirma) {
      doc.moveDown();
      doc.text(`Nome firma: ${chiamata.nomefirma}`, { align: 'right' });
      doc.text(`Firma:`, { align: 'right' });

      if (chiamata.firma) {
        const firmaPath = path.join(__dirname, 'firme', chiamata.firma);
        if (fs.existsSync(firmaPath)) {
          doc.image(firmaPath, 450, doc.y, { width: 100 });
        }
      }
    }

    doc.end();
  } catch (err) {
    console.error('Errore:', err);
    res.status(500).send('Errore generazione PDF');
  }
});

app.listen(port, () => {
  console.log(`Server attivo su http://localhost:${port}`);
});
