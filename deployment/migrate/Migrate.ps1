<#
.SYNOPSIS
    ConnOps Migrate - CLI-Host fuer das bestehende Migrationsskript.

.DESCRIPTION
    Analog zu deployment/verify/Verify.ps1, deployment/backup/Backup.ps1
    und deployment/restore/Restore.ps1: dieser CLI-Host enthaelt selbst
    keine Migrations-Fachlogik. Er ruft das bestehende
    backend/data/migrate.js unveraendert auf und reicht dessen Exit-Code
    unveraendert durch.

    WICHTIGER UNTERSCHIED zu den bisherigen Modulen: migrate.js ist ein
    Node-Skript, kein PowerShell-Skript, und wird deshalb per "node"
    aufgerufen statt per "&". Gefunden am 28.07.2026 beim Review von
    migrate.js: das Skript laedt seine Konfiguration per
    "require('dotenv').config()" OHNE Pfadangabe - dotenv sucht die .env
    dann relativ zum AKTUELLEN ARBEITSVERZEICHNIS des Node-Prozesses
    (process.cwd()), NICHT relativ zum Skript selbst. migrate.js geht
    davon aus, aus backend/ heraus aufgerufen zu werden (siehe Kommentar
    dort: "Einmalig ausfuehren: node data/migrate.js"). Wuerde dieser
    CLI-Host node einfach mit dem ererbten Arbeitsverzeichnis von
    connops.ps1 aufrufen (typischerweise deployment/), wuerde dotenv dort
    keine .env finden - PG_HOST/PG_USER/etc. blieben leer, die Fehlermeldung
    waere ein irrefuehrender Verbindungsfehler statt eines klaren Hinweises
    auf die fehlende .env. Deshalb wird das Arbeitsverzeichnis hier
    VOR dem node-Aufruf explizit auf backend/ gesetzt (Push-Location) und
    danach wieder zurueckgesetzt (Pop-Location), unabhaengig davon, von wo
    aus connops.ps1 selbst aufgerufen wurde.

.EXAMPLE
    .\connops.ps1 migrate
#>

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
$backendPath = Join-Path $scriptDir "..\..\backend"
$migrateScript = Join-Path $backendPath "data\migrate.js"

if (-not (Test-Path $migrateScript)) {
    Write-Error "[Migrate] migrate.js nicht gefunden unter: $migrateScript"
    exit 2
}

Push-Location $backendPath
try {
    node $migrateScript
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

exit $exitCode
