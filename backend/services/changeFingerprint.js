/**
 * changeFingerprint.js – Berechnet einen stabilen Fingerabdruck eines
 * resolved-Objekts, um eine Freigabe (approve) an eine KONKRETE
 * Auflösungsversion zu binden (siehe Projektnotizen 09.09.2026,
 * "Freigabe von Ausführung entkoppeln").
 *
 * Wird an drei Stellen genutzt, alle muessen dieselbe Berechnung nutzen:
 *   1. Freigabe-Route (POST /changes/:id/approve) - Fingerabdruck beim
 *      Freigeben speichern
 *   2. ingestWorker.js - nach jeder Neuauflösung pruefen, ob der neue
 *      Fingerabdruck noch zum freigegebenen passt; falls nicht, Freigabe
 *      verfallen lassen
 *   3. scheduler.js - unmittelbar vor einer automatischen Ausfuehrung
 *      als letzte Sicherheitspruefung nochmals gegenpruefen
 */

const crypto = require('crypto');

function computeFingerprint(resolved) {
  if (!resolved) return null;
  const json = JSON.stringify(resolved);
  return crypto.createHash('sha256').update(json).digest('hex');
}

module.exports = { computeFingerprint };
