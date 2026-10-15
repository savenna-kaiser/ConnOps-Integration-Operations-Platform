# Execution Report — Datenstruktur-Spezifikation

Vorbereitung für Roadmap-Schritt 8 Phase 10 (`install`) und Schritt 9
(`update`) — noch kein Code, nur die Datenstruktur und das Ausgabeformat,
damit sie nicht nachträglich in bereits fertige Phasen hineingefrickelt
werden müssen. Gleiches Vorgehen wie bei den Verify-Checks: Struktur zuerst
deklarativ festlegen, JSON-Fähigkeit von Anfang an mitdenken (siehe
Roadmap, "Verify-Ergebnisse von Anfang an maschinenlesbar mitdenken" —
dasselbe Prinzip gilt hier).

## Warum ein eigenes Format, nicht einfach die Verify-Ergebnisse

`Invoke-ConnOpsVerify` liefert einzelne Check-Ergebnisse (Name, Category,
OK, Hint) — das reicht für "ist der Sollzustand erreicht", aber nicht für
"was ist während dieses `install`-Laufs passiert". Der Execution Report ist
eine Ebene darüber: pro Phase, was wurde *getan* (nicht nur geprüft), wie
lange hat es gedauert, und was bleibt am Ende manuell zu erledigen.

## Datenstruktur

```powershell
$executionReport = @{
    # --- Kopfdaten ---------------------------------------------------
    Server       = $env:COMPUTERNAME       # z. B. "connops01"
    Command      = "install"                # oder "update"
    StartedAt    = [datetime]               # UTC
    FinishedAt   = [datetime]               # UTC, erst am Ende gesetzt
    DurationSec  = [int]                    # FinishedAt - StartedAt
    ConnOpsVersion = ""                     # git rev-parse --short HEAD,
                                             # nach Phase 3 ermittelt

    # --- Gesamtergebnis, erst am Ende gesetzt -------------------------
    # "Success"      = alle Phasen abgeschlossen, keine manuellen
    #                  Restschritte offen
    # "PartialSuccess" = alle automatisierten Phasen abgeschlossen,
    #                  aber manuelle Restschritte stehen noch aus
    #                  (das ist der ERWARTETE Normalfall bei install,
    #                  siehe Phase 7: Dienstkonto bleibt bewusst manuell)
    # "Failed"       = mindestens eine Phase mit Exit 1/2/3 abgebrochen
    OverallResult = ""

    # --- Eine Zeile pro Phase, in Ausfuehrungsreihenfolge -------------
    Phases = @(
        @{
            Number      = 1
            Name        = "Voraussetzungen"
            Status      = ""        # "Completed" | "Skipped" | "Failed"
            ExitCode    = $null     # 0/1/2/3/4, $null falls Skipped
            DurationSec = $null
            # Nur die Verify-Ergebnisse DIESER Kategorie, nicht alle 23 -
            # gleiche Filterung wie install selbst nutzt
            VerifyResults = @()     # Array von {Name, OK, Hint}
            # Frei formulierte Notiz, z.B. warum eine Phase uebersprungen
            # wurde (Idempotenz-Guard griff, Sollzustand schon erreicht)
            Note        = ""
        }
        # ... eine Eintrag pro Phase 1-9 (Phase 10 berichtet nicht ueber
        # sich selbst)
    )

    # --- Manuelle Restschritte, gesammelt aus allen Phasen ------------
    # Jeder Eintrag entspricht einem Punkt, der NICHT automatisiert wurde
    # (siehe INSTALL_PREREQUISITES.md fuer die Vorab-Voraussetzungen -
    # das hier sind die NACHHER noch offenen Schritte, z.B. Phase 7s
    # Dienstkonto-Konfiguration)
    ManualStepsRemaining = @(
        @{
            Phase       = 7
            Description = "Dienstkonto konfigurieren: nssm set ConnOps ObjectName 'CORP\Service_ConnOps' <Passwort>, danach Start-Service ConnOps"
            Reference   = "INSTALL_PREREQUISITES.md, Punkt 3"
        }
    )
}
```

## Ausgabeformate

**Konsole (Standardfall, analog zum bisherigen `Verify`-Ausgabestil):**
```
=== ConnOps Install - Execution Report ===
Server: connops01
Version: a3f9c21
Gestartet: 2026-08-12 09:14:02 UTC
Beendet:   2026-08-12 09:26:47 UTC
Dauer: 12 Min 45 Sek

Phase 1  Voraussetzungen        [OK]        3 Sek
Phase 2  Windows-Rechte         [OK]        8 Sek
Phase 3  Code + Build           [OK]      340 Sek
Phase 4  Konfiguration          [OK]        1 Sek
Phase 5  Datenbank              [OK]        4 Sek
Phase 6  Secrets                [OK]        2 Sek
Phase 7  Windows-Dienst         [TEILWEISE] 6 Sek
Phase 8  IIS                    [OK]       15 Sek

Ergebnis: PartialSuccess

Manuelle Restschritte:
  - Phase 7: Dienstkonto konfigurieren - siehe
    INSTALL_PREREQUISITES.md, Punkt 3
```

**JSON (`-Json`-Schalter, analog zum geplanten `-Category`-Filter bei
Verify), für spätere Wiederverwendung durch Health/Diagnose/Support-Bundle
(2.1/2.2), ohne dass dafür etwas umgebaut werden muss:**
```powershell
$executionReport | ConvertTo-Json -Depth 5
```

## Wo der Report entsteht — Architektureinordnung

Der Execution Report ist **kein eigenes Modul** (siehe Roadmap: "kein
eigener Schritt/Feature, sondern fachlich Teil von Install/Update"). Er
wird vom `install`-CLI-Host selbst zusammengebaut, während die Phasen
nacheinander laufen — jede Phase liefert ihren Status/ihre Dauer/ihre
Verify-Teilergebnisse zurück an den CLI-Host, der sie im
`$executionReport.Phases`-Array sammelt. Keine der Phasen kennt den
Execution Report selbst — Single Responsibility bleibt gewahrt (Phase 5
weiß nichts von Phase 7, jede Phase liefert nur ihr eigenes Ergebnis
zurück).

## Offene Frage, bewusst nicht vorab entschieden

Soll der Execution Report zusätzlich als Datei abgelegt werden (z. B.
`C:\ConnOps\deployment\logs\install-<timestamp>.json`), damit ein
Installationslauf auch im Nachhinein nachvollziehbar bleibt, nicht nur in
der Konsolenausgabe? Spricht dafür: Nachvollziehbarkeit, falls ein
Restschritt vergessen wird und Wochen später auffällt. Spricht dagegen:
noch ein Ablageort, um den sich `install` kümmern müsste (Rotation,
Berechtigungen). Würde ich zur Implementierungszeit entscheiden, nicht
jetzt vorab.
