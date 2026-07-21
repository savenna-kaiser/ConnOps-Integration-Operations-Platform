<#
.SYNOPSIS
    ConnOps - Taegliches PostgreSQL-Backup (Phase 6.5)

.DESCRIPTION
    Liest die DB-Zugangsdaten aus backend/.env (keine zweite Secret-Quelle),
    erstellt ein komprimiertes pg_dump-Backup (Custom-Format, fuer pg_restore
    geeignet), raeumt Backups auf, die aelter als BACKUP_RETENTION_DAYS sind,
    und schreibt eine Status-JSON, die health.js fuer die Systemstatus-Seite
    ausliest (analog zum bestehenden Docusnap-Import-Status-Muster).

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

function Write-Status([bool]$ok, [string]$fileName, [long]$sizeBytes, [string]$errorMsg) {
    $status = [ordered]@{
        ts             = (Get-Date).ToUniversalTime().ToString("o")
        ok             = $ok
        fileName       = $fileName
        sizeBytes      = $sizeBytes
        retentionDays  = $retentionDays
        targetPath     = $targetPath
        error          = $errorMsg
    }
    $dataDir = Split-Path $statusFile
    if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }
    $status | ConvertTo-Json | Set-Content -Path $statusFile -Encoding UTF8
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

# --- Alte Backups aufraeumen (> retentionDays) --------------------------------
$cutoff = (Get-Date).AddDays(-$retentionDays)
$old = Get-ChildItem -Path $targetPath -Filter "connops_backup_*.dump" |
       Where-Object { $_.LastWriteTime -lt $cutoff }

foreach ($f in $old) {
    Write-Output "[Backup] Loesche altes Backup: $($f.Name) (aelter als $retentionDays Tage)"
    Remove-Item $f.FullName -Force
}

Write-Status -ok $true -fileName $fileName -sizeBytes $sizeBytes -errorMsg $null
Write-Output "[Backup] Fertig."
