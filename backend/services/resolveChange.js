/**
 * resolveChange.js – Löst einen TopDesk-Change gegen org_departments + org_roles auf
 *
 * Typ-Erkennung über templateId (nicht category).
 * Feldmapping basiert auf Screenshot-Verifikation (siehe PROJECT_CONTEXT.md):
 *   optionalFields1: text1=Vorname, text2=Name, searchlist1=Abteilung,
 *                     text3=Telefonnummer, date1=Datum, text4=Raum
 *   optionalFields2: text1=Personalnummer (=SAM-Account), text2=Rolle,
 *                     boolean1=Zeitlich begrenzt (nur Austritt), date1=Rückkehrdatum (nur Austritt)
 * Diese Felder gelten global für alle Change-Typen (kein Pro-Template-Mapping in TopDesk).
 */

const db = require('../data/db');
const { TEMPLATE_TYPE_MAP } = require('../services/topdeskClient');
// Phase 6.2: TEMPLATE_TYPE_MAP kam hier bisher als eigene, zweite Kopie aus
// denselben .env-Variablen zusammengebaut — Duplikat-Risiko wie bei den
// Frontend-hasPermission()-Kopien. Jetzt einzige Quelle: topdeskClient.js.

function getTypeFromTemplate(templateId) {
  const type = TEMPLATE_TYPE_MAP[templateId];
  if (!type) throw new ResolveError(`Unbekannte templateId: ${templateId}`, { templateId });
  return type;
}

// ─── Payload normalisieren ───────────────────────────────────────────────────

function extractFields(change, type) {
  const f1 = change.optionalFields1 || {};
  const f2 = change.optionalFields2 || {};

  const sam        = (f2.text1 || '').trim();   // Personalnummer = SAM-Account
  const firstName  = (f1.text1 || '').trim();   // Vorname
  const lastName   = (f1.text2 || '').trim();   // Name (Nachname)
  const department = (f1.searchlist1 || '').trim(); // Abteilung (Dropdown)
  const targetDate = f1.date1 || null;
  const role       = (f2.text2 || '').trim();   // Rolle
  // Robust gegen echten Boolean ODER String-Kodierung (z.B. "true"/"ja"/"1"),
  // falls TopDesk Freie-Felder-Booleans anders serialisiert als die
  // Haupt-Objekt-Booleans (dort bestätigt: echte JSON-Booleans, siehe
  // emergencyChange/archived) — für optionalFields2.boolean1 noch nicht
  // verifiziert, da das Feld bislang nie befüllt war.
  const temporary  = f2.boolean1 === true
    || String(f2.boolean1).trim().toLowerCase() === 'true'
    || String(f2.boolean1).trim().toLowerCase() === 'ja';
  const returnDate = f2.date1 || null;          // Rückkehrdatum (nur Austritt)

  if (!sam) {
    throw new ResolveError(
      'SAM-Account (Personalnummer) fehlt in optionalFields2.text1 — ' +
      'Freie Felder 2 in TopDesk noch nicht befüllt.',
      { changeId: change.id }
    );
  }

  if (type === 'EINTRITT') {
    return { sam, firstName, lastName, department, targetDate, role };
  }

  if (type === 'AUSTRITT') {
    if (temporary && !returnDate) {
      throw new ResolveError(
        'Rückkehrdatum fehlt in optionalFields2.date1 — ' +
        'bei "Zeitlich begrenzt = Ja" ist es Pflicht.',
        { changeId: change.id, sam }
      );
    }
    return { sam, targetDate, temporary, returnDate };
  }

  if (type === 'ABT_WECHSEL') {
    return { sam, newDepartment: department, targetDate, role };
  }

  throw new ResolveError(`Unbekannter Typ: ${type}`);
}

// ─── Hauptfunktion ───────────────────────────────────────────────────────────

/**
 * @param {object} change  – Raw TopDesk Change-Objekt
 * @returns {object}       – Aufgelöster Soll-Zustand
 */
async function resolveChange(change) {
  const type = getTypeFromTemplate(change.templateId);
  const fields = extractFields(change, type);

  // Austritt braucht keine Org-Auflösung
  if (type === 'AUSTRITT') {
    return {
      type,
      sam:         fields.sam,
      targetDate:  fields.targetDate,
      temporary:   fields.temporary,
      returnDate:  fields.returnDate,
      // Zeitlich begrenzt (z.B. Elternzeit): nur Konto deaktivieren, Gruppen
      // und Exchange-Mailbox bleiben unangetastet. Sonst: vollständiger Austritt.
      steps: fields.temporary
        ? ['disable_account']
        : ['disable_account', 'move_to_inactive', 'remove_groups'],
    };
  }

  // ─── Abteilung aus DB laden ───────────────────────────────────────────────
  const deptName = fields.department || fields.newDepartment;

  if (!deptName) {
    throw new ResolveError(
      'Abteilung fehlt im Payload — bitte TopDesk-Template prüfen.',
      { fields }
    );
  }

  const deptResult = await db.query(
    'SELECT * FROM org_departments WHERE LOWER(name) = LOWER($1)',
    [deptName.trim()]
  );
  if (!deptResult.rows.length) {
    throw new ResolveError(
      `Abteilung "${deptName}" nicht in der Datenbank gefunden. ` +
      `Bitte in der Rollen-Konfiguration anlegen.`,
      { deptName }
    );
  }
  const department = deptResult.rows[0];

  // ─── Rolle wird für Eintritt und Abteilungswechsel benötigt ───────────────
  // Rolle kommt aus optionalFields2.text2 (Freie Felder 2), gilt für die
  // Zielabteilung. Kein Fallback: eine geratene Rolle würde stillschweigend
  // falsche AD-Gruppen/Mailbox-Konfiguration zuweisen — das ist ein
  // Berechtigungsrisiko, kein reiner Komfortverlust. Solange das Feld in
  // TopDesk nicht befüllt ist (offener Punkt 3), bleibt der Change bewusst
  // in "Ausstehend" mit klarer Meldung.
  let role = null;
  if (type === 'EINTRITT' || type === 'ABT_WECHSEL') {
    if (!fields.role) {
      throw new ResolveError(
        `Rolle fehlt in optionalFields2.text2 für Abteilung "${deptName}" — ` +
        `Freie Felder 2 in TopDesk noch nicht befüllt (siehe offener Punkt 3).`,
        { deptName, sam: fields.sam }
      );
    }
    const roleResult = await db.query(
      `SELECT * FROM org_roles WHERE department_id = $1 AND LOWER(name) = LOWER($2)`,
      [department.id, fields.role]
    );
    if (!roleResult.rows.length) {
      throw new ResolveError(
        `Rolle "${fields.role}" nicht in Abteilung "${deptName}" gefunden. ` +
        `Bitte in der Rollen-Konfiguration anlegen.`,
        { deptName, role: fields.role }
      );
    }
    role = roleResult.rows[0];
  }

  // ─── Eintritt ─────────────────────────────────────────────────────────────
  if (type === 'EINTRITT') {
    return {
      type,
      sam:             fields.sam,
      firstName:       fields.firstName,
      lastName:        fields.lastName,
      targetDate:      fields.targetDate,
      targetOU:        department.ad_ou,
      adGroups:        role.ad_groups,
      mailboxDatabase: role.mailbox_database,
      mailboxSizeMb:   role.mailbox_size_mb,
      manualTasks:     role.manual_tasks,
      department:      department.name,
      role:            role.name,
      steps: [
        'create_ad_account',
        'assign_groups',
        'enable_mailbox',
        'configure_mailbox',
      ],
    };
  }

  // ─── Abteilungswechsel ────────────────────────────────────────────────────
  if (type === 'ABT_WECHSEL') {
    return {
      type,
      sam:           fields.sam,
      targetDate:    fields.targetDate,
      newTargetOU:   department.ad_ou,
      newDepartment: department.name,
      newRole:       role.name,
      // Gruppen-Delta wird zur Laufzeit berechnet (aktuell vs. Soll aus Rolle)
      newAdGroups:   role.ad_groups,
      newMailboxDatabase: role.mailbox_database,
      newMailboxSizeMb:   role.mailbox_size_mb,
      manualTasks:   role.manual_tasks,
      steps: [
        'move_ou',
        'set_department',
        'apply_group_delta',
      ],
    };
  }
}

// ─── Fehlerklasse ─────────────────────────────────────────────────────────────

class ResolveError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name    = 'ResolveError';
    this.context = context;
  }
}

module.exports = { resolveChange, ResolveError, getTypeFromTemplate };