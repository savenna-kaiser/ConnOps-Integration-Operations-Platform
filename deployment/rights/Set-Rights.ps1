<#
.SYNOPSIS
    ConnOps install Phase 2 - setzt Windows-Benutzerrechte fuer
    Service_ConnOps (SeServiceLogonRight, SeBatchLogonRight).

.DESCRIPTION
    Nutzt denselben Lese-/Vergleichsmechanismus wie
    deployment/common/Verify.ps1 (secedit /export /areas USER_RIGHTS,
    SID-Aufloesung ueber NTAccount->SecurityIdentifier), damit Pruefung
    und Setzen konsistent bleiben.

    Sicherheitsprinzip (siehe DEPLOYMENT_ENGINE_ROADMAP.md, Phase 2):
    Plausibilitaetspruefung VOR jedem Schreiben:
      - Zeilenzahl der Datei unveraendert
      - Alle NICHT betroffenen Zeilen exakt identisch zum Original
      - Betroffene Zeilen (SeServiceLogonRight/SeBatchLogonRight)
        enthalten NACHHER alle bisherigen SIDs PLUS die neue SID -
        niemals ein Ersetzen, nur ein Ergaenzen

    Standardverhalten: TROCKENLAUF. Zeigt an, was geaendert wuerde, OHNE
    etwas zu schreiben. Echtes Schreiben nur mit -Apply.

.NUTZUNG
    .\Set-Rights.ps1                    (Trockenlauf, aendert nichts)
    .\Set-Rights.ps1 -Apply             (wendet die Aenderung tatsaechlich an)
#>

param(
    [switch]$Apply
)

$ErrorActionPreference = "Stop"
$targetAccountName = "Service_ConnOps"
$rightsToSet = @("SeServiceLogonRight", "SeBatchLogonRight")

function Write-Step($msg) { Write-Output "`n=== $msg ===" }

# ─── SID des Zielkontos aufloesen (identisches Muster wie Verify.ps1) ───────
Write-Step "Konto aufloesen: $targetAccountName"
try {
    $ntAccount = New-Object System.Security.Principal.NTAccount($targetAccountName)
    $targetSid = ($ntAccount.Translate([System.Security.Principal.SecurityIdentifier])).Value
    Write-Output "SID: $targetSid"
} catch {
    Write-Error "Konto '$targetAccountName' konnte nicht aufgeloest werden: $($_.Exception.Message)"
    Write-Output "Voraussetzung: Das AD-Konto muss existieren, bevor Phase 2 laufen kann"
    Write-Output "(siehe INSTALL_PREREQUISITES.md, Punkt 4)."
    exit 2
}

# ─── Aktuelle Richtlinie exportieren ─────────────────────────────────────────
Write-Step "Aktuelle Sicherheitsrichtlinie exportieren"
$secpolPath = Join-Path $env:TEMP "connops_rights_current.cfg"
secedit /export /cfg $secpolPath /areas USER_RIGHTS | Out-Null
if (-not (Test-Path $secpolPath)) {
    Write-Error "secedit /export ist fehlgeschlagen - keine Datei erzeugt."
    exit 1
}
$originalLines = Get-Content $secpolPath
Write-Output "Exportiert: $secpolPath ($($originalLines.Count) Zeilen)"

# ─── Zeilen fuer die betroffenen Rechte finden + ggf. neue SID ergaenzen ────
$newLines = [System.Collections.ArrayList]::new($originalLines)
$changesPlanned = @()

foreach ($right in $rightsToSet) {
    $idx = -1
    for ($i = 0; $i -lt $newLines.Count; $i++) {
        if ($newLines[$i] -match "^\s*$right\s*=") { $idx = $i; break }
    }

    if ($idx -eq -1) {
        Write-Output "[WARNUNG] Zeile fuer '$right' nicht gefunden - wird NICHT angelegt (nur Ergaenzen bestehender Zeilen, kein Neuanlegen)."
        continue
    }

    $line = $newLines[$idx]
    if ($line -match [regex]::Escape($targetSid)) {
        Write-Output "[SKIP] '$right' enthaelt SID bereits - keine Aenderung noetig."
        continue
    }

    # Format: "SeServiceLogonRight = *S-1-5-...,*S-1-5-..."
    $newLine = $line.TrimEnd() + ",*$targetSid"
    $changesPlanned += [PSCustomObject]@{
        Index    = $idx
        Right    = $right
        Before   = $line
        After    = $newLine
    }
}

if ($changesPlanned.Count -eq 0) {
    Write-Step "Keine Aenderung noetig"
    Write-Output "$targetAccountName hat bereits alle gepruefsten Rechte. Nichts zu tun."
    Remove-Item $secpolPath -Force -ErrorAction SilentlyContinue
    exit 0
}

# ─── Geplante Aenderungen anzeigen ───────────────────────────────────────────
Write-Step "Geplante Aenderungen"
foreach ($c in $changesPlanned) {
    Write-Output "`n$($c.Right):"
    Write-Output "  VORHER: $($c.Before)"
    Write-Output "  NACHHER: $($c.After)"
}

# ─── Neue Datei zusammenbauen ─────────────────────────────────────────────────
foreach ($c in $changesPlanned) { $newLines[$c.Index] = $c.After }

# ─── Plausibilitaetspruefung VOR dem Schreiben ──────────────────────────────
Write-Step "Plausibilitaetspruefung"

$checksPassed = $true

# 1. Zeilenzahl unveraendert
if ($newLines.Count -ne $originalLines.Count) {
    Write-Output "[FEHLER] Zeilenzahl hat sich geaendert ($($originalLines.Count) -> $($newLines.Count)) - erwartet: unveraendert."
    $checksPassed = $false
} else {
    Write-Output "[OK] Zeilenzahl unveraendert ($($originalLines.Count))."
}

# 2. Alle NICHT betroffenen Zeilen exakt identisch
$changedIndexes = $changesPlanned.Index
$unexpectedDiffs = 0
for ($i = 0; $i -lt $originalLines.Count; $i++) {
    if ($changedIndexes -contains $i) { continue }
    if ($originalLines[$i] -ne $newLines[$i]) {
        Write-Output "[FEHLER] Unerwartete Abweichung in Zeile $($i+1) (sollte unveraendert sein):"
        Write-Output "         VORHER:  $($originalLines[$i])"
        Write-Output "         NACHHER: $($newLines[$i])"
        $unexpectedDiffs++
        $checksPassed = $false
    }
}
if ($unexpectedDiffs -eq 0) {
    Write-Output "[OK] Alle nicht betroffenen Zeilen unveraendert."
}

# 3. Betroffene Zeilen enthalten alle ALTEN Eintraege + den NEUEN Eintrag
#    (nur Ergaenzen, kein Ersetzen). Behandelt die komplette kommagetrennte
#    Werteliste hinter "=" - nicht nur SID-Muster per Regex, da Zeilen auch
#    namensbasierte Eintraege enthalten koennen (z.B. "EINGESCHRAENKTE
#    DIENSTE\ALLE EINGESCHRAENKTEN DIENSTE", gefunden 07.09.2026 am echten
#    Trockenlauf - die vorherige rein SID-Muster-basierte Pruefung haette
#    einen solchen Eintrag NICHT erfasst, obwohl der eigentliche
#    Schreibvorgang selbst bereits korrekt nur anhaengt).
foreach ($c in $changesPlanned) {
    $oldValue = ($c.Before -split '=', 2)[1].Trim()
    $newValue = ($c.After  -split '=', 2)[1].Trim()
    $oldEntries = $oldValue -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
    $newEntries = $newValue -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
    $missingOld = $oldEntries | Where-Object { $newEntries -notcontains $_ }
    if ($missingOld) {
        Write-Output "[FEHLER] $($c.Right): folgende bisherige Eintraege wuerden VERLOREN gehen: $($missingOld -join ', ')"
        $checksPassed = $false
    } else {
        $addedCount = $newEntries.Count - $oldEntries.Count
        Write-Output "[OK] $($c.Right): alle $($oldEntries.Count) bisherige(n) Eintraege bleiben erhalten, $addedCount neu ergaenzt."
    }
}

Remove-Item $secpolPath -Force -ErrorAction SilentlyContinue

if (-not $checksPassed) {
    Write-Step "ABGEBROCHEN"
    Write-Output "Plausibilitaetspruefung fehlgeschlagen - es wurde NICHTS geschrieben."
    exit 1
}

# ─── Trockenlauf vs. tatsaechliches Schreiben ────────────────────────────────
if (-not $Apply) {
    Write-Step "Trockenlauf abgeschlossen"
    Write-Output "Alle Pruefungen bestanden. Es wurde NICHTS geaendert (kein -Apply angegeben)."
    Write-Output "Zum tatsaechlichen Anwenden: .\Set-Rights.ps1 -Apply"
    exit 0
}

Write-Step "Aenderung wird angewendet"
$outPath = Join-Path $env:TEMP "connops_rights_new.cfg"
$dbPath  = Join-Path $env:TEMP "connops_rights.sdb"
$logPath = Join-Path $env:TEMP "connops_rights_secedit.log"
$newLines | Set-Content -Path $outPath -Encoding Unicode

# Vor dem Aufruf sicherstellen, dass keine Reste eines vorherigen (auch
# fehlgeschlagenen) Laufs die Datenbank-Datei oder das Log stoeren -
# secedit /configure kann sich an einer bereits vorhandenen .sdb stoeren.
Remove-Item $dbPath -Force -ErrorAction SilentlyContinue
Remove-Item $logPath -Force -ErrorAction SilentlyContinue

try {
    secedit /configure /db $dbPath /cfg $outPath /areas USER_RIGHTS /log $logPath | Out-Null
    $seceditExitCode = $LASTEXITCODE

    # WICHTIG (gefunden 07.09.2026 am echten Testlauf): secedit /configure
    # kann einen von 0 abweichenden Exit-Code melden, OBWOHL die
    # Konfiguration tatsaechlich erfolgreich war - der Exit-Code allein ist
    # kein zuverlaessiges Erfolgssignal. Robuster: nach dem Schreiben die
    # Richtlinie ERNEUT exportieren und direkt nachpruefen, ob die
    # Ziel-SID tatsaechlich in allen betroffenen Zeilen angekommen ist -
    # derselbe Ansatz wie die unabhaengige Pruefung in Verify.ps1.
    Write-Output "`nVerifiziere tatsaechlichen Zustand nach dem Schreiben ..."
    secedit /export /cfg $secpolPath /areas USER_RIGHTS | Out-Null
    $verifyContent = Get-Content $secpolPath -Raw
    Remove-Item $secpolPath -Force -ErrorAction SilentlyContinue

    $allConfirmed = $true
    foreach ($right in $rightsToSet) {
        $line = ($verifyContent -split "`r?`n") | Where-Object { $_ -match "^\s*$right\s*=" } | Select-Object -First 1
        if ($line -and ($line -match [regex]::Escape($targetSid))) {
            Write-Output "[BESTAETIGT] $right enthaelt die Ziel-SID."
        } else {
            Write-Output "[FEHLT] $right enthaelt die Ziel-SID NICHT - Schreibvorgang war NICHT erfolgreich."
            $allConfirmed = $false
        }
    }

    if (-not $allConfirmed) {
        if (Test-Path $logPath) {
            Write-Output "`nsecedit-Protokoll ($logPath):"
            Get-Content $logPath | ForEach-Object { Write-Output "  $_" }
        }
        throw "Verifikation nach dem Schreiben fehlgeschlagen (secedit-Exit-Code war $seceditExitCode)"
    }

    if ($seceditExitCode -ne 0) {
        Write-Output "`n[HINWEIS] secedit meldete Exit-Code $seceditExitCode, die Verifikation zeigt aber,"
        Write-Output "          dass die Aenderung trotzdem korrekt angekommen ist (bekannte Eigenheit von secedit)."
    }

    Write-Output "`n[OK] Richtlinie erfolgreich angewendet und verifiziert."
    Write-Output "Zur unabhaengigen Bestaetigung zusaetzlich: deployment\verify\Verify.ps1 -Category 'Windows-Rechte'"
} catch {
    Write-Error "Anwenden der Richtlinie fehlgeschlagen: $($_.Exception.Message)"
    exit 1
} finally {
    Remove-Item $outPath -Force -ErrorAction SilentlyContinue
    Remove-Item $dbPath -Force -ErrorAction SilentlyContinue
}
