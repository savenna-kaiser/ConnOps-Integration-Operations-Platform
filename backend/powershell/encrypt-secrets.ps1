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

    ADDITIVER MODUS ALS STANDARD (gehaertet am 28.07.2026, nach einem
    produktiven Vorfall - siehe Roadmap-Eintrag "Zwischenfall" bei Schritt
    6): Eine bereits vorhandene secrets.dat wird VOR dem Schreiben gelesen
    und mit den neu in .env gefundenen Werten zusammengefuehrt. Keys, die
    in secrets.dat bereits existieren, aber aktuell NICHT im Klartext in
    .env stehen (weil sie schon vorher verschluesselt und aus .env entfernt
    wurden), bleiben erhalten - sie werden NICHT geloescht.

    Vorher schrieb dieses Skript secrets.dat immer komplett neu, nur mit
    dem, was im jeweiligen Lauf in .env im Klartext gefunden wurde. Wurde
    das Skript erneut ausgefuehrt, waehrend nur EIN neues Secret im
    Klartext in .env stand (z. B. weil alle anderen schon verschluesselt
    waren), gingen dabei alle uebrigen, laengst verschluesselten Secrets
    verloren. Genau das ist am 28.07.2026 auf connops01 passiert (7 von 8
    Secrets kurzzeitig verloren, rechtzeitig bemerkt und aus einem alten
    .env-Backup repariert, bevor der Dienst neu gestartet wurde).

    Vollstaendiges Ueberschreiben (alte Faehigkeit) bleibt ueber den
    Schalter -Replace verfuegbar, fuer den bewussten Fall, dass secrets.dat
    tatsaechlich neu aufgebaut werden soll (z. B. nach Rotation aller
    Passwoerter). -Replace fragt bei sinkender Key-Anzahl zusaetzlich
    explizit nach Bestaetigung.

.PARAMETER Replace
    Wenn gesetzt: secrets.dat wird komplett neu geschrieben, nur mit den in
    diesem Lauf in .env gefundenen Werten - bestehende, nicht mehr in .env
    vorhandene Keys werden ENTFERNT. Bewusster Vorgang, kein Standard mehr.
    Fragt bei sinkender Key-Anzahl zusaetzlich nach Bestaetigung.

.NOTES
    Einmalig ausfuehren: powershell -ExecutionPolicy Bypass -File .\powershell\encrypt-secrets.ps1
    Vollstaendiger Neuaufbau: powershell -ExecutionPolicy Bypass -File .\powershell\encrypt-secrets.ps1 -Replace
#>

param(
    [switch]$Replace
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security

$scriptDir  = $PSScriptRoot
$envPath    = Join-Path $scriptDir "..\.env"
$secretsPath = Join-Path $scriptDir "..\data\secrets.dat"

# Alle per DPAPI zu verschluesselnden Geheimnisse.
# Neue Secret-Keys muessen hier explizit ergaenzt werden - diese Liste ist
# bewusst nicht generisch, damit nicht versehentlich beliebige .env-Werte
# verschluesselt werden.
$SECRET_KEYS = @(
    "AD_SERVICE_PASSWORD",
    "EXCHANGE_SERVICE_PASSWORD",
    "PG_PASSWORD",
    "PG_ADMIN_PASSWORD",
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

# --- Bestehende secrets.dat einlesen (fuer den additiven Merge) ---------------
$existingSecrets = @{}
$existingCount = 0
if (Test-Path $secretsPath) {
    $decryptScript = Join-Path $scriptDir "decrypt-secrets.ps1"
    $existingJson = $null
    try {
        $existingJson = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $decryptScript
    } catch {
        $existingJson = $null
    }
    if ($LASTEXITCODE -eq 0 -and $existingJson) {
        $existingObj = $existingJson | ConvertFrom-Json
        foreach ($prop in $existingObj.PSObject.Properties) {
            $existingSecrets[$prop.Name] = $prop.Value
        }
        $existingCount = $existingSecrets.Count
    } elseif (-not $Replace) {
        Write-Error "[Secrets] Bestehende secrets.dat konnte nicht gelesen werden (Entschluesselung fehlgeschlagen). Abgebrochen, um nicht versehentlich vorhandene Secrets zu ueberschreiben. Falls secrets.dat bewusst neu aufgebaut werden soll, -Replace verwenden."
        exit 1
    } else {
        Write-Warning "[Secrets] Bestehende secrets.dat konnte nicht gelesen werden - wird durch -Replace ohnehin komplett neu geschrieben."
    }
}

$config = Read-DotEnv $envPath

#  Werte aus .env einsammeln, fehlende Keys melden statt stillschweigend zu ignorieren 
$secretsFromEnv = @{}
$missing = @()
foreach ($key in $SECRET_KEYS) {
    if ($config.ContainsKey($key) -and $config[$key]) {
        $secretsFromEnv[$key] = $config[$key]
    } else {
        $missing += $key
    }
}

if ($missing.Count -gt 0) {
    Write-Warning "Folgende Keys fehlen in .env oder sind leer, werden uebersprungen: $($missing -join ', ')"
}
if ($secretsFromEnv.Count -eq 0 -and $existingCount -eq 0) {
    Write-Error "Keine der erwarteten Secret-Keys in .env gefunden, und secrets.dat ist leer oder nicht vorhanden. Abgebrochen."
    exit 1
}

# --- Merge: bestehende Secrets + neue/aktualisierte Werte aus .env ------------
if ($Replace) {
    $secrets = $secretsFromEnv
    Write-Output "[Secrets] -Replace gesetzt: secrets.dat wird komplett neu aufgebaut, nur mit den aktuell in .env gefundenen Werten."
} else {
    $secrets = @{}
    foreach ($k in $existingSecrets.Keys) { $secrets[$k] = $existingSecrets[$k] }
    foreach ($k in $secretsFromEnv.Keys) { $secrets[$k] = $secretsFromEnv[$k] }
}

Write-Output "[Secrets] Vorher: $existingCount Secret(s) in secrets.dat. Nachher: $($secrets.Count) Secret(s)."

if ($secrets.Count -lt $existingCount) {
    Write-Warning "[Secrets] ACHTUNG: Die Anzahl der Secrets sinkt von $existingCount auf $($secrets.Count) - moeglicher Datenverlust."
    if ($Replace) {
        $confirmReplace = Read-Host "Mit -Replace werden bestehende Secrets entfernt, die nicht mehr in .env stehen. Wirklich fortfahren? (ja/nein)"
        if ($confirmReplace -ne "ja") {
            Write-Output "[Secrets] Abgebrochen - keine Datei geschrieben."
            exit 4
        }
    } else {
        # Sollte im additiven Modus rechnerisch nicht vorkommen (Merge kann
        # die Anzahl nur erhoehen oder gleich lassen) - falls doch, deutet
        # das auf einen Fehler in der Merge-Logik selbst hin. Sicherheits-
        # abbruch statt stillschweigend schreiben.
        Write-Error "[Secrets] Sicherheitsabbruch: sinkende Secret-Anzahl im additiven Modus ist unerwartet und deutet auf einen Fehler hin. Abgebrochen, keine Datei geschrieben."
        exit 1
    }
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
    icacls $secretsPath /grant "CORP\Service_ConnOps:(R)" | Out-Null
    icacls $secretsPath /grant "Administratoren:(F)" | Out-Null
    icacls $secretsPath /grant "SYSTEM:(F)" | Out-Null
    Write-Output "[Secrets] NTFS-Rechte auf secrets.dat eingeschraenkt (Service_ConnOps + Administratoren + SYSTEM)."
} catch {
    Write-Warning "[Secrets] NTFS-Rechte konnten nicht gesetzt werden: $($_.Exception.Message)"
    Write-Warning "[Secrets] Bitte manuell pruefen, wer Lesezugriff auf $secretsPath hat."
}

#  Optional: Klartext-Zeilen aus .env entfernen (nur die in DIESEM Lauf 
#  aus .env gelesenen Keys - unveraendert gegenueber der bisherigen Logik) 
if ($secretsFromEnv.Count -gt 0) {
    Write-Output ""
    $confirm = Read-Host "Klartext-Zeilen jetzt aus .env entfernen? (ja/nein)"
    if ($confirm -eq "ja") {
        $newLines = Get-Content $envPath | Where-Object {
            $line = $_.Trim()
            $shouldRemove = $false
            foreach ($key in $secretsFromEnv.Keys) {
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
}
