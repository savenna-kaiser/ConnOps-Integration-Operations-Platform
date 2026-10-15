# SECURITY.md
# Sicherheitsumsetzung — ConnOps

---

## Kapitel 1 — Einleitung

### Zweck dieses Dokuments

Dieses Dokument beschreibt die technische Umsetzung der in `ARCHITECTURE.md` festgelegten
Sicherheitsprinzipien. Es beantwortet, wie die in `ARCHITECTURE.md` Kapitel 8 festgelegten
Grundsätze technisch umgesetzt werden: Authentifizierungsverfahren, Autorisierung,
Sitzungsverwaltung, Secrets-Management, Transportverschlüsselung und sicherheitsrelevante
Anforderungen an einzelne Schnittstellen.

`SECURITY.md` trifft damit keine eigenen Sicherheitsprinzipien. Es setzt die in
`ARCHITECTURE.md` Kapitel 8 (Sicherheitsarchitektur) beschriebenen Grundsätze — Schichtgrenzen
als Sicherheitsgrenzen, Permissions statt Rollen, Vertrauensgrenzen zwischen Plattform und
externen Systemen, Konfiguration außerhalb des Codes — in eine konkrete technische Form um. Wo
dieses Dokument ein Sicherheitsverfahren beschreibt, ist stets `ARCHITECTURE.md` Kapitel 8 die
Grundlage, aus der sich dieses Verfahren ableitet.

### Abgrenzung zu `ARCHITECTURE.md`

`ARCHITECTURE.md` Kapitel 8 beantwortet, welche Sicherheitsgrundsätze gelten und warum sie
gelten. `SECURITY.md` beantwortet, wie diese Grundsätze technisch umgesetzt werden. Eine
Aussage über die Begründung eines Sicherheitsprinzips gehört deshalb auch dann in
`ARCHITECTURE.md`, wenn sie im Zusammenhang mit einem in diesem Dokument beschriebenen
Verfahren steht. `SECURITY.md` verweist in solchen Fällen auf `ARCHITECTURE.md`, statt die
Begründung zu wiederholen.

`SECURITY.md` beschreibt die Sicherheitsumsetzung innerhalb des durch `ARCHITECTURE.md`
vorgegebenen architektonischen Rahmens. Es trifft keine Aussagen, die den in `ARCHITECTURE.md`
definierten architektonischen Rahmen verändern oder erweitern.

### Abgrenzung zu `TECHNICAL.md`

`TECHNICAL.md` beschreibt, welche technischen Kommunikations- und Infrastrukturmechanismen
existieren. `SECURITY.md` beschreibt, wie diese Mechanismen abgesichert werden. Ein
Kommunikationsweg — etwa die PowerShell-Bridge oder die REST-API — wird in `SECURITY.md` nicht
erneut beschrieben; `SECURITY.md` setzt ihn als bekannt voraus und ergänzt ausschließlich seine
sicherheitsrelevanten Eigenschaften, etwa das verwendete Authentifizierungsverfahren.

### Abgrenzung zu weiteren Fachdokumenten

`SECURITY.md` beschreibt die Sicherheitsumsetzung der Plattform vollständig. Für einzelne
angrenzende Aspekte sind eigene Fachdokumente zuständig, die `SECURITY.md` nicht dupliziert:

| Dokument | Zuständig für |
|---|---|
| `API.md` | Fachliche API-Endpunkte und ihre Semantik |
| `PATTERNS.md` | Wiederkehrende Implementierungsmuster |
| `DEPLOYMENT.md` | Netzwerkports, Firewalls, Installation |
| `OPERATIONS.md` | Logging als Betriebsfunktion, laufende Überwachung sicherheitsrelevanter Ereignisse |

Die Zuständigkeiten sicherheitsrelevanter Themen werden in Kapitel 2 festgelegt.

### Zielgruppe

Dieses Dokument richtet sich an Personen, die die Plattform sicherheitstechnisch
weiterentwickeln, prüfen oder in ihre Sicherheitsumsetzung einarbeiten — insbesondere
Entwickler und Administratoren mit grundlegenden Kenntnissen der eingesetzten
Authentifizierungs- und Autorisierungsverfahren. Es dient nicht als Betriebshandbuch für den
laufenden Sicherheitsbetrieb; dieser Zweck ist `OPERATIONS.md` vorbehalten. Es dient außerdem
nicht als Referenz für die fachliche API-Beschreibung oder für architektonische
Grundsatzentscheidungen.

---

## Kapitel 2 — Zuständigkeit für sicherheitsrelevante Themen

### Zweck dieses Kapitels

Die Matrix legt die dokumentarische Zuständigkeit sicherheitsrelevanter Themen fest. Alle
folgenden Kapitel orientieren sich an dieser Zuordnung.

### Zuständigkeitsmatrix

| Thema | Zuständiges Dokument |
|---|---|
| Sicherheitsprinzipien (Schichtgrenzen, Permissions statt Rollen, Vertrauensgrenzen, Konfiguration/Geheimnisse) | `ARCHITECTURE.md` |
| Konkrete Authentifizierungsverfahren je Integration | `SECURITY.md` |
| Autorisierung / technische RBAC-Umsetzung | `SECURITY.md` |
| Sitzungsverwaltung (Session Management, Session Lifetime, Session Secret, Cookie Security) | `SECURITY.md` |
| Secrets-Management (Speicherorte, Verschlüsselung, Rotation) | `SECURITY.md` |
| Transportverschlüsselung (HTTPS, TLS, Zertifikate) | `SECURITY.md` |
| Vertrauensgrenzen und Angriffsflächen — technische Umsetzung | `SECURITY.md` |
| Sicherheitsrelevante Konfigurationsparameter | `SECURITY.md` |
| Sicherheitsrelevante API-Aspekte (Authentifizierung, Autorisierung, Sicherheitsanforderungen an Endpunkte) | `SECURITY.md` |
| Fachliche API-Endpunkte und Semantik | `API.md` |
| Logging/Auditing als Sicherheitsmaßnahme | `SECURITY.md` |
| Logging als Betriebsfunktion | `OPERATIONS.md` |
| Netzwerkports, Firewalls, Installation | `DEPLOYMENT.md` |
| Laufende Überwachung sicherheitsrelevanter Ereignisse | `OPERATIONS.md` |
| Kommunikationswege und -mechanismen | `TECHNICAL.md` |

### Erweiterung dieser Matrix

Neue sicherheitsrelevante Themen werden dieser Matrix hinzugefügt, sobald sie für die Plattform
relevant werden. Eine Erweiterung der Matrix ist keine Architekturentscheidung, sofern
lediglich ein neues Thema einem bereits bestehenden Dokument zugeordnet wird. Erfordert ein
neues Thema dagegen eine neue Zuständigkeitskategorie oder ein neues Dokument, ist dies
zunächst als Dokumentationsfrage gemäß `DOCUMENTATION.md` zu klären.

### Grenzen dieses Kapitels

Dieses Kapitel legt ausschließlich Zuständigkeiten fest und begründet diese Zuständigkeiten
nicht. Es enthält keine inhaltlichen Aussagen zu den aufgeführten Themen selbst — diese folgen
in den weiteren Kapiteln dieses Dokuments beziehungsweise in den jeweils zuständigen
Fachdokumenten.

---

## Kapitel 3 — Authentifizierung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, wie sich Benutzer und externe Systeme gegenüber ConnOps
authentifizieren. Es setzt die in `DECISIONS.md` getroffenen Entscheidungen zur
AD-gebundenen Benutzeranmeldung (ADR-018) und zur Webhook-Authentifizierung (ADR-019) voraus
und beschreibt deren technische Umsetzung.

### Authentifizierung von Benutzern

Benutzer authentifizieren sich an ConnOps mit ihren Active-Directory-Anmeldedaten. Active
Directory ist die einzige Quelle für die Identität eines Benutzers; ConnOps verwaltet keine
eigenen Benutzerkonten und speichert keine Benutzerpasswörter.

Nach erfolgreicher Authentifizierung erstellt ConnOps eine eigene Anwendungssitzung. Nach
erfolgreicher Anmeldung findet keine erneute Authentifizierung des Benutzers gegenüber Active
Directory statt; alle weiteren Anfragen werden ausschließlich anhand der bestehenden
Anwendungssitzung authentifiziert. Die technische Ausgestaltung dieser Sitzung —
Cookie-Eigenschaften, Lifetime, Session Secret — wird in Kapitel 4 (Sitzungsverwaltung)
beschrieben.

AD-Gruppen werden auf interne Rollen abgebildet. Die Rollen bündeln Permissions, anhand derer
die Autorisierung erfolgt, wie in `ARCHITECTURE.md` Kapitel 8.2 beschrieben. Die Zuordnung von
AD-Gruppen zu Rollen ist Konfiguration, nicht Anwendungscode.

Das konkrete technische Authentifizierungsverfahren gegen Active Directory ist keine
architektonische Festlegung dieses Projekts. Die Beschreibung orientiert sich an der jeweiligen
Implementierung.

### Schutz gegen wiederholte Anmeldeversuche

ConnOps begrenzt die Anzahl der Anmeldeversuche pro Client-Adresse. Werden fünf Versuche
innerhalb eines festen Zeitfensters von 15 Minuten überschritten, werden weitere
Anmeldeversuche abgelehnt. Das Zeitfenster beginnt mit dem ersten Versuch der jeweiligen
Adresse und wird durch weitere Versuche nicht verlängert; nach Ablauf des Fensters wird die
Begrenzung zurückgesetzt. Die Ermittlung der Client-Adresse erfolgt nach demselben Verfahren
wie die in Kapitel 7 beschriebene Herkunftsermittlung.

Die Begrenzung bezieht sich ausschließlich auf die Client-Adresse, nicht zusätzlich auf den
verwendeten Benutzernamen. Sie erschwert dadurch wiederholte Anmeldeversuche mit
unterschiedlichen Benutzernamen von derselben Adresse, bietet jedoch keinen Schutz gegen
Angriffe, die denselben Benutzernamen verteilt über viele unterschiedliche Adressen versuchen.

Eine durch diese Begrenzung abgelehnte Anmeldung wird protokolliert, ebenso wie die übrigen in
diesem Kapitel beschriebenen Ablehnungsfälle.

### Zwei Authentifizierungsmodelle gegenüber Active Directory, Exchange und Citrix

ConnOps verwendet bewusst unterschiedliche Authentifizierungsmodelle, abhängig vom fachlichen
Zweck der Operation. Interaktive Verwaltungsaktionen gegen Active Directory erfolgen im
Sicherheitskontext des angemeldeten Administrators. Hintergrundprozesse sowie die Integrationen
mit Exchange und Citrix verwenden dagegen dedizierte technische Identitäten. Die folgenden
beiden Abschnitte beschreiben diese beiden Modelle im Detail.

### Benutzergebundene Authentifizierung für administrative AD-Operationen

Für die direkte Verwaltung von Benutzerkonten und Computern — etwa Aktivieren, Deaktivieren,
Entsperren, Zurücksetzen von Passwörtern oder Gruppenzuordnung — verwendet ConnOps nicht eine
technische Identität, sondern die persönlichen Active-Directory-Zugangsdaten des angemeldeten
Administrators. Diese Operationen sind stets durch eine Benutzeraktion ausgelöst.

Diese benutzergebundenen Zugangsdaten werden, wie in Kapitel 6 (Schutz persönlicher
Laufzeit-Credentials) beschrieben, verschlüsselt innerhalb der Anwendungssitzung gehalten und
für die Dauer der jeweiligen Operation verwendet. Dadurch wird jede Änderung an Active
Directory der tatsächlich handelnden Person zugeordnet, nicht einer gemeinsam genutzten
technischen Identität.

Diese Unterscheidung ist unabhängig von der in Kapitel 5 beschriebenen Autorisierungsprüfung:
Ein Benutzer benötigt weiterhin die erforderliche Permission, um eine Aktion überhaupt auslösen
zu dürfen. Die hier beschriebene Wahl der Zugangsdatenquelle betrifft ausschließlich die
technische Ausführung gegenüber Active Directory.

### Authentifizierung des Node.js-Prozesses gegenüber Active Directory, Exchange und Citrix

Für Exchange und Citrix authentifiziert sich die Plattform selbst — unabhängig von der
auslösenden Person — durchgängig über dedizierte Service-Accounts (`Service_Exchange`,
`Service_Citrix`) mit explizit hinterlegtem Passwort, wie in `TECHNICAL.md` Kapitel 6
beschrieben. Für diese beiden Systeme existiert kein benutzergebundener Zugriffsweg.

Für Active Directory kommt derselbe Mechanismus — der Service-Account `Service_AD` — gezielt
dort zum Einsatz, wo kein benutzergebundener Zugriffsweg vorgesehen ist: bei der Verarbeitung
von TopDesk-Changes (sowohl Validierung als auch Ausführung), unabhängig davon, ob dieser
Vorgang automatisiert oder durch eine Benutzeraktion ausgelöst wird, sowie bei automatisierten
Health-Checks. Diese Fälle benötigen eine von der jeweils auslösenden Person unabhängige,
durchgängig konsistente Berechtigungsbasis — insbesondere, weil ein automatisiert gestarteter
Vorgang ohne aktive Benutzersitzung ablaufen kann und ein später folgender, durch einen
Administrator ausgelöster Schritt desselben Vorgangs sich nicht abhängig vom Auslöser anders
verhalten soll.

Diese Passwörter sind technische Secrets im Sinne von Kapitel 6.

Technisch unterscheidet sich die Art des Zugriffs je System: Der Zugriff auf Active Directory
erfolgt lokal innerhalb der Worker-Umgebung mit expliziter Anmeldeinformation, ohne eine eigene
Remoting-Verbindung. Der Zugriff auf Exchange erfolgt über eine für die Dauer der Operation
aufgebaute Remoting-Verbindung, wie in `DECISIONS.md` ADR-005 festgelegt. Der Zugriff auf
Citrix erfolgt ebenfalls über eine Remoting-Verbindung, jedoch ohne eine vorab aufgebaute,
wiederverwendete Sitzung — jede Anfrage baut eine eigene, einmalige Verbindung auf.

Das konkrete Windows-Authentifizierungsprotokoll für den jeweiligen Zugriff selbst ist nicht
gesondert festgelegt und bleibt, sofern es sich um eine reine Implementierungsfolge der
Windows-Umgebung handelt, außerhalb dieses Dokuments; für Exchange erfolgt dies über
Kerberos-Authentifizierung.

Diese technischen Identitäten sind von der Benutzeranmeldung und von der im vorigen Abschnitt
beschriebenen benutzergebundenen AD-Authentifizierung unabhängig: Ein angemeldeter Benutzer
besitzt keinen eigenen Zugriff auf die Service-Accounts.

### Authentifizierung ausgehender Anfragen an TopDesk

Ausgehende Anfragen der Plattform an die TopDesk REST-API werden über ein Application Password
des Kontos `TOPDESKAPI` authentifiziert, wie in `TECHNICAL.md` Kapitel 6 beschrieben.

### Authentifizierung eingehender TopDesk-Webhooks

Eingehende Webhook-Ereignisse von TopDesk werden über ein Shared Secret im HTTP-Header
authentifiziert. Die Plattform vergleicht den empfangenen Header-Wert mit dem für die
Anwendung bereitgestellten Secret. Stimmen die Werte nicht überein, wird das Ereignis
abgelehnt und nicht verarbeitet. Nicht authentifizierte Webhooks werden verworfen und
lösen keine fachliche Verarbeitung aus.

Eine zusätzliche IP-Allowlist kann als ergänzende Infrastrukturmaßnahme eingesetzt werden,
ersetzt diese Authentifizierung jedoch nicht. Die Konfiguration einer solchen Allowlist ist
Gegenstand von `DEPLOYMENT.md`.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt, welche Authentifizierungsverfahren verwendet werden. Es enthält
keine Aussagen zur Sitzungsverwaltung nach erfolgreicher Authentifizierung (Kapitel 4), keine
Autorisierungslogik (Kapitel 5), keine Angaben zum Secrets-Management der verwendeten
Zugangsdaten selbst (Kapitel 6) und keine Aussagen zur Transportverschlüsselung.

---

## Kapitel 4 — Sitzungsverwaltung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt die Anwendungssitzung, die ConnOps nach erfolgreicher
Authentifizierung erstellt, sowie deren sicherheitsrelevante Eigenschaften. Es setzt Kapitel 3
(Authentifizierung) voraus und beschreibt nicht erneut den Anmeldevorgang selbst, sondern das,
was danach folgt.

### Session-Erstellung

Nach erfolgreicher AD-Authentifizierung erstellt ConnOps eine eigene Anwendungssitzung. Die
aktuelle Implementierung erzeugt diese Sitzung unabhängig davon, ob für denselben Benutzer
bereits eine oder mehrere Sitzungen bestehen.

### Parallele Sitzungen

Mehrere Sitzungen desselben Benutzers können aktuell gleichzeitig bestehen. Eine Zuordnung und
Verwaltung aller aktiven Sitzungen eines Benutzers ist aktuell nicht implementiert. Eine
Änderung dieses Verhaltens erfordert eine gesonderte Entscheidung.

### Session-Beendigung

Eine Sitzung endet auf eine der folgenden Arten:

- **Logout:** Beendet ausschließlich die aktuelle Sitzung. Andere bestehende Sitzungen
  desselben Benutzers bleiben bestehen.
- **Absolute Lifetime** (maximale Sitzungsdauer unabhängig von Aktivität): Die Sitzung läuft
  nach einer festen Zeitspanne ab dem Login ab, unabhängig davon, ob der Benutzer die Plattform
  in dieser Zeit aktiv genutzt hat. Diese Zeitspanne ist im Anwendungscode festgelegt, nicht
  über Konfiguration veränderbar, und beträgt aktuell 8 Stunden.
- **Inaktivitäts-Timeout:** Die Sitzung wird serverseitig beendet, wenn über einen
  konfigurierbaren Zeitraum keine Anfrage des Benutzers eingegangen ist. Jede Anfrage setzt
  diesen Zeitraum zurück. Der Schwellenwert ist konfigurierbar und beträgt, sofern nicht
  anders konfiguriert, 30 Minuten. Eine durch Inaktivität beendete Sitzung wird protokolliert.

Absolute Lifetime und Inaktivitäts-Timeout sind zwei unabhängige Mechanismen; es greift
jeweils derjenige, dessen Schwelle zuerst erreicht wird.

### Session Store

Die aktuelle Implementierung verwendet keinen persistenten Session-Store, sondern den
Standard-MemoryStore von `express-session`. Dadurch bestehen Sitzungen ausschließlich innerhalb
des laufenden Node.js-Prozesses und gehen bei einem Neustart verloren.

### Cookie-Eigenschaften

Die Anwendungssitzung wird über ein Cookie an den Browser übertragen. Das Cookie ist für
JavaScript im Browser nicht zugreifbar und wird bei seitenübergreifenden Anfragen nicht
mitgesendet.

Die Übertragung des Cookies über eine sichere Verbindung ist abhängig von der aktuellen
Betriebskonfiguration. In Umgebungen mit aktivierter entsprechender Konfiguration wird das
Cookie ausschließlich über sichere Verbindungen übertragen.

### Sicherheitsrelevante Session-Eigenschaften

- Nach der Session-Erstellung erfolgt die Autorisierung von Folgeanfragen über die
  Session-ID, nicht über eine erneute Authentifizierung gegen Active Directory.
- Die Sitzung wird über ein Session Secret geschützt. Dieses Secret ist ein schützenswerter
  Konfigurationswert; seine Speicherung und sein Schutz sind Gegenstand von Kapitel 6
  (Secrets-Management), nicht dieses Kapitels.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt die Eigenschaften der Anwendungssitzung. Es enthält keine
Autorisierungslogik (Permissions, Rollen, RBAC — Kapitel 5), keine Angaben zur Speicherung oder
zum Schutz des Session Secret selbst (Kapitel 6), keine Aussagen zur Transportverschlüsselung
und keine Festlegung eines bestimmten Session-Frameworks, sofern diese Wahl keine bewusste
Architekturentscheidung ist.

---

## Kapitel 5 — Autorisierung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt die technische Umsetzung der Autorisierung von Anfragen an ConnOps.
Es setzt das in `ARCHITECTURE.md` Kapitel 8.2 festgelegte Permission-Modell voraus und
begründet es nicht erneut, sondern beschreibt, wie eine Anfrage von der Benutzeridentität bis
zur Freigabe oder Ablehnung einer Aktion verarbeitet wird.

### Von der Identität zur Berechtigung

Jede authentifizierte Anfrage ist über die Anwendungssitzung (Kapitel 4) einer
Benutzeridentität zugeordnet. Für diese Identität wird die Zugehörigkeit zu
Active-Directory-Gruppen ermittelt. Die technische Ermittlung der Gruppenmitgliedschaften ist
abhängig von der gewählten Implementierung der AD-Integration und wird hier nicht näher
beschrieben.

Diese Gruppen werden auf interne Rollen abgebildet; die Rollen bündeln Permissions. Die
Zuordnung von AD-Gruppen zu Rollen ist Konfiguration, nicht Anwendungscode, wie in Kapitel 3
festgelegt.

Am Ende dieser Kette steht eine Menge konkreter Permissions, die der angemeldeten Identität für
die aktuelle Anfrage zur Verfügung stehen.

### Prüfung vor geschützten Aktionen

Jede geschützte Aktion der API-Schicht ist einer konkreten Permission zugeordnet. Vor der
Ausführung einer Aktion wird geprüft, ob die Permissions der angemeldeten Identität die für
diese Aktion erforderliche Permission enthalten. Die Prüfung erfolgt ausschließlich anhand von
Permissions; ein Vergleich von Rollennamen im Code findet nicht statt, wie in `ARCHITECTURE.md`
Prinzip 4 festgelegt.

### Verhalten bei fehlender Authentifizierung oder Autorisierung

ConnOps unterscheidet zwischen fehlender Authentifizierung und fehlender Autorisierung:

- **Keine gültige Sitzung:** Die Anfrage wird abgelehnt. Nicht authentifizierte
  Zugriffsversuche werden im Audit-Log protokolliert. Die regelmäßige Prüfung der eigenen
  Sitzung über den Authentifizierungsstatus-Endpunkt ist davon ausgenommen, um wiederkehrende
  Prüfungen nicht mit technisch erwartbaren Ereignissen zu füllen.

- **Gültige Sitzung, aber fehlende Permission:** Die Aktion wird nicht ausgeführt. Der Versuch
  wird im Audit-Log protokolliert, einschließlich der angeforderten Aktion und der fehlenden
  Berechtigung.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt den technischen Ablauf der Autorisierungsprüfung. Es enthält keine
Begründung des Permission-Modells selbst (`ARCHITECTURE.md` Kapitel 8.2), keine Aufzählung
konkreter Permissions oder Rollen (Konfiguration, kein Dokumentationsgegenstand), keine Aussagen
zur Authentifizierung als Mechanismus (Kapitel 3) und keine Aussagen zum Audit-Log als
Betriebsfunktion (`OPERATIONS.md`).

---

## Kapitel 6 — Secrets-Management

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, wie ConnOps mit schützenswerten Geheimnissen umgeht: technischen
Zugangsdaten zu externen Systemen (Konfigurationssecrets) und persönlichen Zugangsdaten, die im
Rahmen benutzergebundener administrativer Aktionen zur Laufzeit verarbeitet werden. Es setzt den in
`ARCHITECTURE.md` Kapitel 8.4 festgelegten Grundsatz voraus, dass kein Geheimnis so gespeichert
werden darf, dass sein Inhalt durch bloßen Lesezugriff auf Konfigurationsdateien oder Quellcode
offenliegt, und beschreibt den aktuellen Stand seiner Umsetzung.

Dieses Kapitel unterscheidet durchgehend zwischen umgesetzten Schutzmaßnahmen und noch offenen
Anforderungen, sofern solche bestehen. Ein Schutzmechanismus für eine einzelne Kategorie von
Geheimnissen ersetzt kein vollständiges Secrets-Management für alle Kategorien.

### Konfigurationssecrets — aktueller Zustand

ConnOps benötigt technische Zugangsdaten zu mehreren externen Systemen sowie interne
Geheimnisse für die eigene Sitzungsverwaltung. Dazu gehören insbesondere Zugangsdaten für
Active Directory, Exchange, TopDesk, Citrix, PostgreSQL sowie das Session Secret und das
TopDesk-Webhook-Secret.

Diese Werte werden über Konfiguration außerhalb des Anwendungscodes bereitgestellt, wie in
`ARCHITECTURE.md` Prinzip 5 gefordert. Sie liegen in dieser Konfiguration nicht im Klartext vor,
sondern maschinenbezogen verschlüsselt: Die Entschlüsselung ist an den technischen Kontext des
Backend-Prozesses gebunden und daher nicht durch bloßen Lesezugriff auf die Konfiguration
möglich. Damit ist die in `ARCHITECTURE.md` Kapitel 8.4 formulierte Anforderung an den Schutz
dieser Geheimnisse — und die in `DECISIONS.md` als ADR-020 und ADR-024 festgehaltenen
Entscheidungen — für diese Kategorie erfüllt.

### Schutz persönlicher Laufzeit-Credentials

ConnOps verarbeitet im Rahmen benutzergebundener administrativer Aktionen persönliche
Active-Directory-Credentials eines angemeldeten Benutzers.

Diese Credentials werden nicht im Klartext in der Anwendungssitzung gespeichert, sondern vor
der Ablage verschlüsselt. Die Verschlüsselung schützt diese Laufzeitdaten innerhalb des
aktuellen Anwendungskontexts. Der zur Verschlüsselung verwendete Schlüssel wird aus dem Session
Secret abgeleitet; beide Mechanismen teilen sich damit dieselbe Vertrauensbasis. Die Speicherung
erfolgt ausschließlich innerhalb des in Kapitel 4 beschriebenen Session Store und damit
ausschließlich im Arbeitsspeicher des laufenden Prozesses.

Dieser Mechanismus ist von der Absicherung der Konfigurationssecrets (voriger Abschnitt)
unabhängig: Beide Kategorien werden inzwischen geschützt, jedoch über unterschiedliche
Mechanismen mit unterschiedlicher Vertrauensbasis.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt den Schutzstatus von Konfigurationssecrets und persönlichen
Laufzeit-Credentials. Es enthält keine Aufzählung konkreter Konfigurationsschlüssel oder
Dateipfade, keine Nennung konkreter kryptographischer Verfahren, keine Aussagen zur
Sitzungsverwaltung selbst (Kapitel 4) und keine Aussagen zur Betriebs- oder
Installationsumgebung, in der diese Geheimnisse bereitgestellt werden (`DEPLOYMENT.md`).

---

## Kapitel 7 — Transportverschlüsselung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt den aktuellen Stand der Transportverschlüsselung zwischen Frontend
und Backend sowie deren Zusammenhang mit den in Kapitel 4 beschriebenen Cookie-Eigenschaften
und der in `ARCHITECTURE.md` Kapitel 8.5 beschriebenen Nachvollziehbarkeit.

### Aktueller Zustand

Die Transportverschlüsselung wird durch einen vorgeschalteten Webserver bereitgestellt, wie in
`DECISIONS.md` ADR-025 festgelegt. Der Backend-Prozess selbst stellt seine Schnittstelle
weiterhin unverschlüsselt bereit; die Verschlüsselung entsteht durch die Terminierung am
vorgeschalteten Webserver, nicht im Anwendungscode.

Die Erfassung der Herkunftsangabe einer Anfrage — insbesondere der Absenderadresse für das
Audit-Log — erfolgt unabhängig von einer aus dem verwendeten Backend-Framework stammenden
Standardeinstellung und liest die vom vorgeschalteten Webserver weitergereichte tatsächliche
Client-Adresse aus. Diese Erfassung wurde nach der Umstellung auf den vorgeschalteten Webserver
verifiziert: Audit-Log-Einträge weisen die tatsächliche Client-Adresse aus, nicht die Adresse
des vorgeschalteten Webservers. Es besteht in diesem Punkt keine offene Lücke.

### Zusammenhang mit der Sitzungsverwaltung

Das in Kapitel 4 beschriebene Sicherheitsattribut, das die Übertragung des Session-Cookies auf
sichere Verbindungen beschränkt, entfaltet seine Schutzwirkung, sobald die Verbindung zwischen
Client und vorgeschaltetem Webserver durchgängig verschlüsselt ist. Da eine
Transportverschlüsselung nun bereitgestellt wird, ist diese Voraussetzung erfüllt.

### Architektonische Anforderung

Die Übertragung von Anmeldedaten, Sitzungsinformationen und sonstigen sicherheitsrelevanten
Daten zwischen Frontend und Backend erfordert eine durchgängige Transportverschlüsselung. Diese
Anforderung ist durch die in `DECISIONS.md` ADR-025 festgelegte Trennung von Webserver und
Anwendungsserver erfüllt.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt den Status der Transportverschlüsselung und ihre sicherheitsrelevante
Wechselwirkung mit der Sitzungsverwaltung und der Nachvollziehbarkeit. Es enthält keine
Beschreibung des konkreten Webservers oder seiner Konfiguration, keine Zertifikatsverwaltung
und keine Netzwerk- oder Infrastrukturkonfiguration — diese Inhalte sind Gegenstand von
`DEPLOYMENT.md` beziehungsweise `TECHNICAL.md`.

---

## Kapitel 8 — Sicherheitsrelevante API-Aspekte

### Zweck dieses Kapitels

Dieses Kapitel führt die in den vorangehenden Kapiteln beschriebenen Schutzmechanismen —
Authentifizierung, Sitzungsverwaltung, Autorisierung — zu einem zusammenhängenden Bild der
Sicherheitsgrenzen der API-Schicht zusammen. Es beschreibt nicht erneut, wie diese Mechanismen
funktionieren, sondern welche Sicherheitsgarantien daraus für jede Anfrage an die API
resultieren.

### Schutz jeder API-Anfrage

Jede Anfrage an eine geschützte Aktion der API-Schicht durchläuft dieselben zwei Prüfungen:

- Es muss eine gültige Anwendungssitzung vorliegen (Kapitel 4).
- Die dieser Sitzung zugeordnete Identität muss über die für die angeforderte Aktion
  erforderliche Permission verfügen (Kapitel 5).

Beide Prüfungen sind notwendig; keine ersetzt die andere.

### Keine Umgehung der Backend-Prüfung

Berechtigungsprüfungen, die im Frontend stattfinden, dienen ausschließlich der
Benutzerführung. Sie stellen keine Sicherheitsgrenze dar. Die verbindliche Prüfung von
Authentifizierung und Autorisierung erfolgt ausschließlich im Backend, unabhängig davon, welche
Möglichkeiten das Frontend einem Benutzer anzeigt oder verbirgt.

### Sicherheitsrelevante Eigenschaften

- Nicht authentifizierte Anfragen an geschützte Aktionen werden abgelehnt und, mit der in
  Kapitel 5 beschriebenen Ausnahme, protokolliert.
- Anfragen mit gültiger Sitzung, aber ohne die erforderliche Permission, werden abgelehnt und
  protokolliert.
- Eingehende externe Schnittstellen — insbesondere der TopDesk-Webhook — sind über einen
  eigenen, in Kapitel 3 beschriebenen Authentifizierungsmechanismus abgesichert und unterliegen
  nicht der Sitzungsprüfung, da sie nicht von einem angemeldeten Benutzer, sondern von einem
  externen System ausgehen.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt die sicherheitsrelevanten Garantien der API-Schicht als
Zusammenführung der vorangehenden Kapitel. Es enthält keine Beschreibung einzelner Endpunkte,
keine Request- oder Response-Strukturen und keine Fehlercodes — diese Inhalte sind Gegenstand
von `API.md`. Wiederkehrende technische Implementierungsmuster der Prüfungen sind Gegenstand
von `PATTERNS.md`.

---

## Kapitel 9 — Abschluss und Dokumentationsgrenzen

### Stellung dieses Dokuments

`SECURITY.md` beschreibt die technische Umsetzung der in `ARCHITECTURE.md` Kapitel 8
festgelegten Sicherheitsprinzipien: Authentifizierung, Sitzungsverwaltung, Autorisierung,
Secrets-Management, Transportverschlüsselung und die daraus resultierenden Sicherheitsgrenzen
der API-Schicht. Es ersetzt `ARCHITECTURE.md` nicht und trifft keine Aussagen, die den dort
definierten architektonischen Rahmen verändern oder erweitern.

### Verweisstruktur

| Dokument | Vertieft folgenden Aspekt dieses Dokuments |
|---|---|
| `ARCHITECTURE.md` | Sicherheitsprinzipien und ihre Begründung |
| `TECHNICAL.md` | Kommunikationswege und -mechanismen, die dieses Dokument absichert |
| `API.md` | Fachliche Endpunkte, Request-/Response-Strukturen, Fehlercodes |
| `PATTERNS.md` | Wiederkehrende technische Implementierungsmuster der Sicherheitsprüfungen |
| `DEPLOYMENT.md` | Netzwerkports, Firewalls, Installation, künftige TLS-Terminierung |
| `OPERATIONS.md` | Logging als Betriebsfunktion, laufende Überwachung sicherheitsrelevanter Ereignisse |

Widersprüche zwischen diesem Dokument und anderen Dokumenten werden nicht durch Priorisierung
dieses Dokuments aufgelöst. Maßgeblich ist die Zuständigkeit des jeweiligen Dokuments gemäß der
in Kapitel 2 festgelegten Matrix.

### Ist-Zustand statt Zielbild

Dieses Dokument beschreibt den tatsächlichen Sicherheitszustand von ConnOps zum jeweiligen
Zeitpunkt, nicht einen angestrebten Zielzustand. Wo eine Sicherheitsanforderung noch nicht
vollständig umgesetzt ist, wird dies als offener Punkt kenntlich gemacht, nicht als bereits
bestehende Eigenschaft dargestellt. Konkrete Konfigurationswerte, Bibliotheken und
Betriebsparameter sind nicht Bestandteil dieses Dokuments.

### Pflege dieses Dokuments

Dieses Dokument wird angepasst, wenn sich der Sicherheitszustand von ConnOps ändert — etwa
durch die Umsetzung einer bisher offenen Anforderung, eine neue Integration oder eine Änderung
eines bestehenden Schutzmechanismus. Ändert sich dagegen der architektonische Rahmen selbst,
ist zunächst `ARCHITECTURE.md` zu prüfen und gegebenenfalls anzupassen, bevor `SECURITY.md`
folgt.

---

Damit ist `SECURITY.md` vollständig. Das Dokument beschreibt in sich abgeschlossen die
Sicherheitsumsetzung von ConnOps: Authentifizierung, Sitzungsverwaltung, Autorisierung,
Secrets-Management, Transportverschlüsselung und die daraus resultierenden Sicherheitsgrenzen
der API-Schicht.
