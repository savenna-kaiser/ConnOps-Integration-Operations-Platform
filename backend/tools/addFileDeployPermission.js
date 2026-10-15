/**
 * addFileDeployPermission.js - Legt die Permission "computer:filedeploy" an
 * und weist sie der Rolle it-admin zu (it-lead bekommt sie ebenfalls, da
 * dieser Vollzugriff hat). Idempotent: mehrfaches Ausfuehren ist unschaedlich.
 * Bewusst als eigenes Werkzeug statt Aenderung an data/migrate.js.
 *
 * Nutzung (im Ordner backend):  node tools\addFileDeployPermission.js
 * Danach ConnOps-Dienst neu starten (RBAC-Cache wird beim Start geladen),
 * alternativ Rollen-Tab speichern.
 */

require('dotenv').config();
// Secrets (z. B. PG_PASSWORD) liegen verschluesselt in secrets.dat - wie in server.js
// VOR dem Laden von data/db laden.
require('../services/loadSecrets').loadSecrets();
const db = require('../data/db');

const KEY  = 'computer:filedeploy';
const DESC = 'Datei auf einen Computer verteilen (FileDeploy)';
const ROLES = ['it-admin', 'it-lead'];

(async () => {
  try {
    await db.query(
      `INSERT INTO permissions (key, description) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [KEY, DESC]
    );
    for (const role of ROLES) {
      const r = await db.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM roles r, permissions p
         WHERE r.name = $1 AND p.key = $2
         ON CONFLICT DO NOTHING`,
        [role, KEY]
      );
      console.log(`${role}: ${r.rowCount ? 'zugewiesen' : 'war bereits zugewiesen (oder Rolle fehlt)'}`);
    }
    const check = await db.query(
      `SELECT r.name FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key = $1 ORDER BY r.name`, [KEY]);
    console.log(`Rollen mit "${KEY}":`, check.rows.map(x => x.name).join(', ') || '(keine)');
  } catch (err) {
    console.error('Fehler:', err.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
