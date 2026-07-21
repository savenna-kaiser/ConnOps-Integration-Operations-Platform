<#
.SYNOPSIS
    ConnOps – Migrationspaket exportieren (läuft auf dem ALTEN Server)

.DESCRIPTION
    Bündelt alles, was für den Umzug auf epn1Connops gebraucht wird:
      - PostgreSQL-Dump (nutzt dieselbe pg_dump-Logik wie backup-db.ps1)
      - data/audit.db (SQLite, Audit-Historie)
      - data/assets.csv + data/lastImport.json (Docusnap-Dashboard-Stand)
      - .env als Vorlage (Werte, die sich NICHT ändern, bleiben drin;
        Werte, die sich MIT dem Umzug ändern müssen, werden markiert)

    Der Code selbst (das Git-Repo) wird bewusst NICHT mit exportiert — der
    saubere Weg ist ein frischer `git clone` auf dem neuen Server, statt
    node_modules/.vite/alte Build-Artefakte mitzuschleppen (siehe die
    wiederholten Vite-Cache-Probleme aus den letzten Sessions).

.NOTES
    Ausführen im backend-Ordner: .\powershell\export-migration-package.ps1
#>

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
$envPath   = Join-Path $scriptDir "..\.env"
$dataDir   = Join-Path $scriptDir "..\data"

function Read-DotEnv([string]$path) {
    $result = @{}
    Get-Content $path | ForEach-Object {
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

$config = Read-DotEnv $envPath

$pgHost     = $config["PG_HOST"]
$pgPort     = $(if ($config["PG_PORT"]) { $config["PG_PORT"] } else { "5432" })
$pgDatabase = $config["PG_DATABASE"]
$pgUser     = $config["PG_USER"]
$pgPassword = $config["PG_PASSWORD"]
$pgDumpPath = $(if ($config["PG_DUMP_PATH"]) { $config["PG_DUMP_PATH"] } else { "pg_dump" })

# ─── Zielordner fürs Paket ─────────────────────────────────────────────────
$timestamp  = Get-Date -Format "yyyyMMdd_HHmmss"
$packageDir = Join-Path $scriptDir "..\..\connops_migration_$timestamp"
New-Item -ItemType Directory -Path $packageDir -Force | Out-Null
Write-Output "[Migration] Paket wird gebaut in: $packageDir"

# ─── 1. PostgreSQL-Dump ──────────────────────────────────────────────────────
$dumpFile = Join-Path $packageDir "connops_db.dump"
Write-Output "[Migration] Erstelle PostgreSQL-Dump ..."
$env:PGPASSWORD = $pgPassword
try {
    & $pgDumpPath --host=$pgHost --port=$pgPort --username=$pgUser `
        --format=custom --file=$dumpFile $pgDatabase
    if ($LASTEXITCODE -ne 0) { throw "pg_dump Exit-Code $LASTEXITCODE" }
    Write-Output "[Migration] DB-Dump OK: $dumpFile ($([math]::Round((Get-Item $dumpFile).Length / 1MB, 2)) MB)"
} catch {
    Write-Error "[Migration] DB-Dump fehlgeschlagen: $($_.Exception.Message)"
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    exit 1
} finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

# ─── 2. Datendateien kopieren ─────────────────────────────────────────────────
$filesToCopy = @("audit.db", "assets.csv", "lastImport.json", "lastBackup.json")
foreach ($f in $filesToCopy) {
    $src = Join-Path $dataDir $f
    if (Test-Path $src) {
        Copy-Item $src -Destination $packageDir
        Write-Output "[Migration] Kopiert: $f"
    } else {
        Write-Output "[Migration] Übersprungen (nicht vorhanden): $f"
    }
}

# ─── 3. .env-Vorlage mit Umzugs-Hinweisen ────────────────────────────────────
# Werte, die typischerweise NICHT vom Servernamen abhängen (Passwörter,
# Secrets, fachliche Konfiguration), bleiben unverändert. Werte, die
# wahrscheinlich angepasst werden müssen (Hostnamen/Pfade mit Server-Bezug),
# werden mit einem Kommentar markiert statt automatisch geändert — das soll
# bewusst niemand blind übernehmen.
$envLines = Get-Content $envPath
$hostSensitiveKeys = @("PG_HOST", "AD_DC", "TOPDESK_URL", "TOPDESK_WEBHOOK_SECRET")
$annotated = $envLines | ForEach-Object {
    $line = $_
    foreach ($key in $hostSensitiveKeys) {
        if ($line -match "^\s*$key\s*=") {
            $line = "$line  # ⚠ PRÜFEN: hängt ggf. vom neuen Server ab"
            break
        }
    }
    $line
}
$envTemplatePath = Join-Path $packageDir "env.template"
$annotated | Set-Content -Path $envTemplatePath -Encoding UTF8
Write-Output "[Migration] .env-Vorlage mit Hinweisen erstellt: env.template"

# ─── Zusammenfassung ──────────────────────────────────────────────────────────
Write-Output ""
Write-Output "[Migration] Paket fertig: $packageDir"
Write-Output "[Migration] Enthält:"
Get-ChildItem $packageDir | ForEach-Object { Write-Output "    - $($_.Name)" }
Write-Output ""
Write-Output "[Migration] Nächster Schritt: Ordner '$packageDir' auf epn1Connops übertragen"
Write-Output "[Migration] (z.B. per Kopie über eine Netzwerkfreigabe oder USB — NICHT per Git, das Paket gehört nicht ins Repo)"
