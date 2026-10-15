# psWorker.ps1
#
# FIX #3: LDAP-Injection-Escaping in allen LDAP-Filter-Strings
# FIX #3: Computer-Filter ebenfalls gesichert

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# UTF-8-Kodierung fuer Ein- UND Ausgabe erzwingen (behebt kaputte Umlaute wie
# "S_nke" statt "Soenke" in AD-Namen, sowohl beim Anzeigen als auch bei der
# Suche). Windows PowerShell 5.1 nutzt fuer Konsolen-I/O standardmaessig oft
# die System-Codepage statt UTF-8, waehrend Node stdout als UTF-8 interpretiert
# (chunk.toString()) und stdin als UTF-8 schreibt (stdin.write(string)) - ohne
# beide Zeilen wird jedes Byte oberhalb von 127 (Umlaute, Eszett) falsch
# interpretiert. OutputEncoding behebt nur die Anzeige (PS -> Node), ohne
# InputEncoding werden Suchbegriffe mit Umlauten (Node -> PS, z.B. "Schäfer")
# beim Einlesen verstuemmelt und liefern in Get-ADUser/-ADComputer keine
# Treffer, obwohl der Benutzer existiert.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Wandelt ein .NET-DateTime kultur-unabhaengig in ISO-8601 um. Ohne das wuerde
# [string]$dateTimeObjekt die aktuelle Systemkultur nutzen (z.B. deutsches
# Format "13.07.2026 07:26:00"), das JavaScripts new Date(...) im Frontend
# nicht zuverlaessig parsen kann - fuehrt dort zu "Invalid Date".
function ConvertTo-IsoDate($value) {
    if ($null -eq $value -or $value -eq '') { return '' }
    try {
        return ([datetime]$value).ToString('o')
    } catch {
        return [string]$value
    }
}

Import-Module ActiveDirectory -ErrorAction Stop

$DC = $env:AD_DC
if (-not $DC) { $DC = "dc01.corp.example.com" }

[Console]::Out.WriteLine("##READY##")
[Console]::Out.Flush()

# ─── FIX #3: LDAP-Sonderzeichen escapen ─────────────────────────────────────
# Escapet alle Zeichen die in LDAP-Filtern eine Sonderbedeutung haben.
# RFC 4515: ( ) * \ NUL und nicht-ASCII-Bytes
function Escape-LdapFilter {
    param([string]$Value)
    if ([string]::IsNullOrEmpty($Value)) { return "" }
    # Reihenfolge wichtig: \ zuerst escapen
    $escaped = $Value `
        -replace '\\', '\5c' `
        -replace '\*',  '\2a' `
        -replace '\(',  '\28' `
        -replace '\)',  '\29' `
        -replace '\x00','\00'
    return $escaped
}

# ─── Credential aus Payload ───────────────────────────────────────────────────
function Get-PayloadCredential {
    param([hashtable]$CredInfo)
    if (-not $CredInfo -or -not $CredInfo.username) { return $null }
    $secPwd = ConvertTo-SecureString $CredInfo.password -AsPlainText -Force
    return New-Object PSCredential ($CredInfo.username, $secPwd)
}

# ─── Ergebnis serialisieren ───────────────────────────────────────────────────
function Write-Result {
    param($Obj)
    $json = $Obj | ConvertTo-Json -Depth 6 -Compress
    [Console]::Out.WriteLine($json)
    [Console]::Out.WriteLine("##END##")
    [Console]::Out.Flush()
}

# ─── Citrix: erreichbaren Delivery Controller finden (Failover) ─────────────
function Get-CitrixController {
    # Aktualisiert: CDC1/CDC2 sind ausser Betrieb, aktuelle Controller sind
    # CDC3/CDC4/CDC5. Das erklaert rueckwirkend auch das "Zugriff verweigert"
    # auf CDC1 (war schlicht kein aktiver Controller mehr, keine reine
    # WinRM-Rechte-Frage wie zunaechst vermutet).
    $controllers = @(
        "ddc01.corp.example.com",
        "ddc02.corp.example.com",
        "ddc03.corp.example.com"
    )
    foreach ($ctrl in $controllers) {
        if (Test-Connection -ComputerName $ctrl -Count 1 -Quiet -ErrorAction SilentlyContinue) {
            return $ctrl
        }
    }
    return $null
}

# ─── FileDeploy (Datei auf einen Computer verteilen) ─────────────────────────
# Portiert aus dem Solo-Tool FileDeploy.ps1 (Schritte: Quelle, Erreichbarkeit,
# Admin-Share, Zielordner, Kopieren). Unterschied zum Solo-Tool: Der Zugriff
# auf \\PC\C$ und auf die Quelle laeuft NICHT mit dem Konto des Prozesses
# (Service_ConnOps), sondern mit den Zugangsdaten des angemeldeten ConnOps-
# Benutzers (Payload-Credential, per New-PSDrive eingebunden). Dadurch gelten
# genau dessen Rechte, und das Audit-Log nennt den richtigen Akteur.
# Alle Texte bewusst ASCII (siehe Roadmap: Encoding-Fehlerquelle).

function Get-FdBaseException {
    param($Ex)
    while ($Ex.InnerException) { $Ex = $Ex.InnerException }
    return $Ex
}

function New-FdStep {
    param([string]$State, [string]$Text, [string]$Detail = '')
    return @{ state = $State; text = $Text; detail = $Detail }
}

# Lokaler Windows-Pfad auf dem Zielcomputer, z. B. C:\install -> Laufwerk + Rest.
# Rueckgabe $null bei ungueltigem Pfad (kein Laufwerksbuchstabe, "..", Sonderzeichen).
function Split-FdTargetPath {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
    $m = [regex]::Match($Path.Trim(), '^([A-Za-z]):(\\.*)?$')
    if (-not $m.Success) { return $null }
    $rest = ''
    if ($m.Groups[2].Success) { $rest = $m.Groups[2].Value.Trim('\') }
    if ($rest -match '[<>"|?*/:]' -or $rest -match '(^|\\)\.\.?(\\|$)') { return $null }
    $drive = $m.Groups[1].Value.ToUpper()
    $display = if ($rest) { $drive + ':\' + $rest } else { $drive + ':\' }
    return @{ Drive = $drive; Rest = $rest; Display = $display }
}

# Quelle muss ein UNC-Pfad auf eine Datei sein: \\server\share\ordner\datei.ext
function Split-FdSourcePath {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
    $m = [regex]::Match($Path.Trim(), '^\\\\([^\\/:*?"<>|]+)\\([^\\/:*?"<>|]+)((\\[^\\/:*?"<>|]+)+)$')
    if (-not $m.Success) { return $null }
    $rel = $m.Groups[3].Value.TrimStart('\')
    if ($rel -match '(^|\\)\.\.?(\\|$)') { return $null }
    return @{
        Root = '\\' + $m.Groups[1].Value + '\' + $m.Groups[2].Value
        Rel  = $rel
        Leaf = (Split-Path $rel -Leaf)
    }
}

# Erreichbarkeit = SMB-Port 445 (kein Ping)
function Test-FdSmb {
    param([string]$Computer, [int]$TimeoutMs = 3000)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect($Computer, 445, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
            return @{ Ok = $false; Detail = 'Zeitueberschreitung bei der Verbindung zu TCP-Port 445' }
        }
        $client.EndConnect($iar)
        return @{ Ok = $true; Detail = '' }
    } catch {
        return @{ Ok = $false; Detail = (Get-FdBaseException $_.Exception).Message }
    } finally {
        $client.Close()
    }
}

# Bindet eine Freigabe mit den Benutzer-Zugangsdaten als temporaeres PSDrive ein.
function Connect-FdShare {
    param([string]$Root, [PSCredential]$Cred)
    $name = 'FD' + [guid]::NewGuid().ToString('N').Substring(0, 8)
    New-PSDrive -Name $name -PSProvider FileSystem -Root $Root -Credential $Cred -Scope Script -ErrorAction Stop | Out-Null
    return $name
}

function Disconnect-FdShare {
    param([string]$Name)
    if ($Name) { Remove-PSDrive -Name $Name -Scope Script -Force -ErrorAction SilentlyContinue }
}

function Test-FdComputerName {
    param([string]$Name)
    return ($Name -match '^[A-Za-z0-9._-]+$')
}

# Quelle-Browser: Ordner UNC-Pfad (\\server\share[\unterordner]) -> Unterordner UND Dateien.
function Split-FdSourceFolder {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
    $m = [regex]::Match($Path.Trim(), '^\\\\([^\\/:*?"<>|]+)\\([^\\/:*?"<>|]+)((\\[^\\/:*?"<>|]+)*)$')
    if (-not $m.Success) { return $null }
    $rel = $m.Groups[3].Value.TrimStart('\')
    if ($rel -match '(^|\\)\.\.?(\\|$)') { return $null }
    $root = '\\' + $m.Groups[1].Value + '\' + $m.Groups[2].Value
    $display = if ($rel) { $root + '\' + $rel } else { $root }
    return @{ Root = $root; Rel = $rel; Display = $display }
}

function Get-FdSourceEntries {
    param([string]$Path, [PSCredential]$Cred)

    if (-not $Cred) { return @{ ok = $false; error = 'Keine Benutzer-Zugangsdaten in der Sitzung.' } }
    $sf = Split-FdSourceFolder $Path
    if (-not $sf) { return @{ ok = $false; error = 'Ungueltiger Pfad (erwartet: \\server\share[\ordner]).' } }

    $drv = $null
    try {
        $drv = Connect-FdShare -Root $sf.Root -Cred $Cred
        $dir = $drv + ':\' + $sf.Rel
        $all = @(Get-ChildItem -LiteralPath $dir -ErrorAction Stop | Select-Object -First 2001)
        $truncated = ($all.Count -gt 2000)
        if ($truncated) { $all = @($all | Select-Object -First 2000) }
        $folders = @()
        $files   = @()
        foreach ($i in ($all | Sort-Object Name)) {
            $child = $sf.Display + '\' + $i.Name
            if ($i.PSIsContainer) { $folders += @{ name = $i.Name; path = $child } }
            else                  { $files   += @{ name = $i.Name; path = $child; size = [int64]$i.Length } }
        }
        return @{ ok = $true; data = @{ path = $sf.Display; folders = @($folders); files = @($files); truncated = $truncated } }
    } catch {
        return @{ ok = $false; error = (Get-FdBaseException $_.Exception).Message }
    } finally {
        Disconnect-FdShare $drv
    }
}

# Ordnerbaum: direkte Unterordner von $Path auf dem Computer (ohne versteckte).
function Get-FdFolders {
    param([string]$Computer, [string]$Path, [PSCredential]$Cred)

    if (-not $Cred) { return @{ ok = $false; error = 'Keine Benutzer-Zugangsdaten in der Sitzung.' } }
    if (-not (Test-FdComputerName $Computer)) { return @{ ok = $false; error = 'Ungueltiger Computername.' } }
    $tp = Split-FdTargetPath $Path
    if (-not $tp) { return @{ ok = $false; error = 'Ungueltiger Pfad.' } }

    $t = Test-FdSmb -Computer $Computer
    if (-not $t.Ok) { return @{ ok = $false; error = 'Computer nicht erreichbar (SMB): ' + $t.Detail } }

    $drv = $null
    try {
        $drv = Connect-FdShare -Root ('\\' + $Computer + '\' + $tp.Drive + '$') -Cred $Cred
        $dir = $drv + ':\' + $tp.Rest
        $items = @(Get-ChildItem -LiteralPath $dir -Directory -ErrorAction Stop | Sort-Object Name)
        $list = @()
        foreach ($i in $items) {
            $child = if ($tp.Rest) { $tp.Display + '\' + $i.Name } else { $tp.Display + $i.Name }
            $list += @{ name = $i.Name; path = $child }
        }
        return @{ ok = $true; data = @{ path = $tp.Display; folders = @($list) } }
    } catch {
        $ex = Get-FdBaseException $_.Exception
        $kind = if ($ex -is [System.UnauthorizedAccessException]) { 'AccessDenied' } else { 'Other' }
        return @{ ok = $false; error = $ex.Message; kind = $kind }
    } finally {
        Disconnect-FdShare $drv
    }
}

# Kopiervorgang mit Schrittprotokoll. Bricht beim ersten Fehler ab. Das Ergebnis
# ist auch bei Fehlschlag ok=$true (die Schritte SIND das Ergebnis); ok=$false
# nur bei ungueltigen Eingaben oder unerwarteten Ausnahmen.
function Invoke-FdCopy {
    param([string]$Computer, [string]$Source, [string]$DestDir, [PSCredential]$Cred)

    if (-not $Cred) { return @{ ok = $false; error = 'Keine Benutzer-Zugangsdaten in der Sitzung.' } }
    if (-not (Test-FdComputerName $Computer)) { return @{ ok = $false; error = 'Ungueltiger Computername.' } }
    $tp  = Split-FdTargetPath $DestDir
    if (-not $tp)  { return @{ ok = $false; error = 'Ungueltiger Zielpfad.' } }
    $src = Split-FdSourcePath $Source
    if (-not $src) { return @{ ok = $false; error = 'Ungueltiger Quellpfad (erwartet: \\server\share\...\datei).' } }

    $res = @{
        computer     = $Computer
        source       = $Source.Trim()
        targetDir    = $tp.Display
        fileName     = $src.Leaf
        sizeBytes    = $null
        sha256       = ''
        steps        = @{}
        overall      = 'Error'
        errorMessage = ''
        detail       = ''
    }

    $srcDrv = $null
    $dstDrv = $null
    try {
        # 1) Quelle einbinden und Datei pruefen
        try {
            $srcDrv  = Connect-FdShare -Root $src.Root -Cred $Cred
            $srcPath = $srcDrv + ':\' + $src.Rel
            $item = Get-Item -LiteralPath $srcPath -ErrorAction Stop
            if ($item.PSIsContainer) { throw 'Die Quelle ist ein Ordner, keine Datei.' }
            $res.sizeBytes = [int64]$item.Length
            $res.steps.source = New-FdStep 'Ok' ('Quelldatei erreichbar (' + [math]::Round($item.Length / 1MB, 2) + ' MB)')
        } catch {
            $ex = Get-FdBaseException $_.Exception
            $res.steps.source = New-FdStep 'Failed' 'Quelldatei nicht lesbar' $ex.Message
            $res.errorMessage = 'Quelldatei nicht lesbar'
            $res.detail = $ex.Message
            return @{ ok = $true; data = $res }
        }

        # 2) Computer erreichbar (SMB 445)?
        $t = Test-FdSmb -Computer $Computer
        if (-not $t.Ok) {
            $res.steps.reachability = New-FdStep 'Failed' 'Computer nicht erreichbar' $t.Detail
            $res.errorMessage = 'SMB-Verbindung nicht moeglich'
            $res.detail = $t.Detail
            return @{ ok = $true; data = $res }
        }
        $res.steps.reachability = New-FdStep 'Ok' 'Computer erreichbar'

        # 3) Administrativen Share mit Benutzer-Zugangsdaten einbinden
        $share = $tp.Drive + '$'
        try {
            $dstDrv = Connect-FdShare -Root ('\\' + $Computer + '\' + $share) -Cred $Cred
            $null = Get-ChildItem -LiteralPath ($dstDrv + ':\') -ErrorAction Stop | Select-Object -First 1
            $res.steps.adminShare = New-FdStep 'Ok' ('Zugriff auf ' + $share + ' moeglich')
        } catch {
            $ex = Get-FdBaseException $_.Exception
            $txt = if ($ex -is [System.UnauthorizedAccessException]) { 'Zugriff auf ' + $share + ' verweigert' } else { 'Zugriff auf ' + $share + ' nicht moeglich' }
            $res.steps.adminShare = New-FdStep 'Failed' $txt $ex.Message
            $res.errorMessage = $txt
            $res.detail = $ex.Message
            return @{ ok = $true; data = $res }
        }

        # 4) Zielordner vorhanden? Sonst erstellen.
        $dstDir = $dstDrv + ':\' + $tp.Rest
        try {
            if (Test-Path -LiteralPath $dstDir -PathType Container) {
                $res.steps.targetDirectory = New-FdStep 'Ok' 'Zielordner vorhanden'
            } else {
                New-Item -ItemType Directory -Path $dstDir -Force -ErrorAction Stop | Out-Null
                $res.steps.targetDirectory = New-FdStep 'Ok' 'Zielordner erstellt'
            }
        } catch {
            $ex = Get-FdBaseException $_.Exception
            $res.steps.targetDirectory = New-FdStep 'Failed' 'Zielordner konnte nicht erstellt werden' $ex.Message
            $res.errorMessage = 'Zielordner ' + $tp.Display + ' konnte nicht erstellt werden'
            $res.detail = $ex.Message
            return @{ ok = $true; data = $res }
        }

        # 5) Kopieren (vorhandene Datei wird ueberschrieben), Groesse gegenpruefen
        $dstFile = Join-Path $dstDir $src.Leaf
        try {
            Copy-Item -LiteralPath $srcPath -Destination $dstFile -Force -ErrorAction Stop
            $copied = Get-Item -LiteralPath $dstFile -ErrorAction Stop
            if ([int64]$copied.Length -ne $res.sizeBytes) {
                throw ('Groesse nach dem Kopieren weicht ab (Quelle ' + $res.sizeBytes + ', Ziel ' + $copied.Length + ' Bytes).')
            }
            $res.steps.copy = New-FdStep 'Ok' 'Datei kopiert'
        } catch {
            $ex = Get-FdBaseException $_.Exception
            $res.steps.copy = New-FdStep 'Failed' 'Datei konnte nicht kopiert werden' $ex.Message
            $res.errorMessage = 'Datei konnte nicht nach ' + $tp.Display + '\' + $src.Leaf + ' kopiert werden'
            $res.detail = $ex.Message
            return @{ ok = $true; data = $res }
        }

        # SHA-256 der Quelldatei fuers Audit-Log (kein Einfluss auf das Ergebnis)
        try { $res.sha256 = (Get-FileHash -LiteralPath $srcPath -Algorithm SHA256 -ErrorAction Stop).Hash } catch { }

        $res.overall = 'Success'
        return @{ ok = $true; data = $res }
    } catch {
        return @{ ok = $false; error = 'Unerwarteter Fehler: ' + (Get-FdBaseException $_.Exception).Message }
    } finally {
        Disconnect-FdShare $dstDrv
        Disconnect-FdShare $srcDrv
    }
}

# ─── Lokal angemeldeter Benutzer (Konsole) per CIM/DCOM ──────────────────────
# Win32_ComputerSystem.UserName liefert den an der KONSOLE angemeldeten Benutzer
# (leer, wenn niemand lokal angemeldet ist; RDP-/Citrix-gehostete Sitzungen
# erscheinen dort nicht). Zugriff mit den Zugangsdaten des ConnOps-Benutzers.
function Get-LocalLoggedOnUser {
    param([string]$Computer, [PSCredential]$Cred)

    if (-not $Cred) { return @{ ok = $false; error = 'Keine Benutzer-Zugangsdaten in der Sitzung.' } }
    if ($Computer -notmatch '^[A-Za-z0-9._-]+$') { return @{ ok = $false; error = 'Ungueltiger Computername.' } }

    # Schneller Erreichbarkeitstest (RPC/DCOM-Port 135), damit ein ausgeschalteter
    # Computer nicht erst nach dem langen CIM-Timeout auffaellt.
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect($Computer, 135, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne(3000, $false)) {
            return @{ ok = $false; error = 'Computer nicht erreichbar (TCP 135, Zeitueberschreitung).' }
        }
        $client.EndConnect($iar)
    } catch {
        return @{ ok = $false; error = 'Computer nicht erreichbar: ' + (Get-FdBaseException $_.Exception).Message }
    } finally {
        $client.Close()
    }

    $cim = $null
    try {
        $opt = New-CimSessionOption -Protocol Dcom
        $cim = New-CimSession -ComputerName $Computer -Credential $Cred -SessionOption $opt -OperationTimeoutSec 10 -ErrorAction Stop
        $cs  = Get-CimInstance -CimSession $cim -ClassName Win32_ComputerSystem -ErrorAction Stop
        $u   = [string]$cs.UserName
        return @{ ok = $true; data = @{ userName = $u } }
    } catch {
        return @{ ok = $false; error = (Get-FdBaseException $_.Exception).Message }
    } finally {
        if ($cim) { Remove-CimSession $cim -ErrorAction SilentlyContinue }
    }
}

# ─── Dispatcher ───────────────────────────────────────────────────────────────
function Invoke-Command-Safe {
    param([string]$Cmd, [hashtable]$Params, [PSCredential]$Cred)

    $adArgs = @{ Server = $DC; ErrorAction = "Stop" }
    if ($Cred) { $adArgs.Credential = $Cred }

    switch ($Cmd) {

        "SearchUsers" {
            # FIX #3: Query escapen bevor er in LDAP-Filter eingesetzt wird
            $safeQuery = Escape-LdapFilter $Params.query
            $filter    = "(|(sAMAccountName=*${safeQuery}*)(displayName=*${safeQuery}*))"
            $allUsers  = @()
            foreach ($ou in $Params.ouList) {
                try {
                    $users = Get-ADUser -LDAPFilter $filter `
                        -SearchBase $ou -SearchScope Subtree `
                        -Properties DisplayName,Enabled,LockedOut,Department,DistinguishedName `
                        @adArgs
                    $allUsers += $users
                } catch { }
            }
            return @{ ok = $true; data = @($allUsers | Select-Object SamAccountName, DisplayName, Enabled, LockedOut, Department, DistinguishedName) }
        }

        "EnableUser" {
            $u = Get-ADUser -Identity $Params.sam -Properties DistinguishedName @adArgs
            Enable-ADAccount -Identity $u @adArgs
            if ($Params.targetOU) {
                Move-ADObject -Identity $u.DistinguishedName -TargetPath $Params.targetOU @adArgs
            }
            return @{ ok = $true; data = @{ sam = $Params.sam } }
        }

        "DisableUser" {
            $u = Get-ADUser -Identity $Params.sam -Properties DistinguishedName,Enabled @adArgs
            Set-ADObject -Identity $u.DistinguishedName -ProtectedFromAccidentalDeletion $false @adArgs
            if ($u.Enabled) { Disable-ADAccount -Identity $u @adArgs }
            $originalOU = $u.DistinguishedName -replace '^CN=[^,]+,', ''
            Move-ADObject -Identity $u.DistinguishedName -TargetPath $Params.targetOU @adArgs
            return @{ ok = $true; data = @{ sam = $Params.sam; originalOU = $originalOU } }
        }

        "UnlockUser" {
            Unlock-ADAccount -Identity $Params.sam @adArgs
            return @{ ok = $true; data = @{ sam = $Params.sam } }
        }

        "ResetPassword" {
            $secPwd = ConvertTo-SecureString $Params.newPassword -AsPlainText -Force
            Set-ADAccountPassword -Identity $Params.sam -Reset -NewPassword $secPwd @adArgs
            Set-ADUser -Identity $Params.sam `
                -ChangePasswordAtLogon ([bool]$Params.mustChange) `
                -CannotChangePassword  ([bool]$Params.cannotChange) `
                @adArgs
            return @{ ok = $true; data = @{ sam = $Params.sam } }
        }

        "EditUser" {
            $setArgs = @{ Identity = $Params.sam; Server = $DC; ErrorAction = "Stop" }
            if ($Cred) { $setArgs.Credential = $Cred }
            # changes ist PSCustomObject – in Hashtable konvertieren
            $changes = if ($Params.changes) { ConvertTo-Hashtable $Params.changes } else { @{} }
            $allowed = @("GivenName","Surname","DisplayName","Title","Department",
                         "Office","OfficePhone","MobilePhone","Description")
            foreach ($field in $allowed) {
                if ($changes.ContainsKey($field)) {
                    $setArgs[$field] = $changes[$field]
                }
            }
            Set-ADUser @setArgs
            if ($changes.ContainsKey("AccountExpires")) {
                $exp = $changes["AccountExpires"]
                if ($null -eq $exp -or $exp -eq "") {
                    Set-ADAccountExpiration -Identity $Params.sam -DateTime ([DateTime]::MaxValue) @adArgs
                } else {
                    Set-ADAccountExpiration -Identity $Params.sam -DateTime ([DateTime]$exp) @adArgs
                }
            }
            return @{ ok = $true; data = @{ sam = $Params.sam } }
        }

        "GetUserGroups" {
            $userObj = Get-ADUser -Identity $Params.sam -Properties memberOf @adArgs
            $groups  = @()
            if ($userObj.memberOf) {
                foreach ($dn in $userObj.memberOf) {
                    # KEIN eigenes try/catch mehr (Entscheidung 10.09.2026,
                    # Pre-Change-Snapshot fuer Gruppen): ein Aufloesungsfehler
                    # bei EINER Gruppe soll den GESAMTEN Aufruf fehlschlagen
                    # lassen, nicht stillschweigend nur diese eine Gruppe
                    # aus der Liste verschwinden lassen. Wird vom aeusseren
                    # Dispatch-catch (Ende der Datei) sauber als
                    # { ok = $false; error = ... } zurueckgegeben.
                    $g = Get-ADGroup -Identity $dn -Properties Name,SamAccountName @adArgs
                    $groups += @{
                        Name              = $g.Name
                        SamAccountName    = $g.SamAccountName
                        DistinguishedName = $dn
                        ObjectGuid        = $g.ObjectGUID.ToString()
                    }
                }
            }
            return @{ ok = $true; data = $groups }
        }

        "GetUser" {
            $u = Get-ADUser -Identity $Params.sam `
                -Properties DisplayName,Enabled,DistinguishedName,Department,Title,ProtectedFromAccidentalDeletion `
                @adArgs
            return @{ ok = $true; data = @{
                sam             = $u.SamAccountName
                displayName     = $u.DisplayName
                enabled         = $u.Enabled
                distinguishedName = $u.DistinguishedName
                department      = $u.Department
                title           = $u.Title
                protectedFromAccidentalDeletion = $u.ProtectedFromAccidentalDeletion
            }}
        }

        "AddGroupMember" {
            Add-ADGroupMember -Identity $Params.groupDn -Members $Params.sam @adArgs
            return @{ ok = $true; data = @{ sam = $Params.sam; groupDn = $Params.groupDn } }
        }

        "RemoveGroupMember" {
            Remove-ADGroupMember -Identity $Params.groupDn -Members $Params.sam -Confirm:$false @adArgs
            return @{ ok = $true; data = @{ sam = $Params.sam; groupDn = $Params.groupDn } }
        }

        "GetAllGroups" {
            $groups = @()
            foreach ($ou in $Params.ouList) {
                try {
                    $g = Get-ADGroup -Filter * -SearchBase $ou -Properties Name,SamAccountName @adArgs
                    $groups += $g | Select-Object Name, SamAccountName, DistinguishedName
                } catch { }
            }
            return @{ ok = $true; data = @($groups | Sort-Object Name -Unique) }
        }

        "GetHealthUsers" {
            # Liefert gesperrte Accounts + Accounts mit LastLogon > N Tagen
            # sowie demnächst auslaufende Accounts (AccountExpirationDate).
            $thresholdDays = if ($Params.thresholdDays) { [int]$Params.thresholdDays } else { 90 }
            $expiringDays  = if ($Params.expiringDays)  { [int]$Params.expiringDays }  else { 14 }
            $cutoff        = (Get-Date).AddDays(-$thresholdDays)
            $expiryWindow  = (Get-Date).AddDays($expiringDays)

            $locked   = @()
            $inactive = @()
            $expiring = @()

            foreach ($ou in $Params.ouList) {
                try {
                    $users = Get-ADUser -Filter * -SearchBase $ou -SearchScope Subtree `
                        -Properties DisplayName,Enabled,LockedOut,LastLogonDate,AccountExpirationDate `
                        @adArgs

                    foreach ($u in $users) {
                        if ($u.LockedOut) {
                            $locked += @{
                                sam = $u.SamAccountName
                                displayName = $u.DisplayName
                            }
                        }
                        if ($u.Enabled -and (-not $u.LastLogonDate -or $u.LastLogonDate -lt $cutoff)) {
                            $inactive += @{
                                sam = $u.SamAccountName
                                displayName = $u.DisplayName
                                lastLogon = if ($u.LastLogonDate) { $u.LastLogonDate.ToString("o") } else { $null }
                            }
                        }
                        if ($u.Enabled -and $u.AccountExpirationDate -and $u.AccountExpirationDate -lt $expiryWindow -and $u.AccountExpirationDate -gt (Get-Date)) {
                            $expiring += @{
                                sam = $u.SamAccountName
                                displayName = $u.DisplayName
                                expires = $u.AccountExpirationDate.ToString("o")
                            }
                        }
                    }
                } catch { }
            }

            return @{ ok = $true; data = @{
                locked   = @($locked)
                inactive = @($inactive)
                expiring = @($expiring)
            }}
        }

        "GetHealthComputers" {
            # Liefert AD-Computer mit LastLogon > N Tagen (inkl. Namen für Docusnap-Abgleich)
            $thresholdDays = if ($Params.thresholdDays) { [int]$Params.thresholdDays } else { 90 }
            $cutoff        = (Get-Date).AddDays(-$thresholdDays)

            $inactive = @()
            $allNames = @()

            foreach ($ou in $Params.ouList) {
                try {
                    $computers = Get-ADComputer -Filter * -SearchBase $ou -SearchScope Subtree `
                        -Properties Enabled,LastLogonDate `
                        @adArgs

                    foreach ($c in $computers) {
                        $allNames += $c.Name
                        if ($c.Enabled -and (-not $c.LastLogonDate -or $c.LastLogonDate -lt $cutoff)) {
                            $inactive += @{
                                name = $c.Name
                                lastLogon = if ($c.LastLogonDate) { $c.LastLogonDate.ToString("o") } else { $null }
                            }
                        }
                    }
                } catch { }
            }

            return @{ ok = $true; data = @{
                inactive = @($inactive)
                allNames = @($allNames)
            }}
        }

        "SearchComputers" {
            # FIX #3: Computer-Query ebenfalls escapen
            $safeQuery = Escape-LdapFilter $Params.query
            $filter    = "(name=*${safeQuery}*)"
            $allComputers = @()
            foreach ($ou in $Params.ouList) {
                try {
                    $computers = Get-ADComputer -LDAPFilter $filter `
                        -SearchBase $ou -SearchScope Subtree `
                        -Properties Enabled,DistinguishedName `
                        @adArgs
                    $allComputers += $computers
                } catch { }
            }
            return @{ ok = $true; data = @($allComputers | Select-Object Name, Enabled, DistinguishedName) }
        }

        "DisableComputer" {
            $c = Get-ADComputer -Identity $Params.name -Properties DistinguishedName,Enabled @adArgs
            Set-ADObject -Identity $c.DistinguishedName -ProtectedFromAccidentalDeletion $false @adArgs
            if ($c.Enabled) { Disable-ADAccount -Identity $c @adArgs }
            $originalOU = $c.DistinguishedName -replace '^CN=[^,]+,', ''
            Move-ADObject -Identity $c.DistinguishedName -TargetPath $Params.targetOU @adArgs
            return @{ ok = $true; data = @{ name = $Params.name; originalOU = $originalOU } }
        }

        "EnableComputer" {
            $c = Get-ADComputer -Identity $Params.name -Properties DistinguishedName @adArgs
            Enable-ADAccount -Identity $c @adArgs
            if ($Params.targetOU) {
                Move-ADObject -Identity $c.DistinguishedName -TargetPath $Params.targetOU @adArgs
            }
            return @{ ok = $true; data = @{ name = $Params.name } }
        }

        "CreateUser" {
            $secPwd = ConvertTo-SecureString $Params.initialPassword -AsPlainText -Force
            New-ADUser `
                -SamAccountName   $Params.sam `
                -GivenName        $Params.firstName `
                -Surname          $Params.lastName `
                -DisplayName      $Params.displayName `
                -EmailAddress     $Params.email `
                -OfficePhone      $Params.phoneNumber `
                -Department       $Params.department `
                -Path             $Params.targetOU `
                -AccountPassword  $secPwd `
                -Enabled          ([bool]$Params.enabled) `
                -ChangePasswordAtLogon $true `
                @adArgs
            return @{ ok = $true; data = @{ sam = $Params.sam } }
        }

        "TestLogin" {
            # Get-ADUser mit Credential reicht zum Verifizieren – kein Get-ADDomain nötig
            $user = Get-ADUser -Identity $Params.sam `
                -Properties DisplayName,MemberOf `
                -Server $DC -Credential $Cred `
                -ErrorAction Stop
            return @{ ok = $true; data = @{
                sam         = $user.SamAccountName
                displayName = $user.DisplayName
                memberOf    = @($user.MemberOf)
            }}
        }


        "CitrixLogoff" {
            # Citrix Session abmelden via Delivery Controller
            # 1. Erreichbaren Controller finden (Failover)
            # 2. Nachricht senden (60s Vorwarnung)
            # 3. 60 Sekunden warten
            # 4. Session beenden

            $controller = Get-CitrixController
            if (-not $controller) {
                return @{ ok = $false; error = "Kein erreichbarer Delivery Controller gefunden." }
            }

            $sessionUid  = [int]$Params.sessionUid
            $userName    = $Params.userName
            if (-not $sessionUid) {
                return @{ ok = $false; error = "sessionUid fehlt oder ungueltig." }
            }

            # Nachricht senden
            try {
                Invoke-Command -ComputerName $controller -Credential $Cred -ScriptBlock {
                    param($uid, $msg)
                    Add-PSSnapin Citrix.* -ErrorAction SilentlyContinue
                    $s = Get-BrokerSession -Uid $uid -ErrorAction SilentlyContinue
                    if ($s) {
                        Send-BrokerSessionMessage -InputObject $s `
                            -MessageStyle Information `
                            -Title "IT-Hinweis" `
                            -Text $msg
                    }
                } -ArgumentList $sessionUid, "Ihre Sitzung wird in 60 Sekunden beendet. Bitte speichern Sie Ihre Arbeit." -ErrorAction Stop
            } catch {
                return @{ ok = $false; error = "Fehler beim Senden der Nachricht: $($_.Exception.Message)" }
            }

            # 60 Sekunden warten
            Start-Sleep -Seconds 60

            # Session beenden
            try {
                Invoke-Command -ComputerName $controller -Credential $Cred -ScriptBlock {
                    param($uid)
                    Add-PSSnapin Citrix.* -ErrorAction SilentlyContinue
                    $s = Get-BrokerSession -Uid $uid -ErrorAction SilentlyContinue
                    if ($s) { $s | Stop-BrokerSession }
                    # Keine Session mehr = Benutzer hat sich selbst abgemeldet, kein Fehler
                } -ArgumentList $sessionUid -ErrorAction Stop
            } catch {
                return @{ ok = $false; error = "Fehler beim Beenden der Session: $($_.Exception.Message)" }
            }

            return @{ ok = $true; data = @{ userName = $userName; controller = $controller } }
        }

        "GetCitrixSessions" {
            # Alle aktuellen Sessions live vom Delivery Controller lesen.
            # Ersetzt die fruehere CSV-Quelle (seit Server-Umstellung nicht
            # mehr befuellt). Rein lesend, keine Aenderung an Sessions.

            $controller = Get-CitrixController
            if (-not $controller) {
                return @{ ok = $false; error = "Kein erreichbarer Delivery Controller gefunden." }
            }

            try {
                $sessions = Invoke-Command -ComputerName $controller -Credential $Cred -ScriptBlock {
                    Add-PSSnapin Citrix.* -ErrorAction SilentlyContinue
                    Get-BrokerSession -MaxRecordCount 2000 -ErrorAction Stop |
                        Select-Object UserName, UserFullName, ClientName, MachineName,
                                       HostedMachineName, DNSName, SessionState, StartTime,
                                       SessionStateChangeTime, IdleSince, Protocol, Uid,
                                       SessionId, DesktopGroupName, ClientAddress, AppState
                } -ErrorAction Stop

                # PSCustomObject aus Invoke-Command sauber in einfache Hashtables wandeln,
                # damit ConvertTo-Json in Write-Result sie zuverlaessig serialisiert.
                $data = @($sessions | ForEach-Object {
                    @{
                        userName               = [string]$_.UserName
                        userFullName           = [string]$_.UserFullName
                        clientName              = [string]$_.ClientName
                        machineName             = [string]$_.MachineName
                        hostedMachineName       = [string]$_.HostedMachineName
                        dnsName                 = [string]$_.DNSName
                        sessionState            = [string]$_.SessionState
                        startTime               = ConvertTo-IsoDate $_.StartTime
                        sessionStateChangeTime  = ConvertTo-IsoDate $_.SessionStateChangeTime
                        idleSince               = ConvertTo-IsoDate $_.IdleSince
                        protocol                = [string]$_.Protocol
                        uid                     = [string]$_.Uid
                        sessionId               = [string]$_.SessionId
                        desktopGroupName        = [string]$_.DesktopGroupName
                        clientAddress           = [string]$_.ClientAddress
                        appState                = [string]$_.AppState
                    }
                })

                return @{ ok = $true; data = @{ controller = $controller; sessions = $data } }
            } catch {
                return @{ ok = $false; error = "Fehler beim Lesen der Sessions: $($_.Exception.Message)" }
            }
        }
		"ExchangeMailbox" {
            # Mailbox aktivieren und/oder konfigurieren via Remote-PSSession
            # Kerberos-Auth mit Service_Exchange-Account aus Payload-Credential
            # Params: sam, database, sizeMb, action ("enable" | "configure" | "both")

            $exchangeUri = "http://exchange01.corp.example.com/PowerShell/"
            $sessionOptions = New-PSSessionOption -SkipCACheck -SkipCNCheck
            $session = $null

            try {
                $session = New-PSSession `
                    -ConfigurationName Microsoft.Exchange `
                    -ConnectionUri     $exchangeUri `
                    -Authentication    Kerberos `
                    -Credential        $Cred `
                    -SessionOption     $sessionOptions `
                    -ErrorAction       Stop

                $sam      = $Params.sam
                $database = $Params.database
                $sizeMb   = if ($Params.sizeMb) { [int]$Params.sizeMb } else { $null }
                $action   = if ($Params.action)  { $Params.action }      else { "both" }

                if ($action -eq "enable" -or $action -eq "both") {
                    Invoke-Command -Session $session -ScriptBlock {
                        param($sam, $database)
                        Enable-Mailbox -Identity $sam -Database $database -ErrorAction Stop
                    } -ArgumentList $sam, $database -ErrorAction Stop
                }

                if ($action -eq "configure" -or $action -eq "both") {
                    Invoke-Command -Session $session -ScriptBlock {
                        param($sam, $sizeMb)
                        $quota = if ($sizeMb) { "$($sizeMb)MB" } else { "unlimited" }
                        $warn  = if ($sizeMb) { "$([int]($sizeMb * 0.9))MB" } else { "unlimited" }
                        Set-Mailbox `
                            -Identity                  $sam `
                            -EmailAddressPolicyEnabled $true `
                            -ProhibitSendReceiveQuota  $quota `
                            -ProhibitSendQuota         $quota `
                            -IssueWarningQuota         $warn `
                            -ErrorAction               Stop
                    } -ArgumentList $sam, $sizeMb -ErrorAction Stop
                }

                return @{ ok = $true; data = @{ sam = $sam; action = $action } }

            } catch {
                return @{ ok = $false; error = "Exchange-Fehler ($($Params.action)): $($_.Exception.Message)" }
            } finally {
                if ($session) { Remove-PSSession $session -ErrorAction SilentlyContinue }
            }
        }
"CheckOU" {
            # Prüft ob eine OU in AD existiert
            # Params: ou (Distinguished Name)
            try {
                $ou = Get-ADOrganizationalUnit -Identity $Params.ou @adArgs
                return @{ ok = $true; data = @{ exists = $true; ou = $Params.ou } }
            } catch {
                return @{ ok = $true; data = @{ exists = $false; ou = $Params.ou } }
            }
        }

        "ListOUs" {
            # Liefert alle OUs unterhalb der Domäne für Auswahlmenüs (z.B.
            # Abteilungs-Konfiguration), damit dort nicht der vollständige DN
            # per Hand eingetippt werden muss.
            # Params: baseDN
            try {
                $ous = Get-ADOrganizationalUnit -Filter * -SearchBase $Params.baseDN -SearchScope Subtree `
                    -Properties DistinguishedName, Name @adArgs |
                    Sort-Object DistinguishedName |
                    Select-Object Name, DistinguishedName

                $data = @($ous | ForEach-Object {
                    @{ name = $_.Name; dn = $_.DistinguishedName }
                })
                return @{ ok = $true; data = $data }
            } catch {
                return @{ ok = $false; error = "AD-Fehler bei ListOUs: $($_.Exception.Message)" }
            }
        }

        "CheckExchangeDatabase" {
            $exchangeUri    = "http://exchange01.corp.example.com/PowerShell/"
            $sessionOptions = New-PSSessionOption -SkipCACheck -SkipCNCheck
            $session        = $null
            try {
                $session = New-PSSession `
                    -ConfigurationName Microsoft.Exchange `
                    -ConnectionUri     $exchangeUri `
                    -Authentication    Kerberos `
                    -Credential        $Cred `
                    -SessionOption     $sessionOptions `
                    -ErrorAction       Stop

                $result = Invoke-Command -Session $session -ScriptBlock {
                    param($dbName)
                    $db = Get-MailboxDatabase -Identity $dbName -Status -ErrorAction Stop
                    return @{
                        exists  = $true
                        mounted = ($db.Mounted -eq $true)
                        name    = $db.Name
                    }
                } -ArgumentList $Params.database -ErrorAction Stop

                return @{ ok = $true; data = $result }
            } catch {
                return @{ ok = $true; data = @{
                    exists  = $false
                    mounted = $false
                    name    = $Params.database
                    error   = $_.Exception.Message
                }}
            } finally {
                if ($session) { Remove-PSSession $session -ErrorAction SilentlyContinue }
            }
        }
		
		"CheckGroup" {
            # Prüft ob eine AD-Gruppe per DN auflösbar ist
            try {
                $g = Get-ADGroup -Identity $Params.groupDn @adArgs
                return @{ ok = $true; data = @{ exists = $true; name = $g.Name; dn = $Params.groupDn } }
            } catch {
                return @{ ok = $true; data = @{ exists = $false; dn = $Params.groupDn } }
            }
        }

        "PingExchange" {
            # Erreichbarkeits-Check Exchange — kein spezifischer DB-Name nötig
            $exchangeUri    = "http://exchange01.corp.example.com/PowerShell/"
            $sessionOptions = New-PSSessionOption -SkipCACheck -SkipCNCheck
            $session        = $null
            try {
                $session = New-PSSession `
                    -ConfigurationName Microsoft.Exchange `
                    -ConnectionUri     $exchangeUri `
                    -Authentication    Kerberos `
                    -Credential        $Cred `
                    -SessionOption     $sessionOptions `
                    -ErrorAction       Stop

                $dbs = Invoke-Command -Session $session -ScriptBlock {
                    @(Get-MailboxDatabase -ErrorAction Stop).Count
                } -ErrorAction Stop

                return @{ ok = $true; data = @{ databases = $dbs } }
            } catch {
                return @{ ok = $false; error = $_.Exception.Message }
            } finally {
                if ($session) { Remove-PSSession $session -ErrorAction SilentlyContinue }
            }
        }
		
        "GetLocalUser" {
            # Params: computer
            return Get-LocalLoggedOnUser -Computer ([string]$Params.computer) -Cred $Cred
        }

        "FileDeployListFolders" {
            # Ordnerbaum fuer die Zielordner-Auswahl (nur lesend).
            # Params: computer, path (z. B. "C:\" oder "C:\install")
            return Get-FdFolders -Computer ([string]$Params.computer) -Path ([string]$Params.path) -Cred $Cred
        }

        "FileDeployListSource" {
            # Quelle-Browser (Ordner + Dateien) auf einer UNC-Freigabe, nur lesend.
            # Params: path (\\server\share[\ordner])
            return Get-FdSourceEntries -Path ([string]$Params.path) -Cred $Cred
        }

        "FileDeployCopy" {
            # Datei von UNC-Quelle auf Computer kopieren, mit Benutzer-Credential.
            # Params: computer, source (\\server\share\...), destDir (z. B. "C:\install")
            return Invoke-FdCopy -Computer ([string]$Params.computer) -Source ([string]$Params.source) `
                -DestDir ([string]$Params.destDir) -Cred $Cred
        }

        default {
            return @{ ok = $false; error = "Unbekanntes Kommando: $Cmd" }
        }
    }
}

# ─── Haupt-Loop ───────────────────────────────────────────────────────────────

# Hilfsfunktion: PSCustomObject → Hashtable (ConvertFrom-Json liefert PSCustomObject)
function ConvertTo-Hashtable {
    param($obj)
    if ($null -eq $obj) { return @{} }
    $ht = @{}
    $obj.PSObject.Properties | ForEach-Object { $ht[$_.Name] = $_.Value }
    return $ht
}

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    $line = $line.Trim()
    if (-not $line) { continue }

    try {
        $payload = $line | ConvertFrom-Json
        $cmd     = $payload.cmd
        $params  = if ($payload.params) { ConvertTo-Hashtable $payload.params } else { @{} }
        $credRaw = if ($payload.credential) { ConvertTo-Hashtable $payload.credential } else { $null }
        $cred    = Get-PayloadCredential $credRaw

        $result = Invoke-Command-Safe -Cmd $cmd -Params $params -Cred $cred
        Write-Result $result

    } catch {
        Write-Result @{ ok = $false; error = $_.Exception.Message }
    }
}