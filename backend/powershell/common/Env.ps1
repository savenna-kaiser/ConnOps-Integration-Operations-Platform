<#
.SYNOPSIS
    Gemeinsamer .env-Parser fuer die PowerShell-Betriebsskripte.

.DESCRIPTION
    Extrahiert am 28.07.2026 aus backup-db.ps1 und restore-db.ps1 - beide
    hatten dieselbe Read-DotEnv-Funktion, mit einem kleinen Unterschied:
    nur backup-db.ps1 hatte eine Test-Path-Pruefung mit klarer
    Fehlermeldung, falls die .env fehlt. Diese robustere Fassung ist hier
    uebernommen, restore-db.ps1 bekommt sie dadurch mit.

    Liegt bewusst unter backend/powershell/common/, NICHT unter
    deployment/common/. Grund: backend/powershell/*.ps1 (backup-db.ps1,
    restore-db.ps1, und potenziell rotate-logs.ps1, verify-new-server.ps1
    u.a.) sind eigenstaendige Betriebsskripte, die auch OHNE die
    Deployment Engine laufen (z. B. backup-db.ps1 direkt per Scheduled
    Task). Abhaengigkeiten zeigen in diesem Projekt ausschliesslich nach
    unten:

        Deployment Engine (deployment/)
                |
                v
        PowerShell-Betriebsskripte (backend/powershell/)
                |
                v
        gemeinsame PowerShell-Bibliotheken (backend/powershell/common/)

    Ein Betriebsskript darf nie von deployment/ abhaengen - sonst waere
    die Deployment Engine Voraussetzung fuer den eigenstaendigen Betrieb
    der Skripte, was sie nicht sein soll.

.NOTES
    Einbindung per Dot-Sourcing im aufrufenden Skript:
        . (Join-Path $scriptDir "common\Env.ps1")
#>

function Read-DotEnv {
    param(
        [string]$Path
    )
    if (-not (Test-Path $Path)) {
        throw "Konfigurationsdatei nicht gefunden: $Path"
    }
    $result = @{}
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $idx = $line.IndexOf("=")
        if ($idx -lt 1) { return }
        $key = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1).Trim()
        if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Trim('"') }
        $result[$key] = $val
    }
    return $result
}
