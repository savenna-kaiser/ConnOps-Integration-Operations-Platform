<#
.SYNOPSIS
    ConnOps – Voraussetzungen auf dem NEUEN Server prüfen (epn1Connops)

.DESCRIPTION
    Reine Diagnose, verändert nichts. Prüft, ob alles installiert und
    erreichbar ist, bevor der eigentliche Code deployed wird — spart das
    "erst beim Serverstart merken, dass etwas fehlt"-Muster, das uns bei
    fehlenden .env-Werten schon mehrfach begegnet ist.

.NOTES
    Ausführen auf epn1Connops, VOR dem ersten `npm install`/`npm run dev`.
#>

Write-Output "=== ConnOps – Server-Voraussetzungen (epn1Connops) ==="
Write-Output ""

$results = @()

function Check($label, [scriptblock]$test) {
    try {
        $ok = & $test
        $status = if ($ok) { "OK" } else { "FEHLT" }
    } catch {
        $ok = $false
        $status = "FEHLER: $($_.Exception.Message)"
    }
    $script:results += [PSCustomObject]@{ Check = $label; Status = $status }
    $color = if ($ok) { "Green" } else { "Red" }
    Write-Host ("  [{0}] {1}" -f $status, $label) -ForegroundColor $color
}

Write-Output "--- Laufzeitumgebung ---"
Check "Node.js installiert" { (Get-Command node -ErrorAction SilentlyContinue) -ne $null }
Check "Node.js Version >= 18" { 
    $v = (node --version) -replace 'v', ''
    [version]$v -ge [version]"18.0.0"
}
Check "npm installiert" { (Get-Command npm -ErrorAction SilentlyContinue) -ne $null }
Check "Git installiert" { (Get-Command git -ErrorAction SilentlyContinue) -ne $null }

Write-Output ""
Write-Output "--- PostgreSQL ---"
Check "pg_dump im PATH" { (Get-Command pg_dump -ErrorAction SilentlyContinue) -ne $null }
Check "pg_restore im PATH" { (Get-Command pg_restore -ErrorAction SilentlyContinue) -ne $null }
Check "psql im PATH" { (Get-Command psql -ErrorAction SilentlyContinue) -ne $null }
Check "PostgreSQL-Dienst läuft lokal" {
    $svc = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    $svc -ne $null -and $svc.Status -eq "Running"
}

Write-Output ""
Write-Output "--- PowerShell-Module (für psWorker.ps1) ---"
Check "ActiveDirectory-Modul verfügbar" {
    (Get-Module -ListAvailable -Name ActiveDirectory) -ne $null
}
Check "PowerShell-Version >= 5.1" {
    $PSVersionTable.PSVersion -ge [version]"5.1"
}

Write-Output ""
Write-Output "--- Netzwerk-Erreichbarkeit ---"
Check "AD-DC erreichbar (musterstadt.example)" {
    Test-Connection -ComputerName "musterstadt.example" -Count 1 -Quiet -ErrorAction SilentlyContinue
}
Check "Exchange-Server erreichbar (epn1exchg3)" {
    Test-Connection -ComputerName "mail1.musterstadt.example" -Count 1 -Quiet -ErrorAction SilentlyContinue
}
Check "Citrix Delivery Controller CDC3 erreichbar" {
    Test-Connection -ComputerName "CTX-DC1.musterstadt.example" -Count 1 -Quiet -ErrorAction SilentlyContinue
}
Check "Docusnap-Freigabe erreichbar" {
    Test-Path "\\epn1docusnap1\Docusnap_Share"
}
Check "Citrix-CSV-Fallback-Freigabe erreichbar" {
    Test-Path "\\wsus1.musterstadt.example\TsData"
}
Check "Backup-Zielfreigabe erreichbar" {
    Test-Path "\\fs1.musterstadt.example\gb0-it$\05_Software_intern\ConnOps"
}

Write-Output ""
Write-Output "=== Zusammenfassung ==="
$failed = $results | Where-Object { $_.Status -ne "OK" }
if ($failed.Count -eq 0) {
    Write-Host "Alle Prüfungen erfolgreich — Server ist bereit für den Deploy." -ForegroundColor Green
} else {
    Write-Host "$($failed.Count) Prüfung(en) fehlgeschlagen — bitte vor dem Deploy klären:" -ForegroundColor Yellow
    $failed | Format-Table -AutoSize
}
