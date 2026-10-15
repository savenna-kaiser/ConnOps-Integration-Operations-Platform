/**
 * resolveChange.js – Löst einen TopDesk-Change gegen org_departments + org_roles auf
 *
 * Typ-Erkennung über templateId (nicht category).
 *
 * Feldmapping: die urspruengliche, per Screenshot verifizierte Annahme
 * (siehe PROJECT_CONTEXT.md) galt vermeintlich global fuer alle
 * Change-Typen - erwies sich am 29.07.2026 fuer AUSTRITT als falsch,
 * sowohl bei den Text- als auch den Datumsfeldern (siehe Kommentare in
 * extractFields() fuer die jeweilige, mit echten Formulardaten
 * verifizierte Begruendung). Tatsaechliches Mapping ist NICHT global,
 * sondern typabhaengig:
 *   EINTRITT/ABT_WECHSEL (bislang UNBESTAETIGT, keine echten Datenpunkte):
 *     optionalFields1: text1=Vorname, text2=Name, searchlist1=Abteilung,
 *                       text3=Telefonnummer, date1=Datum, text4=Raum
 *     optionalFields2: text1=Personalnummer (=SAM-Account), text2=Rolle
 *   AUSTRITT (bestaetigt anhand echter Formulardaten, CH-202608-031):
 *     optionalFields2: text1=Name, text2=Personalnummer (=SAM-Account),
 *                       boolean1=Zeitlich begrenzt, date1=Austrittsdatum/
 *                       Sperrdatum, date2=Voraussichtlicher Wiedereintritt
 *                       (optionalFields1 wird bei diesem Typ nicht genutzt)
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

  // SAM-Account-Feld ist je nach Change-Typ unterschiedlich belegt:
  //   - AUSTRITT: text2 = Personalnummer. Bestaetigt am 29.07.2026 durch
  //     den TopDesk-Admin selbst (direkt beim Ausfuellen von
  //     CH-202608-031 beobachtet), zusaetzlich durch ein zweites,
  //     unabhaengiges Beispiel mit identischem Muster untermauert
  //     (CH-202607-005). Vorher stand hier faelschlich text1 (siehe
  //     urspruengliche Kopfkommentar-Annahme, PROJECT_CONTEXT.md).
  //   - ABT_WECHSEL: text2 = Personalnummer. Bestaetigt am 08.09.2026
  //     anhand des ersten echten Datenpunkts fuer diesen Typ
  //     (CH-202609-001: f2.text1="", f2.text2="800424") - identisches
  //     Vertauschungsmuster wie bei AUSTRITT, hier aber durch ECHTE
  //     ABT_WECHSEL-Daten belegt, nicht per Analogieschluss uebernommen.
  //   - EINTRITT: text1 = Personalnummer. UNVERAENDERT gegenueber der
  //     urspruenglichen, Screenshot-verifizierten Annahme - fuer diesen
  //     Typ liegt weiterhin KEIN einziger echter Datenpunkt vor. Bewusst
  //     nicht angetastet, bis echte Daten das belegen oder widerlegen.
  const sam = (type === 'AUSTRITT' || type === 'ABT_WECHSEL')
    ? (f2.text2 || '').trim()
    : (f2.text1 || '').trim();

  const firstName  = (f1.text1 || '').trim();   // Vorname
  const lastName   = (f1.text2 || '').trim();   // Name (Nachname)

  // department: TopDesk liefert bei Dropdown-/Verweisfeldern (searchlist)
  // ein Objekt {id, name}, KEINEN reinen String - bestaetigt am
  // 08.09.2026 anhand von CH-202609-001 (Absturz "trim is not a
  // function", da .trim() blind auf ein Objekt angewendet wurde).
  // Fallback auf String-Fall bleibt erhalten, falls TopDesk das Feld in
  // anderen Situationen doch als reinen Text liefert.
  const departmentRaw = f1.searchlist1;
  const department = (
    departmentRaw && typeof departmentRaw === 'object'
      ? (departmentRaw.name || '')
      : (departmentRaw || '')
  ).trim();

  // role: NOCH UNGEKLAERT fuer ABT_WECHSEL (gefunden 08.09.2026). Das
  // erste echte Beispiel (CH-202609-001) hatte f1.text3/text4 leer und
  // f2.text2 wird jetzt korrekt als sam gelesen (s.o.) - es ist aktuell
  // UNBEKANNT, welches Feld bei ABT_WECHSEL tatsaechlich die Rolle
  // enthaelt. Bewusst NICHT geraten. Falls das Rollenfeld im TopDesk-
  // Formular schlicht nicht ausgefuellt war (Testdaten unvollstaendig),
  // waere die Loesung: erneut mit ausgefuelltem Rollenfeld testen und
  // pruefen, welches Freie Feld sich dabei aendert - nicht am Code
  // raten.
  const role       = (f2.text2 || '').trim();   // Rolle (nur EINTRITT genutzt, siehe Hinweis oben zu ABT_WECHSEL)

  // targetDate ist je nach Typ ebenfalls unterschiedlich belegt:
  //   - AUSTRITT: f2.date1 = "Austrittsdatum / Sperrdatum". Bestaetigt
  //     anhand der tatsaechlichen TopDesk-Formularbeschriftung (29.07.2026,
  //     CH-202608-031: Formularfeld "Austrittsdatum / Sperrdatum" = 11.08.2026,
  //     identisch mit f2.date1). f1.date1 ist bei Austritt-Changes laut
  //     dumpFieldsByTemplate.js-Auswertung immer leer (Freie Felder 1
  //     werden fuer diesen Typ gar nicht genutzt) - vorher faelschlich
  //     von dort gelesen, targetDate war dadurch bei AUSTRITT immer null.
  //   - EINTRITT/ABT_WECHSEL: f1.date1 = "Datum", UNVERAENDERT gegenueber
  //     der urspruenglichen Annahme - bislang kein echter Datenpunkt,
  //     bewusst nicht angetastet (siehe SAM-Account-Kommentar oben).
  const targetDate = type === 'AUSTRITT'
    ? (f2.date1 || null)
    : (f1.date1 || null);

  // Robust gegen echten Boolean ODER String-Kodierung (z.B. "true"/"ja"/"1"),
  // falls TopDesk Freie-Felder-Booleans anders serialisiert als die
  // Haupt-Objekt-Booleans (dort bestätigt: echte JSON-Booleans, siehe
  // emergencyChange/archived) — für optionalFields2.boolean1 noch nicht
  // verifiziert, da das Feld bislang nie befüllt war.
  const temporary  = f2.boolean1 === true
    || String(f2.boolean1).trim().toLowerCase() === 'true'
    || String(f2.boolean1).trim().toLowerCase() === 'ja';

  // f2.date2 = "Voraussichtlicher Wiedereintritt". Bestaetigt anhand der
  // tatsaechlichen TopDesk-Formularbeschriftung (CH-202608-031:
  // Formularfeld "Voraussichtlicher Wiedereintritt" = 31.12.2099, identisch
  // mit f2.date2). Vorher stand hier faelschlich f2.date1 (das ist das
  // Austrittsdatum, siehe targetDate oben) - der Kopfkommentar dieser
  // Datei hatte "date1=Rückkehrdatum" behauptet, was falsch war (dieselbe
  // Art Fehler wie beim SAM-Account text1/text2-Mapping).
  const returnDate = f2.date2 || null;          // Rückkehrdatum (nur Austritt)

  if (!sam) {
    const feld = type === 'AUSTRITT' ? 'optionalFields2.text2' : 'optionalFields2.text1';
    throw new ResolveError(
      `SAM-Account (Personalnummer) fehlt in ${feld} — ` +
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
    // Name steht bei AUSTRITT als EIN kombinierter String in
    // optionalFields2.text1, Format "Nachname, Vorname" (bestaetigt
    // anhand CH-202608-031, siehe Kopfkommentar). Wird hier aufgesplittet
    // in firstName/lastName - dieselben Feldnamen, die EINTRITT/
    // ABT_WECHSEL bereits nutzen, damit die bestehende Frontend-Anzeige
    // (erwartet genau diese beiden Felder) ohne weitere Aenderung auch
    // fuer AUSTRITT greift. Gefunden 10.09.2026: bisher komplett
    // uebersehen, obwohl das Feld schon lange bekannt/dokumentiert war.
    const nameRaw = (f2.text1 || '').trim();
    let austrittFirstName = '';
    let austrittLastName  = nameRaw;
    if (nameRaw.includes(',')) {
      const [nachname, vorname] = nameRaw.split(',');
      austrittLastName  = (nachname || '').trim();
      austrittFirstName = (vorname  || '').trim();
    }
    return {
      sam, targetDate, temporary, returnDate,
      firstName: austrittFirstName,
      lastName:  austrittLastName,
    };
  }

  if (type === 'ABT_WECHSEL') {
    return { sam, firstName, lastName, newDepartment: department, targetDate, role };
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
      firstName:   fields.firstName,
      lastName:    fields.lastName,
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

  // ─── Abteilung/Rolle aus DB laden ─────────────────────────────────────────
  // ARCHITEKTUR (final festgelegt 08.09.2026, nach mehreren Iterationen):
  // TopDesk trifft die fachliche Entscheidung, welche Rolle gemeint ist,
  // BEREITS EXPLIZIT (der Mensch waehlt z.B. "GB0-Personal-Leitung" statt
  // "GB0-Personal" bewusst aus). ConnOps rekonstruiert diese Entscheidung
  // NICHT aus anderen Daten (weder Name-Heuristik noch OU-Ableitung) -
  // reiner, strikter Namensabgleich zwischen dem gelieferten Wert und
  // org_roles.name. Klare Verantwortungstrennung:
  //   - Aufloesung ("welche Rolle?")     -> TopDesk (dieser Abgleich hier)
  //   - Validierung ("organisatorisch    -> AD/OU (eigenstaendiger,
  //     plausibel?")                        spaeterer Schritt, NICHT Teil
  //                                          dieser Aufloesung)
  //   - Berechtigungen                   -> ConnOps-Rolle selbst
  //
  // Bewusst KEIN topdesk_name-Alias auf Rollenebene (anders als bei
  // Abteilungen): TopDesk liefert hier bereits den stabilen fachlichen
  // Schluessel direkt - ein zusaetzliches Alias-Feld waere eine
  // ueberfluessige weitere Mapping-Ebene. Vorbedingung: ConnOps-Rollen
  // werden entsprechend benannt (z.B. "GB0-Personal-Leitung"), damit der
  // Name selbst der Integrationsschluessel ist.
  //
  // Frueher zwischenzeitlich erwogen und wieder verworfen: OU-basierte
  // Ableitung bzw. "OU zuerst, Name als Tie-Breaker" - macht die OU
  // faelschlich zum Teil der fachlichen Rollenauswahl, obwohl TopDesk die
  // Information bereits eindeutig liefert. Wuerde zudem bedeuten: aendert
  // sich morgen die AD-OU-Struktur, koennte sich unbemerkt aus "Personal"
  // "Personal-Leitung" ergeben - genau das gewuenschte Fail-Safe-Verhalten
  // (0 oder >1 Treffer -> CONFLICT) waere dadurch unterlaufen worden.
  //
  // Fehlerverhalten: kein Fallback, keine Aehnlichkeitssuche, kein
  // "wahrscheinlich diese Rolle" - 0 Treffer -> CONFLICT, >1 Treffer
  // (Rollenname nicht global eindeutig) -> CONFLICT.
  //
  // BEWUSST NICHT auf EINTRITT uebertragen: dafuer liegt weiterhin KEIN
  // einziger echter Datenpunkt vor - die urspruengliche, unbestaetigte
  // Annahme (Abteilung zuerst, siehe unten) bleibt dort unveraendert.
  let department, role;

  if (type === 'ABT_WECHSEL') {
    const roleName = fields.department || fields.newDepartment;
    if (!roleName) {
      throw new ResolveError(
        'Rolle fehlt im Payload — bitte TopDesk-Template prüfen.',
        { fields }
      );
    }

    const roleResult = await db.query(
      `SELECT r.*, d.name AS department_name, d.ad_ou AS department_ad_ou
       FROM org_roles r
       JOIN org_departments d ON d.id = r.department_id
       WHERE LOWER(r.name) = LOWER($1)`,
      [roleName.trim()]
    );

    if (roleResult.rows.length === 0) {
      throw new ResolveError(
        `Rolle "${roleName}" nicht in der Datenbank gefunden. ` +
        `Bitte in der Rollen-Konfiguration anlegen.`,
        { roleName }
      );
    }
    if (roleResult.rows.length > 1) {
      // Kein automatisches Auswaehlen "des wahrscheinlichsten" Treffers -
      // ein falsch zugeordneter Bereich waere ein Berechtigungsrisiko.
      throw new ResolveError(
        `Rolle "${roleName}" ist nicht eindeutig - existiert in ` +
        `${roleResult.rows.length} Abteilungen (${roleResult.rows.map(r => r.department_name).join(', ')}). ` +
        `Bitte Rollennamen eindeutig machen.`,
        { roleName, matches: roleResult.rows.map(r => r.department_name) }
      );
    }

    role = roleResult.rows[0];
    department = { id: role.department_id, name: role.department_name, ad_ou: role.department_ad_ou };

  } else {
    // EINTRITT (unveraendert): Abteilung zuerst, Rolle danach INNERHALB
    // dieser Abteilung gesucht.
    const deptName = fields.department || fields.newDepartment;

    if (!deptName) {
      throw new ResolveError(
        'Abteilung fehlt im Payload — bitte TopDesk-Template prüfen.',
        { fields }
      );
    }

    // Sucht sowohl gegen den AD-treuen Namen (name) als auch gegen einen
    // optionalen TopDesk-Alias (topdesk_name) - fuer den Fall, dass
    // TopDesk und AD/ConnOps unterschiedliche Namen fuer dieselbe
    // Abteilung verwenden (unabhaengig vom ABT_WECHSEL-Rollen-Fund oben -
    // bleibt als generische Absicherung fuer EINTRITT erhalten).
    const deptResult = await db.query(
      `SELECT * FROM org_departments
       WHERE LOWER(name) = LOWER($1) OR LOWER(topdesk_name) = LOWER($1)`,
      [deptName.trim()]
    );
    if (!deptResult.rows.length) {
      throw new ResolveError(
        `Abteilung "${deptName}" nicht in der Datenbank gefunden ` +
        `(weder als Name noch als TopDesk-Alias). ` +
        `Bitte in der Rollen-Konfiguration anlegen oder den TopDesk-Alias ergänzen.`,
        { deptName }
      );
    }
    department = deptResult.rows[0];

    // ─── Rolle wird für Eintritt benötigt ───────────────────────────────
    // Rolle kommt aus optionalFields2.text2 (Freie Felder 2). Kein
    // Fallback: eine geratene Rolle würde stillschweigend falsche
    // AD-Gruppen/Mailbox-Konfiguration zuweisen — das ist ein
    // Berechtigungsrisiko, kein reiner Komfortverlust. Solange das Feld
    // in TopDesk nicht befüllt ist (offener Punkt 3), bleibt der Change
    // bewusst in "Ausstehend" mit klarer Meldung.
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
      targetOU:        role.ad_ou || department.ad_ou,
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
      firstName:     fields.firstName,
      lastName:      fields.lastName,
      targetDate:    fields.targetDate,
      newTargetOU:   role.ad_ou || department.ad_ou,
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