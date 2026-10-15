/**
 * loadSecrets.js - Phase 6.3, DPAPI-Secrets-Management
 *
 * Wird als ALLERERSTES in server.js aufgerufen, VOR allen anderen require()s.
 * Grund: mehrere Module (topdeskClient.js, adClient.js CITRIX_CREDENTIAL, ...)
 * lesen Passwoerter beim eigenen Laden als Modul-Konstante aus process.env.
 * Wenn die entschluesselten Werte erst NACH diesen require()s in process.env
 * landen wuerden, haetten diese Module bereits leere/falsche Werte
 * eingefroren. Deshalb synchron (execFileSync), nicht async.
 *
 * Nicht-fataler Fallback: existiert data/secrets.dat noch nicht (z.B. auf
 * einem frischen Deploy, bevor encrypt-secrets.ps1 einmalig gelaufen ist),
 * bleiben die Klartextwerte aus .env (bereits von dotenv.config() geladen)
 * unveraendert bestehen - kein Blocker fuer den Serverstart, analog zum
 * .env-Fallback-Muster bei RBAC/AD-Gruppen (Phase 6.1).
 */

const { execFileSync } = require("child_process");
const path = require("path");

function loadSecrets() {
  const scriptPath = path.join(__dirname, "..", "powershell", "decrypt-secrets.ps1");

  let output;
  try {
    output = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { encoding: "utf8", timeout: 10000 }
    );
  } catch (err) {
    // secrets.dat existiert noch nicht, oder Entschluesselung fehlgeschlagen -
    // nicht fatal, .env-Klartextwerte (falls vorhanden) bleiben aktiv.
    console.log("[Secrets] Keine verschluesselten Secrets gefunden, nutze .env-Werte (falls vorhanden).");
    return { loaded: 0 };
  }

  let secrets;
  try {
    secrets = JSON.parse(output);
  } catch (err) {
    console.error("[Secrets] Entschluesselte Ausgabe war kein gueltiges JSON:", err.message);
    return { loaded: 0 };
  }

  let count = 0;
  for (const [key, value] of Object.entries(secrets)) {
    process.env[key] = value;
    count++;
  }

  console.log(`[Secrets] ${count} verschluesselte(s) Secret(s) aus secrets.dat geladen.`);
  return { loaded: count };
}

module.exports = { loadSecrets };
