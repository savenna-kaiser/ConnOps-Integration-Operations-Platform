<#
.SYNOPSIS
    ConnOps - Taegliches PostgreSQL-Backup (Phase 6.5)

.DESCRIPTION
    Liest die DB-Zugangsdaten aus backend/.env (keine zweite Secret-Quelle),
    erstellt ein komprimiertes pg_dump-Backup (Custom-Format, fuer pg_restore
    geeignet), sichert zusaetzlich die Uebergabedokumente (data/handover/, PDFs
    mit Mitarbeiterdaten - liegen nur lokal, sind nicht Teil der DB) als ZIP,
    raeumt beides auf was aelter als BACKUP_RETENTION_DAYS ist, und schreibt
    eine Status-JSON, die health.js fuer die Systemstatus-Seite ausliest.

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

# --- .env einlesen (einfacher KEY=VALUE-Parser, keine externe Abhaengigkeit) --
function Read-DotEnv([string]$path) {
    $result = @{}
    if (-not (Test-Path $path)) {
        throw "Konfigurationsdatei nicht gefunden: $path"
    }
    Get-Content $path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $idx = $line.IndexOf("=")
        if ($idx -lt 1) { return }
        $key = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1).Trim()
        # Anfuehrungszeichen um den Wert entfernen, falls vorhanden
        if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Trim('"') }
        $result[$key] = $val
    }
    return $result
}

$config = Read-DotEnv $envPath

$pgHost     = $config["PG_HOST"]
$pgPort     = $(if ($config["PG_PORT"]) { $config["PG_PORT"] } else { "5432" })
$pgDatabase = $config["PG_DATABASE"]
$pgUser     = $config["PG_USER"]
$pgPassword = $config["PG_PASSWORD"]

$targetPath    = $(if ($config["BACKUP_TARGET_PATH"])    { $config["BACKUP_TARGET_PATH"] }    else { "" })
$retentionDays = $(if ($config["BACKUP_RETENTION_DAYS"])  { [int]$config["BACKUP_RETENTION_DAYS"] } else { 14 })
$pgDumpPath    = $(if ($config["PG_DUMP_PATH"])           { $config["PG_DUMP_PATH"] }          else { "pg_dump" })

$statusFile = Join-Path $scriptDir "..\data\lastBackup.json"

function Write-Status([bool]$ok, [string]$fileName, [long]$sizeBytes, [string]$errorMsg, [bool]$handoverOk, [string]$handoverFileName, [long]$handoverSizeBytes) {
    $status = [ordered]@{
        ts             = (Get-Date).ToUniversalTime().ToString("o")
        ok             = $ok
        fileName       = $fileName
        sizeBytes      = $sizeBytes
        retentionDays  = $retentionDays
        targetPath     = $targetPath
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
    $handoverZipPath  = Join-Path $targetPath $handoverFileName
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
$oldHandover = Get-ChildItem -Path $targetPath -Filter "connops_handover_*.zip" |
       Where-Object { $_.LastWriteTime -lt $cutoff }

foreach ($f in $old) {
    Write-Output "[Backup] Loesche altes Backup: $($f.Name) (aelter als $retentionDays Tage)"
    Remove-Item $f.FullName -Force
}
foreach ($f in $oldHandover) {
    Write-Output "[Backup] Loesche altes Handover-Backup: $($f.Name) (aelter als $retentionDays Tage)"
    Remove-Item $f.FullName -Force
}

Write-Status -ok $true -fileName $fileName -sizeBytes $sizeBytes -errorMsg $null `
    -handoverOk $handoverOk -handoverFileName $handoverFileName -handoverSizeBytes $handoverSizeBytes
Write-Output "[Backup] Fertig."