<#
.SYNOPSIS
    ConnOps - PostgreSQL-Restore aus einem Backup (Phase 6.5)

.DESCRIPTION
    Stellt ein Backup wieder her. SICHER PER DEFAULT: Restore landet in
    einer NEUEN Datenbank (<PG_DATABASE>_restore_<timestamp>), NICHT in
    der Produktions-DB - analog zum projektweiten Muster
    "Bestaetigungsdialog bei destruktiven Aktionen". Nur mit explizitem
    -OverwriteProduction-Schalter UND einer getippten Bestaetigung wird
    die tatsaechliche Produktions-DB ueberschrieben.

    -BackupFile ergaenzt am 28.07.2026 (Schritt 6 der Deployment Engine):
    Wird ein konkreter Dateipfad uebergeben, entfaellt die interaktive
    Auflistung/Auswahl komplett - restore-db.ps1 stellt dann NUR NOCH das
    angegebene Backup wieder her, fragt nichts. Grund: die Deployment
    Engine (deployment/restore/Restore.ps1) uebernimmt die Backup-Auswahl
    kuenftig selbst und ruft dieses Skript bereits mit einem konkreten
    Pfad auf - Restore-Logik und Benutzerinteraktion sollen getrennte
    Verantwortungen sein (CLI-Host fragt, Fachskript fuehrt aus). Wird
    KEIN -BackupFile uebergeben, bleibt das bisherige interaktive
    Verhalten (Auflisten + Read-Host) unveraendert bestehen - fuer den
    direkten Aufruf durch einen Administrator ohne Deployment Engine.

.PARAMETER BackupFile
    Voller Pfad zu einer konkreten .dump-Datei. Wenn gesetzt: keine
    interaktive Auswahl, direkter Restore dieser Datei. Wenn nicht
    gesetzt: bisheriges Verhalten (Backups aus BACKUP_TARGET_PATH
    auflisten, Read-Host-Auswahl).

.PARAMETER OverwriteProduction
    Wenn gesetzt: stellt DIREKT in die Produktions-Datenbank wieder her
    (droppt und erstellt sie neu). Erfordert zusaetzliche Bestaetigung durch
    Eintippen des exakten Datenbanknamens.

.EXAMPLE
    .\restore-db.ps1
    Interaktiv: listet Backups auf, fragt per Read-Host, stellt in eine
    neue Test-Datenbank wieder her (sicherer Standardfall, z. B. fuer den
    in der Roadmap geforderten Disaster-Recovery-Test).

.EXAMPLE
    .\restore-db.ps1 -BackupFile "D:\Backups\connops_backup_20260728.dump"
    Nicht-interaktiv: stellt genau diese Datei in eine neue
    Test-Datenbank wieder her. So ruft deployment/restore/Restore.ps1
    dieses Skript kuenftig auf.

.EXAMPLE
    .\restore-db.ps1 -OverwriteProduction
    Interaktiv, stellt die Produktions-Datenbank tatsaechlich wieder her.
    NUR im echten Notfall verwenden.
#>

param(
    [string]$BackupFile,
    [switch]$OverwriteProduction
)

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
$envPath   = Join-Path $scriptDir "..\.env"

# --- .env einlesen ------------------------------------------------------------
# Read-DotEnv ist am 28.07.2026 nach common/Env.ps1 gewandert (siehe dort
# fuer Begruendung). restore-db.ps1 bekommt dadurch zusaetzlich die
# Test-Path-Pruefung mit klarer Fehlermeldung, die backup-db.ps1 schon
# hatte, restore-db.ps1 bisher aber nicht.
. (Join-Path $scriptDir "common\Env.ps1")

$config = Read-DotEnv -Path $envPath

$pgHost     = $config["PG_HOST"]
$pgPort     = $(if ($config["PG_PORT"]) { $config["PG_PORT"] } else { "5432" })
$pgDatabase = $config["PG_DATABASE"]
$pgUser     = $config["PG_USER"]
$pgPassword = $config["PG_PASSWORD"]

# Fallback auf DPAPI-verschluesselte Secrets, falls PG_PASSWORD nicht (mehr)
# in .env steht - identische Luecke wie damals bei migrate.js und
# backup-db.ps1 (Phase 6.3 hat PG_PASSWORD ggf. aus .env entfernt). Ohne
# diesen Fallback wuerde der Restore mit einer irrefuehrenden SASL-
# Fehlermeldung abbrechen statt klar zu sagen, woran es liegt.
if (-not $pgPassword) {
    Write-Output "[Restore] PG_PASSWORD nicht in .env gefunden, versuche DPAPI-Secrets..."
    $decryptScript = Join-Path $scriptDir "decrypt-secrets.ps1"
    try {
        $json = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $decryptScript
        if ($LASTEXITCODE -eq 0 -and $json) {
            $secrets = $json | ConvertFrom-Json
            if ($secrets.PG_PASSWORD) {
                $pgPassword = $secrets.PG_PASSWORD
                Write-Output "[Restore] PG_PASSWORD aus secrets.dat geladen."
            }
        }
    } catch {
        Write-Warning "[Restore] DPAPI-Secrets konnten nicht gelesen werden: $($_.Exception.Message)"
    }
}

if (-not $pgPassword) {
    Write-Error "[Restore] PG_PASSWORD weder in .env noch in secrets.dat gefunden. Restore abgebrochen."
    exit 1
}

$targetPath = $config["BACKUP_TARGET_PATH"]
$pgRestorePath = $(if ($config["PG_RESTORE_PATH"]) { $config["PG_RESTORE_PATH"] } else { "pg_restore" })
$psqlPath      = $(if ($config["PSQL_PATH"])        { $config["PSQL_PATH"] }        else { "psql" })

if (-not $targetPath -or -not (Test-Path $targetPath)) {
    Write-Error "Backup-Ordner nicht gefunden: $targetPath"
    exit 1
}

# --- Administratives Datenbankkonto laden --------------------------------------
# Architekturentscheidung vom 28.07.2026 (Schritt 6): PG_USER (Anwendungs-
# konto, z. B. itops_app) darf KEIN CREATEDB-Recht bekommen - das waere
# eine dauerhafte Rechteausweitung des am staerksten exponierten Kontos
# fuer einen Vorgang, der 364 Tage im Jahr nie gebraucht wird. Stattdessen:
# ein separates administratives Datenbankkonto (PG_ADMIN_USER), das
# NUR fuer den minimal notwendigen Ausschnitt eines Workflows verwendet
# wird (hier: CREATE DATABASE, DROP DATABASE, Verbindungen trennen,
# Eigentuemer uebertragen) und danach sofort nicht mehr angefasst wird.
# Der eigentliche Restore (pg_restore) laeuft weiterhin mit PG_USER, weil
# das Schreiben von Daten in die Anwendungsdatenbank keine administrative
# Operation ist. Gedacht als "Deployment-Datenbankkonto" - seine Rechte
# ergeben sich aus den Anforderungen der Deployment Engine allgemein,
# nicht nur aus diesem einen Restore-Anwendungsfall; kuenftige Aufgaben
# (z. B. ALTER ROLE bei install/update) koennen spaeter dazukommen.
$pgAdminUser = $config["PG_ADMIN_USER"]
if (-not $pgAdminUser) {
    Write-Error "[Restore] PG_ADMIN_USER ist in .env nicht gesetzt. Fuer CREATE DATABASE wird ein separates administratives Datenbankkonto benoetigt (nicht PG_USER/das Anwendungskonto) - siehe Roadmap-Architekturentscheidung zu Schritt 6. Bitte ein Postgres-Konto mit CREATEDB-Recht anlegen und als PG_ADMIN_USER (plus PG_ADMIN_PASSWORD) in .env eintragen."
    exit 1
}

$pgAdminPassword = $config["PG_ADMIN_PASSWORD"]
if (-not $pgAdminPassword) {
    Write-Output "[Restore] PG_ADMIN_PASSWORD nicht in .env gefunden, versuche DPAPI-Secrets..."
    $decryptScript = Join-Path $scriptDir "decrypt-secrets.ps1"
    try {
        $json = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $decryptScript
        if ($LASTEXITCODE -eq 0 -and $json) {
            $secrets = $json | ConvertFrom-Json
            if ($secrets.PG_ADMIN_PASSWORD) {
                $pgAdminPassword = $secrets.PG_ADMIN_PASSWORD
                Write-Output "[Restore] PG_ADMIN_PASSWORD aus secrets.dat geladen."
            }
        }
    } catch {
        Write-Warning "[Restore] DPAPI-Secrets konnten nicht gelesen werden: $($_.Exception.Message)"
    }
}

if (-not $pgAdminPassword) {
    Write-Error "[Restore] PG_ADMIN_PASSWORD weder in .env noch in secrets.dat gefunden. Restore abgebrochen."
    exit 1
}

# --- Backup bestimmen: entweder direkt uebergeben, oder interaktiv auswaehlen -
if ($BackupFile) {
    # Nicht-interaktiver Pfad (Schritt 6): Datei wurde bereits konkret
    # angegeben - z. B. von deployment/restore/Restore.ps1, das die
    # Auswahl uebernommen hat. Keine Auflistung, keine Read-Host-Abfrage.
    if (-not (Test-Path $BackupFile)) {
        Write-Error "Angegebene Backup-Datei nicht gefunden: $BackupFile"
        exit 1
    }
    $chosenFile = (Resolve-Path $BackupFile).Path
} else {
    # Interaktiver Fallback-Pfad (unveraendertes bisheriges Verhalten):
    # fuer den direkten Aufruf durch einen Administrator ohne Deployment
    # Engine.
    $backups = Get-ChildItem -Path $targetPath -Filter "connops_backup_*.dump" |
               Sort-Object LastWriteTime -Descending

    if ($backups.Count -eq 0) {
        Write-Error "Keine Backups in $targetPath gefunden."
        exit 1
    }

    Write-Output "Verfuegbare Backups:"
    for ($i = 0; $i -lt $backups.Count; $i++) {
        $b = $backups[$i]
        $sizeMb = [math]::Round($b.Length / 1MB, 2)
        Write-Output "  [$i] $($b.Name)  ($sizeMb MB, $($b.LastWriteTime))"
    }

    $selection = Read-Host "Welches Backup wiederherstellen? (Index eingeben)"
    $idx = 0
    if (-not [int]::TryParse($selection, [ref]$idx) -or $idx -lt 0 -or $idx -ge $backups.Count) {
        Write-Error "Ungueltige Auswahl."
        exit 1
    }
    $chosenFile = $backups[$idx].FullName
}

# --- Zieldatenbank bestimmen ----------------------------------------------
# Admin-Konto wird NUR in diesem Block verwendet (CREATE/DROP DATABASE,
# Verbindungen trennen, Eigentuemer uebertragen). Direkt danach wird auf
# das Anwendungskonto zurueckgewechselt - siehe Architekturkommentar oben.
$env:PGPASSWORD = $pgAdminPassword

if ($OverwriteProduction) {
    Write-Output ""
    Write-Output "!!! ACHTUNG: Dies ueberschreibt die PRODUKTIONS-Datenbank '$pgDatabase' vollstaendig !!!"
    Write-Output "Alle aktuellen Daten (auch neuer als das Backup) gehen unwiderruflich verloren."
    $confirm = Read-Host "Zum Bestaetigen exakten Datenbanknamen eingeben ('$pgDatabase')"
    if ($confirm -ne $pgDatabase) {
        Write-Output "Abgebrochen - Eingabe stimmte nicht ueberein."
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
        exit 1
    }

    $restoreDbName = $pgDatabase

    Write-Output "[Restore] Trenne bestehende Verbindungen zu '$pgDatabase' ..."
    & $psqlPath --host=$pgHost --port=$pgPort --username=$pgAdminUser --dbname=postgres -c `
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$pgDatabase' AND pid <> pg_backend_pid();"

    Write-Output "[Restore] Loesche und erstelle '$pgDatabase' neu ..."
    & $psqlPath --host=$pgHost --port=$pgPort --username=$pgAdminUser --dbname=postgres -c "DROP DATABASE IF EXISTS $pgDatabase;"
    & $psqlPath --host=$pgHost --port=$pgPort --username=$pgAdminUser --dbname=postgres -c "CREATE DATABASE $pgDatabase;"
    if ($LASTEXITCODE -ne 0) {
        # Gefunden am 28.07.2026 beim ersten produktiven Testlauf: ohne
        # diese Pruefung lief das Skript nach einem fehlgeschlagenen
        # CREATE DATABASE trotzdem bis zu pg_restore weiter (das dann
        # ebenfalls scheitert, weil die Zieldatenbank nicht existiert)
        # und meldete am Ende trotzdem "[Restore] Fertig." - irrefuehrend
        # bei einem Backup/Restore-Werkzeug.
        Write-Error "[Restore] CREATE DATABASE fuer '$pgDatabase' fehlgeschlagen (Exit-Code $LASTEXITCODE). Restore abgebrochen - pg_restore wuerde sonst gegen eine nicht existierende Datenbank laufen und einen irrefuehrenden Erfolg melden."
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
        exit 1
    }

    Write-Output "[Restore] Uebertrage Eigentuemerschaft von '$pgDatabase' an Anwendungskonto '$pgUser' ..."
    & $psqlPath --host=$pgHost --port=$pgPort --username=$pgAdminUser --dbname=postgres -c "ALTER DATABASE $pgDatabase OWNER TO $pgUser;"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[Restore] ALTER DATABASE OWNER TO '$pgUser' fehlgeschlagen (Exit-Code $LASTEXITCODE). Restore abgebrochen - ohne Eigentuemerschaft haette pg_restore als Anwendungskonto vermutlich keine Rechte, Objekte im 'public'-Schema anzulegen."
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
        exit 1
    }
} else {
    $restoreDbName = "$pgDatabase" + "_restore_" + (Get-Date -Format "yyyyMMdd_HHmmss")
    Write-Output "[Restore] Sicherer Modus: erstelle NEUE Datenbank '$restoreDbName' (Produktions-DB bleibt unangetastet)."
    & $psqlPath --host=$pgHost --port=$pgPort --username=$pgAdminUser --dbname=postgres -c "CREATE DATABASE $restoreDbName;"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[Restore] CREATE DATABASE fuer '$restoreDbName' fehlgeschlagen (Exit-Code $LASTEXITCODE). Pruefen: hat PG_ADMIN_USER tatsaechlich CREATEDB-Recht? (ALTER USER <admin-user> CREATEDB; als Superuser). Restore abgebrochen, um keinen irrefuehrenden Erfolg zu melden."
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
        exit 1
    }

    Write-Output "[Restore] Uebertrage Eigentuemerschaft von '$restoreDbName' an Anwendungskonto '$pgUser' ..."
    & $psqlPath --host=$pgHost --port=$pgPort --username=$pgAdminUser --dbname=postgres -c "ALTER DATABASE $restoreDbName OWNER TO $pgUser;"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[Restore] ALTER DATABASE OWNER TO '$pgUser' fehlgeschlagen (Exit-Code $LASTEXITCODE). Restore abgebrochen - ohne Eigentuemerschaft haette pg_restore als Anwendungskonto vermutlich keine Rechte, Objekte im 'public'-Schema anzulegen."
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
        exit 1
    }
}

Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

# --- Restore ausfuehren --------------------------------------------------------
# Zurueck zum Anwendungskonto: pg_restore schreibt Daten in die
# Anwendungsdatenbank, das ist keine administrative Operation und braucht
# daher nicht das Admin-Konto (siehe Architekturkommentar oben).
$env:PGPASSWORD = $pgPassword
Write-Output "[Restore] Stelle '$chosenFile' in '$restoreDbName' wieder her (als Anwendungskonto '$pgUser') ..."
try {
    & $pgRestorePath `
        --host=$pgHost --port=$pgPort --username=$pgUser `
        --dbname=$restoreDbName --no-owner --clean --if-exists `
        $chosenFile

    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1) {
        # pg_restore liefert bei harmlosen Warnungen manchmal Exit-Code 1 -
        # nur hoehere Codes als echten Fehler behandeln.
        throw "pg_restore beendete sich mit Exit-Code $LASTEXITCODE"
    }
} finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Output ""
Write-Output "[Restore] Fertig. Zieldatenbank: $restoreDbName"
if (-not $OverwriteProduction) {
    Write-Output "[Restore] Zum Verifizieren: PG_DATABASE in einer Test-.env auf '$restoreDbName' setzen und die Plattform testweise dagegen starten."
    Write-Output "[Restore] Danach zum Aufraeumen: DROP DATABASE $restoreDbName;"
}
