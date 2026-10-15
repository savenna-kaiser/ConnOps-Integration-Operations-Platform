<#
.SYNOPSIS
    Testet Lese-/Schreibzugriff auf die drei fuer ConnOps relevanten
    Netzwerkfreigaben - ausgefuehrt als Service_ConnOps (nicht als
    interaktiver Benutzer), um die tatsaechliche Laufzeit-Berechtigung
    zu pruefen, nicht die des Test-Ausfuehrenden.

.NOTES
    Wird per einmaligem Scheduled Task unter Service_ConnOps gestartet,
    NICHT direkt interaktiv - siehe Anleitung im Chat.
#>

$results = [ordered]@{
    ts = (Get-Date).ToString("o")
    runningAs = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
}

# --- 1. Docusnap-Freigabe: Lesezugriff -----------------------------------
$docusnapPath = "\\docusnap01\Docusnap_Share"
try {
    $items = Get-ChildItem -Path $docusnapPath -ErrorAction Stop | Select-Object -First 1
    $results.docusnap = "OK - Zugriff erfolgreich"
} catch {
    $results.docusnap = "FEHLGESCHLAGEN - $($_.Exception.Message)"
}

# --- 2. Citrix-CSV-Fallback-Freigabe: Lesezugriff ------------------------
$citrixPath = "\\fileserver01.corp.example.com\TsData"
try {
    $items = Get-ChildItem -Path $citrixPath -ErrorAction Stop | Select-Object -First 1
    $results.citrixCsv = "OK - Zugriff erfolgreich"
} catch {
    $results.citrixCsv = "FEHLGESCHLAGEN - $($_.Exception.Message)"
}

# --- 3. Backup-Zielfreigabe: Schreibzugriff ------------------------------
$backupPath = "\\fs01.corp.example.com\it$\Software\ConnOps\Backup"
$testFile = Join-Path $backupPath "service_connops_write_test_$(Get-Date -Format 'yyyyMMdd_HHmmss').tmp"
try {
    "Test" | Set-Content -Path $testFile -ErrorAction Stop
    Remove-Item $testFile -ErrorAction Stop
    $results.backupWrite = "OK - Schreiben und Loeschen erfolgreich"
} catch {
    $results.backupWrite = "FEHLGESCHLAGEN - $($_.Exception.Message)"
}

# --- Ergebnis in lokale Datei schreiben (Task-Ausgabe ist sonst schwer einsehbar) ---
$outFile = "C:\ConnOps\backend\logs\service-connops-share-test.json"
$results | ConvertTo-Json | Set-Content -Path $outFile -Encoding UTF8

Write-Output "Testergebnisse geschrieben nach: $outFile"
