/**
 * scheduler.js – Cron holt neue TopDesk-Changes und speichert sie in DB.
 * Führt NICHT aus — Ausführung nur manuell per Button im Frontend.
 *
 * Phase 6.2 (System-Tab): Der Cron wird nicht mehr einmalig beim Modul-Laden
 * aus .env gestartet, sondern über configureCron() von außen gesteuert
 * (server.js beim Start mit Werten aus platform_settings, adminConfig.js bei
 * Änderungen über die Konfigseite). Dadurch wirken Enabled/Intervall-Änderungen
 * sofort, ohne Serverneustart. .env-Werte (TOPDESK_CRON_ENABLED/_INTERVAL_MIN)
 * dienen weiterhin als Fallback-Default, falls platform_settings leer ist.
 */

const topdesk           = require('../services/topdeskClient');
const { ingestChange }  = require('./ingestWorker');

const ENV_DEFAULT_ENABLED      = process.env.TOPDESK_CRON_ENABLED === 'true';
const ENV_DEFAULT_INTERVAL_MIN = parseInt(process.env.TOPDESK_CRON_INTERVAL_MIN || '15', 10);

let timerId         = null;
let currentEnabled  = false;
let currentInterval = ENV_DEFAULT_INTERVAL_MIN;

async function runCycle() {
  console.log(`[Scheduler] TopDesk-Poll gestartet (${new Date().toISOString()})`);
  try {
    const changes = await topdesk.getAllPendingChanges();
    console.log(`[Scheduler] ${changes.length} Changes gefunden`);

    for (const change of changes) {
      try {
        await ingestChange(change.number);
      } catch (err) {
        console.error(`[Scheduler] Fehler bei ${change.number}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Poll fehlgeschlagen:', err.message);
  }
}

/**
 * Setzt den Cron auf den gewünschten Zustand: stoppt einen laufenden Timer
 * immer zuerst (idempotent), startet bei enabled=true neu mit intervalMin.
 * Aufgerufen beim Serverstart (server.js, mit DB-Werten) und bei jeder
 * Änderung über die Konfigseite (adminConfig.js).
 */
function configureCron({ enabled, intervalMin }) {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }

  currentEnabled  = Boolean(enabled);
  currentInterval = Number.isInteger(intervalMin) && intervalMin > 0 ? intervalMin : ENV_DEFAULT_INTERVAL_MIN;

  if (currentEnabled) {
    timerId = setInterval(runCycle, currentInterval * 60 * 1000);
    console.log(`[Scheduler] TopDesk-Cron aktiv: alle ${currentInterval} Minuten`);
  } else {
    console.log('[Scheduler] TopDesk-Cron deaktiviert.');
  }
}

/**
 * Aktueller Zustand — für die Systemstatus-Seite (health.js), damit dort
 * nicht mehr direkt process.env gelesen wird (das wäre nach einer Änderung
 * über die Konfigseite veraltet).
 */
function getCronStatus() {
  return {
    enabled:     currentEnabled,
    intervalMin: currentInterval,
    running:     timerId !== null,
  };
}

module.exports = {
  runCycle,
  configureCron,
  getCronStatus,
  ENV_DEFAULT_ENABLED,
  ENV_DEFAULT_INTERVAL_MIN,
};
