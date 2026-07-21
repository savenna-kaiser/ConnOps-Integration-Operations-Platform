/**
 * adClient.js – Sauberes AD-API für die Actions
 *
 * Alle Actions importieren dieses Modul statt direkt mit der Bridge zu sprechen.
 * Hier steckt die gesamte AD-Logik (Parameter-Aufbau, OU-Listen, Fehlerbehandlung).
 */

const { getPool } = require("./powershellBridge");

const DC = process.env.AD_DC || "musterstadt.example";

const OU_LIST = [
  "OU=EPN-AD,DC=musterstadt,DC=example,DC=de",
  "OU=EPN-BUE,DC=musterstadt,DC=example,DC=de",
  "OU=EPN-EL,DC=musterstadt,DC=example,DC=de",
  "OU=EPN-KL,DC=musterstadt,DC=example,DC=de",
  "OU=EPN-MU,DC=musterstadt,DC=example,DC=de",
  "OU=EPN-RI,DC=musterstadt,DC=example,DC=de",
  "OU=EPN-RO,DC=musterstadt,DC=example,DC=de",
  "OU=EPN-RT,DC=musterstadt,DC=example,DC=de",
  "OU=AdminUsers,DC=musterstadt,DC=example,DC=de",
  "OU=Krieger,DC=musterstadt,DC=example,DC=de",
  "OU=Users,OU=_Inactive,DC=musterstadt,DC=example,DC=de",
];

const COMPUTER_OU_LIST = [
  "OU=COMPUTER,DC=musterstadt,DC=example,DC=de",
  "OU=Computers,OU=_Inactive,DC=musterstadt,DC=example,DC=de",
];

const GROUP_OUS = [
  process.env.AD_PRINTER_OU  || "OU=Druckergruppen,DC=musterstadt,DC=example,DC=de",
  process.env.AD_GROUP_OU    || "OU=GROUP,DC=musterstadt,DC=example,DC=de",
  process.env.AD_EXCHANGE_OU || "OU=Verteiler,OU=Exchange,DC=musterstadt,DC=example,DC=de",
];

const INACTIVE_USERS_OU     = process.env.AD_INACTIVE_USERS_OU     || "OU=Users,OU=_Inactive,DC=musterstadt,DC=example,DC=de";
const INACTIVE_COMPUTERS_OU = process.env.AD_INACTIVE_COMPUTERS_OU || "OU=Computers,OU=_Inactive,DC=musterstadt,DC=example,DC=de";

// ─── Interner Helfer ─────────────────────────────────────────────────────────

async function run(cmd, params, credential = null) {
  const pool   = await getPool();
  const result = await pool.run(cmd, params, credential);
  if (!result.ok) throw new Error(result.error || `PS-Fehler bei ${cmd}`);
  return result.data;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

async function testLogin(username, password) {
  const sam    = username.includes("\\") ? username.split("\\")[1] : username;
  const fqUser = username.includes("\\") ? username : `MUSTERSTADT\\${username}`;
  return run("TestLogin", { sam }, { username: fqUser, password });
}

// ─── Benutzer ────────────────────────────────────────────────────────────────

async function searchUsers(query, credential) {
  return run("SearchUsers", { query, ouList: OU_LIST }, credential);
}

async function createUser({ sam, firstName, lastName, displayName, email, phoneNumber, department, targetOU, enabled }, credential) {
  const initialPassword = process.env.AD_NEW_USER_INITIAL_PASSWORD;
  if (!initialPassword) throw new Error("AD_NEW_USER_INITIAL_PASSWORD nicht konfiguriert.");
  return run("CreateUser", {
    sam, firstName, lastName, displayName,
    email:       email       || "",
    phoneNumber: phoneNumber || "",
    department:  department  || "",
    targetOU,
    enabled: enabled !== false,
    initialPassword,
  }, credential);
}

async function getUser(sam, credential) {
  return run("GetUser", { sam }, credential);
}

/**
 * Prüft ob eine OU in AD existiert.
 * @param {string} ou  – Distinguished Name
 */
async function checkOU(ou, credential) {
  return run("CheckOU", { ou }, credential);
}

/**
 * Prüft ob eine AD-Gruppe per DN auflösbar ist.
 * @param {string} groupDn  – Distinguished Name der Gruppe
 */
async function checkGroup(groupDn, credential) {
  return run("CheckGroup", { groupDn }, credential);
}

async function enableUser(sam, targetOU, credential) {
  return run("EnableUser", { sam, targetOU: targetOU || null }, credential);
}

async function disableUser(sam, credential) {
  return run("DisableUser", { sam, targetOU: INACTIVE_USERS_OU }, credential);
}

async function unlockUser(sam, credential) {
  return run("UnlockUser", { sam }, credential);
}

async function resetPassword(sam, newPassword, mustChange, cannotChange, credential) {
  return run("ResetPassword", { sam, newPassword, mustChange, cannotChange }, credential);
}

async function editUser(sam, changes, credential) {
  return run("EditUser", { sam, changes }, credential);
}

async function getUserGroups(sam, credential) {
  return run("GetUserGroups", { sam }, credential);
}

async function getAllGroups(credential) {
  return run("GetAllGroups", { ouList: GROUP_OUS }, credential);
}

async function addGroupMember(groupDn, sam, credential) {
  return run("AddGroupMember", { groupDn, sam }, credential);
}

async function removeGroupMember(groupDn, sam, credential) {
  return run("RemoveGroupMember", { groupDn, sam }, credential);
}

// ─── Computer ────────────────────────────────────────────────────────────────

async function searchComputers(query, credential) {
  return run("SearchComputers", { query, ouList: COMPUTER_OU_LIST }, credential);
}

async function disableComputer(name, credential) {
  return run("DisableComputer", { name, targetOU: INACTIVE_COMPUTERS_OU }, credential);
}

async function enableComputer(name, targetOU, credential) {
  return run("EnableComputer", { name, targetOU: targetOU || null }, credential);
}

// ─── Citrix (Logoff + Live-Session-Abfrage) ─────────────────────────────────

const { spawn } = require("child_process");
const path       = require("path");

const CITRIX_PS_SCRIPT = path.join(__dirname, "../powershell/psWorker.ps1");

// Dedizierter Service-Account (wie AD_SERVICE_ACCOUNT/EXCHANGE_SERVICE_ACCOUNT) —
// nicht alle IT-Admins sind persönlich auf dem Delivery Controller berechtigt,
// daher läuft der Zugriff einheitlich über diesen Account statt über das
// jeweils eingeloggte Admin-Konto.
const CITRIX_CREDENTIAL = {
  username: process.env.CITRIX_SERVICE_ACCOUNT,
  password: process.env.CITRIX_SERVICE_PASSWORD,
};

/**
 * Gemeinsamer Ausführungs-Helper für Citrix-Befehle gegen psWorker.ps1.
 * Spawnt einen eigenen PowerShell-Prozess (nicht den persistenten Worker-Pool),
 * da Citrix-Befehle (Add-PSSnapin, Invoke-Command zum DDC, ggf. 60s-Wartezeit
 * beim Logoff) eine andere Laufzeit-Charakteristik haben als die üblichen
 * kurzen AD-Abfragen.
 */
function runCitrixCommand(cmd, params, credential, timeoutMs) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      cmd,
      params:     params || {},
      credential: credential || null,
    });

    const exe  = process.platform === "win32" ? "powershell.exe" : "pwsh";
    const proc = spawn(exe, [
      "-NoProfile", "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-File", CITRIX_PS_SCRIPT,
    ], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });

    let stdout  = "";
    let stderr  = "";
    let settled = false;

    const settle = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      proc.kill();
      fn();
    };

    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (!proc._cmdSent && stdout.includes("##READY##")) {
        proc._cmdSent = true;
        proc.stdin.write(payload + "\n");
      }
      if (stdout.includes("##END##")) {
        const match = stdout.match(/##READY##\s*([\s\S]*?)##END##/);
        if (match) {
          try {
            const result = JSON.parse(match[1].trim());
            if (result.ok) settle(() => resolve(result.data));
            else           settle(() => reject(new Error(result.error || `${cmd} fehlgeschlagen`)));
          } catch (e) {
            settle(() => reject(new Error(`${cmd} JSON-Fehler: ` + match[1].slice(0, 200))));
          }
        } else {
          settle(() => resolve({ done: true }));
        }
      }
    });

    proc.on("exit", (code) => {
      if (!settled) {
        settle(() => reject(new Error(stderr.trim() || `${cmd} PS exit ${code}`)));
      }
    });

    const timer = setTimeout(() => {
      settle(() => reject(new Error(`${cmd} Timeout (${Math.round(timeoutMs / 1000)}s)`)));
    }, timeoutMs);
  });
}

function citrixLogoff(sessionUid, userName) {
  return runCitrixCommand(
    "CitrixLogoff",
    { sessionUid: parseInt(sessionUid, 10), userName: userName || "" },
    CITRIX_CREDENTIAL,
    3 * 60 * 1000, // 60s Vorwarnung + Reserve
  );
}

/**
 * Holt alle aktuellen Citrix-Sessions live vom Delivery Controller
 * (ersetzt die frühere CSV-Quelle, die seit der Server-Umstellung nicht
 * mehr befüllt wird). Nutzt denselben Controller-Failover wie CitrixLogoff.
 */
function getCitrixSessionsLive() {
  return runCitrixCommand("GetCitrixSessions", {}, CITRIX_CREDENTIAL, 60 * 1000);
}

// ─── Health ──────────────────────────────────────────────────────────────────

const HEALTH_PS_TIMEOUT = parseInt(process.env.PS_HEALTH_TIMEOUT || "30000", 10);

async function getHealthUsers({ thresholdDays = 90, expiringDays = 14 } = {}, credential) {
  const pool   = await getPool();
  const result = await pool.run(
    "GetHealthUsers",
    { ouList: OU_LIST, thresholdDays, expiringDays },
    credential,
    HEALTH_PS_TIMEOUT
  );
  if (!result.ok) throw new Error(result.error || "PS-Fehler bei GetHealthUsers");
  return result.data;
}

async function getHealthComputers({ thresholdDays = 90 } = {}, credential) {
  const pool   = await getPool();
  const result = await pool.run(
    "GetHealthComputers",
    { ouList: COMPUTER_OU_LIST, thresholdDays },
    credential,
    HEALTH_PS_TIMEOUT
  );
  if (!result.ok) throw new Error(result.error || "PS-Fehler bei GetHealthComputers");
  return result.data;
}

// ─── Export ──────────────────────────────────────────────────────────────────

module.exports = {
  testLogin,
  createUser,
  getUser,
  checkOU,
  checkGroup,
  searchUsers,
  enableUser,
  disableUser,
  unlockUser,
  resetPassword,
  editUser,
  getUserGroups,
  getAllGroups,
  addGroupMember,
  removeGroupMember,
  searchComputers,
  disableComputer,
  enableComputer,
  citrixLogoff,
  getCitrixSessionsLive,
  getHealthUsers,
  getHealthComputers,
};