/**
 * citrixService.js – Liest Citrix-Sessions LIVE vom Delivery Controller,
 * mit CSV-Fallback (Phase: "kleine Zwischendurch-Aufgabe").
 *
 * Ursprünglich: CSV-Export, den der Delivery Controller alle 5 Minuten schrieb.
 * Nach der Server-Umstellung wurde diese CSV lange nicht mehr befüllt, daher
 * Umstieg auf Live-Abfrage (adClient.getCitrixSessionsLive()). Die CSV ist
 * inzwischen auf CDC3 wieder verfügbar — bleibt aber bewusst NUR Fallback,
 * falls die Live-Abfrage fehlschlägt. Live ist weiterhin die primäre Quelle
 * (aktueller, kein 5-Minuten-Verzug).
 *
 * Der Cache bleibt bewusst bestehen (TTL wie vorher), da eine Live-Abfrage
 * per Invoke-Command an den Controller deutlich teurer ist als das Lesen
 * einer lokalen/Netzwerk-Datei — bei mehreren Sucheingaben in kurzer Zeit
 * soll nicht jedes Mal ein neuer Remote-Befehl losgeschickt werden.
 */

const adClient = require("./adClient");
const fs       = require("fs");

const CACHE_TTL_MS = 60 * 1000;

// CSV-Fallback: nur genutzt, wenn die Live-Abfrage fehlschlägt.
const CSV_FALLBACK_PATH = process.env.CITRIX_CSV_FALLBACK ||
  "\\\\wsus1.musterstadt.example\\TsData\\Sessions.csv";

let _cache      = null;
let _cacheTime  = 0;
let _cacheSource = null; // "live" | "csv-fallback" | "stale" — für Diagnose/Transparenz
let _pending    = null; // laufender Refresh, um parallele Doppel-Abfragen zu vermeiden

// ─── Normalisierung ───────────────────────────────────────────────────────────
// Feldnamen kommen jetzt direkt (camelCase) aus psWorker.ps1 (GetCitrixSessions),
// nicht mehr aus CSV-Headern (PascalCase) — daher hier keine Header-Mapping-Logik
// mehr nötig, nur noch Fallback-Werte für evtl. fehlende Felder.

function normalizeSession(row) {
  return {
    userName:           row.userName           || "",
    userFullName:       row.userFullName       || "",
    clientName:         row.clientName         || "",
    machineName:        row.hostedMachineName  || row.machineName || "",
    machineNameFQDN:    row.dnsName            || "",
    sessionState:       row.sessionState       || "",
    sessionStart:       row.startTime          || "",
    sessionStateChange: row.sessionStateChangeTime || "",
    idleSince:          row.idleSince          || "",
    protocol:           row.protocol           || "",
    dnsName:            row.dnsName            || "",
    sessionId:          row.sessionId          || "",
    sessionUid:         row.uid                || row.sessionId || "",
    desktopGroupName:   row.desktopGroupName   || "",
    clientAddress:      row.clientAddress      || "",
    appState:           row.appState           || "",
  };
}

// ─── CSV-Fallback ─────────────────────────────────────────────────────────────
// Spalten sind PascalCase (Citrix-eigenes Exportformat, tab-getrennt) — hier auf
// dieselben Feldnamen gemappt, die normalizeSession() von der Live-Antwort
// erwartet, damit KEINE zweite Normalisierungslogik gepflegt werden muss.
//
// WICHTIG: Die CSV liefert Datumswerte im deutschen Format ("13.07.2026 07:26"),
// das JavaScripts new Date(...) NICHT zuverlaessig parst (fuehrt zu "Invalid
// Date" im Frontend) - deshalb hier explizit in ISO-8601 umwandeln, analog zum
// gleichen Fix auf der Live-Abfrage-Seite (psWorker.ps1, ConvertTo-IsoDate).
function parseGermanDateTime(str) {
  if (!str || !str.trim()) return "";
  const match = str.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return str; // unbekanntes Format - unveraendert durchreichen statt zu verwerfen
  const [, day, month, year, hour, minute, second] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:${second || "00"}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

// WICHTIG (Fund aus der alten, rein CSV-basierten citrixService.js-Version):
// Die Citrix-Export-CSV ist NICHT einfaches UTF-8, sondern UTF-16 LE mit BOM
// (typisch für PowerShells Export-Csv), und alle Werte sind in doppelte
// Anführungszeichen eingeschlossen. Ein naiver csv-parser-Ansatz (UTF-8-
// Annahme) hätte hier stillschweigend falsche/unlesbare Daten geliefert,
// statt einen sichtbaren Fehler zu werfen — deshalb hier bewusst die
// BOM-erkennende, bereits bewährte Parser-Logik übernommen statt csv-parser.

function readCsvFileContent(filePath) {
  const raw = fs.readFileSync(filePath); // Buffer, kein Encoding

  if (raw[0] === 0xFF && raw[1] === 0xFE) {
    return raw.slice(2).toString("utf16le");
  }
  if (raw[0] === 0xFE && raw[1] === 0xFF) {
    // UTF-16 BE – Bytes paarweise tauschen
    const swapped = Buffer.alloc(raw.length - 2);
    for (let i = 0; i < swapped.length; i += 2) {
      swapped[i]     = raw[i + 3];
      swapped[i + 1] = raw[i + 2];
    }
    return swapped.toString("utf16le");
  }
  if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
    return raw.slice(3).toString("utf8"); // UTF-8 BOM
  }
  return raw.toString("utf8"); // kein BOM → UTF-8
}

/** Splittet einen String an Tabs, aber maximal `max` Mal (Rest bleibt im letzten Feld). */
function splitTabsMax(str, max) {
  const result = [];
  let   start  = 0;
  let   count  = 0;
  for (let i = 0; i < str.length && count < max; i++) {
    if (str[i] === "\t") {
      result.push(str.slice(start, i));
      start = i + 1;
      count++;
    }
  }
  result.push(str.slice(start));
  return result;
}

function parseCsvContent(content) {
  const lines = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter(l => l.trim().length > 0);

  if (lines.length < 2) return [];

  const stripQuotes = (s) => s.trim().replace(/^"|"$/g, "");
  const headers     = lines[0].split("\t").map(stripQuotes);
  const maxSplits   = headers.length - 1;

  return lines.slice(1).map(line => {
    const parts = splitTabsMax(line, maxSplits);
    const obj   = {};
    headers.forEach((h, i) => { obj[h] = stripQuotes(parts[i] || ""); });
    return obj;
  }).filter(row => row.UserName && row.UserName.trim().length > 0);
}

function csvRowToLiveShape(row) {
  return {
    userName:               row.UserName               || "",
    userFullName:           row.UserFullName            || "",
    clientName:             row.ClientName              || "",
    hostedMachineName:      row.HostedMachineName       || "",
    machineName:            row.MachineName             || "",
    dnsName:                row.DNSName                 || "",
    sessionState:           row.SessionState            || "",
    startTime:              parseGermanDateTime(row.StartTime),
    sessionStateChangeTime: parseGermanDateTime(row.SessionStateChangeTime),
    idleSince:              parseGermanDateTime(row.IdleSince),
    protocol:               row.Protocol                || "",
    sessionId:              row.SessionId               || "",
    uid:                    row.Uid                     || "",
    desktopGroupName:       row.DesktopGroupName        || "",
    clientAddress:          row.ClientAddress           || "",
    appState:               row.AppState                || "",
  };
}

async function loadCsvFallbackSessions() {
  if (!fs.existsSync(CSV_FALLBACK_PATH)) {
    throw new Error(`CSV-Fallback nicht erreichbar: ${CSV_FALLBACK_PATH}`);
  }
  const content = readCsvFileContent(CSV_FALLBACK_PATH);
  const rows    = parseCsvContent(content);
  return rows.map(row => normalizeSession(csvRowToLiveShape(row)));
}

// ─── Cache + Live-Laden ───────────────────────────────────────────────────────

/**
 * Liefert die aktuellen Sessions – aus dem Cache, falls frisch genug,
 * sonst per Live-Abfrage an den Delivery Controller.
 *
 * Der Cache wird über einen dedizierten Citrix-Service-Account befüllt
 * (siehe adClient.js), nicht über das Konto des anfragenden Admins.
 */
async function getSessions() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) {
    return _cache;
  }

  // Falls bereits ein Refresh läuft (z.B. zwei Suchen kurz hintereinander),
  // auf dessen Ergebnis warten statt einen zweiten Remote-Befehl zu starten.
  if (_pending) {
    return _pending;
  }

  _pending = (async () => {
    try {
      const result   = await adClient.getCitrixSessionsLive();
      const sessions = (result?.sessions || []).map(normalizeSession);
      _cache       = sessions;
      _cacheTime   = Date.now();
      _cacheSource = "live";
      console.log(`[Citrix] Live-Abfrage OK (${result?.controller}): ${_cache.length} Sessions`);
      return _cache;
    } catch (liveErr) {
      console.error("[Citrix] Live-Abfrage fehlgeschlagen:", liveErr.message);

      // Fallback: CSV auf CDC3 — nur wenn Live nicht erreichbar ist, siehe
      // Dateikopf. Kein Ersatz für Live, nur Notlösung für diesen Moment.
      try {
        const csvSessions = await loadCsvFallbackSessions();
        _cache       = csvSessions;
        _cacheTime   = Date.now();
        _cacheSource = "csv-fallback";
        console.warn(`[Citrix] Fallback auf CSV (${CSV_FALLBACK_PATH}): ${csvSessions.length} Sessions. ` +
                     `Live-Abfrage war nicht erreichbar — bitte AD/Citrix-Verbindung prüfen.`);
        return _cache;
      } catch (csvErr) {
        console.error("[Citrix] CSV-Fallback ebenfalls fehlgeschlagen:", csvErr.message);
        // Letzter Ausweg: alten Cache weiterverwenden (auch wenn abgelaufen),
        // damit ein einzelner fehlgeschlagener Request nicht die ganze Ansicht leert.
        _cacheSource = _cache ? "stale" : null;
        return _cache || [];
      }
    } finally {
      _pending = null;
    }
  })();

  return _pending;
}

// ─── Lookup-Funktionen ────────────────────────────────────────────────────────

/**
 * Gibt die Citrix-Session eines Users zurück (case-insensitiv).
 * Matched sowohl "DOMAIN\sam" als auch nur "sam".
 * Bevorzugt Active vor Disconnected.
 */
async function getSessionForUser(samAccountName) {
  const sessions = await getSessions();
  const sam      = samAccountName.toLowerCase().trim();

  const matches = sessions.filter(s => {
    const u = s.userName.toLowerCase();
    if (u.includes("\\")) return u.split("\\").pop() === sam;
    if (u.endsWith(sam)) return true;
    return u === sam;
  });

  if (matches.length === 0) return null;

  return matches.find(s => s.sessionState.toLowerCase() === "active")
      || matches[0];
}

/**
 * Gibt die Citrix-Session anhand des Client-PC-Namens zurück (case-insensitiv).
 */
async function getSessionForClient(clientName) {
  const sessions = await getSessions();
  const name     = clientName.toLowerCase().trim();

  const matches = sessions.filter(s =>
    s.clientName.toLowerCase() === name
  );

  if (matches.length === 0) return null;

  return matches.find(s => s.sessionState.toLowerCase() === "active")
      || matches[0];
}

/**
 * Alle aktiven Sessions (SessionState === "Active").
 */
async function getActiveSessions() {
  const sessions = await getSessions();
  return sessions.filter(s => s.sessionState.toLowerCase() === "active");
}

/**
 * Diagnose-Funktion: gibt Cache-Metadaten zurück (kein CSV-Pfad mehr).
 * Nur für interne Debug-Routen verwenden (RBAC: it-lead).
 */
async function getDiagnostics() {
  const sessions   = await getSessions();
  const cacheAgeMs = _cacheTime ? Date.now() - _cacheTime : null;
  return {
    source:       _cacheSource || "unbekannt", // "live" | "csv-fallback" | "stale"
    csvFallbackPath: CSV_FALLBACK_PATH,
    cacheAgeMs,
    cacheAgeSec:  cacheAgeMs !== null ? Math.floor(cacheAgeMs / 1000) : null,
    cacheTtlSec:  CACHE_TTL_MS / 1000,
    sessionCount: sessions.length,
    activeSessions: sessions.filter(s => s.sessionState.toLowerCase() === "active").length,
    disconnectedSessions: sessions.filter(s => s.sessionState.toLowerCase() === "disconnected").length,
    sample: sessions.slice(0, 3).map(s => ({
      userName:     s.userName,
      userFullName: s.userFullName,
      clientName:   s.clientName,
      machineName:  s.machineName,
      sessionState: s.sessionState,
      sessionStart: s.sessionStart,
    })),
  };
}

module.exports = {
  getSessions,
  getSessionForUser,
  getSessionForClient,
  getActiveSessions,
  getDiagnostics,
};