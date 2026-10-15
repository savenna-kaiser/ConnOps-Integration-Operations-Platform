/**
 * scheduler.js – Cron holt neue TopDesk-Changes und speichert sie in DB.
 *
 * WICHTIG (Sicherheitsgrenze, bewusst geaendert 09.09.2026 - siehe
 * Projektnotizen "Freigabe von Ausführung entkoppeln"): Fuehrt Changes
 * NUR dann automatisch aus, wenn sie ZUVOR EXPLIZIT DURCH EINEN MENSCHEN
 * FREIGEGEBEN wurden (POST /changes/:id/approve) UND ihr Zieldatum
 * erreicht ist UND die freigegebenen Ausfuehrungsdaten seitdem
 * unveraendert sind (Fingerabdruck-Abgleich, siehe changeFingerprint.js).
 * Die Automatisierung ersetzt NICHT die menschliche Freigabe, nur den
 * zweiten Klick zum tatsaechlichen Ausfuehrungszeitpunkt. Ohne
 * vorherige Freigabe bleibt es weiterhin bei rein manueller Ausfuehrung
 * per Button im Frontend.
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
const { logSuccess, logFailure, writeAuditLog, ACTION_TYPES } = require('../services/auditLog');
const { computeFingerprint } = require('../services/changeFingerprint');
const executeChange     = require('../actions/topdesk/executeChange');
const db                = require('../data/db');

// Fester Actor fuer automatisierte, nicht benutzerausgeloeste Aktionen
// (gleiche Konvention wie im deprecated processTopdeskChanges.js).
const ACTOR = 'topdesk-automation';

// "audit"-Objekt fuer executeChange.execute(), das sonst aus der
// Benutzer-Session kommt (siehe auditMiddleware.js). Fuer automatische
// Ausfuehrung gibt es keine Session - executeChange.js braucht aber
// nachweislich NUR .actor und .log() (KEIN .getCredential(), das AD-Konto
// kommt bei der Ausfuehrung selbst aus process.env, siehe
// executeChange.js AD_CREDENTIAL) - dieses Objekt reicht daher aus.
const systemAudit = {
  actor: ACTOR,
  log(entry) {
    writeAuditLog({ ...entry, actor: entry.actor || ACTOR });
  },
};

const ENV_DEFAULT_ENABLED      = process.env.TOPDESK_CRON_ENABLED === 'true';
const ENV_DEFAULT_INTERVAL_MIN = parseInt(process.env.TOPDESK_CRON_INTERVAL_MIN || '15', 10);

let timerId         = null;
let currentEnabled  = false;
let currentInterval = ENV_DEFAULT_INTERVAL_MIN;

/**
 * Sucht freigegebene Changes, deren Zieldatum erreicht ist, und fuehrt sie
 * automatisch aus - NEUE Sicherheitsgrenze (bewusst so entschieden,
 * Projektnotizen 09.09.2026): Ein Change darf automatisch ausgefuehrt
 * werden, WENN ER ZUVOR EXPLIZIT DURCH EINEN MENSCHEN FREIGEGEBEN WURDE
 * UND die freigegebenen Ausfuehrungsdaten seitdem UNVERAENDERT sind
 * (Fingerabdruck-Abgleich, siehe changeFingerprint.js). Die Automatisierung
 * ersetzt NICHT die Freigabe selbst, nur den zweiten Klick zum
 * tatsaechlichen Ausfuehrungszeitpunkt.
 *
 * Freigabe-Ungueltigmachung passiert primaer bereits in ingestChange()
 * (jede Neuauflösung prueft den Fingerabdruck) - diese Funktion prueft
 * unmittelbar vor der eigentlichen Ausfuehrung TROTZDEM nochmal
 * gegen, als letzte Sicherheitsbremse direkt vor einer echten
 * AD-Schreibaktion.
 */
async function runApprovedExecutions() {
  const { rows } = await db.query(
    `SELECT change_id, resolved, approved_fingerprint
     FROM topdesk_changes
     WHERE approved_at IS NOT NULL
       AND target_date IS NOT NULL
       AND target_date <= NOW()
       AND status = 'PENDING'`
  );

  if (!rows.length) return;
  console.log(`[Scheduler] ${rows.length} freigegebene(r), faellige(r) Change(s) zur automatischen Ausfuehrung.`);

  for (const row of rows) {
    const currentFingerprint = computeFingerprint(row.resolved);
    if (currentFingerprint !== row.approved_fingerprint) {
      console.warn(`[Scheduler] Freigabe fuer ${row.change_id} passt nicht mehr zum aktuellen Auflösungsstand - automatische Ausfuehrung uebersprungen (erfordert erneute Freigabe).`);
      continue;
    }

    try {
      console.log(`[Scheduler] Automatische Ausfuehrung (freigegeben + Zieldatum erreicht): ${row.change_id}`);
      await executeChange.execute({ changeId: row.change_id }, systemAudit);
    } catch (err) {
      console.error(`[Scheduler] Automatische Ausfuehrung fehlgeschlagen fuer ${row.change_id}:`, err.message);
    }
  }
}

async function runCycle() {
  console.log(`[Scheduler] TopDesk-Poll gestartet (${new Date().toISOString()})`);
  try {
    const changes = await topdesk.getAllPendingChanges();
    console.log(`[Scheduler] ${changes.length} Changes gefunden`);

    let errorCount = 0;
    for (const change of changes) {
      try {
        await ingestChange(change.number);
      } catch (err) {
        errorCount++;
        console.error(`[Scheduler] Fehler bei ${change.number}:`, err.message);
      }
    }

    // WICHTIG: health.js (checkTopdeskCron) liest genau diesen Eintrag,
    // um den TopDesk-Sync-Status auf der Statusseite zu bestimmen. Ohne
    // diesen Aufruf blieb "lastRun" dort IMMER null - der Status zeigte
    // deshalb permanent "Warnung" ("aktiviert, aber noch nie gelaufen"),
    // unabhaengig davon, wie zuverlaessig der Scheduler tatsaechlich lief
    // (gefunden 07.09.2026 anhand echter Server-Logs, die zuverlaessige
    // stuendliche Laeufe zeigten, waehrend die Statusseite trotzdem
    // "Warnung" anzeigte).
    if (errorCount > 0) {
      logFailure(ACTION_TYPES.TOPDESK_CRON_RUN, ACTOR, 'topdesk-poll', 'system',
        `${errorCount} von ${changes.length} Changes fehlgeschlagen`,
        { total: changes.length, errors: errorCount });
    } else {
      logSuccess(ACTION_TYPES.TOPDESK_CRON_RUN, ACTOR, 'topdesk-poll', 'system',
        { total: changes.length });
    }
  } catch (err) {
    console.error('[Scheduler] Poll fehlgeschlagen:', err.message);
    logFailure(ACTION_TYPES.TOPDESK_CRON_RUN, ACTOR, 'topdesk-poll', 'system', err.message);
  }

  // Getrennter try/catch: ein Fehler bei der automatischen Ausfuehrung
  // soll NICHT die TOPDESK_CRON_RUN-Protokollierung oben verfaelschen
  // (die betrifft ausschliesslich den Ingest-Poll, nicht die Ausfuehrung).
  try {
    await runApprovedExecutions();
  } catch (err) {
    console.error('[Scheduler] Automatische Ausfuehrung fehlgeschlagen (uebergreifend):', err.message);
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
