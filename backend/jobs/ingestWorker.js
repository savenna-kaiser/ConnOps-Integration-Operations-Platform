/**
 * ingestWorker.js – Gemeinsame Ingest-Logik für Webhook und Scheduler
 */

const topdesk                        = require('../services/topdeskClient');
const { resolveChange, ResolveError } = require('../services/resolveChange');
const { computeFingerprint }         = require('../services/changeFingerprint');
const db                             = require('../data/db');

// Rohdatum-Extraktion, typspezifisch - AUSTRITT nutzt optionalFields2.date1,
// EINTRITT/ABT_WECHSEL nutzen optionalFields1.date1 (identische Zuordnung
// wie in resolveChange.js, siehe dortiger Kopfkommentar). Als gemeinsame
// Funktion ausgelagert (gefunden 11.09.2026), da diese Logik bisher an
// ZWEI Stellen unabhaengig voneinander haette gepflegt werden muessen:
// beim allerersten INSERT eines neuen Changes UND im ResolveError-
// Fehlerfall-Pfad (dort bisher komplett gefehlt, siehe unten).
function extractRawTargetDate(change, type) {
  const f1 = change.optionalFields1 || {};
  const f2 = change.optionalFields2 || {};
  return (type === 'AUSTRITT' ? f2.date1 : f1.date1) || null;
}

async function detectConflicts(resolved, changeId) {
  if (!resolved.sam) return null;

  const hard = await db.query(
    `SELECT change_id, type, status FROM topdesk_changes
     WHERE change_id != $1
       AND status NOT IN ('DONE', 'FAILED')
       AND (resolved->>'sam') = $2`,
    [changeId, resolved.sam]
  );
  if (hard.rows.length) {
    return {
      level:     'CONFLICT',
      reason:    `SAM-Account "${resolved.sam}" bereits in Change ${hard.rows[0].change_id} (${hard.rows[0].status})`,
      changeRef: hard.rows[0].change_id,
    };
  }

  if (resolved.firstName && resolved.lastName && resolved.department && resolved.targetDate) {
    const soft = await db.query(
      `SELECT change_id FROM topdesk_changes
       WHERE change_id != $1
         AND status NOT IN ('DONE', 'FAILED')
         AND (resolved->>'firstName')  = $2
         AND (resolved->>'lastName')   = $3
         AND (resolved->>'department') = $4
         AND ABS(EXTRACT(EPOCH FROM (target_date - $5::date)) / 86400) <= 7`,
      [changeId, resolved.firstName, resolved.lastName, resolved.department, resolved.targetDate]
    );
    if (soft.rows.length) {
      return {
        level:     'WARNING',
        reason:    `Mögliches Duplikat: gleicher Name + Abteilung + Zieldatum ±7 Tage (${soft.rows[0].change_id})`,
        changeRef: soft.rows[0].change_id,
      };
    }
  }

  return null;
}

async function ingestChange(changeId) {
  const change = await topdesk.getChangeById(changeId);
  const type   = topdesk.getTypeFromChange(change);

  if (!type) {
    console.warn(`[Ingest] Unbekannte templateId ${change.templateId} — ignoriert`);
    return;
  }

  // In DB speichern — ON CONFLICT ignorieren (bereits vorhanden)
  await db.query(
    `INSERT INTO topdesk_changes
       (change_id, type, status, target_date, payload)
     VALUES ($1, $2, 'PENDING', $3, $4)
     ON CONFLICT (change_id) DO NOTHING`,
    [
      change.number,
      type,
      extractRawTargetDate(change, type),
      JSON.stringify(change),
    ]
  );

  // Aktuellen Status abfragen, um zu entscheiden, ob neu aufgeloest wird -
  // approved_fingerprint gleich mit abgefragt, fuer die spaetere Pruefung,
  // ob eine bestehende Freigabe noch zur neuen Auflösung passt (siehe
  // changeFingerprint.js, Projektnotizen 09.09.2026).
  const existing = await db.query(
    `SELECT status, approved_fingerprint FROM topdesk_changes WHERE change_id = $1`,
    [change.number]
  );

  // Neu aufloesen bei jedem Ingest-Aufruf (stuendlicher Scheduler-Poll ODER
  // manuelles Reingest ueber reingestChange.js) - AUSSER bei drei Zustaenden,
  // wo eine erneute fachliche Bewertung falsch waere:
  //   DONE       - abgeschlossen, nachtraegliche Neubewertung waere semantisch falsch
  //   PROCESSING - wird gerade ausgefuehrt, resolved darf waehrenddessen nicht wechseln
  //   PARTIAL    - bereits teilweise ausgefuehrte Realitaet existiert, eine neue
  //                Resolution koennte einen anderen Zielzustand ergeben und die
  //                Nachvollziehbarkeit beschaedigen
  // CONFLICT/WARNING/FAILED werden bewusst WEITERHIN neu bewertet - eine
  // zwischenzeitliche manuelle Aenderung in TopDesk (z.B. Korrektur eines
  // Feldes) soll spaetestens beim naechsten stuendlichen Poll ankommen,
  // statt fuer immer eingefroren zu bleiben (vorher: nur PENDING wurde neu
  // aufgeloest, alles andere blieb dauerhaft eingefroren - Ursache dafuer,
  // dass reingestChange.js als manueller Notbehelf noetig wurde).
  if (['DONE', 'PROCESSING', 'PARTIAL'].includes(existing.rows[0]?.status)) return;

  // resolveChange
  let resolved = null;
  try {
    resolved = await resolveChange(change);
  } catch (err) {
    if (err instanceof ResolveError) {
      // Freigabe verfaellt immer bei komplettem Aufloesungs-Fehlschlag -
      // eine bestehende Freigabe kann dann unmoeglich noch zur aktuellen
      // Situation passen.
      //
      // WICHTIG (gefunden 11.09.2026): target_date wird jetzt AUCH im
      // Fehlerfall aktualisiert - vorher wurde es hier nie angefasst,
      // wodurch Changes, die (auch nur voruebergehend) in CONFLICT/
      // WARNING/FAILED liefen, fuer immer auf ihrem urspruenglichen,
      // moeglicherweise laengst veralteten Wert (oft NULL) haengen
      // blieben, selbst wenn das Datum in TopDesk laengst nachgetragen
      // wurde. Nutzt dieselbe typspezifische Extraktion wie der
      // Erfolgsfall und der allererste INSERT.
      await db.query(
        `UPDATE topdesk_changes
         SET status = 'CONFLICT', resolved = $1, target_date = $3,
             approved_at = NULL, approved_by = NULL, approved_fingerprint = NULL
         WHERE change_id = $2`,
        [
          JSON.stringify({ error: err.message, context: err.context }),
          change.number,
          extractRawTargetDate(change, type),
        ]
      );
      return;
    }
    throw err;
  }

  // Konflikt-Erkennung
  const conflict = await detectConflicts(resolved, change.number);
  const status   = conflict ? conflict.level : 'PENDING';

  // Freigabe ist an eine KONKRETE Auflösungsversion gebunden (siehe
  // changeFingerprint.js). Nur wenn der neu berechnete Fingerabdruck
  // exakt zum bereits freigegebenen passt, bleibt approved_at/approved_by
  // erhalten - bei jeder Abweichung verfaellt die Freigabe automatisch.
  // KEIN automatisches Wiederherstellen, falls sich die Daten spaeter
  // zufaellig wieder decken sollten - erfordert immer einen erneuten,
  // bewussten menschlichen Freigabeklick.
  const newFingerprint  = computeFingerprint(resolved);
  const existingFp      = existing.rows[0]?.approved_fingerprint;
  const approvalStillValid = !!existingFp && existingFp === newFingerprint;

  // WICHTIG (gefunden 09.09.2026): target_date wird jetzt bei JEDER
  // erfolgreichen Neuaufloesung aktualisiert, nicht nur beim allerersten
  // Einlesen. Vorher blieb die Spalte fuer immer auf den Wert des ersten
  // Kontakts eingefroren (nur in der INSERT-Anweisung gesetzt, nie in
  // einem UPDATE) - falls das Datumsfeld beim allerersten Einlesen noch
  // leer war, blieb target_date dauerhaft NULL, obwohl resolved.targetDate
  // bei jeder Neuaufloesung korrekt aktualisiert wurde. Das fiel auf, als
  // ein UI-Feature (Frueh-Ausfuehren-Warnung), das die rohe target_date-
  // Spalte statt resolved.targetDate nutzt, nicht wie erwartet reagierte.
  await db.query(
    `UPDATE topdesk_changes
     SET resolved = $1, status = $2, target_date = $5,
         approved_at          = CASE WHEN $4 THEN approved_at          ELSE NULL END,
         approved_by          = CASE WHEN $4 THEN approved_by          ELSE NULL END,
         approved_fingerprint = CASE WHEN $4 THEN approved_fingerprint ELSE NULL END
     WHERE change_id = $3`,
    [JSON.stringify(resolved), status, change.number, approvalStillValid, resolved.targetDate || null]
  );
}

/**
 * Holt alle aktuell bei TopDesk wartenden Changes und ruft fuer jeden
 * ingestChange() auf - gemeinsame Funktion fuer CLI-Werkzeug
 * (tools/syncPendingChanges.js) UND den manuellen "Von TopDesk
 * abrufen"-Button (POST /topdesk/sync), damit es nur einen fachlichen
 * Entscheidungsweg gibt (siehe Projektnotizen 07.09.2026).
 *
 * Dank des Guards in ingestChange() (nur DONE/PROCESSING/PARTIAL werden
 * uebersprungen) ist der Aufruf hier fuer JEDEN wartenden Change sicher -
 * keine Unterscheidung zwischen "schon bekannt" und "neu" mehr noetig,
 * bereits bekannte Changes werden dabei einfach passend neu bewertet
 * (Selbstheilung bei CONFLICT/WARNING/FAILED).
 */
async function syncPendingChanges() {
  const pending = await topdesk.getAllPendingChanges({ limit: 200 });
  const results = { total: pending.length, ok: [], errors: [] };

  for (const c of pending) {
    try {
      await ingestChange(c.id);
      results.ok.push(c.number);
    } catch (err) {
      results.errors.push({ number: c.number, reason: err.message });
    }
  }

  return results;
}

module.exports = { ingestChange, syncPendingChanges };