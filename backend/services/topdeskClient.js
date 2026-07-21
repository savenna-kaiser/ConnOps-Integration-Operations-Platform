/**
 * topdeskClient.js – TopDesk REST-API-Client
 *
 * Typ-Erkennung über templateId (nicht category).
 * Self-signed certificate support für On-Prem.
 * Status-Filter angepasst auf echte TopDesk-Werte.
 */

const https   = require('https');
const http    = require('http');
const { URL } = require('url');

// BASE_URL ist jetzt veränderbar (Phase 6.2, TopDesk-Tab) — Startwert aus .env,
// kann über configureBaseUrl()/configureAndTestBaseUrl() zur Laufzeit geändert
// werden (server.js beim Start aus platform_settings, adminConfig.js bei
// Änderungen über die Konfigseite).
let BASE_URL = process.env.TOPDESK_URL || '';
const USERNAME = process.env.TOPDESK_USERNAME     || '';
const PASSWORD = process.env.TOPDESK_APP_PASSWORD || '';

// Self-signed Zertifikat für On-Prem
const HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });

// Template-IDs → Typ (aus .env, Fallback auf bekannte IDs)
const TEMPLATE_IDS = {
  EINTRITT:    process.env.TOPDESK_TEMPLATE_EINTRITT    || 'aa16e90a-97f7-4b5f-9ef2-2fd7f0f80f3c',
  AUSTRITT:    process.env.TOPDESK_TEMPLATE_AUSTRITT    || '3ebc323a-eb81-4211-b576-2e72af2ac322',
  ABT_WECHSEL: process.env.TOPDESK_TEMPLATE_ABT_WECHSEL|| '3b8b64dc-3f36-4ddd-a951-b86630ebf95e',
};

// Umgekehrtes Mapping: templateId → Typ
const TEMPLATE_TYPE_MAP = Object.fromEntries(
  Object.entries(TEMPLATE_IDS).map(([type, id]) => [id, type])
);

// Status der Changes die wir verarbeiten wollen
const PROCESS_STATUS = process.env.TOPDESK_PROCESS_STATUS || '1 - Zu bearbeiten';

// ─── Interner HTTP-Client ────────────────────────────────────────────────────

function request(method, path, body = null, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const url     = new URL(path, BASE_URL);
    const auth    = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
    const isHttps = url.protocol === 'https:';
    const lib     = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept':        'application/json',
        'Content-Type':  'application/json',
      },
      ...(isHttps ? { agent: HTTPS_AGENT } : {}),
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`TopDesk API ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`TopDesk API Timeout (${timeoutMs}ms)`));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Typ aus Change ermitteln ────────────────────────────────────────────────
// TopDesk liefert die Template-Referenz je nach Endpunkt unterschiedlich:
//   - GET Einzel-Change (getChangeById):        flaches Feld `templateId`
//   - GET Liste (mit ?fields=all):               verschachteltes Objekt `template.id`
// getTemplateId() ist robust gegen beide Formen.
function getTemplateId(change) {
  return change.template?.id || change.templateId || null;
}

function getTypeFromChange(change) {
  return TEMPLATE_TYPE_MAP[getTemplateId(change)] || null;
}

// ─── API-Funktionen ──────────────────────────────────────────────────────────

/**
 * Holt alle Changes eines bestimmten Typs mit dem konfigurierten Status.
 * Filtert nach templateId client-seitig, da TopDesk keine templateId-Filter unterstützt.
 * ?fields=all ist nötig, da die Liste sonst weder template noch optionalFields liefert
 * (siehe backend/tools/probeListFields.js zur Verifikation).
 */
async function getChanges(type, { limit = 100 } = {}) {
  const templateId = TEMPLATE_IDS[type];
  if (!templateId) throw new Error(`Unbekannter Change-Typ: ${type}`);

  const path   = `/tas/api/operatorChanges?pageSize=${limit}&fields=all`;
  const result = await request('GET', path);
  const all    = result.results || [];

  // Client-seitig nach templateId und Status filtern
  return all.filter(c =>
    getTemplateId(c) === templateId &&
    c.status?.name === PROCESS_STATUS
  );
}

/**
 * Holt alle verarbeitbaren Changes (alle Typen) in einem Aufruf.
 * Effizienter als drei separate getChanges()-Aufrufe.
 */
async function getAllPendingChanges({ limit = 100 } = {}) {
  const path   = `/tas/api/operatorChanges?pageSize=${limit}&fields=all`;
  const result = await request('GET', path);
  const all    = result.results || [];

  const knownTemplates = Object.values(TEMPLATE_IDS);
  return all.filter(c =>
    knownTemplates.includes(getTemplateId(c)) &&
    c.status?.name === PROCESS_STATUS
  );
}

/**
 * Holt einen einzelnen Change inkl. aller Custom-Felder.
 */
async function getChangeById(changeId) {
  return request('GET', `/tas/api/operatorChanges/${changeId}?fields=all`);
}

/**
 * Setzt den Status eines Change-Requests.
 */
async function updateChangeStatus(changeId, status) {
  return request('PUT', `/tas/api/operatorChanges/${changeId}`, { status });
}

/**
 * Fügt eine Progress-Note zu einem Change hinzu.
 */
async function addProgressNote(changeId, note) {
  return request('POST',
    `/tas/api/operatorChanges/${changeId}/progressNotes`,
    { progressNotes: note }
  );
}

/**
 * Erreichbarkeits-Check.
 */
async function ping() {
  await request('GET', `/tas/api/operatorChanges?pageSize=1`);
  return true;
}

/**
 * Setzt die Basis-URL ohne Test — für den Serverstart (server.js), wo ein
 * unerreichbarer TopDesk-Server den Start nicht blockieren soll (das würde
 * schon der bestehende Health-Check sichtbar melden).
 */
function configureBaseUrl(url) {
  BASE_URL = url;
}

/**
 * Setzt die Basis-URL NUR, wenn ein Verbindungstest (ping) erfolgreich war —
 * sonst Rollback auf die vorherige URL und Fehler wird geworfen. Für die
 * Konfigseite (adminConfig.js): eine falsche URL soll sofort im Formular
 * auffallen, nicht erst beim nächsten Health-Check lautlos "down" zeigen.
 */
async function configureAndTestBaseUrl(url) {
  const previous = BASE_URL;
  BASE_URL = url;
  try {
    await ping();
    return true;
  } catch (err) {
    BASE_URL = previous; // Rollback
    throw err;
  }
}

function getBaseUrl() {
  return BASE_URL;
}

// ─── Export ──────────────────────────────────────────────────────────────────

module.exports = {
  getChanges,
  getAllPendingChanges,
  getChangeById,
  updateChangeStatus,
  addProgressNote,
  getTypeFromChange,
  TEMPLATE_IDS,
  TEMPLATE_TYPE_MAP, // Phase 6.2: einzige Quelle der Wahrheit, resolveChange.js baut keine eigene Kopie mehr
  PROCESS_STATUS,
  getBaseUrl,
  configureBaseUrl,
  configureAndTestBaseUrl,
  ping,
};