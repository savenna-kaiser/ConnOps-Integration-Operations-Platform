<#
.SYNOPSIS
    ConnOps Backup - CLI-Host fuer das bestehende Backup-Skript.

.DESCRIPTION
    Analog zu deployment/verify/Verify.ps1: dieser CLI-Host enthaelt
    selbst keine Backup-Fachlogik. Er nimmt nur Argumente entgegen, ruft
    das bestehende backend/powershell/backup-db.ps1 unveraendert auf und
    reicht dessen Exit-Code unveraendert durch.

    Bewusst keine Vorab-Pruefungen hier (z. B. ".env vorhanden?", "pg_dump
    vorhanden?") - das wuerde die Backup-Fachlogik auf zwei Ebenen
    verteilen. Diese Pruefungen gehoeren in backup-db.ps1 selbst (macht es
    teilweise schon, z. B. .env-Existenzpruefung ueber common/Env.ps1) und
    bleiben dort.

    Schritt 5 der Roadmap (28.07.2026): bewusst kleiner Umfang, reiner
    Wrapper. Funktionale Erweiterungen (differenzierte Exit-Codes gemaess
    dem Vertrag in connops.ps1, aktive Integritaetspruefung des Dumps)
    sind zurueckgestellt, siehe Roadmap-Abschnitt zu Schritt 5 -
    "erst integrieren, dann verbessern".

.NOTES
    backup-db.ps1 setzt aktuell noch keine differenzierten Exit-Codes im
    Sinne des Vertrags aus connops.ps1 (0/1/2/3/4) - im Wesentlichen nur
    0 (Erfolg, implizit) und 1 (jeder Fehlerfall). Dieser CLI-Host gibt
    das unveraendert weiter, bis das plattformweite Exit-Code-Refactoring
    (siehe Roadmap) ansteht.

.EXAMPLE
    .\connops.ps1 backup
#>

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
$backupScript = Join-Path $scriptDir "..\..\backend\powershell\backup-db.ps1"

& $backupScript
exit $LASTEXITCODE
