# test-citrix-connection.ps1
# Rein lesend – listet nur Sessions auf, verändert nichts, meldet niemanden ab.
#
# Zweck: Prüfen, ob der Citrix-Broker-Zugriff (Add-PSSnapin Citrix.* +
# Get-BrokerSession), den auch der bestehende Logoff-Befehl nutzt, nach der
# Serverumstellung noch funktioniert – und ob dafür eine explizite
# -AdminAddress (neuer Delivery Controller) nötig ist.
#
# Ausführen direkt auf dem Server, auf dem auch psWorker.ps1 läuft
# (gleicher Kontext wie der bestehende Logoff-Befehl).

Write-Host "== Citrix Broker Snap-in Test ==" -ForegroundColor Cyan

Add-PSSnapin Citrix.* -ErrorAction SilentlyContinue
$snapins = Get-PSSnapin -Registered | Where-Object { $_.Name -like "Citrix*" }

if (-not $snapins) {
    Write-Host "FEHLER: Keine Citrix-PowerShell-Snapins auf diesem Rechner registriert." -ForegroundColor Red
    Write-Host "-> Citrix Studio / Remote PowerShell SDK muesste auf diesem Server (neu) installiert werden."
    exit 1
}

Write-Host "Gefundene Snap-ins:"
$snapins | ForEach-Object { Write-Host "  - $($_.Name)" }

Write-Host "`n== Versuch 1: Get-BrokerSession OHNE AdminAddress (bisheriger Weg) ==" -ForegroundColor Cyan
try {
    $sessions = Get-BrokerSession -MaxRecordCount 5 -ErrorAction Stop
    Write-Host "OK - Verbindung erfolgreich. $($sessions.Count) Session(s) gefunden (max. 5 angezeigt):" -ForegroundColor Green
    $sessions | Select-Object UserName, MachineName, SessionState, HostedMachineName | Format-Table -AutoSize
} catch {
    Write-Host "FEHLGESCHLAGEN: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n== Versuch 2: Get-BrokerSession MIT expliziter AdminAddress ==" -ForegroundColor Cyan
$ddc = Read-Host "Hostname/FQDN des (neuen) Delivery Controllers eingeben (z.B. dc1.musterstadt.example) - leer lassen zum Ueberspringen"
if ($ddc) {
    try {
        $sessions2 = Get-BrokerSession -AdminAddress $ddc -MaxRecordCount 5 -ErrorAction Stop
        Write-Host "OK - Verbindung zu '$ddc' erfolgreich. $($sessions2.Count) Session(s) gefunden (max. 5 angezeigt):" -ForegroundColor Green
        $sessions2 | Select-Object UserName, MachineName, SessionState, HostedMachineName | Format-Table -AutoSize
    } catch {
        Write-Host "FEHLGESCHLAGEN: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "Uebersprungen (kein Hostname eingegeben)."
}

Write-Host "`n== Fertig ==" -ForegroundColor Cyan