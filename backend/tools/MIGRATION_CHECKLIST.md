# ConnOps – Server-Umzug auf epn1Connops

Checkliste für den vollständigen Umzug (Anwendung + PostgreSQL) vom
bisherigen Server auf einen neuen, dedizierten Server. Alter Server bleibt
bestehen, bekommt aber einen anderen Verwendungszweck — kein Parallelbetrieb
von ConnOps auf beiden Servern vorgesehen.

**Reihenfolge einhalten** — spätere Schritte setzen frühere voraus.

---

## Phase 1 — Vorbereitung (alter Server, während er noch läuft)

- [ ] `git status` prüfen — alle Änderungen committed und gepusht? (siehe bisherige Commit-Historie)
- [ ] `export-migration-package.ps1` ausführen (siehe Skript) — erstellt DB-Dump + Datendateien + annotierte `.env`-Vorlage
- [ ] Paket-Ordner (`connops_migration_<timestamp>`) auf eine Zwischenablage übertragen, auf die auch `epn1Connops` Zugriff hat (z. B. die Backup-Freigabe `\\epn1fs1...\ConnOps\` eignet sich, oder ein temporärer Ordner)
- [ ] **TopDesk-Webhook-Ziel notieren** — die aktuell in TopDesk hinterlegte Webhook-URL (zeigt vermutlich auf den alten Servernamen/IP) muss später auf `epn1Connops` umgestellt werden. Wo das in TopDesk konfiguriert ist, vorher einmal nachsehen, damit es am Umzugstag nicht gesucht werden muss.
- [ ] Prüfen, ob für `AD_SERVICE_ACCOUNT` (oder andere Service-Accounts) eine **Kerberos-Delegation** oder ein **SPN** speziell auf den alten Servernamen eingetragen ist — falls ja, muss das für `epn1Connops` neu eingerichtet werden (sonst funktioniert WinRM/Remoting u. U. nicht, siehe die kürzliche Citrix-"Zugriff verweigert"-Erfahrung — das gleiche Muster kann bei einem neuen Servernamen erneut auftreten)

## Phase 2 — Neuer Server: Grundausstattung

- [ ] Node.js installieren (gleiche Major-Version wie bisher — prüfen mit `node --version` auf dem alten Server vor dem Umzug)
- [ ] Git installieren
- [ ] PostgreSQL installieren (gleiche oder neuere Major-Version als bisher — **nicht älter**, sonst kann `pg_restore` scheitern)
- [ ] PowerShell `ActiveDirectory`-Modul installieren (RSAT-Feature)
- [ ] `verify-new-server.ps1` ausführen — sollte am Ende "Alle Prüfungen erfolgreich" zeigen, bevor es weitergeht
- [ ] DNS-Eintrag für `connops.musterstadt.example` prüfen/anlegen, falls nicht automatisch vorhanden
- [ ] Firewall: eingehend für den Webhook-Port (TopDesk → `epn1Connops`), eingehend für Frontend-Zugriff (Port, unter dem die Plattform erreichbar sein soll); ausgehend zu AD-DC, Exchange, TopDesk, Citrix-Controllern (CDC3–5), den Netzwerkfreigaben (Docusnap, Citrix-CSV-Fallback, Backup-Ziel) und PostgreSQL (jetzt lokal, falls es mit umzieht)

## Phase 3 — Code deployen

- [ ] `git clone https://github.com/savenna-kaiser/ConnOps.git C:\ConnOps` (frischer Klon, **keine** Kopie von `node_modules`/`.vite`-Cache vom alten Server — das hat schon während der Entwicklung Probleme gemacht)
- [ ] `cd C:\ConnOps\backend && npm install`
- [ ] `cd C:\ConnOps\frontend && npm install`
- [ ] Migrationspaket vom alten Server (Phase 1) nach `C:\ConnOps\backend\data\` kopieren: `audit.db`, `assets.csv`, `lastImport.json`, `lastBackup.json` (jeweils falls vorhanden)

## Phase 4 — Konfiguration

- [ ] `env.template` aus dem Migrationspaket nach `C:\ConnOps\backend\.env` kopieren
- [ ] Alle mit `⚠ PRÜFEN` markierten Zeilen durchgehen und anpassen:
  - `PG_HOST` → `localhost` (PostgreSQL zieht mit um, läuft jetzt lokal)
  - `AD_DC` → bleibt vermutlich gleich (AD selbst zieht nicht um), trotzdem kurz verifizieren
  - `TOPDESK_URL` → bleibt vermutlich gleich (TopDesk-Server zieht nicht um), trotzdem verifizieren
  - `TOPDESK_WEBHOOK_SECRET` → bleibt gleich, **aber** die Webhook-URL selbst muss in TopDesk auf `epn1Connops` umgestellt werden (siehe Phase 1)
- [ ] `BACKUP_TARGET_PATH` prüfen — bleibt gleich (Freigabe zieht nicht um), aber Zugriff vom neuen Server aus testen

## Phase 5 — Datenbank wiederherstellen

- [ ] `node data/migrate.js` **NICHT zuerst** ausführen — erst der Restore, `migrate.js` würde sonst eine leere DB anlegen, bevor der Dump eingespielt ist
- [ ] Neue, leere Datenbank anlegen (Name aus `PG_DATABASE`):
  ```powershell
  psql --host=localhost --username=<PG_USER> -c "CREATE DATABASE <PG_DATABASE>;"
  ```
- [ ] Dump einspielen:
  ```powershell
  pg_restore --host=localhost --username=<PG_USER> --dbname=<PG_DATABASE> --no-owner --clean --if-exists connops_db.dump
  ```
- [ ] `node data/migrate.js` jetzt ausführen — legt nur noch fehlende Tabellen/Seeds nach (idempotent, siehe `ON CONFLICT DO NOTHING`), überschreibt nichts Bestehendes
- [ ] **AD-Gruppen-Zuordnung erneut einspielen** (falls `GRP_ConnOps_Lead`/`_Admin`/`_Helpdesk` bereits vor dem Umzug angelegt und zugeordnet wurden — die Zeilen unten waren nur auf der alten DB-Instanz aktiv, müssen auf der neuen DB nochmal ausgeführt werden):
  ```sql
  INSERT INTO ad_group_roles (ad_group_name, role_id) VALUES
    ('GRP_ConnOps_Lead',     (SELECT id FROM roles WHERE name = 'it-lead')),
    ('GRP_ConnOps_Admin',    (SELECT id FROM roles WHERE name = 'it-admin')),
    ('GRP_ConnOps_Helpdesk', (SELECT id FROM roles WHERE name = 'helpdesk'))
  ON CONFLICT (ad_group_name) DO NOTHING;
  ```
  Bis dahin greift automatisch der `.env`-SAM-Fallback (`RBAC_IT_LEADS=...`) — kein Blocker, aber nicht vergessen, sonst bleibt die AD-Gruppen-Zuordnung dauerhaft ungenutzt.

## Phase 6 — Erststart und Verifikation

- [ ] `npm run dev` (Backend) — Startlog durchgehen:
  - `[RBAC] Cache geladen: ...` — Rollen/Permissions korrekt geladen?
  - `[Audit] Log-Aufbewahrung geändert: ...` — Audit-Setting aus DB übernommen?
  - `[Scheduler] TopDesk-Cron aktiv/deaktiviert: ...` — Cron-Setting korrekt?
  - Keine `[FATAL]`-Zeilen?
- [ ] `npm run dev` (Frontend), Login testen
- [ ] Systemstatus-Seite (System-Tab) durchgehen: PostgreSQL OK? Audit-DB OK? PS-Worker bereit? Backup-Status (falls schon einmal gelaufen)?
- [ ] Stichprobenartig: Benutzersuche, Computer-Suche, Docusnap-Ansicht, Citrix-Session-Suche, TopDesk-Verlauf — sind die migrierten Daten sichtbar?

## Phase 7 — Externe Anbindungen umstellen

- [ ] **TopDesk-Webhook-URL** auf `epn1Connops` umstellen (siehe Notiz aus Phase 1) — danach einen Test-Change in TopDesk auslösen und prüfen, ob er in ConnOps ankommt
- [ ] Falls Kerberos-Delegation/SPN für Service-Accounts angepasst werden musste (Phase 1) — jetzt verifizieren: AD-Suche, Exchange-Aktion, Citrix-Live-Abfrage testen
- [ ] Browser-Lesezeichen/interne Doku-Links, die auf den alten Servernamen zeigen, aktualisieren (außerhalb dieses Checklisten-Scopes, aber leicht zu vergessen)

## Phase 8 — Backup neu einrichten

- [ ] `backup-db.ps1` manuell einmal auf `epn1Connops` testen
- [ ] Scheduled Task auf `epn1Connops` neu anlegen (der alte Task auf dem alten Server zieht nicht automatisch mit um):
  ```powershell
  schtasks /create /tn "ConnOps-Backup" /tr "powershell.exe -File C:\ConnOps\backend\powershell\backup-db.ps1" /sc daily /st 02:00 /ru SYSTEM
  ```
- [ ] Alten Scheduled Task auf dem alten Server **deaktivieren/löschen**, damit nicht versehentlich zwei Systeme gegeneinander Backups schreiben

## Phase 9 — Alten Server abschließen

- [ ] Alten Node-Prozess stoppen (`npm run dev` beenden, falls noch aktiv)
- [ ] Alte PostgreSQL-Instanz: Daten dort **nicht sofort löschen** — als Rückfallebene noch einige Tage/Wochen aufbewahren, bis der neue Server sich im Betrieb bewährt hat
- [ ] Alten Scheduled Task (Backup) final entfernen, falls in Phase 8 nur deaktiviert
- [ ] `PROJECT_CONTEXT.md`/Doku aktualisieren: Servername, ggf. neue IP, Hinweis auf den Umzug (dein separater Doku-Chat)

---

## Rollback-Plan, falls etwas nicht funktioniert

Der alte Server läuft ja weiter (nur mit anderem Zweck) — solange die alte
PostgreSQL-Instanz dort nicht gelöscht wurde (Phase 9), kann im Notfall der
alte Node-Prozess dort wieder gestartet und die TopDesk-Webhook-URL
zurückgestellt werden. Deshalb Phase 9 bewusst erst nach einer
Bewährungsphase durchführen, nicht direkt am Umzugstag.
