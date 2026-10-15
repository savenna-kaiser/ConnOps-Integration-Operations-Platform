<#
.SYNOPSIS
    ConnOps Verify - prueft, ob die Installation korrekt und vollstaendig ist

.DESCRIPTION
    Umgebaut am 29.07.2026 (Vorbereitung fuer Schritt 8, install-Modul):
    dieser CLI-Host enthaelt selbst keine Pruef-Fachlogik mehr - die
    eigentlichen Checks liegen jetzt in deployment/common/Verify.ps1
    (deklaratives Array mit Category-Feld). Grund: install soll spaeter
    dieselbe Bibliothek gezielt nach Kategorie gefiltert nutzen koennen
    (nach jeder Installationsphase nur die davon betroffenen Pruefungen
    erneut), ohne ueber den Dispatcher zu gehen. Dieses Skript hier bleibt
    weiterhin NUR der CLI-Host: Argumente entgegennehmen, Bibliothek
    aufrufen, Ausgabe formatieren, Exit-Code setzen - unveraendert in der
    Verantwortung, nur die Fachlogik ist jetzt woanders.

    Beantwortet nach wie vor die Frage "Ist ConnOps korrekt installiert?",
    NICHT "Ist ConnOps gerade betriebsbereit?" (das ist Health, ein
    spaeteres, separates Modul). Rein lesend, veraendert nichts.

    Deckt ab, was uns am 14.-28.07.2026 beim manuellen Aufsetzen von
    connops01 tatsaechlich begegnet ist: fehlende Windows-Rechte, leere
    Backups durch vergessene DPAPI-Migration, IIS-Site-Kollisionen,
    Zertifikat-Ablauf.

.PARAMETER Category
    Optional. Nur Checks dieser Kategorie(n) ausfuehren, z. B. "-Category
    IIS" oder "-Category Windows-Rechte,Secrets". Ohne Angabe: alle
    Checks (bisheriges Verhalten).

.NOTES
    Exit Codes (siehe connops.ps1):
      0 = Alle (gefilterten) Pruefungen bestanden
      3 = Mindestens eine Pruefung fehlgeschlagen

.EXAMPLE
    .\connops.ps1 verify
    Alle 18 Pruefungen (bisheriges Verhalten, unveraendert).

.EXAMPLE
    .\connops.ps1 verify -Category IIS
    Nur die IIS-bezogenen Pruefungen (kuenftig z. B. von install nach der
    IIS-Phase genutzt).
#>

param(
    [string[]]$Category
)

$ErrorActionPreference = "Continue"  # ein fehlgeschlagener Check soll die anderen nicht verhindern

$scriptDir = $PSScriptRoot
. (Join-Path $scriptDir "..\common\Verify.ps1")

$connopsRoot = "C:\ConnOps"
# @(...) erzwingt ein Array: ein einzelnes Ergebnis bzw. ein einzelner Fehler
# wuerde sonst zum Skalar, und .Count lieferte nichts (Zaehlfehler 12.09.2026)
$results = @(Invoke-ConnOpsVerify -ConnopsRoot $connopsRoot -Category $Category)

# --- Ausgabe ---------------------------------------------------------------
Write-Output ""
Write-Output "=== ConnOps Verify ==="
Write-Output ""

foreach ($r in $results) {
    if ($r.OK) {
        Write-Output "  [OK]     $($r.Name)"
    } else {
        Write-Output "  [FEHLT]  $($r.Name)"
        if ($r.Hint) { Write-Output "           -> $($r.Hint)" }
    }
}

$failed = @($results | Where-Object { -not $_.OK })
Write-Output ""
Write-Output "=== Zusammenfassung ==="
Write-Output "$($results.Count - $failed.Count) von $($results.Count) Pruefungen bestanden."

if ($failed.Count -gt 0) {
    Write-Output ""
    Write-Output "Fehlgeschlagene Pruefungen:"
    $failed | Format-Table Name, Hint -AutoSize | Out-String | Write-Output
    exit 3
} else {
    Write-Output "Installation vollstaendig und korrekt."
    exit 0
}
