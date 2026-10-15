<#
.SYNOPSIS
    ConnOps Deployment Engine - zentraler Einstiegspunkt

.DESCRIPTION
    Phase 1 (siehe Planungsgespraech vom 28.07.2026): bewusst nur ein
    Dispatcher, kein Logging-/Config-/Progress-Framework. Diese entstehen
    erst, wenn mehrere Module denselben Bedarf tatsaechlich zeigen (siehe
    common/ - existiert hier noch nicht, absichtlich).

.NOTES
    Exit Codes (gelten fuer alle Module, ab jetzt verbindlich):
      0 = Erfolgreich
      1 = Fehler waehrend der Ausfuehrung
      2 = Voraussetzungen nicht erfuellt
      3 = Verifikation fehlgeschlagen
      4 = Benutzerabbruch

.EXAMPLE
    .\connops.ps1 verify
#>

param(
    [Parameter(Position = 0, Mandatory = $true)]
    [string]$Command,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot

switch ($Command) {
    "verify" {
        & (Join-Path $scriptDir "verify\Verify.ps1") @RemainingArgs
        exit $LASTEXITCODE
    }
    "backup" {
        & (Join-Path $scriptDir "backup\Backup.ps1") @RemainingArgs
        exit $LASTEXITCODE
    }
    "restore" {
        & (Join-Path $scriptDir "restore\Restore.ps1") @RemainingArgs
        exit $LASTEXITCODE
    }
    "migrate" {
        & (Join-Path $scriptDir "migrate\Migrate.ps1") @RemainingArgs
        exit $LASTEXITCODE
    }
    default {
        Write-Error "Unbekannter Befehl: '$Command'"
        Write-Output ""
        Write-Output "Verfuegbare Befehle:"
        Write-Output "  verify   - Prueft, ob ConnOps korrekt installiert ist"
        Write-Output "  backup   - Erstellt ein Datenbank- und Handover-Backup"
        Write-Output "  restore  - Stellt ein Backup wieder her (interaktiv oder -BackupFile)"
        Write-Output "  migrate  - Fuehrt Schema-Migration und Seed-Daten aus"
        Write-Output ""
        Write-Output "(weitere Befehle folgen: install, update, health)"
        exit 2
    }
}
