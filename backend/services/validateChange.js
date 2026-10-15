/**
 * validateChange.js – Validitätsprüfung für TopDesk-Changes
 */

const adClient       = require('./adClient');
const exchangeClient = require('./exchangeClient');
const topdesk        = require('./topdeskClient');

const AD_CREDENTIAL = {
  username: process.env.AD_SERVICE_ACCOUNT,
  password: process.env.AD_SERVICE_PASSWORD,
};

async function checkSamAvailable(sam) {
  if (!sam) return { ok: false, skipped: true, reason: 'Kein SAM-Account angegeben' };
  try {
    await adClient.getUser(sam, AD_CREDENTIAL);
    return { ok: false, exists: true, message: `SAM-Account "${sam}" existiert bereits in AD` };
  } catch {
    return { ok: true, exists: false, message: `SAM-Account "${sam}" ist verfügbar` };
  }
}

async function checkSamExists(sam) {
  if (!sam) return { ok: false, skipped: true, reason: 'Kein SAM-Account angegeben' };
  try {
    const user = await adClient.getUser(sam, AD_CREDENTIAL);
    return { ok: true, exists: true, enabled: user.enabled, message: `SAM-Account "${sam}" gefunden` };
  } catch {
    return { ok: false, exists: false, message: `SAM-Account "${sam}" nicht in AD gefunden` };
  }
}

async function checkTargetOU(ou) {
  if (!ou) return { ok: false, skipped: true, reason: 'Keine Ziel-OU angegeben' };
  try {
    const result = await adClient.checkOU(ou, AD_CREDENTIAL);
    return result.exists
      ? { ok: true,  message: 'Ziel-OU existiert' }
      : { ok: false, message: `Ziel-OU "${ou}" nicht gefunden` };
  } catch (err) {
    return { ok: false, message: `OU-Prüfung fehlgeschlagen: ${err.message}` };
  }
}

async function checkGroups(adGroups) {
  if (!adGroups?.length) return { ok: true, skipped: true, reason: 'Keine Gruppen zu prüfen' };

  const results = await Promise.all(
    adGroups.map(async (dn) => {
      try {
        const r = await adClient.checkGroup(dn, AD_CREDENTIAL);
        return { dn, ok: r.exists, name: r.name || null };
      } catch (err) {
        return { dn, ok: false, error: err.message };
      }
    })
  );

  const failed = results.filter(r => !r.ok);
  return {
    ok:      failed.length === 0,
    groups:  results,
    message: failed.length === 0
      ? `Alle ${adGroups.length} Gruppen auflösbar`
      : `${failed.length} Gruppe(n) nicht auflösbar: ${failed.map(r => r.dn).join(', ')}`,
  };
}

async function checkExchangeDatabase(database) {
  if (!database) return { ok: true, skipped: true, reason: 'Keine Mailbox-Datenbank konfiguriert' };
  try {
    const result = await exchangeClient.checkDatabase(database);
    if (result.exists && result.mounted)  return { ok: true,  message: `Datenbank "${database}" ist verfügbar und gemountet` };
    if (result.exists && !result.mounted) return { ok: false, message: `Datenbank "${database}" existiert aber ist nicht gemountet` };
    return { ok: false, message: `Datenbank "${database}" nicht gefunden` };
  } catch (err) {
    return { ok: false, message: `Exchange-Prüfung fehlgeschlagen: ${err.message}` };
  }
}

async function checkTopdeskReachable() {
  try {
    await topdesk.ping();
    return { ok: true, message: 'TopDesk API erreichbar' };
  } catch (err) {
    return { ok: false, message: `TopDesk nicht erreichbar: ${err.message}` };
  }
}

// ─── Hauptfunktion ────────────────────────────────────────────────────────────

async function validateChange(resolved, type) {
  const checks = {};

  if (type === 'EINTRITT') {
    const [sam, ou, groups, exchange, td] = await Promise.all([
      checkSamAvailable(resolved.sam),
      checkTargetOU(resolved.targetOU),
      checkGroups(resolved.adGroups),
      checkExchangeDatabase(resolved.mailboxDatabase),
      checkTopdeskReachable(),
    ]);
    checks.samAvailable     = sam;
    checks.targetOU         = ou;
    checks.groups           = groups;
    checks.exchangeDatabase = exchange;
    checks.topdeskReachable = td;
  }

  if (type === 'AUSTRITT') {
    const [sam, td] = await Promise.all([
      checkSamExists(resolved.sam),
      checkTopdeskReachable(),
    ]);
    checks.samExists        = sam;
    checks.topdeskReachable = td;
  }

  if (type === 'ABT_WECHSEL') {
    const [sam, ou, td] = await Promise.all([
      checkSamExists(resolved.sam),
      checkTargetOU(resolved.newTargetOU),
      checkTopdeskReachable(),
    ]);
    checks.samExists        = sam;
    checks.targetOU         = ou;
    checks.topdeskReachable = td;
  }

  const valid = Object.values(checks).every(c => c.ok || c.skipped);
  return { valid, checks };
}

module.exports = { validateChange };