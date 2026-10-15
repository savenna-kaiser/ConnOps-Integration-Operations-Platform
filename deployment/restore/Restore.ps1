<#
.SYNOPSIS
    ConnOps Restore - CLI-Host fuer das bestehende Restore-Skript.

.DESCRIPTION
    Analog zu deployment/verify/Verify.ps1 und deployment/backup/Backup.ps1:
    dieser CLI-Host enthaelt selbst keine Restore-Fachlogik (kein
    pg_restore-Aufruf, keine Datenbank-Erstellung). Anders als bei
    Backup/Verify kommt hier aber eine zusaetzliche Aufgabe dazu: die
    Benutzerinteraktion (Backup-Auswahl) wird HIER uebernommen, nicht mehr
    in restore-db.ps1 selbst - siehe Roadmap Schritt 6 (28.07.2026) fuer
    die Begruendung: CLI-Host fragt, Fachskript fuehrt aus.

    Wurde -BackupFile bereits beim Aufruf von "connops.ps1 restore"
    angegeben, wird direkt durchgereicht, keine Abfrage. Wurde es nicht
    angegeben, listet dieser Host die verfuegbaren Backups auf und fragt
    per Read-Host - genau das Verhalten, das restore-db.ps1 vorher selbst
    hatte. Das eigentliche restore-db.ps1 bekommt in beiden Faellen einen
    bereits konkreten Dateipfad und muss selbst nie mehr fragen (der
    interaktive Fallback in restore-db.ps1 bleibt nur fuer den direkten
    Aufruf ausserhalb der Deployment Engine erhalten).

.PARAMETER BackupFile
    Voller Pfad zu einer konkreten .dump-Datei. Wenn gesetzt: keine
    Auflistung/Abfrage, direkte Weitergabe an restore-db.ps1.

.PARAMETER OverwriteProduction
    Wird unveraendert an restore-db.ps1 durchgereicht. Die eigentliche
    Sicherheitsabfrage (Eintippen des Datenbanknamens) bleibt bewusst in
    restore-db.ps1, weil sie unmittelbar an die destruktive Aktion selbst
    gebunden ist (DROP DATABASE), nicht an die Backup-Auswahl.

.EXAMPLE
    .\connops.ps1 restore
    Listet verfuegbare Backups auf, fragt interaktiv, stellt in eine neue
    Test-Datenbank wieder her.

.EXAMPLE
    .\connops.ps1 restore -BackupFile "D:\Backups\connops_backup_20260728.dump"
    Keine Abfrage, direkter Restore dieser Datei in eine neue
    Test-Datenbank.
#>

param(
    [string]$BackupFile,
    [switch]$OverwriteProduction
)

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
$backendPath = Join-Path $scriptDir "..\..\backend\powershell"
$restoreScript = Join-Path $backendPath "restore-db.ps1"
$envPath = Join-Path $backendPath "..\.env"

if (-not $BackupFile) {
    # Backup-Auswahl liegt jetzt hier, nicht mehr in restore-db.ps1 -
    # dieselbe Konfiguration wird gebraucht (BACKUP_TARGET_PATH), also
    # dieselbe gemeinsame Env-Bibliothek wie backup-db.ps1/restore-db.ps1.
    . (Join-Path $backendPath "common\Env.ps1")
    $config = Read-DotEnv -Path $envPath
    $targetPath = $config["BACKUP_TARGET_PATH"]

    if (-not $targetPath -or -not (Test-Path $targetPath)) {
        Write-Error "Backup-Ordner nicht gefunden: $targetPath"
        exit 1
    }

    $backups = Get-ChildItem -Path $targetPath -Filter "connops_backup_*.dump" |
               Sort-Object LastWriteTime -Descending

    if ($backups.Count -eq 0) {
        Write-Error "Keine Backups in $targetPath gefunden."
        exit 1
    }

    Write-Output "Verfuegbare Backups:"
    for ($i = 0; $i -lt $backups.Count; $i++) {
        $b = $backups[$i]
        $sizeMb = [math]::Round($b.Length / 1MB, 2)
        Write-Output "  [$i] $($b.Name)  ($sizeMb MB, $($b.LastWriteTime))"
    }

    $selection = Read-Host "Welches Backup wiederherstellen? (Index eingeben)"
    $idx = 0
    if (-not [int]::TryParse($selection, [ref]$idx) -or $idx -lt 0 -or $idx -ge $backups.Count) {
        Write-Error "Ungueltige Auswahl."
        exit 1
    }
    $BackupFile = $backups[$idx].FullName
}

& $restoreScript -BackupFile $BackupFile -OverwriteProduction:$OverwriteProduction
exit $LASTEXITCODE
