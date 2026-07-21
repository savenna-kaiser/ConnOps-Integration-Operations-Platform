# TECHNICAL.md
# Technische Umsetzung — ConnOps

---

## Kapitel 1 — Einleitung

### Zweck dieses Dokuments

Dieses Dokument beschreibt die technische Umsetzung der in `ARCHITECTURE.md` festgelegten
Architektur von ConnOps. Es beantwortet, welche Technologien eingesetzt werden, wie die
Komponenten der Plattform technisch zusammenarbeiten, über welche technischen Kommunikations-
und Verbindungswege sie miteinander kommunizieren und auf welcher Infrastruktur die Plattform
betrieben wird.

`TECHNICAL.md` trifft damit keine eigenen architektonischen Entscheidungen. Es setzt die in
`ARCHITECTURE.md` Kapitel 6 (Integrationsarchitektur) und Kapitel 10 (Technologieentscheidungen)
beschriebenen Prinzipien und Kriterien in eine konkrete technische Form um. Wo dieses Dokument
eine Technologie oder ein Verfahren nennt, ist stets `ARCHITECTURE.md` die Grundlage, aus der
sich diese Wahl ableitet — nicht eine eigenständige Entscheidung dieses Dokuments.

### Abgrenzung zu `ARCHITECTURE.md`

`ARCHITECTURE.md` beantwortet, warum die Plattform so aufgebaut ist, wie sie aufgebaut ist.
`TECHNICAL.md` beantwortet, womit dieser Aufbau umgesetzt wird. Eine Aussage über die
Begründung einer Integrations- oder Technologieentscheidung gehört deshalb auch dann in
`ARCHITECTURE.md`, wenn sie im Zusammenhang mit einem in diesem Dokument beschriebenen Detail
steht. `TECHNICAL.md` verweist in solchen Fällen auf `ARCHITECTURE.md`, statt die Begründung zu
wiederholen.

`TECHNICAL.md` beschreibt die technische Umsetzung innerhalb des durch `ARCHITECTURE.md`
vorgegebenen architektonischen Rahmens. Es trifft keine Aussagen, die den in `ARCHITECTURE.md`
definierten architektonischen Rahmen verändern oder erweitern.

### Abgrenzung zu weiteren Fachdokumenten

`TECHNICAL.md` beschreibt die technische Umsetzung der Architektur allgemein. Für einzelne
Aspekte dieser Umsetzung sind eigene Fachdokumente zuständig, die `TECHNICAL.md` vertieft:

| Dokument | Zuständig für |
|---|---|
| `SECURITY.md` | Sicherheitskonzepte und deren vollständige Umsetzung |
| `API.md` | API-Semantik — Endpunkte, Parameter, Rückgabewerte |
| `PATTERNS.md` | Wiederkehrende Implementierungsmuster |
| `DEPLOYMENT.md` | Installation und Systemvoraussetzungen |
| `OPERATIONS.md` | Betrieb, Fehlerdiagnose und Monitoring im laufenden Betrieb |

Berührt eine Aussage dieses Dokuments einen dieser Bereiche, wird auf das jeweils zuständige
Dokument verwiesen, statt dessen Inhalt vorwegzunehmen. Diese Abgrenzung folgt der in
`DOCUMENTATION.md` Kapitel 2 festgelegten Grundregel „ein Thema, ein Master-Dokument".

### Zielgruppe

Dieses Dokument richtet sich an Personen, die die Plattform technisch weiterentwickeln, warten
oder in ihren technischen Aufbau einarbeiten — insbesondere Entwickler und Administratoren mit
grundlegenden Kenntnissen der eingesetzten Technologien. Es dient nicht als Installations- oder
Benutzerhandbuch; diese Zielgruppen und Zwecke sind `DEPLOYMENT.md`, `ADMIN_GUIDE.md` und
`USER_GUIDE.md` vorbehalten.

---

## Kapitel 2 — Technologieübersicht

### Zweck dieses Kapitels

Dieses Kapitel beschreibt den technischen Gesamtstack der Plattform als Umsetzung der in
`ARCHITECTURE.md` beschriebenen Architektur. Es beantwortet, welche Rolle jede eingesetzte
Technologie im Gesamtsystem übernimmt und wie sie mit den übrigen Komponenten zusammenspielt —
nicht, warum sie gewählt wurde. Die Begründung einzelner Technologieentscheidungen ist
Gegenstand von `ARCHITECTURE.md` Kapitel 10 und wird hier nicht wiederholt.

### Überblick

| Bereich | Technologie |
|---|---|
| Frontend | React, React Router, MUI, Vite |
| Backend | Node.js, Express |
| Datenhaltung | PostgreSQL, SQLite |
| Worker-Schicht | PowerShell |
| Kommunikation | REST, JSON |
| Externe Systeme | Active Directory, Exchange On-Prem, TopDesk, Docusnap, Citrix |
| Bereitstellung | Webserver als Reverse Proxy und statische Frontend-Auslieferung |

Die folgenden Abschnitte beschreiben, welche Rolle jeder dieser Bereiche im Gesamtsystem
übernimmt.

### Frontend

Das Frontend wird mit React umgesetzt und übernimmt ausschließlich die Darstellung und
Benutzerinteraktion, die `ARCHITECTURE.md` Kapitel 5 der Frontend-Schicht zuweist. React Router
bildet die Navigation innerhalb der Anwendung ab, MUI stellt die Oberflächenkomponenten bereit.
Vite dient als Build-Werkzeug für Entwicklung und Auslieferung des Frontends.

Das Frontend kommuniziert ausschließlich über die eigene REST-API mit dem Backend. Ein direkter
Zugriff auf Datenhaltung, Worker-Schicht oder externe Systeme ist nicht vorgesehen; diese Grenze
entspricht der in `ARCHITECTURE.md` Kapitel 5 beschriebenen Verantwortlichkeit der
Frontend-Schicht.

Das Frontend wird als statisches Build-Ergebnis ausgeliefert, nicht durch den Node.js-Prozess
selbst. Die Auslieferung erfolgt durch den in Kapitel 4 beschriebenen vorgeschalteten
Webserver.

### Backend

Das Backend basiert auf Node.js als Laufzeitumgebung und Express als Webframework. Express
stellt die eigene REST-API bereit, über die das Frontend ausschließlich mit JSON als
Austauschformat kommuniziert. Die fachliche Verarbeitung erfolgt im Business Layer, der
innerhalb derselben Backend-Anwendung implementiert ist und entscheidet, über welchen
Integrationsweg — Worker-Schicht oder direkte Verbindung — eine Operation ausgeführt wird, wie
in `ARCHITECTURE.md` Kapitel 5 beschrieben.

### Datenhaltung

PostgreSQL speichert die zentralen Plattformdaten, insbesondere Organisationsdaten und die
Change-Queue. SQLite speichert lokale Worker- und Synchronisationsdaten. Diese Trennung setzt
die in `ARCHITECTURE.md` Kapitel 7 beschriebene Kategorisierung eigener Daten technisch um.
Beide Datenhaltungen werden ausschließlich vom Backend angesprochen; das Frontend hat keinen
eigenen Zugriff auf eine der beiden.

### Worker-Schicht

Die Worker-Schicht wird mit PowerShell umgesetzt und übernimmt die in `ARCHITECTURE.md`
Kapitel 6 beschriebene Vermittlerrolle zu Active Directory und Exchange On-Prem. Das Backend
startet dazu einen PowerShell-Prozess und kommuniziert mit ihm über Standard-Input/Output mit
JSON als Austauschformat — die PowerShell-Bridge. Diese Bridge ist der alleinige Zugangspunkt zu
Active Directory und Exchange; ein direkter Zugriff des Backends auf diese Systeme ist nicht
vorgesehen.

### Externe Integrationen

TopDesk wird über seine REST-Schnittstelle direkt durch den Business Layer angebunden, ebenso
Citrix. Docusnap wird dagegen nicht über eine API integriert, sondern über den Import
exportierter CSV-Dateien; die Verarbeitung dieser Daten erfolgt innerhalb der Plattform durch
einen CSV-Parser. Alle Integrationswege entsprechen den in `ARCHITECTURE.md` Kapitel 6
beschriebenen Integrationsprinzipien, unterscheiden sich jedoch in ihrer technischen Umsetzung.
Die technischen Besonderheiten der einzelnen Integrationen werden in Kapitel 6 beschrieben.

### Zusammenspiel im Überblick

Die vorstehenden Technologien setzen gemeinsam das in `ARCHITECTURE.md` Kapitel 5 beschriebene
Schichtenmodell um: Frontend, API-Schicht, Business Layer, Worker-Schicht und externe Systeme
sind jeweils einer eigenen Technologie oder Technologiegruppe zugeordnet, ohne dass eine Schicht
eine andere überspringt. Wie diese Komponenten technisch angeordnet sind und miteinander
kommunizieren, beschreibt Kapitel 3 (Systemaufbau).

---

## Kapitel 3 — Systemaufbau

### Zweck dieses Kapitels

Dieses Kapitel zeigt, wie die in Kapitel 2 beschriebenen Technologien zu einem
Gesamtsystem angeordnet sind und wie sie technisch miteinander kommunizieren. Es
unterscheidet sich damit von der in `ARCHITECTURE.md` Kapitel 5 gezeigten Darstellung der
Komponentenverantwortlichkeiten: Dort wird gezeigt, welche Schicht wofür verantwortlich ist;
hier wird gezeigt, mit welcher Technologie und über welchen technischen Kanal diese
Verantwortlichkeit umgesetzt wird.

### Technische Anordnung

```text
Browser
   │  HTTPS
   ▼
Webserver (Reverse Proxy + statische Auslieferung)
   │  HTTP (intern)
   ▼
Backend (Node.js / Express)
   │  API-Schicht, Business Layer, CSV-Parser
   │
   ├── PowerShell-Bridge ──▶ Worker-Schicht ──▶ AD / Exchange On-Prem
   ├── REST/JSON ───────────▶ TopDesk
   ├── REST/JSON ───────────▶ Citrix
   └── CSV-Datei ───────────▶ CSV-Parser ──▶ Docusnap (Export/Import)
```

Der Webserver liefert das Build-Ergebnis des Frontends statisch aus und leitet alle
API-Anfragen intern per HTTP an das Backend weiter, wie in Kapitel 4 beschrieben. Der
CSV-Parser ist eine Backend-Komponente und keine eigenständige Systemkomponente. Er wird nicht
durch eine Anfrage des Backends ausgelöst, sondern durch das Vorliegen einer exportierten
Datei — er verarbeitet ereignisgesteuert, nicht anfragegesteuert wie die übrigen
Integrationswege.

### Drei technische Integrationswege

Die Darstellung macht drei unterschiedliche technische Kommunikationswege sichtbar, die
jeweils einer eigenen Integration aus `ARCHITECTURE.md` Kapitel 6 entsprechen:

- **REST-API** — synchrone HTTP-Kommunikation, verwendet für die eigene API (Frontend↔Backend)
  sowie für TopDesk und Citrix.
- **PowerShell-Bridge** — Kommunikation über einen gestarteten Prozess mit JSON über
  Standard-Input/Output, verwendet für Active Directory und Exchange On-Prem.
- **CSV-Import** — dateibasierter, ereignisgesteuerter Austausch ohne direkte
  Systemverbindung, verwendet für Docusnap.

Die drei Integrationswege sind technisch voneinander getrennt. Eine Störung eines
Integrationswegs beeinträchtigt grundsätzlich nur die von diesem Weg abhängigen Funktionen und
nicht die technische Funktionsfähigkeit der übrigen Integrationswege. Das entspricht der in
`ARCHITECTURE.md` Kapitel 6.6 beschriebenen Fehlerisolation, hier auf technischer statt auf
architektonischer Ebene betrachtet.

### Grenzen dieses Kapitels

Dieses Kapitel zeigt die technische Anordnung der Komponenten. Es enthält keine
Konfigurationswerte, keine Verbindungsparameter und keine Details zur Laufzeitumgebung — diese
sind Gegenstand von Kapitel 4 (Infrastruktur und Laufzeitumgebung).

---

## Kapitel 4 — Infrastruktur und Laufzeitumgebung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, auf welcher Infrastruktur die Plattform betrieben wird und welche
Laufzeitumgebungen die in Kapitel 2 und 3 beschriebenen Technologien voraussetzen. Es
beantwortet nicht, wie die Plattform installiert oder eingerichtet wird — das ist Gegenstand
von `DEPLOYMENT.md` — sondern welche Betriebsumgebung die Architektur voraussetzt.

### Betriebsmodell

Die Plattform wird On-Premises betrieben. Sämtliche Plattformkomponenten — Frontend, Backend,
Worker-Schicht und Datenhaltung — werden innerhalb der eigenen Netzwerkinfrastruktur der
Organisation betrieben. Dies folgt unmittelbar aus der Anbindung an Active Directory und
Exchange On-Prem über die PowerShell-Bridge, die eine Positionierung innerhalb desselben
Netzwerks voraussetzt.

### Serverrollen

Die Plattform benötigt eine Umgebung für die Ausführung von Backend und Worker-Schicht sowie
eine Umgebung für die Datenhaltung. Beide Rollen können auf demselben Server oder auf getrennten
Servern betrieben werden; die Architektur setzt keine der beiden Varianten voraus. Die
Architektur schreibt keine bestimmte physische oder virtuelle Aufteilung der Komponenten vor.
Diese Wahl ist eine Betriebsentscheidung ohne architektonische Tragweite und wird nicht von
diesem Dokument, sondern von den jeweiligen Betriebsanforderungen bestimmt.

### Betriebssystem

Backend und Worker-Schicht laufen auf Windows Server. Diese Wahl ergibt sich unmittelbar aus der
Worker-Schicht: PowerShell und die Anbindung an Active Directory und Exchange On-Prem setzen eine
Windows-Umgebung voraus, wie in `ARCHITECTURE.md` Kapitel 6 beschrieben.

### Laufzeitumgebung

Das Backend läuft als Node.js-Anwendung. Das Frontend wird als statisches Build-Ergebnis durch
einen vorgeschalteten Webserver ausgeliefert, nicht durch den Node-Prozess selbst, entsprechend
der in `DECISIONS.md` festgelegten Bereitstellungsarchitektur. Der Webserver übernimmt zugleich
die Rolle eines Reverse Proxy für die Backend-API. Die Worker-Schicht läuft als
PowerShell-Prozess, der vom Backend bei Bedarf gestartet wird, wie in Kapitel 3 beschrieben.

### Datenhaltung

PostgreSQL und SQLite laufen innerhalb derselben On-Premises-Umgebung wie das Backend. Die
Plattform greift ausschließlich über das Backend auf beide Datenhaltungen zu. Ein direkter
Datenbankzugriff durch andere Plattformkomponenten ist nicht vorgesehen.

### Netzwerkkommunikation

Die Plattform kommuniziert über folgende Wege mit ihrer Umgebung:

- **Extern:** HTTPS zwischen Browser und dem vorgeschalteten Webserver.
- **Intern:** HTTP zwischen dem vorgeschalteten Webserver und dem Backend.
- **Active Directory / Exchange On-Prem:** PowerShell-Bridge innerhalb desselben Netzwerks.
- **TopDesk / Citrix:** REST-API über eine Netzwerkverbindung zum jeweiligen System.
- **Docusnap:** Kein direkter Netzwerkzugriff; der Datenaustausch erfolgt über den in Kapitel 3
  beschriebenen CSV-Import.

Die konkreten Netzwerkzonen, Portfreigaben und Firewallregeln sind nicht Gegenstand dieses
Dokuments; sie werden in `DEPLOYMENT.md` beschrieben.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt die Betriebsumgebung, die die Architektur voraussetzt. Es enthält
keine Installationsschritte, keine Systemvoraussetzungen im Sinne konkreter Versions- oder
Hardwareangaben und keine Angaben zu Benutzerkonten, unter denen einzelne Prozesse laufen.
Diese Inhalte sind Gegenstand von `DEPLOYMENT.md`.

---

## Kapitel 5 — Datenhaltung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt die technische Organisation der Datenhaltung. Es setzt die in
`ARCHITECTURE.md` Kapitel 7 definierte Aufteilung der Datenkategorien voraus und erläutert sie
nicht erneut: Warum die Plattform zwischen fachlichen Prozessdaten und technischen Betriebsdaten
unterscheidet und warum diese Unterscheidung zwei getrennte Speicher rechtfertigt, ist dort
begründet. Dieses Kapitel beschreibt stattdessen, wie diese Aufteilung technisch umgesetzt ist.

### Technische Aufteilung der Datenhaltung

**PostgreSQL** ist die zentrale relationale Datenbank der Plattform. Sie speichert die
persistenten Plattformdaten im Sinne von `ARCHITECTURE.md` Kapitel 7.

**SQLite** dient als lokaler Speicher für die technischen Betriebsdaten der Plattform. Sie ist
keine gemeinsam genutzte Plattformdatenbank, sondern ein von PostgreSQL unabhängiger Speicher
für die in `ARCHITECTURE.md` Kapitel 7 beschriebenen technischen Betriebsdaten.

### Zugriff auf die Datenhaltung

Der Zugriff auf beide Datenhaltungen erfolgt ausschließlich über den Business Layer. Weder
Frontend noch Worker-Schicht besitzen einen eigenen Zugriff auf die Datenhaltung der Plattform,
wie in `ARCHITECTURE.md` Kapitel 7.3 festgelegt. Ein Zugriff, der die Geschäftslogik des
Business Layer umgeht, ist nicht vorgesehen.

### Datenkonsistenz

Der Business Layer stellt die Konsistenz der zentralen Plattformdaten sicher. Soweit Daten in
PostgreSQL gespeichert werden, erfolgen Validierung und Schreibzugriffe ausschließlich über den
Business Layer.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt die technische Organisation der Datenhaltung, nicht ihr konkretes
Datenmodell. Tabellenstrukturen, SQL-Schemata, Entitäten, Indizes und Migrationsmechanismen sind
nicht Bestandteil dieses Dokuments. Backup- und Wiederherstellungsstrategien sind Gegenstand von
`DEPLOYMENT.md` beziehungsweise `OPERATIONS.md`.

---

## Kapitel 6 — Integrationen

### Zweck dieses Kapitels

Dieses Kapitel beschreibt die technische Umsetzung der in `ARCHITECTURE.md` Kapitel 6
beschriebenen Integrationen. Es wiederholt nicht, warum eine Integration auf einem bestimmten
Weg erfolgt — diese Begründung ist dort festgehalten — sondern beschreibt Kommunikationsweg,
Datenflussrichtung, auslösenden Mechanismus, Datenformat und die verantwortliche
Plattformkomponente je Integration.

### Active Directory

**Kommunikationsweg:** PowerShell-Bridge.
**Datenfluss:** Die Plattform liest und schreibt Identitäts- und Gruppendaten bei Bedarf.
**Auslösung:** Anfragegesteuert durch den Business Layer.
**Datenformat:** JSON zwischen Business Layer und Worker-Schicht.
**Verantwortliche Komponente:** Die Worker-Schicht führt die PowerShell-Kommandos aus; der
Business Layer entscheidet, wann und mit welchem Ziel sie ausgeführt werden.

### Exchange On-Prem

**Kommunikationsweg:** PowerShell-Bridge, über eine pro Operation neu aufgebaute Session.
**Datenfluss:** Die Plattform liest und schreibt Mailbox- und Konfigurationsdaten bei Bedarf.
**Auslösung:** Anfragegesteuert durch den Business Layer.
**Datenformat:** JSON zwischen Business Layer und Worker-Schicht.
**Verantwortliche Komponente:** Die Worker-Schicht führt die Session-basierten Operationen aus;
der Business Layer entscheidet über Zeitpunkt und Ziel.

### TopDesk

**Kommunikationsweg:** REST-API, bidirektional; zusätzlich ein eingehender Webhook.
**Datenfluss:** Die Plattform fragt Daten über die REST-API ab und schreibt Status- und
Fortschrittsinformationen zurück; TopDesk sendet eingehende Ereignisse über den Webhook.
**Auslösung:** Abfragen und Rückschreibungen sind anfragegesteuert durch den Business Layer;
eingehende Ereignisse sind ereignisgesteuert durch TopDesk.
**Datenformat:** JSON über HTTP.
**Verantwortliche Komponente:** Der Business Layer kommuniziert direkt mit TopDesk, ohne die
Worker-Schicht einzubeziehen.

### Citrix

**Kommunikationsweg:** REST-API.
**Datenfluss:** Die Plattform fragt den aktuellen Sitzungsstatus eines Benutzers ab und kann
eine laufende Sitzung beenden. Es findet keine dauerhafte Speicherung von Sitzungsinformationen
statt.
**Auslösung:** Anfragegesteuert durch den Business Layer.
**Datenformat:** JSON über HTTP.
**Verantwortliche Komponente:** Der Business Layer kommuniziert direkt mit Citrix, ohne die
Worker-Schicht einzubeziehen.

### Docusnap

**Kommunikationsweg:** Dateibasierter Austausch über CSV-Export und -Import; keine
Netzwerkverbindung zu Docusnap.
**Datenfluss:** Docusnap exportiert Inventardaten als CSV-Datei; die Plattform liest diese
Datei ein und kann ein aktualisiertes CSV für den Reimport erzeugen.
**Auslösung:** Ereignisgesteuert durch das Vorliegen einer exportierten Datei, nicht durch eine
Anfrage der Plattform.
**Datenformat:** CSV.
**Verantwortliche Komponente:** Der CSV-Parser als Backend-Komponente verarbeitet importierte
CSV-Dateien und erzeugt die für den Reimport vorgesehenen CSV-Dateien. Der Business Layer
verarbeitet die importierten Daten weiter und steuert den Export.

### Gemeinsame technische Integrationsprinzipien

Unabhängig vom jeweiligen Kommunikationsweg gelten für alle Integrationen dieselben technischen
Grundsätze:

- Alle Integrationen werden durch den Business Layer koordiniert.
- Das Frontend kommuniziert niemals direkt mit einem externen System.
- Je nach Zielsystem kommt ein eigener technischer Kommunikationsmechanismus zum Einsatz —
  REST-API, PowerShell-Bridge oder CSV-Import.
- Die Wahl des Integrationswegs bleibt für das Frontend transparent. Die API-Schicht leitet
  Anfragen an den Business Layer weiter und kennt die technische Umsetzung der einzelnen
  Integrationen nicht.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt Kommunikationsweg, Datenfluss, Auslösung, Datenformat und
Zuständigkeit je Integration. Es enthält keine Angaben zu Authentifizierungsverfahren, soweit
diese nicht bereits verbindlich feststehen, keine Timeout-, Retry- oder
Fehlerbehandlungsstrategien und keine Payload- oder Nachrichtenstrukturen. Diese Inhalte sind,
sobald sie verbindlich festgelegt sind, Gegenstand von `SECURITY.md`, `API.md` oder
`PATTERNS.md`.

---

## Kapitel 7 — Kommunikation zwischen Komponenten

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, wie die Komponenten der Plattform intern miteinander kommunizieren.
Es setzt die in Kapitel 3 beschriebene technische Anordnung und die in Kapitel 6 beschriebenen
externen Integrationen voraus und wiederholt sie nicht, sondern verbindet beide zu einem
zusammenhängenden Kommunikationsbild.

### Interne Kommunikationswege

- **Browser ↔ Webserver:** HTTPS.
- **Webserver → Backend:** HTTP (intern, auf derselben Maschine), sowohl als Reverse Proxy für
  die API-Schicht als auch als statische Auslieferung des Frontend-Build-Ergebnisses.
- **API-Schicht → Business Layer:** Interner Aufruf innerhalb derselben Backend-Anwendung, ohne
  eigenes Netzwerkprotokoll.
- **Business Layer → Worker-Schicht:** PowerShell-Bridge (Prozessaufruf mit JSON über
  Standard-Input/Output), wie in Kapitel 6 beschrieben.
- **Business Layer → TopDesk:** REST/JSON über HTTP, wie in Kapitel 6 beschrieben.
- **Business Layer → Citrix:** REST/JSON über HTTP, wie in Kapitel 6 beschrieben.
- **Business Layer → CSV-Parser:** Interner Aufruf innerhalb derselben Backend-Anwendung.
- **Business Layer → Datenhaltung:** Zugriff auf PostgreSQL und SQLite innerhalb derselben
  Backend-Anwendung.

### Kommunikationsprinzipien

Für die interne Kommunikation gelten dieselben Grundsätze, die bereits für die
Komponentenverantwortlichkeiten (`ARCHITECTURE.md` Kapitel 5) und die Integrationen (Kapitel 6)
festgelegt sind:

- Verantwortlichkeiten der Schichten werden eingehalten; Komponenten greifen nicht unter
  Umgehung zuständiger Schichten auf andere Komponenten oder Systeme zu.
- Die Kommunikation ist überwiegend synchron und anfragegesteuert. Ereignisgesteuerte
  Verarbeitung kommt an zwei Stellen vor: beim eingehenden TopDesk-Webhook und beim Vorliegen
  eines Docusnap-CSV-Imports, wie in Kapitel 6 beschrieben.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt, welche Komponenten miteinander kommunizieren und über welchen
technischen Weg. Es enthält keine Protokolldetails, keine Payload- oder Nachrichtenstrukturen,
keine Authentifizierungsverfahren und keine Fehlerszenarien. Diese Inhalte sind, sobald sie
verbindlich festgelegt sind, Gegenstand von `SECURITY.md`, `API.md` oder `PATTERNS.md`.

---

## Kapitel 8 — Verweis auf weiterführende Dokumente

### Stellung dieses Dokuments

`TECHNICAL.md` beschreibt die technische Umsetzung der in `ARCHITECTURE.md` festgelegten
Architektur: Technologien, Systemaufbau, Infrastruktur, Datenhaltung, Integrationen und interne
Kommunikation. Es ersetzt `ARCHITECTURE.md` nicht und trifft keine Aussagen, die den dort
definierten architektonischen Rahmen verändern oder erweitern.

### Verweisstruktur

| Dokument | Vertieft folgenden Aspekt dieses Dokuments |
|---|---|
| `SECURITY.md` | Sicherheitskonzepte und deren vollständige Umsetzung |
| `API.md` | API-Semantik — Endpunkte, Parameter, Rückgabewerte |
| `PATTERNS.md` | Wiederkehrende Implementierungsmuster, u. a. Nachrichten- und Payload-Strukturen |
| `DEPLOYMENT.md` | Installation, Systemvoraussetzungen, Netzwerkzonen und Betriebskonten |
| `OPERATIONS.md` | Betrieb, Fehlerdiagnose und Monitoring im laufenden Betrieb |

Jedes dieser Dokumente vertieft einen Aspekt der hier beschriebenen technischen Umsetzung,
ersetzt sie jedoch nicht. Widersprüche zwischen diesem Dokument und anderen Dokumenten werden
nicht durch Priorisierung dieses Dokuments aufgelöst. Maßgeblich ist die Zuständigkeit des
jeweiligen Dokuments: Architektonische Entscheidungen werden in `ARCHITECTURE.md`
beziehungsweise `DECISIONS.md` getroffen, technische Umsetzungsdetails in `TECHNICAL.md` und
spezialisierte Details in den jeweiligen Fachdokumenten.

### Pflege dieses Dokuments

Dieses Dokument wird angepasst, wenn sich die technische Umsetzung der Architektur ändert —
etwa durch den Austausch einer Technologie, eine neue Integration oder eine Änderung des
Kommunikationswegs zwischen Komponenten. Änderungen, die einen der in Kapitel 1 genannten
Spezialbereiche betreffen, werden primär in den jeweils zuständigen Dokumenten beschrieben.
Sofern diese Änderung Auswirkungen auf die technische Gesamtumsetzung hat, wird `TECHNICAL.md`
entsprechend nachgeführt. Ändert sich dagegen der architektonische Rahmen selbst, ist zunächst
`ARCHITECTURE.md` zu prüfen und gegebenenfalls anzupassen, bevor `TECHNICAL.md` folgt.

---

Damit ist `TECHNICAL.md` vollständig. Das Dokument beschreibt in sich abgeschlossen die
technische Umsetzung der IT-Operations-Plattform ConnOps: ihren Technologiestack, ihren
Systemaufbau, ihre Infrastruktur, ihre Datenhaltung, ihre Integrationen und die Kommunikation
zwischen ihren Komponenten.
