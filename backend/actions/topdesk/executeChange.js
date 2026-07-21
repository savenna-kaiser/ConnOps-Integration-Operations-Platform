/**
 * executeChange.js – Ausführungs-Pipeline für TopDesk-Changes
 *
 * Zweistufig:
 *   Stufe 1 (automatisch): AD + Exchange — Steps werden in topdesk_change_steps geschrieben
 *   Stufe 2 (manuell):     rollenspezifische Tasks via TopDesk-API (pending: API-Endpunkt prüfen)
 *
 * Einzelfehler werden gesammelt, Pipeline bricht nicht ab.
 * Gesamt-Status: DONE / PARTIAL / FAILED
 */

const adClient       = require('../../services/adClient');
const exchangeClient = require('../../services/exchangeClient');
const topdesk        = require('../../services/topdeskClient');
const db             = require('../../data/db');
const { ACTION_TYPES } = require('../../services/auditLog');

const AD_CREDENTIAL = {
  username: process.env.AD_SERVICE_ACCOUNT,
  password: process.env.AD_SERVICE_PASSWORD,
};

// ─── Step-Logger ──────────────────────────────────────────────────────────────

async function writeStep(changeId, stepName, status, result = null, errorMessage = null) {
  await db.query(
    `INSERT INTO topdesk_change_steps
       (change_id, step_name, status, result, error_message)
     VALUES ($1, $2, $3, $4, $5)`,
    [changeId, stepName, status, result ? JSON.stringify(result) : null, errorMessage]
  );
}

// ─── Eintritt ────────────────────────────────────────────────────────────────

async function executeEintritt(change, resolved, audit) {
  const { change_id } = change;
  const errors = [];

  // Step 1: AD-Account anlegen
  try {
    await adClient.createUser({
      sam:         resolved.sam,
      firstName:   resolved.firstName,
      lastName:    resolved.lastName,
      displayName: `${resolved.firstName} ${resolved.lastName}`,
      email:       resolved.email       || '',
      phoneNumber: resolved.phone       || '',
      department:  resolved.department  || '',
      targetOU:    resolved.targetOU,
      enabled:     true,
    }, AD_CREDENTIAL);

    await writeStep(change_id, 'create_ad_account', 'OK', { sam: resolved.sam });
    audit.log({ action: ACTION_TYPES.TOPDESK_STEP_OK, target: change_id,
                targetType: 'topdesk', result: 'success',
                details: { step: 'create_ad_account', sam: resolved.sam } });
    // Eigener USER_CREATE-Eintrag zusätzlich zum TopDesk-Step-Log, damit
    // Kontoerstellungen im Report sauber gezählt werden können.
    audit.log({ action: ACTION_TYPES.USER_CREATE, target: resolved.sam,
                targetType: 'user', result: 'success',
                details: { changeId: change_id } });
  } catch (err) {
    await writeStep(change_id, 'create_ad_account', 'FAILED', null, err.message);
    audit.log({ action: ACTION_TYPES.TOPDESK_STEP_FAIL, target: change_id,
                targetType: 'topdesk', result: 'failure',
                details: { step: 'create_ad_account', error: err.message } });
    errors.push({ step: 'create_ad_account', error: err.message });
    // Kritischer Fehler — Account nicht angelegt, restliche Steps sinnlos
    return { status: 'FAILED', errors };
  }

  // Step 2: AD-Gruppen zuweisen (Einzelfehler sammeln, nicht abbrechen)
  const groupResults = [];
  for (const groupDn of (resolved.adGroups || [])) {
    try {
      await adClient.addGroupMember(groupDn, resolved.sam, AD_CREDENTIAL);
      groupResults.push({ groupDn, ok: true });
      audit.log({ action: ACTION_TYPES.GROUP_ADD, target: change_id,
                  targetType: 'topdesk', result: 'success',
                  details: { groupDn, sam: resolved.sam } });
    } catch (err) {
      groupResults.push({ groupDn, ok: false, error: err.message });
      errors.push({ step: 'assign_groups', groupDn, error: err.message });
      audit.log({ action: ACTION_TYPES.TOPDESK_STEP_FAIL, target: change_id,
                  targetType: 'topdesk', result: 'failure',
                  details: { step: 'assign_groups', groupDn, error: err.message } });
    }
  }
  const groupStatus = groupResults.every(r => r.ok) ? 'OK' : 'FAILED';
  await writeStep(change_id, 'assign_groups', groupStatus, { groups: groupResults });

  // Step 3: Exchange-Mailbox aktivieren
  if (resolved.mailboxDatabase) {
    try {
      await exchangeClient.enableMailbox(resolved.sam, resolved.mailboxDatabase);
      await writeStep(change_id, 'enable_mailbox', 'OK', { sam: resolved.sam, database: resolved.mailboxDatabase });
      audit.log({ action: ACTION_TYPES.TOPDESK_STEP_OK, target: change_id,
                  targetType: 'topdesk', result: 'success',
                  details: { step: 'enable_mailbox' } });
    } catch (err) {
      await writeStep(change_id, 'enable_mailbox', 'FAILED', null, err.message);
      errors.push({ step: 'enable_mailbox', error: err.message });
      audit.log({ action: ACTION_TYPES.TOPDESK_STEP_FAIL, target: change_id,
                  targetType: 'topdesk', result: 'failure',
                  details: { step: 'enable_mailbox', error: err.message } });
    }

    // Step 4: Exchange-Mailbox konfigurieren
    try {
      await exchangeClient.configureMailbox(resolved.sam, resolved.mailboxSizeMb || null);
      await writeStep(change_id, 'configure_mailbox', 'OK', { sizeMb: resolved.mailboxSizeMb });
      audit.log({ action: ACTION_TYPES.TOPDESK_STEP_OK, target: change_id,
                  targetType: 'topdesk', result: 'success',
                  details: { step: 'configure_mailbox' } });
    } catch (err) {
      await writeStep(change_id, 'configure_mailbox', 'FAILED', null, err.message);
      errors.push({ step: 'configure_mailbox', error: err.message });
      audit.log({ action: ACTION_TYPES.TOPDESK_STEP_FAIL, target: change_id,
                  targetType: 'topdesk', result: 'failure',
                  details: { step: 'configure_mailbox', error: err.message } });
    }
  } else {
    await writeStep(change_id, 'enable_mailbox',     'SKIPPED', { reason: 'Keine Mailbox-Datenbank konfiguriert' });
    await writeStep(change_id, 'configure_mailbox',  'SKIPPED', { reason: 'Keine Mailbox-Datenbank konfiguriert' });
  }

  return { status: errors.length === 0 ? 'DONE' : 'PARTIAL', errors };
}

// ─── Austritt ────────────────────────────────────────────────────────────────

async function executeAustritt(change, resolved, audit) {
  const { change_id } = change;
  const errors = [];

  // Step 1: Account deaktivieren
  try {
    await adClient.disableUser(resolved.sam, AD_CREDENTIAL);
    await writeStep(change_id, 'disable_account', 'OK', { sam: resolved.sam });
    audit.log({ action: ACTION_TYPES.USER_DISABLE, target: change_id,
                targetType: 'topdesk', result: 'success',
                details: { step: 'disable_account', sam: resolved.sam } });
  } catch (err) {
    await writeStep(change_id, 'disable_account', 'FAILED', null, err.message);
    errors.push({ step: 'disable_account', error: err.message });
    audit.log({ action: ACTION_TYPES.TOPDESK_STEP_FAIL, target: change_id,
                targetType: 'topdesk', result: 'failure',
                details: { step: 'disable_account', error: err.message } });
    // disableUser verschiebt bereits in _Inactive — bei Fehler trotzdem weitermachen
  }

  // Step 2: Gruppen entfernen
  // Bei "zeitlich begrenzt" (z.B. Elternzeit) bleiben Gruppenmitgliedschaften
  // bewusst erhalten — nur das Konto wird deaktiviert.
  if (resolved.temporary) {
    await writeStep(change_id, 'remove_groups', 'SKIPPED',
      { reason: 'Zeitlich begrenzter Austritt — Gruppen bleiben erhalten', returnDate: resolved.returnDate });
    return { status: errors.length === 0 ? 'DONE' : 'PARTIAL', errors };
  }

  // Aktuelle Gruppen aus AD holen
  let currentGroups = [];
  try {
    currentGroups = await adClient.getUserGroups(resolved.sam, AD_CREDENTIAL);
  } catch (err) {
    await writeStep(change_id, 'remove_groups', 'FAILED', null, `Gruppen konnten nicht geladen werden: ${err.message}`);
    errors.push({ step: 'remove_groups', error: err.message });
    return { status: errors.length === 0 ? 'DONE' : 'PARTIAL', errors };
  }

  const removeResults = [];
  for (const group of currentGroups) {
    try {
      await adClient.removeGroupMember(group.DistinguishedName, resolved.sam, AD_CREDENTIAL);
      removeResults.push({ groupDn: group.DistinguishedName, ok: true });
    } catch (err) {
      removeResults.push({ groupDn: group.DistinguishedName, ok: false, error: err.message });
      errors.push({ step: 'remove_groups', groupDn: group.DistinguishedName, error: err.message });
    }
  }
  const removeStatus = removeResults.every(r => r.ok) ? 'OK' : 'FAILED';
  await writeStep(change_id, 'remove_groups', removeStatus, { groups: removeResults });

  return { status: errors.length === 0 ? 'DONE' : 'PARTIAL', errors };
}

// ─── Abteilungswechsel ───────────────────────────────────────────────────────

async function executeAbteilungswechsel(change, resolved, audit) {
  const { change_id } = change;
  const errors = [];

  // Step 1: OU wechseln (enableUser mit neuer OU verschiebt ohne Enable/Disable)
  try {
    await adClient.enableUser(resolved.sam, resolved.newTargetOU, AD_CREDENTIAL);
    await writeStep(change_id, 'move_ou', 'OK', { sam: resolved.sam, newOU: resolved.newTargetOU });
    audit.log({ action: ACTION_TYPES.USER_MOVE, target: change_id,
                targetType: 'topdesk', result: 'success',
                details: { step: 'move_ou', newOU: resolved.newTargetOU } });
  } catch (err) {
    await writeStep(change_id, 'move_ou', 'FAILED', null, err.message);
    errors.push({ step: 'move_ou', error: err.message });
    audit.log({ action: ACTION_TYPES.TOPDESK_STEP_FAIL, target: change_id,
                targetType: 'topdesk', result: 'failure',
                details: { step: 'move_ou', error: err.message } });
  }

  // Step 2: Department-Feld in AD setzen
  try {
    await adClient.editUser(resolved.sam, { Department: resolved.newDepartment }, AD_CREDENTIAL);
    await writeStep(change_id, 'set_department', 'OK', { department: resolved.newDepartment });
    audit.log({ action: ACTION_TYPES.USER_EDIT, target: change_id,
                targetType: 'topdesk', result: 'success',
                details: { step: 'set_department', department: resolved.newDepartment } });
  } catch (err) {
    await writeStep(change_id, 'set_department', 'FAILED', null, err.message);
    errors.push({ step: 'set_department', error: err.message });
  }

  // Step 3: Gruppen-Delta anwenden
  // Aktuelle Gruppen aus AD holen, Differenz zu Soll berechnen
  let currentGroups = [];
  try {
    currentGroups = await adClient.getUserGroups(resolved.sam, AD_CREDENTIAL);
  } catch (err) {
    await writeStep(change_id, 'apply_group_delta', 'FAILED', null, `Gruppen konnten nicht geladen werden: ${err.message}`);
    errors.push({ step: 'apply_group_delta', error: err.message });
    return { status: errors.length === 0 ? 'DONE' : 'PARTIAL', errors };
  }

  const currentDns = new Set(currentGroups.map(g => g.DistinguishedName));
  const targetDns  = new Set(resolved.newAdGroups || []);

  const toAdd    = [...targetDns].filter(dn => !currentDns.has(dn));
  const toRemove = [...currentDns].filter(dn => !targetDns.has(dn));

  const deltaResults = [];

  for (const dn of toAdd) {
    try {
      await adClient.addGroupMember(dn, resolved.sam, AD_CREDENTIAL);
      deltaResults.push({ dn, action: 'add', ok: true });
    } catch (err) {
      deltaResults.push({ dn, action: 'add', ok: false, error: err.message });
      errors.push({ step: 'apply_group_delta', action: 'add', dn, error: err.message });
    }
  }

  for (const dn of toRemove) {
    try {
      await adClient.removeGroupMember(dn, resolved.sam, AD_CREDENTIAL);
      deltaResults.push({ dn, action: 'remove', ok: true });
    } catch (err) {
      deltaResults.push({ dn, action: 'remove', ok: false, error: err.message });
      errors.push({ step: 'apply_group_delta', action: 'remove', dn, error: err.message });
    }
  }

  const deltaStatus = deltaResults.every(r => r.ok) ? 'OK' : 'FAILED';
  await writeStep(change_id, 'apply_group_delta', deltaStatus, { delta: deltaResults });

  return { status: errors.length === 0 ? 'DONE' : 'PARTIAL', errors };
}

// ─── Haupt-Execute ────────────────────────────────────────────────────────────

async function execute({ changeId }, audit) {
  // Change aus DB laden
  const { rows } = await db.query(
    'SELECT * FROM topdesk_changes WHERE change_id = $1',
    [changeId]
  );
  if (!rows.length) throw new Error(`Change ${changeId} nicht gefunden.`);

  const change   = rows[0];
  const resolved = change.resolved;

  if (!resolved || resolved.error) {
    throw new Error('Change ist nicht aufgelöst — bitte zuerst Konflikt beheben.');
  }

  if (change.status === 'DONE') {
    throw new Error('Change wurde bereits ausgeführt.');
  }

  // Status auf PROCESSING setzen
  await db.query(
    `UPDATE topdesk_changes SET status = 'PROCESSING' WHERE change_id = $1`,
    [changeId]
  );

  audit.log({ action: ACTION_TYPES.TOPDESK_EXECUTE, target: changeId,
              targetType: 'topdesk', result: 'success',
              details: { type: change.type, actor: audit.actor } });

  let pipelineResult;
  try {
    if (change.type === 'EINTRITT')       pipelineResult = await executeEintritt(change, resolved, audit);
    else if (change.type === 'AUSTRITT')  pipelineResult = await executeAustritt(change, resolved, audit);
    else if (change.type === 'ABT_WECHSEL') pipelineResult = await executeAbteilungswechsel(change, resolved, audit);
    else throw new Error(`Unbekannter Change-Typ: ${change.type}`);
  } catch (err) {
    await db.query(
      `UPDATE topdesk_changes
       SET status = 'FAILED', processed_at = NOW()
       WHERE change_id = $1`,
      [changeId]
    );
    throw err;
  }

  // Gesamt-Status in DB schreiben
  await db.query(
    `UPDATE topdesk_changes
     SET status = $1, processed_at = NOW(),
         executed = $2
     WHERE change_id = $3`,
    [
      pipelineResult.status,
      JSON.stringify({ errors: pipelineResult.errors }),
      changeId,
    ]
  );

  // Progress-Note nach TopDesk
  const noteLines = [`IT-Platform: Change ${changeId} ausgeführt — Status: ${pipelineResult.status}`];
  if (pipelineResult.errors.length) {
    noteLines.push('Fehler:');
    pipelineResult.errors.forEach(e => noteLines.push(`  - ${e.step}: ${e.error}`));
  }
  await topdesk.addProgressNote(changeId, noteLines.join('\n')).catch(() => {});

  return pipelineResult;
}

module.exports = { execute };