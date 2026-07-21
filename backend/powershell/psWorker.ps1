# psWorker.ps1
#
# FIX #3: LDAP-Injection-Escaping in allen LDAP-Filter-Strings
# FIX #3: Computer-Filter ebenfalls gesichert

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# UTF-8-Ausgabekodierung erzwingen (behebt kaputte Umlaute wie "S_nke" statt
# "Soenke" in AD-Namen). Windows PowerShell 5.1 schreibt auf die Konsole
# standardmaessig oft in der System-Codepage statt UTF-8, waehrend Node die
# stdout-Bytes als UTF-8 interpretiert (chunk.toString()) - ohne diese Zeilen
# ergibt jedes Byte oberhalb von 127 (Umlaute, Eszett) falsche Zeichen.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
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
if (-not $DC) { $DC = "dc1.musterstadt.example" }

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
        "CTX-DC1.musterstadt.example",
        "CTX-DC2.musterstadt.example",
        "CTX-DC3.musterstadt.example"
    )
    foreach ($ctrl in $controllers) {
        if (Test-Connection -ComputerName $ctrl -Count 1 -Quiet -ErrorAction SilentlyContinue) {
            return $ctrl
        }
    }
    return $null
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
                    try {
                        $g = Get-ADGroup -Identity $dn -Properties Name,SamAccountName @adArgs
                        $groups += @{ Name = $g.Name; SamAccountName = $g.SamAccountName; DistinguishedName = $dn }
                    } catch { }
                }
            }
            return @{ ok = $true; data = $groups }
        }

        "GetUser" {
            $u = Get-ADUser -Identity $Params.sam `
                -Properties DisplayName,Enabled,DistinguishedName,Department,Title `
                @adArgs
            return @{ ok = $true; data = @{
                sam             = $u.SamAccountName
                displayName     = $u.DisplayName
                enabled         = $u.Enabled
                distinguishedName = $u.DistinguishedName
                department      = $u.Department
                title           = $u.Title
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

            $exchangeUri = "http://mail1.musterstadt.example/PowerShell/"
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

        "CheckExchangeDatabase" {
            $exchangeUri    = "http://mail1.musterstadt.example/PowerShell/"
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
            $exchangeUri    = "http://mail1.musterstadt.example/PowerShell/"
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