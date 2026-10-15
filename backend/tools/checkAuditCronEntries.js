/**
 * checkAuditCronEntries.js – Rein lesend: ruft queryAuditLog() DIREKT
 * auf (ohne Umweg ueber health.js/HTTP), um zu pruefen ob TOPDESK_CRON_RUN-
 * Eintraege tatsaechlich in der Audit-Datenbank ankommen.
 *
 * Hintergrund (08.09.2026): Statusseite zeigt weiterhin "Warnung" bei
 * TopDesk-Sync, obwohl der Scheduler nachweislich stuendlich laeuft und
 * audit.db-wal aktiv beschrieben wird. Dieses Skript isoliert, ob die
 * Daten da sind (dann Fehler in health.js's Abfrage) oder ob sie
 * trotz WAL-Aktivitaet nicht unter diesem Aktionsnamen ankommen.
 *
 * Nutzung:
 *   node tools/checkAuditCronEntries.js
 */

const { queryAuditLog } = require('../services/auditLog');

console.log('Suche alle Eintraege mit action = "TOPDESK_CRON_RUN" ...\n');
const result = queryAuditLog({ page: 1, pageSize: 10, action: 'TOPDESK_CRON_RUN' });

console.log(`Gefunden: ${result.entries.length} Eintraege (von insgesamt ${result.total ?? '?'})\n`);
result.entries.forEach(e => {
  console.log(`  ${e.ts}  result=${e.result}  actor=${e.actor}  target=${e.target}`);
  if (e.error) console.log(`      error: ${e.error}`);
  if (e.details) console.log(`      details: ${JSON.stringify(e.details)}`);
});

if (result.entries.length === 0) {
  console.log('\nKeine Eintraege gefunden. Pruefe zum Vergleich OHNE Filter,');
  console.log('ob ueberhaupt IRGENDWELCHE aktuellen Eintraege da sind:\n');
  const recent = queryAuditLog({ page: 1, pageSize: 5 });
  recent.entries.forEach(e => {
    console.log(`  ${e.ts}  action=${e.action}  result=${e.result}`);
  });
}
