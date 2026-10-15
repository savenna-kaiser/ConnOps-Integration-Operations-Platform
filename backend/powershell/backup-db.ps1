<#
.SYNOPSIS
    ConnOps - Taegliches PostgreSQL-Backup (Phase 6.5)

.DESCRIPTION
    Liest die DB-Zugangsdaten aus backend/.env (keine zweite Secret-Quelle),
    erstellt ein komprimiertes pg_dump-Backup (Custom-Format, fuer pg_restore
    geeignet) nach BACKUP_TARGET_PATH, sichert zusaetzlich die
    Uebergabedokumente (data/handover/, PDFs mit Mitarbeiterdaten - liegen
    nur lokal, sind nicht Teil der DB) als ZIP nach BACKUP_HANDOVER_PATH
    (faellt auf BACKUP_TARGET_PATH zurueck, falls nicht separat gesetzt),
    raeumt DB-Dumps auf die aelter als BACKUP_RETENTION_DAYS sind auf.
    Uebergabedokumente werden standardmaessig NICHT automatisch geloescht
    (Belege, keine Betriebs-Snapshots) - nur falls
    BACKUP_HANDOVER_RETENTION_DAYS explizit gesetzt ist, greift dort
    ebenfalls eine Frist. Schreibt eine Status-JSON, die health.js fuer die
    Systemstatus-Seite ausliest.

    Vorgesehen fuer die Windows-Aufgabenplanung, taeglich ausserhalb der
    Arbeitszeit, unabhaengig vom laufenden Node-Prozess (funktioniert auch,
    wenn der Server gerade neu startet oder kurz down ist).

.NOTES
    Benoetigt: pg_dump.exe (im PATH ODER via PG_DUMP_PATH in .env erzwungen)
    Einzurichten via: schtasks /create /tn "ConnOps-Backup" /tr "powershell.exe -File C:\ConnOps\backend\powershell\backup-db.ps1" /sc daily /st 02:00
#>

$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
$envPath   = Join-Path $scriptDir "..\.env"

# --- .env einlesen ------------------------------------------------------------
# Read-DotEnv ist am 28.07.2026 nach common/Env.ps1 gewandert, weil sowohl
# backup-db.ps1 als auch restore-db.ps1 dieselbe Funktion brauchten -
# erster nachgewiesener gemeinsamer Bedarf, siehe common/Env.ps1 fuer die
# Begruendung zur Ordnerwahl.
. (Join-Path $scriptDir "common\Env.ps1")

$config = Read-DotEnv -Path $envPath

$pgHost     = $config["PG_HOST"]
$pgPort     = $(if ($config["PG_PORT"]) { $config["PG_PORT"] } else { "5432" })
$pgDatabase = $config["PG_DATABASE"]
$pgUser     = $config["PG_USER"]
$pgPassword = $config["PG_PASSWORD"]

# Fallback auf DPAPI-verschluesselte Secrets, falls PG_PASSWORD nicht (mehr)
# in .env steht - passiert automatisch, wenn encrypt-secrets.ps1 mit "ja"
# (Klartext entfernen) ausgefuehrt wurde. Gleiches Problem wie damals bei
# migrate.js (SASL-Fehler durch fehlendes Passwort) - hier aber tueckischer:
# pg_dump legt die Zieldatei schon an, bevor die Anmeldung geprueft wird,
# das Backup schlaegt also NICHT sichtbar fehl, sondern erzeugt eine leere
# .dump-Datei, die wie ein erfolgreiches Backup aussieht.
if (-not $pgPassword) {
    Write-Output "[Backup] PG_PASSWORD nicht in .env gefunden, versuche DPAPI-Secrets..."
    $decryptScript = Join-Path $scriptDir "decrypt-secrets.ps1"
    try {
        $json = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $decryptScript
        if ($LASTEXITCODE -eq 0 -and $json) {
            $secrets = $json | ConvertFrom-Json
            if ($secrets.PG_PASSWORD) {
                $pgPassword = $secrets.PG_PASSWORD
                Write-Output "[Backup] PG_PASSWORD aus secrets.dat geladen."
            }
        }
    } catch {
        Write-Warning "[Backup] DPAPI-Secrets konnten nicht gelesen werden: $($_.Exception.Message)"
    }
}

if (-not $pgPassword) {
    Write-Error "[Backup] PG_PASSWORD weder in .env noch in secrets.dat gefunden. Backup abgebrochen."
    exit 1
}

$targetPath         = $(if ($config["BACKUP_TARGET_PATH"])   { $config["BACKUP_TARGET_PATH"] }   else { "" })
$handoverTargetPath = $(if ($config["BACKUP_HANDOVER_PATH"]) { $config["BACKUP_HANDOVER_PATH"] } else { $targetPath } )
$retentionDays      = $(if ($config["BACKUP_RETENTION_DAYS"]) { [int]$config["BACKUP_RETENTION_DAYS"] } else { 14 })
$pgDumpPath         = $(if ($config["PG_DUMP_PATH"])          { $config["PG_DUMP_PATH"] }          else { "pg_dump" })

# Uebergabedokumente sind Belege, keine reinen Betriebs-Snapshots wie die
# DB-Dumps - werden standardmaessig NICHT automatisch geloescht (0 = kein
# Cleanup). Nur wenn BACKUP_HANDOVER_RETENTION_DAYS explizit gesetzt ist,
# greift eine Frist, unabhaengig von BACKUP_RETENTION_DAYS.
$handoverRetentionDays = $(if ($config["BACKUP_HANDOVER_RETENTION_DAYS"]) { [int]$config["BACKUP_HANDOVER_RETENTION_DAYS"] } else { 0 })

$statusFile = Join-Path $scriptDir "..\data\lastBackup.json"

function Write-Status([bool]$ok, [string]$fileName, [long]$sizeBytes, [string]$errorMsg, [bool]$handoverOk, [string]$handoverFileName, [long]$handoverSizeBytes) {
    $status = [ordered]@{
        ts             = (Get-Date).ToUniversalTime().ToString("o")
        ok             = $ok
        fileName       = $fileName
        sizeBytes      = $sizeBytes
        retentionDays  = $retentionDays
        targetPath     = $targetPath
        handoverTargetPath = $handoverTargetPath
        error          = $errorMsg
        handover       = [ordered]@{
            ok        = $handoverOk
            fileName  = $handoverFileName
            sizeBytes = $handoverSizeBytes
        }
    }
    $dataDir = Split-Path $statusFile
    if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }
    $status | ConvertTo-Json -Depth 4 | Set-Content -Path $statusFile -Encoding UTF8
}

# --- Validierung --------------------------------------------------------------
if (-not $targetPath) {
    $msg = "BACKUP_TARGET_PATH ist in .env nicht gesetzt. Backup abgebrochen."
    Write-Error $msg
    Write-Status -ok $false -fileName "" -sizeBytes 0 -errorMsg $msg
    exit 1
}
if (-not (Test-Path $targetPath)) {
    try {
        New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
    } catch {
        $msg = "Backup-Zielordner nicht erreichbar/anlegbar: $targetPath ($($_.Exception.Message))"
        Write-Error $msg
        Write-Status -ok $false -fileName "" -sizeBytes 0 -errorMsg $msg
        exit 1
    }
}
if (-not (Test-Path $handoverTargetPath)) {
    try {
        New-Item -ItemType Directory -Path $handoverTargetPath -Force | Out-Null
    } catch {
        # Nicht fatal fuer den DB-Dump-Teil - Handover-Sicherung ist ein
        # eigener, unabhaengiger Schritt weiter unten (ebenfalls nicht-fatal
        # abgesichert), aber ohne Zielordner kann sie von vornherein nicht
        # klappen. Warnung reicht, kein exit hier.
        Write-Warning "Handover-Backup-Zielordner nicht erreichbar/anlegbar: $handoverTargetPath ($($_.Exception.Message))"
    }
}

# --- Backup erstellen ---------------------------------------------------------
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$fileName  = "connops_backup_$timestamp.dump"
$filePath  = Join-Path $targetPath $fileName

Write-Output "[Backup] Starte pg_dump nach $filePath ..."

$env:PGPASSWORD = $pgPassword
try {
    & $pgDumpPath `
        --host=$pgHost `
        --port=$pgPort `
        --username=$pgUser `
        --format=custom `
        --file=$filePath `
        $pgDatabase

    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump beendete sich mit Exit-Code $LASTEXITCODE"
    }
} catch {
    $msg = "pg_dump fehlgeschlagen: $($_.Exception.Message)"
    Write-Error $msg
    Write-Status -ok $false -fileName $fileName -sizeBytes 0 -errorMsg $msg
    exit 1
} finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

$sizeBytes = (Get-Item $filePath).Length
Write-Output "[Backup] Erfolgreich: $fileName ($([math]::Round($sizeBytes / 1MB, 2)) MB)"

# --- Uebergabedokumente sichern (data/handover/, enthaelt Mitarbeiterdaten,
#     liegt nur lokal, ist nicht Teil der PostgreSQL-DB) -----------------------
$handoverDir      = Join-Path $scriptDir "..\data\handover"
$handoverOk       = $false
$handoverFileName = ""
$handoverSizeBytes = 0

if (Test-Path $handoverDir) {
    $handoverFileName = "connops_handover_$timestamp.zip"
    $handoverZipPath  = Join-Path $handoverTargetPath $handoverFileName
    try {
        Compress-Archive -Path "$handoverDir\*" -DestinationPath $handoverZipPath -Force
        $handoverSizeBytes = (Get-Item $handoverZipPath).Length
        $handoverOk = $true
        Write-Output "[Backup] Uebergabedokumente gesichert: $handoverFileName ($([math]::Round($handoverSizeBytes / 1MB, 2)) MB)"
    } catch {
        Write-Warning "[Backup] Uebergabedokumente-Sicherung fehlgeschlagen: $($_.Exception.Message)"
        # Nicht fatal: DB-Backup ist bereits erfolgreich, Skript laeuft weiter
    }
} else {
    Write-Output "[Backup] Kein data/handover/-Ordner vorhanden, ueberspringe (noch keine Uebergabedokumente erstellt?)."
}

# --- Alte Backups aufraeumen (> retentionDays) --------------------------------
# Gleiche Aufbewahrungsfrist fuer DB-Dump und Handover-ZIP, damit beide
# konsistent bleiben (kein Sinn, DB-Backups laenger zu behalten als die
# dazugehoerigen Dokumente oder umgekehrt).
$cutoff = (Get-Date).AddDays(-$retentionDays)
$old = Get-ChildItem -Path $targetPath -Filter "connops_backup_*.dump" |
       Where-Object { $_.LastWriteTime -lt $cutoff }

foreach ($f in $old) {
    Write-Output "[Backup] Loesche altes Backup: $($f.Name) (aelter als $retentionDays Tage)"
    Remove-Item $f.FullName -Force
}

if ($handoverRetentionDays -gt 0) {
    $handoverCutoff = (Get-Date).AddDays(-$handoverRetentionDays)
    $oldHandover = Get-ChildItem -Path $handoverTargetPath -Filter "connops_handover_*.zip" |
           Where-Object { $_.LastWriteTime -lt $handoverCutoff }
    foreach ($f in $oldHandover) {
        Write-Output "[Backup] Loesche altes Handover-Backup: $($f.Name) (aelter als $handoverRetentionDays Tage)"
        Remove-Item $f.FullName -Force
    }
} else {
    Write-Output "[Backup] Handover-Sicherungen werden nicht automatisch geloescht (BACKUP_HANDOVER_RETENTION_DAYS nicht gesetzt)."
}

Write-Status -ok $true -fileName $fileName -sizeBytes $sizeBytes -errorMsg $null `
    -handoverOk $handoverOk -handoverFileName $handoverFileName -handoverSizeBytes $handoverSizeBytes
Write-Output "[Backup] Fertig."
