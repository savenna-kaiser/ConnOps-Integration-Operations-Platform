/**
 * pdfLetterhead.js – Gemeinsames Briefpapier fuer alle PDF-Exporte
 *
 * Verwendet von routes/report.js UND services/handoverService.js, damit das
 * offizielle Briefpapier der Stadtverwaltung Musterstadt nur an einer Stelle
 * gepflegt wird, nicht zweimal dupliziert.
 *
 * CONTENT_TOP/CONTENT_BOTTOM wurden per Pixel-Analyse des Briefpapier-Bilds
 * ermittelt (musterstadt.jpg, 2480x3508px @ 300dpi = exakt A4):
 *   - Kopfbereich (Logo, Adresszeile) endet bei ca. 139pt von oben
 *   - Fusszeile (Trennlinie, Bankverbindung) beginnt bei ca. 782pt von oben
 * Etwas Sicherheitsabstand ergaenzt, damit Inhalt nicht direkt an Kopf-/
 * Fusszeile stoesst.
 */

const path = require("path");

const LETTERHEAD_PATH = path.join(__dirname, "../assets/letterhead/musterstadt.jpg");

const CONTENT_TOP    = 155; // pt von oben - sicherer Start unterhalb des Kopfbereichs
const CONTENT_BOTTOM = 95;  // pt von unten - sicherer Abstand ueber der Fusszeile

/**
 * Zeichnet das Briefpapier als Hintergrund auf JEDE Seite des Dokuments
 * (auch bei mehrseitigen PDFs, ueber den "pageAdded"-Event-Hook).
 * MUSS aufgerufen werden, BEVOR Text/Inhalt gezeichnet wird, sonst liegt
 * der Hintergrund ueber dem Inhalt statt darunter.
 */
function applyLetterhead(doc) {
  const draw = () => {
    doc.image(LETTERHEAD_PATH, 0, 0, {
      width:  doc.page.width,
      height: doc.page.height,
    });
  };
  draw();
  doc.on("pageAdded", draw);
}

module.exports = {
  applyLetterhead,
  CONTENT_TOP,
  CONTENT_BOTTOM,
  LETTERHEAD_PATH,
};
