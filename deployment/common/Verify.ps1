<#
.SYNOPSIS
    ConnOps - gemeinsame Verify-Bibliothek (Check-Definitionen + Ausfuehrung)

.DESCRIPTION
    Extrahiert am 29.07.2026 aus deployment/verify/Verify.ps1, als
    Vorbereitung fuer Schritt 8 (install-Modul). Grund: die Roadmap
    verlangt fuer install, dass nach jeder Installationsphase NUR die von
    dieser Phase betroffenen Verify-Pruefungen erneut laufen, nicht immer
    alle 18 - das braucht dieselbe Pruefbibliothek gezielt gefiltert nach
    Kategorie, ohne ueber den Dispatcher zu gehen (Architekturregel: Module
    rufen sich nicht gegenseitig ueber connops.ps1 auf).

    Liegt bewusst unter deployment/common/, NICHT unter
    backend/powershell/common/ (dort liegt nur Env.ps1, siehe Schritt 5) -
    diese Bibliothek gehoert originaer zur Deployment Engine selbst
    (Verify ist Teil davon), nicht zu eigenstaendigen Betriebsskripten, die
    auch ohne die Deployment Engine laufen muessen.

    Checks sind deklarativ als Array von Hashtables aufgebaut (Name,
    Category, Test, FailHint) statt als wachsende Funktionsliste - laut
    Roadmap eine der wichtigsten Architekturentscheidungen der gesamten
    Deployment Engine. Kategorien sind bewusst KEIN fester Architektur-
    vertrag, koennen wachsen (z. B. "Code", "Datenbank", "Freigaben" fuer
    kuenftige install-Phasen, siehe Roadmap-Luecken-Analyse zu Schritt 8).

    Aktuelle Kategorien (Stand 29.07.2026) und ihre Zuordnung zu den
    zehn install-Phasen aus der Roadmap:
      Voraussetzungen  -> Phase 1 (Node, npm, AD-Modul, PostgreSQL-Dienst)
      Windows-Rechte   -> Phase 2
      Konfiguration    -> Phase 4 (.env)
      Secrets          -> Phase 6
      Windows-Dienst   -> Phase 7
      IIS              -> Phase 8 (inkl. Zertifikat)
      Backup           -> kein install-Phase-Aequivalent, rein operativ
    Noch ohne Checks (Luecken, siehe Schritt-8-Planung):
    Phase 5 (Datenbank-Rollen/Schema), Phase 9 (Freigabe-Rechte-Test),
    Phase 10 (Abschlussbericht - strukturell ohnehin kein Einzel-Check,
    sondern eine Aggregation der anderen Ergebnisse).
    Phase 3 (Code) am 07.09.2026 ergaenzt - siehe Kategorie "Code" unten.

.NOTES
    Einbindung per Dot-Sourcing im aufrufenden CLI-Host:
        . (Join-Path $scriptDir "..\common\Verify.ps1")
        $results = Invoke-ConnOpsVerify -ConnopsRoot $connopsRoot -Category @("IIS")
#>

function Test-UserRightForAccount {
    param(
        [string]$Content,
        [string]$RightName,
        [string]$AccountName,
        [string]$AccountSid
    )
    $line = ($Content -split "`r?`n") | Where-Object { $_ -match "^\s*$RightName\s*=" } | Select-Object -First 1
    if (-not $line) { return $false }
    if ($line -match [regex]::Escape($AccountName)) { return $true }
    if ($AccountSid -and ($line -match [regex]::Escape($AccountSid))) { return $true }
    return $false
}

function Get-ConnOpsChecks {
    <#
    .DESCRIPTION
        Baut das deklarative Check-Array. Werte, die von mehreren Checks
        gemeinsam gebraucht werden (z. B. der einmalige secedit-Export fuer
        beide Rechte-Checks), werden hier EINMAL berechnet und per
        GetNewClosure() fest an die jeweiligen Scriptblocks gebunden -
        nicht per Umgebungsvariable/ambienter Sichtbarkeit, damit die
        Checks unabhaengig davon korrekt bleiben, aus welchem Scope heraus
        sie spaeter per "& $check.Test" ausgefuehrt werden (z. B. aus
        Invoke-ConnOpsVerify hier, oder kuenftig aus install heraus).
    #>
    param(
        [string]$ConnopsRoot = "C:\ConnOps"
    )

    $backendPath = Join-Path $ConnopsRoot "backend"
    $envPath     = Join-Path $backendPath ".env"

    # --- Einmalig fuer beide Windows-Rechte-Checks: secedit-Export -----------
    $secpolTemp = Join-Path $env:TEMP "connops_verify_secpol.cfg"
    try {
        secedit /export /cfg $secpolTemp /areas USER_RIGHTS | Out-Null
        $secpolContent = Get-Content $secpolTemp -Raw
    } catch {
        $secpolContent = ""
    }
    if (Test-Path $secpolTemp) { Remove-Item $secpolTemp -Force -ErrorAction SilentlyContinue }

    $targetAccountName = "Service_ConnOps"
    $targetAccountSid = $null
    try {
        $ntAccount = New-Object System.Security.Principal.NTAccount($targetAccountName)
        $targetAccountSid = ($ntAccount.Translate([System.Security.Principal.SecurityIdentifier])).Value
    } catch {
        $targetAccountSid = $null
    }

    $lastBackupFile = Join-Path $backendPath "data\lastBackup.json"

    # Gefunden am 29.07.2026 (Schritt-8-Vorbereitung): Ergebnis HIER sofort
    # berechnen statt Test-UserRightForAccount innerhalb des per
    # GetNewClosure() gebundenen Scriptblocks aufzurufen. GetNewClosure()
    # bindet Variablen fest an den Scriptblock, aber KEINE Funktionen - ein
    # so gebundener Scriptblock, der spaeter aus einem fremden Funktions-
    # kontext heraus aufgerufen wird (hier: Invoke-ConnOpsVerify statt
    # Get-ConnOpsChecks selbst), kann Test-UserRightForAccount in diesem
    # isolierten Closure-Kontext nicht mehr zuverlaessig finden - fuehrte
    # produktiv zu einer stillen Exception und dadurch False, obwohl
    # Test-UserRightForAccount direkt aufgerufen korrekt True lieferte
    # (auf connops01 reproduziert und isoliert). Alle anderen Checks
    # nutzen nur eingebaute Cmdlets (global aufloesbar, kein Closure-Problem)
    # - deshalb war ausschliesslich dieser Fall betroffen.
    $dienstRecht = Test-UserRightForAccount -Content $secpolContent -RightName "SeServiceLogonRight" -AccountName $targetAccountName -AccountSid $targetAccountSid
    $batchRecht  = Test-UserRightForAccount -Content $secpolContent -RightName "SeBatchLogonRight" -AccountName $targetAccountName -AccountSid $targetAccountSid

    $checks = @(
        # --- Voraussetzungen (install-Phase 1) -------------------------------
        @{
            Name     = "Node.js installiert"
            Category = "Voraussetzungen"
            Test     = ({ (Get-Command node -ErrorAction SilentlyContinue) -ne $null }).GetNewClosure()
            FailHint = ""
        },
        @{
            Name     = "npm installiert"
            Category = "Voraussetzungen"
            Test     = ({ (Get-Command npm -ErrorAction SilentlyContinue) -ne $null }).GetNewClosure()
            FailHint = ""
        },
        @{
            Name     = "ActiveDirectory-Modul verfuegbar"
            Category = "Voraussetzungen"
            Test     = ({ (Get-Module -ListAvailable -Name ActiveDirectory) -ne $null }).GetNewClosure()
            FailHint = ""
        },
        @{
            Name     = "PostgreSQL-Dienst laeuft lokal"
            Category = "Voraussetzungen"
            Test     = ({ (Get-Service | Where-Object { $_.Name -like "postgresql*" -and $_.Status -eq "Running" }) -ne $null }).GetNewClosure()
            FailHint = ""
        },

        # --- Windows-Rechte fuer Service_ConnOps (install-Phase 2) -----------
        # Bekanntes Stolperfeld vom 27.07.2026: Dienst-Recht und Batch-Recht
        # sind ZWEI verschiedene Rechte, beide werden gebraucht. Gehaertet am
        # 28.07.2026: prueft gezielt Service_ConnOps in der Rechte-Zeile
        # (Name oder SID), nicht nur ob irgendein Konto das Recht hat.
        @{
            Name     = "Recht 'Anmelden als Dienst' fuer Service_ConnOps"
            Category = "Windows-Rechte"
            Test     = ({ $dienstRecht }).GetNewClosure()
            FailHint = "Service_ConnOps hat dieses Recht nicht (oder secpol konnte nicht ausgewertet werden) - siehe secpol.msc, 'Anmelden als Dienst'"
        },
        @{
            Name     = "Recht 'Anmelden als Batchauftrag' fuer Service_ConnOps"
            Category = "Windows-Rechte"
            Test     = ({ $batchRecht }).GetNewClosure()
            FailHint = "Service_ConnOps hat dieses Recht nicht (oder secpol konnte nicht ausgewertet werden) - noetig fuer Scheduled Tasks wie Backup, falls diese unter Service_ConnOps laufen"
        },

        # --- Code (install-Phase 3) -------------------------------------------
        # Rein lesende Existenz-Pruefungen (Modell B, siehe Projektnotizen
        # 07.09.2026): install PRUEFT nur, dass der Code bereits vorhanden
        # ist (z.B. per manuellem `git clone` VOR dem ersten install-Lauf),
        # klont NICHT selbst - ein automatisches Klonen wuerde einen
        # SSH-Deploy-Key voraussetzen, eine zusaetzliche, aktuell nicht
        # dokumentierte Voraussetzung.
        @{
            Name     = "Git-Repository vorhanden"
            Category = "Code"
            Test     = ({ Test-Path (Join-Path $ConnopsRoot ".git") }).GetNewClosure()
            FailHint = "Kein .git-Ordner unter $ConnopsRoot gefunden - Repository muss vor 'install' per 'git clone' bereitgestellt werden"
        },
        @{
            Name     = "Backend node_modules vorhanden"
            Category = "Code"
            Test     = ({ Test-Path (Join-Path $backendPath "node_modules") }).GetNewClosure()
            FailHint = "backend\node_modules fehlt - 'npm install' im backend-Ordner ausfuehren"
        },
        @{
            Name     = "Frontend node_modules vorhanden"
            Category = "Code"
            Test     = ({ Test-Path (Join-Path $ConnopsRoot "frontend\node_modules") }).GetNewClosure()
            FailHint = "frontend\node_modules fehlt - 'npm install' im frontend-Ordner ausfuehren"
        },
        @{
            Name     = "Frontend-Build vorhanden (dist + web.config)"
            Category = "Code"
            Test     = ({
                (Test-Path (Join-Path $ConnopsRoot "frontend\dist")) -and
                (Test-Path (Join-Path $ConnopsRoot "frontend\dist\web.config"))
            }).GetNewClosure()
            FailHint = "frontend\dist fehlt oder web.config fehlt darin - 'npm run build' im frontend-Ordner ausfuehren (web.config wird laut Projektnotizen automatisch aus frontend\public\web.config mitkopiert)"
        },

        # --- Konfiguration (install-Phase 4) ---------------------------------
        @{
            Name     = ".env vorhanden"
            Category = "Konfiguration"
            Test     = ({ Test-Path $envPath }).GetNewClosure()
            FailHint = ""
        },

        # --- Secrets (install-Phase 6) ---------------------------------------
        @{
            Name     = "secrets.dat vorhanden (DPAPI-Secrets eingerichtet)"
            Category = "Secrets"
            Test     = ({ Test-Path (Join-Path $backendPath "data\secrets.dat") }).GetNewClosure()
            FailHint = "Secrets liegen evtl. noch im Klartext in .env - encrypt-secrets.ps1 noch nicht gelaufen?"
        },

        # --- Windows-Dienst (install-Phase 7) --------------------------------
        @{
            Name     = "Windows-Dienst 'ConnOps' existiert"
            Category = "Windows-Dienst"
            Test     = ({ (Get-Service -Name "ConnOps" -ErrorAction SilentlyContinue) -ne $null }).GetNewClosure()
            FailHint = ""
        },
        @{
            Name     = "Windows-Dienst 'ConnOps' laeuft"
            Category = "Windows-Dienst"
            Test     = ({
                $svc = Get-Service -Name "ConnOps" -ErrorAction SilentlyContinue
                $svc -and $svc.Status -eq "Running"
            }).GetNewClosure()
            FailHint = "Dienst existiert, laeuft aber nicht - 'nssm restart ConnOps' pruefen"
        },

        # --- IIS, inkl. Zertifikat (install-Phase 8) -------------------------
        @{
            Name     = "IIS-Feature installiert"
            Category = "IIS"
            Test     = ({ (Get-WindowsFeature -Name Web-Server -ErrorAction SilentlyContinue).Installed -eq $true }).GetNewClosure()
            FailHint = ""
        },
        @{
            # Verify prueft hier KEIN bestimmtes Windows-Feature, sondern die
            # tatsaechliche technische Voraussetzung der nachfolgenden IIS-
            # Pruefungen: das Cmdlet Get-Website (Modul WebAdministration) muss
            # verfuegbar sein. Befund 12.09.2026 auf connops01: Get-Website
            # laeuft dort, obwohl Web-Scripting-Tools NICHT installiert ist
            # (installiert: Web-Server, Web-Mgmt-Tools, Web-Mgmt-Console). Welche
            # IIS-Komponenten eine frische Installation braucht, wird in Phase 8
            # empirisch auf der Test-VM geklaert.
            Name     = "IIS-Verwaltungs-Cmdlet Get-Website verfuegbar"
            Category = "IIS"
            Test     = ({ [bool](Get-Command Get-Website -ErrorAction SilentlyContinue) }).GetNewClosure()
            FailHint = "Get-Website nicht verfuegbar - IIS-Verwaltungswerkzeuge fuer Phase 8 pruefen"
        },
        @{
            Name     = "IIS-Site 'ConnOps' existiert"
            Category = "IIS"
            Test     = ({
                if (-not (Get-Command Get-Website -ErrorAction SilentlyContinue)) { return $false }
                Import-Module WebAdministration -ErrorAction SilentlyContinue
                (Get-Website -Name "ConnOps" -ErrorAction SilentlyContinue) -ne $null
            }).GetNewClosure()
            FailHint = "Site 'ConnOps' nicht gefunden - oder Get-Website nicht verfuegbar (siehe Pruefung zum IIS-Verwaltungs-Cmdlet)"
        },
        @{
            Name     = "IIS-Site 'ConnOps' laeuft (nicht 'Default Web Site' im Weg)"
            Category = "IIS"
            Test     = ({
                if (-not (Get-Command Get-Website -ErrorAction SilentlyContinue)) { return $false }
                $site = Get-Website -Name "ConnOps" -ErrorAction SilentlyContinue
                $site -and $site.State -eq "Started"
            }).GetNewClosure()
            FailHint = "Site 'ConnOps' laeuft nicht - bekanntes Problem: Default Web Site startet nach iisreset automatisch neu und blockiert Port 80. Bei fehlendem Get-Website siehe Pruefung zum IIS-Verwaltungs-Cmdlet"
        },
        @{
            Name     = "HTTPS-Bindung (Port 443) vorhanden"
            Category = "IIS"
            Test     = ({
                if (-not (Get-Command Get-WebBinding -ErrorAction SilentlyContinue)) { return $false }
                $bindings = Get-WebBinding -Name "ConnOps" -ErrorAction SilentlyContinue
                $bindings | Where-Object { $_.protocol -eq "https" }
            }).GetNewClosure()
            FailHint = "Zertifikat evtl. noch nicht gebunden - oder Get-WebBinding nicht verfuegbar (siehe Pruefung zum IIS-Verwaltungs-Cmdlet)"
        },
        @{
            Name     = "Zertifikat vorhanden und nicht abgelaufen (< 30 Tage)"
            Category = "IIS"
            Test     = ({
                $cert = Get-ChildItem Cert:\LocalMachine\My -ErrorAction SilentlyContinue |
                    Where-Object { $_.Subject -like "*connops*" } |
                    Select-Object -First 1
                $cert -and ($cert.NotAfter -gt (Get-Date).AddDays(30))
            }).GetNewClosure()
            FailHint = "Zertifikat fehlt oder laeuft in weniger als 30 Tagen ab"
        },

        # --- Backup (rein operativ, kein install-Phase-Aequivalent) ----------
        @{
            Name     = "Scheduled Task 'ConnOps-Backup' existiert"
            Category = "Backup"
            Test     = ({ (Get-ScheduledTask -TaskName "ConnOps-Backup" -ErrorAction SilentlyContinue) -ne $null }).GetNewClosure()
            FailHint = ""
        },
        @{
            Name     = "Letztes Backup erfolgreich UND nicht leer"
            Category = "Backup"
            Test     = ({
                if (-not (Test-Path $lastBackupFile)) { return $false }
                $status = Get-Content $lastBackupFile -Raw | ConvertFrom-Json
                $status.ok -eq $true -and $status.sizeBytes -gt 1000
            }).GetNewClosure()
            FailHint = "Bekanntes Problem: leere .dump-Dateien nach DPAPI-Migration ohne Fehleranzeige - sizeBytes pruefen, nicht nur ok:true"
        },
        @{
            Name     = "Letztes Backup nicht aelter als 48 Stunden"
            Category = "Backup"
            Test     = ({
                if (-not (Test-Path $lastBackupFile)) { return $false }
                $status = Get-Content $lastBackupFile -Raw | ConvertFrom-Json
                ([datetime]$status.ts) -gt (Get-Date).ToUniversalTime().AddHours(-48)
            }).GetNewClosure()
            FailHint = ""
        }
    )

    return $checks
}

function Invoke-ConnOpsVerify {
    <#
    .DESCRIPTION
        Fuehrt alle (oder per -Category gefilterte) Checks aus und gibt ein
        Array von Ergebnis-Objekten zurueck (Name, Category, OK, Hint).
        Rein lesend, wie das gesamte Verify-Modul - siehe Architekturregel
        in der Roadmap ("Verify veraendert niemals den Systemzustand").

    .PARAMETER Category
        Optional. Wenn gesetzt, werden nur Checks dieser Kategorie(n)
        ausgefuehrt - genutzt von install, um nach jeder Phase gezielt nur
        die betroffenen Pruefungen erneut laufen zu lassen. Ohne Angabe:
        alle Checks (bisheriges Verhalten von connops.ps1 verify).
    #>
    param(
        [string]$ConnopsRoot = "C:\ConnOps",
        [string[]]$Category = $null
    )

    $checks = Get-ConnOpsChecks -ConnopsRoot $ConnopsRoot

    if ($Category -and $Category.Count -gt 0) {
        $checks = $checks | Where-Object { $Category -contains $_.Category }
    }

    $results = @()
    foreach ($c in $checks) {
        try {
            $ok = & $c.Test
        } catch {
            $ok = $false
            if (-not $c.FailHint) { $c.FailHint = $_.Exception.Message }
        }
        $results += [PSCustomObject]@{
            Name     = $c.Name
            Category = $c.Category
            OK       = [bool]$ok
            Hint     = $c.FailHint
        }
    }

    return $results
}
