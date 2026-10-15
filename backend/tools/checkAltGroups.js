/**
 * checkAltGroups.js – Rein lesend: durchsucht alle Rollen nach
 * AD-Gruppen mit "alt_"-Praefix (typische AD-Namenskonvention fuer
 * veraltete/nicht mehr genutzte Gruppen).
 *
 * Hintergrund (08.09.2026): Bei der Rolle "GB0-Personal" fiel eine
 * Gruppe "alt_GB1-Personal" auf. Unklar, ob das ein Einzelfall ist oder
 * sich durch mehrere Rollen zieht - dieses Skript prueft das
 * systematisch, statt es zu vermuten.
 *
 * Nutzung:
 *   node tools/checkAltGroups.js
 */

require('dotenv').config();
require('../services/loadSecrets').loadSecrets();

const db = require('../data/db');

async function main() {
  const { rows } = await db.query(
    `SELECT r.id, r.name AS role_name, d.name AS department_name, r.ad_groups
     FROM org_roles r
     JOIN org_departments d ON d.id = r.department_id
     ORDER BY d.name, r.name`
  );

  console.log(`${rows.length} Rolle(n) insgesamt geprueft.\n`);

  let foundCount = 0;
  for (const row of rows) {
    const groups = row.ad_groups || [];
    const altGroups = groups.filter(g => /(^|,)\s*CN=alt_/i.test(g));
    if (altGroups.length > 0) {
      foundCount++;
      console.log(`${row.department_name} / ${row.role_name}:`);
      altGroups.forEach(g => console.log(`    ${g}`));
    }
  }

  console.log(`\n${foundCount} von ${rows.length} Rolle(n) haben mindestens eine "alt_"-Gruppe.`);
}

main()
  .catch(err => {
    console.error('Fehler:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
