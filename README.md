# IT Workflow & Operations Platform

> Web-based IT Operations Platform for Active Directory management — internes Tool der IT-Administration, Stadt Musterstadt.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![PowerShell](https://img.shields.io/badge/PowerShell-5.1+-5391FE?logo=powershell&logoColor=white)](https://microsoft.com/powershell)
[![SQLite](https://img.shields.io/badge/SQLite-Audit--Log-003B57?logo=sqlite&logoColor=white)](https://sqlite.org)

---

## Features

| Modul | Beschreibung |
|---|---|
| **AD-Benutzerverwaltung** | Suche, aktivieren/deaktivieren, entsperren, Passwort zurücksetzen, Gruppen verwalten, Stammdaten bearbeiten |
| **AD-Computerverwaltung** | Computersuche, aktivieren/deaktivieren, Citrix-Session je Computer |
| **Citrix Session Monitoring** | Aktive Sessions aus CSV, Zuordnung Benutzer ↔ Client-PC |
| **Docusnap Asset-Tracking** | Geräteliste aus Docusnap-CSV, Statusverwaltung, QR-Code-Workflow, Import |
| **Audit-Log** | Vollständige Protokollierung in SQLite + Winston (30 Tage Rotation), CSV-Export |
| **Globale Suche** | Kombinierte Echtzeit-Suche nach Benutzern und Computern |
| **RBAC** | Drei Rollen: `helpdesk`, `it-admin`, `it-lead` – via AD-Gruppe oder `.env` |
| **Dark Mode** | Persistierter Theme-Toggle |

---

## Technologie-Stack

### Backend
- **Node.js + Express** – REST API, Session-Management
- **PowerShell Bridge** – Worker-Pool für AD-Operationen via RSAT
- **better-sqlite3** – Audit-Log Datenbank mit WAL-Mode
- **Winston + DailyRotateFile** – Strukturiertes Logging, 30 Tage Rotation
- **express-session** – Cookie-basierte Session mit Idle-Timeout
- **csv-parser** – Docusnap CSV-Import

### Frontend
- **React 18 + Vite** – SPA mit React Router v6
- **Tailwind CSS** – Utility-first Styling mit CSS-Variablen
- **Lucide React** – Icon-Set
- **html5-qrcode + qrcode.react** – QR-Scanner und QR-Code-Generierung

### Tooling
- **Bruno** – API-Tests (Auth, RBAC, Sicherheitstests)
- **deploy.ps1** – Deployment-Skript

---

## Projektstruktur

```
AD Manager Dashboard/
├── backend/
│   ├── actions/                    # Business-Logik (eine Datei pro Operation)
│   │   ├── auth/adLogin.js
│   │   ├── topdesk/processTopdeskChanges.js
│   │   └── user/                   # enable, disable, unlock, reset, edit, groups …
│   ├── data/
│   │   ├── assets.csv              # Docusnap Asset-Datenbank (persistent)
│   │   └── audit.db                # SQLite Audit-Log
│   ├── jobs/scheduler.js           # Cron-Jobs (TopDesk-Automation)
│   ├── logs/                       # Winston Audit-Logs (30 Tage, gzip)
│   ├── middleware/
│   │   ├── auditMiddleware.js      # Request-Kontext, Idle-Timeout
│   │   ├── authMiddleware.js       # Session-Prüfung
│   │   ├── rbac.js                 # Rollen & Berechtigungen
│   │   └── validation.js           # Input-Validierung (Joi/express-validator)
│   ├── powershell/
│   │   └── psWorker.ps1            # PowerShell Worker-Pool (AD-Operationen)
│   ├── routes/
│   │   ├── auth.js                 # Login, Logout, /me
│   │   ├── auditRoute.js           # Audit-Log API
│   │   ├── citrix.js               # Citrix Session Lookup
│   │   ├── computers.js            # Computer-Verwaltung
│   │   ├── docusnap.js             # Asset-Tracking
│   │   ├── topdesk.js              # TopDesk Webhook + Verarbeitung
│   │   └── users.js                # Benutzer-Verwaltung
│   ├── services/
│   │   ├── adClient.js             # AD-API (PowerShell-Abstraktionsschicht)
│   │   ├── auditLog.js             # SQLite + Winston Audit-Service
│   │   ├── citrixService.js        # Citrix CSV-Parser (BOM-aware)
│   │   ├── credentialCrypto.js     # Session-Credential-Verschlüsselung
│   │   ├── powershellBridge.js     # PS Worker-Pool-Manager
│   │   └── withAudit.js            # Audit-Wrapper für Actions
│   ├── server.js
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── api/client.js           # Zentraler API-Client
│   │   ├── components/
│   │   │   ├── layout/AppShell.jsx # Sidebar, Topbar, globale Suche
│   │   │   └── user/               # GlobalSearch, EditUserModal
│   │   ├── hooks/                  # useAuth, useTheme
│   │   ├── pages/
│   │   │   ├── AuditPage.jsx
│   │   │   ├── ComputerPage.jsx
│   │   │   ├── DocusnapPage.jsx
│   │   │   ├── HomePage.jsx
│   │   │   ├── LoginPage.jsx
│   │   │   └── UserPage.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   └── package.json
│
├── Bruno/                          # API-Tests
│   ├── Auth/
│   ├── Helpdesk/
│   ├── IT-Admin/
│   ├── IT-Lead/
│   └── Sicherheitstests/
│
└── deploy.ps1
```

---

## Voraussetzungen

- **Windows Server** mit RSAT (Active Directory PowerShell-Modul installiert)
- **Node.js 18+** auf dem Server
- **Citrix Delivery Controller** – CSV-Export der Sessions (z. B. alle 5 Minuten per Scheduled Task)
- **Docusnap** – CSV-Export erreichbar unter UNC-Pfad
- **Netzwerkzugang** zum AD-Domain Controller

---

## Installation

### 1. Repository klonen

```powershell
git clone https://github.com/savenna-kaiser/IT-Operations-Platform
cd "AD Manager Dashboard"
```

### 2. Backend einrichten

```powershell
cd backend
npm install
copy .env.example .env
# .env anpassen (siehe Konfiguration)
```

### 3. Frontend bauen

```powershell
cd ..\frontend
npm install
npm run build
```

Das Build-Output (`dist/`) wird vom Express-Server statisch ausgeliefert.

### 4. Server starten

```powershell
cd ..\backend
node server.js
```

Produktivbetrieb: über `deploy.ps1` als Windows-Dienst einrichten.

---

## Konfiguration (`.env`)

```env
# ── Server ───────────────────────────────────────────────────
NODE_ENV=production
PORT=3000
SESSION_SECRET=<min. 32 zufällige Zeichen>
SESSION_IDLE_TIMEOUT_MIN=30

# ── Active Directory ─────────────────────────────────────────
AD_DC=musterstadt.example
AD_DOMAIN=MUSTERSTADT
AD_BASE_DN=DC=musterstadt,DC=example,DC=de

# Ziel-OUs beim Deaktivieren
AD_INACTIVE_USERS_OU=OU=Users,OU=_Inactive,DC=...
AD_INACTIVE_COMPUTERS_OU=OU=Computers,OU=_Inactive,DC=...

# Gruppen-OUs
AD_GROUP_OU=OU=GROUP,DC=...
AD_PRINTER_OU=OU=Druckergruppen,DC=...
AD_EXCHANGE_OU=OU=Verteiler,OU=Exchange,DC=...

# Service-Account für TopDesk-Automation (kein persönliches Konto)
AD_SERVICE_ACCOUNT=MUSTERSTADT\svc-admanager
AD_SERVICE_PASSWORD=<passwort>

# Initiales Passwort für neu angelegte Benutzer
AD_NEW_USER_INITIAL_PASSWORD=<initiales-passwort>

# ── Citrix ───────────────────────────────────────────────────
AD_SESSIONS_CSV=\\server\share\Sessions.csv

# ── RBAC – Rollenzuweisung ───────────────────────────────────
# Option A: AD-Gruppen (empfohlen)
RBAC_GROUP_IT_LEADS=GRP_ADManager_Lead
RBAC_GROUP_IT_ADMINS=GRP_ADManager_Admin
RBAC_GROUP_HELPDESK=GRP_ADManager_Helpdesk

# Option B: Fallback via SAM-Account-Listen (kommasepariert)
RBAC_IT_LEADS=admin100001
RBAC_IT_ADMINS=
RBAC_HELPDESK=

# ── TopDesk ──────────────────────────────────────────────────
TOPDESK_URL=https://deine-instanz.topdesk.net
TOPDESK_USERNAME=api-user@musterstadt.de
TOPDESK_APP_PASSWORD=<application-password>
TOPDESK_CAT_EINTRITT=Eintritt
TOPDESK_CAT_AUSTRITT=Austritt
TOPDESK_CAT_ABTW=Abteilungswechsel
TOPDESK_WEBHOOK_SECRET=<langer-zufallsstring>
TOPDESK_CRON_ENABLED=false
TOPDESK_CRON_INTERVAL_MIN=15

# ── PowerShell Bridge ────────────────────────────────────────
PS_POOL_SIZE=3
PS_CMD_TIMEOUT=8000
PS_MAX_RESTARTS=5
```

> **Wichtig:** Die `.env`-Datei niemals ins Repository committen. Sie ist in `.gitignore` eingetragen.

---

## RBAC – Rollen & Berechtigungen

| Berechtigung | helpdesk | it-admin | it-lead |
|---|:---:|:---:|:---:|
| Benutzer suchen | ✅ | ✅ | ✅ |
| Benutzer entsperren | ✅ | ✅ | ✅ |
| Passwort zurücksetzen | ✅ | ✅ | ✅ |
| Gruppen lesen | ✅ | ✅ | ✅ |
| Benutzer aktivieren/deaktivieren | ❌ | ✅ | ✅ |
| Stammdaten bearbeiten | ❌ | ✅ | ✅ |
| Gruppen verwalten | ❌ | ✅ | ✅ |
| Computer verwalten | ❌ | ✅ | ✅ |
| Audit-Log lesen | ❌ | ✅ | ✅ |
| Audit-Log exportieren (CSV) | ❌ | ❌ | ✅ |
| TopDesk Batch-Verarbeitung | ❌ | ❌ | ✅ |

Die Rollenzuweisung erfolgt beim Login automatisch anhand der AD-Gruppenmitgliedschaft (`RBAC_GROUP_*`). Als Fallback können SAM-Accounts direkt in der `.env` eingetragen werden.

---

## API-Tests (Bruno)

Die `Bruno/`-Collection enthält fertige Tests für alle Rollen und Sicherheitsszenarien:

```
Bruno/
├── Auth/             Login, Logout, Session-Check
├── Helpdesk/         Erlaubte (200) und verbotene (403) Operationen
├── IT-Admin/         Admin-spezifische Operationen
├── IT-Lead/          Lead-exklusive Funktionen (Batch-Processing)
└── Sicherheitstests/ Input-Validierung, CSRF, Webhook-Authentifizierung
```

Environment `local` auswählen und Collection in Bruno öffnen.

---

## Audit-Log

Alle Aktionen werden doppelt gespeichert:

| Speicher | Pfad | Zweck |
|---|---|---|
| **SQLite** | `data/audit.db` | Durchsuchbar, paginierbar, filterbar – Basis für die UI |
| **Winston** | `logs/audit-YYYY-MM-DD.log` | JSON-Lines, 30 Tage Rotation, automatisch komprimiert |

CSV-Export (nur `it-lead`) über die Audit-Seite im Frontend – exportiert die aktuelle Filterauswahl.

---

## Lizenz

Internes Tool – Stadt Musterstadt, IT-Administration. Nicht zur Weitergabe bestimmt.
#   C o n n O p s - I n t e g r a t i o n - O p e r a t i o n s - P l a t f o r m  
 