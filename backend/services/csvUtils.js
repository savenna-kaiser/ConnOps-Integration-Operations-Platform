/**
 * csvUtils.js – Gemeinsame CSV-Hilfsfunktionen
 *
 * Security-Review 6.4 (16.07.2026): CSV-Formel-Injection. Excel/LibreOffice
 * interpretieren Zellen, die mit =, +, -, @ oder Tab beginnen, beim Oeffnen
 * als Formel. Ein fuehrendes Apostroph zwingt die Zelle als Text-Interpretation,
 * ohne dass es im Excel sichtbar angezeigt wird.
 *
 * Verwendet von routes/auditRoute.js und routes/report.js (beide CSV-Exporte).
 */

const FORMULA_TRIGGER_CHARS = ["=", "+", "-", "@", "\t"];

/**
 * Bereitet einen einzelnen Zellwert fuer den CSV-Export vor:
 *   1. Formel-Trigger-Zeichen am Anfang mit fuehrendem Apostroph entschaerfen
 *   2. Anfuehrungszeichen im Wert verdoppeln (CSV-Standard-Escaping)
 *   3. In Anfuehrungszeichen einschliessen
 */
function sanitizeCsvCell(value) {
  let str = String(value ?? "");
  if (FORMULA_TRIGGER_CHARS.some(c => str.startsWith(c))) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

module.exports = { sanitizeCsvCell };
