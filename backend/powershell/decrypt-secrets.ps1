<#
.SYNOPSIS
    ConnOps - Secrets entschluesseln (Phase 6.3)

.DESCRIPTION
    Wird von services/loadSecrets.js synchron beim Serverstart aufgerufen
    (ein einzelner kurzlebiger Aufruf, kein persistenter Prozess wie der
    PS-Worker-Pool). Liest data/secrets.dat, entschluesselt per DPAPI
    (LocalMachine-Scope) und gibt die Werte als JSON auf stdout aus.

    Gibt bei Erfolg reines JSON aus (ein Objekt, ein Key pro Secret).
    Gibt bei Fehler nichts auf stdout aus und einen Exit-Code != 0 -
    loadSecrets.js behandelt das als "secrets.dat nicht verfuegbar" und
    faellt auf die .env-Klartextwerte zurueck (nicht-fatal, siehe dort).
#>

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security

$scriptDir   = $PSScriptRoot
$secretsPath = Join-Path $scriptDir "..\data\secrets.dat"

if (-not (Test-Path $secretsPath)) {
    # Kein Fehler-Output - loadSecrets.js soll das still als "noch nicht eingerichtet" werten
    exit 1
}

try {
    $encrypted = [System.IO.File]::ReadAllBytes($secretsPath)
    $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $encrypted,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::LocalMachine
    )
    $json = [System.Text.Encoding]::UTF8.GetString($decrypted)
    [Console]::Out.Write($json)
    exit 0
} catch {
    [Console]::Error.Write("Entschluesselung fehlgeschlagen: $($_.Exception.Message)")
    exit 1
}
