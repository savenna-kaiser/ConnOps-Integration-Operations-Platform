/**
 * getAllGroups.js – Action: Liste aller verfügbaren AD-Gruppen
 *
 * Wird vom „Gruppe hinzufügen"-Dialog im Frontend genutzt, um eine
 * Live-Vorschlagsliste basierend auf dem eingegebenen Suchbegriff zu
 * rendern (Filterung erfolgt client-seitig auf Basis dieser Liste).
 */

const adClient = require("../../services/adClient");

async function execute(_params, audit, credential) {
  return adClient.getAllGroups(credential);
}

module.exports = { execute };
