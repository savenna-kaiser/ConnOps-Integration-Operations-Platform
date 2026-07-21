/**
 * migrate.js – Erstellt das PostgreSQL-Schema für die IT-Operations-Platform
 * Einmalig ausführen: node data/migrate.js
 *
 * Phase 6.1 (RBAC im Detail): roles, permissions, role_permissions, ad_group_roles
 * ergänzt. Seed-Daten für Permissions + Start-Rollen (helpdesk/it-admin/it-lead)
 * sind idempotent (ON CONFLICT DO NOTHING) – mehrfaches Ausführen ist unschädlich.
 */

const { Pool } = require('pg');
require('dotenv').config();

// Phase 6.3: DPAPI-verschluesselte Secrets ueberschreiben die .env-Klartext-
// werte, FALLS vorhanden. migrate.js laeuft eigenstaendig (nicht ueber
// server.js), muss deshalb genau wie server.js selbst dafuer sorgen, dass
// PG_PASSWORD etc. verfuegbar sind, bevor der Pool unten erzeugt wird.
require('../services/loadSecrets').loadSecrets();

const pool = new Pool({
  host:     process.env.PG_HOST,
  port:     process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user:     process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

const schema = `

-- ─── Abteilungen ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_departments (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  ad_ou       TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Rollen (Organisations-RBAC, Phase 1–5) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS org_roles (
  id                 SERIAL PRIMARY KEY,
  department_id      INTEGER NOT NULL REFERENCES org_departments(id) ON DELETE CASCADE,
  name               VARCHAR(100) NOT NULL,
  ad_groups          JSONB NOT NULL DEFAULT '[]',
  mailbox_database   VARCHAR(100),
  mailbox_size_mb    INTEGER,
  manual_tasks       JSONB NOT NULL DEFAULT '[]',
  description        TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(department_id, name)
);

-- ─── TopDesk Changes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS topdesk_changes (
  id           SERIAL PRIMARY KEY,
  change_id    VARCHAR(50) NOT NULL UNIQUE,
  type         VARCHAR(20) NOT NULL CHECK (type IN ('EINTRITT','AUSTRITT','ABT_WECHSEL')),
  status       VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN (
                   'PENDING','CONFLICT','WARNING',
                   'PROCESSING','DONE','PARTIAL','FAILED'
                 )),
  target_date  DATE,
  received_at  TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  payload      JSONB NOT NULL DEFAULT '{}',
  resolved     JSONB NOT NULL DEFAULT '{}',
  executed     JSONB NOT NULL DEFAULT '{}'
);

-- ─── Change Steps ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS topdesk_change_steps (
  id            SERIAL PRIMARY KEY,
  change_id     VARCHAR(50) NOT NULL REFERENCES topdesk_changes(change_id) ON DELETE CASCADE,
  step_name     VARCHAR(100) NOT NULL,
  status        VARCHAR(20) NOT NULL CHECK (status IN ('OK','FAILED','SKIPPED','MANUAL')),
  executed_at   TIMESTAMPTZ DEFAULT NOW(),
  result        JSONB,
  error_message TEXT
);

-- ─── Indizes (Phase 1–5) ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_topdesk_changes_status      ON topdesk_changes(status);
CREATE INDEX IF NOT EXISTS idx_topdesk_changes_target_date ON topdesk_changes(target_date);
CREATE INDEX IF NOT EXISTS idx_topdesk_changes_type        ON topdesk_changes(type);
CREATE INDEX IF NOT EXISTS idx_change_steps_change_id      ON topdesk_change_steps(change_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 6.1 — RBAC im Detail: AD-Gruppe → Rolle → Permissions → Middleware
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Rollen ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Permissions (feste, im Code definierte Liste, siehe rbac.js) ────────────
CREATE TABLE IF NOT EXISTS permissions (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Rolle ↔ Permission (m:n, einzige über 6.2 pflegbare Zuordnung) ──────────
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ─── AD-Gruppe → Rolle (ersetzt RBAC_GROUP_* aus .env) ───────────────────────
CREATE TABLE IF NOT EXISTS ad_group_roles (
  id            SERIAL PRIMARY KEY,
  ad_group_name VARCHAR(200) NOT NULL UNIQUE,
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_group_roles_group ON ad_group_roles (LOWER(ad_group_name));

-- ─── Platform-Settings (Fundament für weitere 6.2-Tabs) ──────────────────────
-- Aktuell nur als Grundgerüst angelegt, noch ungenutzt. Vorgesehen für Health-
-- Schwellenwerte (Phase 9), Audit-Kategorien (Phase 7), TopDesk-Status-Namen/
-- Template-IDs und Cron-Intervalle – alles aktuell noch in .env, wandert
-- schrittweise hierher, sobald die jeweiligen Tabs in der Konfigseite gebaut
-- werden. Generisches Key-Value-Modell, da die Settings-Struktur je Tab
-- unterschiedlich ist (Zahl, String, JSON-Objekt).
CREATE TABLE IF NOT EXISTS platform_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       JSONB NOT NULL,
  category    VARCHAR(50) NOT NULL,  -- 'health' | 'audit' | 'topdesk' | 'system'
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uebergabedokumente: Datei selbst bleibt im Dateisystem (data/handover/),
-- diese Tabelle trackt nur Signierstatus + Position der Unterschriftsflaeche
-- (noetig, damit pdf-lib beim nachtraeglichen Einfuegen weiss, WO im PDF —
-- die Position variiert je nach Dokumentlaenge/Bemerkungstext).
-- Einmal signiert = unveraenderlich (kein erneutes Signieren, siehe
-- addSignature() in handoverService.js).
CREATE TABLE IF NOT EXISTS handover_documents (
  id          SERIAL PRIMARY KEY,
  hostname    VARCHAR(100) NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  signed      BOOLEAN NOT NULL DEFAULT false,
  signed_at   TIMESTAMPTZ,
  sig_x       REAL NOT NULL,
  sig_y       REAL NOT NULL,
  sig_width   REAL NOT NULL,
  sig_height  REAL NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(hostname, filename)
);

`;

// ─── Seed-Daten: Permissions ────────────────────────────────────────────────
// Feste Liste, entspricht dem aktuellen Stand aus middleware/rbac.js
// (inkl. neuer Keys für docusnap:* und citrix:*, die bisher fehlten/falsch
// verdrahtet waren, sowie rbac:manage für den Selbst-Aussperr-Schutz).
const permissionSeeds = `
INSERT INTO permissions (key, description) VALUES
  ('user:search',            'Benutzer suchen'),
  ('user:unlock',            'Benutzerkonto entsperren'),
  ('user:reset-password',    'Passwort zurücksetzen'),
  ('user:read-groups',       'Gruppenmitgliedschaften einsehen'),
  ('user:enable',            'Benutzerkonto aktivieren'),
  ('user:disable',           'Benutzerkonto deaktivieren'),
  ('user:edit',              'Benutzerattribute bearbeiten'),
  ('user:add-group',         'Gruppenmitgliedschaft hinzufügen'),
  ('user:remove-group',      'Gruppenmitgliedschaft entfernen'),
  ('computer:search',        'Computer suchen'),
  ('computer:enable',        'Computerkonto aktivieren'),
  ('computer:disable',       'Computerkonto deaktivieren'),
  ('topdesk:read',           'TopDesk-Changes einsehen'),
  ('topdesk:process-single', 'Einzelnen Change ausführen/übersteuern'),
  ('topdesk:process-batch',  'Batch-Verarbeitung (aktuell kein aktiver Code, siehe processTopdeskChanges.js)'),
  ('audit:read',             'Audit-Log einsehen'),
  ('audit:export',           'Audit-Log als CSV exportieren'),
  ('health:read',            'Health-Dashboard einsehen'),
  ('report:read',            'Report-Seite einsehen'),
  ('org:read',               'Abteilungen/Rollen einsehen'),
  ('org:write',              'Abteilungen/Rollen bearbeiten'),
  ('docusnap:read',          'Docusnap-Assets/Statistiken einsehen'),
  ('docusnap:update',        'Status/Kommentar eines Assets ändern'),
  ('docusnap:import',        'Re-Import aus Docusnap-Netzwerkfreigabe anstoßen'),
  ('citrix:read',            'Citrix-Sessions einsehen'),
  ('citrix:logoff',          'Citrix-Session beenden'),
  ('rbac:manage',            'Rollen-Zuordnungen und Permission-Vergabe verwalten')
ON CONFLICT (key) DO NOTHING;
`;

// ─── Seed-Daten: Start-Rollen ────────────────────────────────────────────────
const roleSeeds = `
INSERT INTO roles (name, description) VALUES
  ('helpdesk', 'Minimale Rechte: Entsperren, Passwort zurücksetzen, Citrix, Docusnap-Übergabe'),
  ('it-admin', 'Erweiterte Rechte: Gruppen, Computer, TopDesk-Einzelverarbeitung, Docusnap-Import'),
  ('it-lead',  'Vollzugriff inkl. Rollen-/Konfigurationsverwaltung')
ON CONFLICT (name) DO NOTHING;
`;

// ─── Seed-Daten: Rolle → Permission Start-Zuordnung ─────────────────────────
const rolePermissionSeeds = `
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = 'helpdesk'), id
FROM permissions WHERE key IN (
  'user:search','user:unlock','user:reset-password','user:read-groups',
  'citrix:read','citrix:logoff',
  'docusnap:read','docusnap:update'
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = 'it-admin'), id
FROM permissions WHERE key IN (
  'user:search','user:unlock','user:reset-password','user:read-groups',
  'user:enable','user:disable','user:edit','user:add-group','user:remove-group',
  'computer:search','computer:enable','computer:disable',
  'topdesk:read','topdesk:process-single',
  'audit:read','health:read','report:read','org:read',
  'citrix:read','citrix:logoff',
  'docusnap:read','docusnap:update','docusnap:import'
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = 'it-lead'), id
FROM permissions
ON CONFLICT DO NOTHING;
`;

// ─── Seed-Daten: platform_settings (Health-Tab, Phase 6.2) ─────────────────
// Übernimmt die bisherigen .env-Defaults als Startwerte. Nur die drei
// fachlich relevanten Werte (Timeouts bleiben bewusst in .env, siehe
// Gespräch zu Phase 6.2 Health-Tab). ON CONFLICT DO NOTHING, damit ein
// bereits über die Konfigseite geänderter Wert bei erneutem migrate.js-Lauf
// nicht überschrieben wird.
const platformSettingsSeeds = `
INSERT INTO platform_settings (key, value, category, description) VALUES
  ('health.inactive_days', '90', 'health',
   'Ab wann gilt ein Benutzer/Computer als inaktiv (Tage)'),
  ('health.topdesk_upcoming_days', '7', 'health',
   'Ab wann gilt eine TopDesk-Aufgabe als "anstehend" (Tage)'),
  ('health.wal_warn_bytes', '8388608', 'health',
   'Ab welcher Audit-DB-WAL-Größe eine Warnung erscheint (Bytes)'),
  ('audit.retention_days', '30', 'audit',
   'Wie lange Audit-Log-Dateien aufbewahrt werden (Tage) - Betriebseinstellung, nicht die Kategorisierung (die bleibt fest im Code)'),
  ('system.topdesk_cron_enabled', 'true', 'system',
   'Ob der TopDesk-Poll-Cron aktiv ist (holt Changes, führt NICHT automatisch aus)'),
  ('system.topdesk_cron_interval_min', '15', 'system',
   'Intervall des TopDesk-Poll-Cron in Minuten')
ON CONFLICT (key) DO NOTHING;
`;

// topdesk.base_url separat als parametrisierte Query (nicht Teil des obigen
// Template-Strings), da der Wert aus process.env kommt und nicht als
// SQL-Literal fest eingebettet werden soll.
const topdeskUrlSeed = {
  text: `INSERT INTO platform_settings (key, value, category, description)
         VALUES ('topdesk.base_url', $1::jsonb, 'topdesk',
                 'Basis-URL der TopDesk-API — änderbar über den TopDesk-Tab, mit Verbindungstest vor dem Speichern')
         ON CONFLICT (key) DO NOTHING`,
  values: [JSON.stringify(process.env.TOPDESK_URL || "")],
};

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Migration gestartet...');
    await client.query(schema);
    console.log('✅ Schema erfolgreich angelegt:');
    console.log('   - org_departments');
    console.log('   - org_roles');
    console.log('   - topdesk_changes');
    console.log('   - topdesk_change_steps');
    console.log('   - roles');
    console.log('   - permissions');
    console.log('   - role_permissions');
    console.log('   - ad_group_roles');
    console.log('   - platform_settings');
    console.log('   - handover_documents');

    console.log('Seed-Daten (Permissions, Start-Rollen, Rolle→Permission)...');
    await client.query(permissionSeeds);
    await client.query(roleSeeds);
    await client.query(rolePermissionSeeds);
    await client.query(platformSettingsSeeds);
    await client.query(topdeskUrlSeed.text, topdeskUrlSeed.values);
    console.log('✅ Seed-Daten eingefügt (bereits vorhandene Einträge übersprungen).');

    console.log('');
    console.log('ℹ️  ad_group_roles ist bewusst NICHT geseedet — dafür gibt es das separate');
    console.log('   Migrationsscript, das eure bestehenden RBAC_GROUP_*-Werte aus .env liest.');
  } catch (err) {
    console.error('❌ Fehler bei der Migration:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();