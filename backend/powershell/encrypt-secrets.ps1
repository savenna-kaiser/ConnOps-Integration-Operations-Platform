<#
.SYNOPSIS
    ConnOps - Secrets verschluesseln (Phase 6.3, DPAPI-Secrets-Management)

.DESCRIPTION
    Liest die aktuell in .env stehenden Klartext-Secrets, verschluesselt sie
    per Windows DPAPI (LocalMachine-Scope) und schreibt sie nach
    data/secrets.dat. Einmalig auszufuehren, danach koennen die Klartext-
    Zeilen aus .env entfernt werden (macht dieses Skript optional automatisch,
    mit Rueckfrage).

    LocalMachine-Scope (nicht CurrentUser): jeder Prozess auf diesem Server
    kann entschluesseln, unabhaengig vom ausfuehrenden Windows-Konto - sonst
    muesste dieses Setup-Skript interaktiv als Service_ConnOps laufen, was
    unpraktisch waere. Als Ausgleich wird die Datei per NTFS-Rechten
    eingeschraenkt (siehe unten).

.NOTES
    Einmalig ausfuehren: powershell -ExecutionPolicy Bypass -File .\powershell\encrypt-secrets.ps1
#>

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security

$scriptDir  = $PSScriptRoot
$envPath    = Join-Path $scriptDir "..\.env"
$secretsPath = Join-Path $scriptDir "..\data\secrets.dat"

# Diese Keys werden verschluesselt und aus .env entfernt (Roadmap-Liste + Citrix, siehe Gespraech 6.3)
$SECRET_KEYS = @(
    "AD_SERVICE_PASSWORD",
    "EXCHANGE_SERVICE_PASSWORD",
    "PG_PASSWORD",
    "TOPDESK_APP_PASSWORD",
    "SESSION_SECRET",
    "TOPDESK_WEBHOOK_SECRET",
    "CITRIX_SERVICE_PASSWORD"
)

function Read-DotEnv([string]$path) {
    $result = @{}
    Get-Content $path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $idx = $line.IndexOf("=")
        if ($idx -lt 1) { return }
        $key = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1).Trim()
        if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Trim('"') }
        $result[$key] = $val
    }
    return $result
}

$config = Read-DotEnv $envPath

#  Werte einsammeln, fehlende Keys melden statt stillschweigend zu ignorieren 
$secrets = @{}
$missing = @()
foreach ($key in $SECRET_KEYS) {
    if ($config.ContainsKey($key) -and $config[$key]) {
        $secrets[$key] = $config[$key]
    } else {
        $missing += $key
    }
}

if ($missing.Count -gt 0) {
    Write-Warning "Folgende Keys fehlen in .env oder sind leer, werden uebersprungen: $($missing -join ', ')"
}
if ($secrets.Count -eq 0) {
    Write-Error "Keine der erwarteten Secret-Keys in .env gefunden. Abgebrochen."
    exit 1
}

#  DPAPI-Verschluesselung (LocalMachine-Scope) 
$json  = $secrets | ConvertTo-Json -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)

$encrypted = [System.Security.Cryptography.ProtectedData]::Protect(
    $bytes,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::LocalMachine
)

$dataDir = Split-Path $secretsPath
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }
[System.IO.File]::WriteAllBytes($secretsPath, $encrypted)

Write-Output "[Secrets] $($secrets.Count) Secret(s) verschluesselt nach: $secretsPath"

#  NTFS-Rechte einschraenken: nur Service_ConnOps + Administratoren 
try {
    icacls $secretsPath /inheritance:r | Out-Null
    icacls $secretsPath /grant "MUSTERSTADT\Service_ConnOps:(R)" | Out-Null
    icacls $secretsPath /grant "Administratoren:(F)" | Out-Null
    icacls $secretsPath /grant "SYSTEM:(F)" | Out-Null
    Write-Output "[Secrets] NTFS-Rechte auf secrets.dat eingeschraenkt (Service_ConnOps + Administratoren + SYSTEM)."
} catch {
    Write-Warning "[Secrets] NTFS-Rechte konnten nicht gesetzt werden: $($_.Exception.Message)"
    Write-Warning "[Secrets] Bitte manuell pruefen, wer Lesezugriff auf $secretsPath hat."
}

#  Optional: Klartext-Zeilen aus .env entfernen 
Write-Output ""
$confirm = Read-Host "Klartext-Zeilen jetzt aus .env entfernen? (ja/nein)"
if ($confirm -eq "ja") {
    $newLines = Get-Content $envPath | Where-Object {
        $line = $_.Trim()
        $shouldRemove = $false
        foreach ($key in $secrets.Keys) {
            if ($line -match "^\s*$key\s*=") { $shouldRemove = $true; break }
        }
        -not $shouldRemove
    }
    Copy-Item $envPath "$envPath.bak-$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    $newLines | Set-Content -Path $envPath -Encoding UTF8
    Write-Output "[Secrets] Klartext-Zeilen aus .env entfernt (Backup der alten .env wurde angelegt)."
} else {
    Write-Output "[Secrets] .env unveraendert gelassen - die Klartext-Werte bleiben zusaetzlich dort stehen,"
    Write-Output "[Secrets] bis du sie manuell entfernst. loadSecrets.js bevorzugt ohnehin die verschluesselten Werte."
}
