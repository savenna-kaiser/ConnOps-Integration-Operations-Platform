# API.md
# Programmierschnittstelle — ConnOps

---

## Kapitel 1 — Einleitung

### Zweck dieses Dokuments

Dieses Dokument beschreibt die Programmierschnittstelle von ConnOps: welche Endpunkte
existieren, welche fachliche Funktion sie erfüllen, welche Informationen sie erwarten und
welche Informationen sie bereitstellen. Es setzt `ARCHITECTURE.md` Kapitel 5.2 (API-Schicht)
voraus und macht die dort beschriebene Verantwortlichkeit — Entgegennahme,
Berechtigungsprüfung, Delegation an den Business Layer, fachliche Antwort — auf der Ebene
einzelner Endpunkte konkret.

Dieses Dokument beschreibt die öffentliche Programmierschnittstelle von ConnOps. Interne
Aufrufe zwischen Komponenten — etwa zwischen Business Layer und Worker-Schicht — sind nicht
Gegenstand dieses Dokuments.

`API.md` trifft damit keine eigenen Architektur- oder Sicherheitsentscheidungen. Es
beschreibt die fachliche Semantik der Schnittstelle — was ein Endpunkt tut —, nicht warum die
API-Schicht so aufgebaut ist oder wie sie abgesichert wird.

### Abgrenzung zu `SECURITY.md`

`SECURITY.md` Kapitel 8 beschreibt die sicherheitsrelevanten Garantien, die für jede Anfrage an
die API-Schicht gelten: dass eine gültige Sitzung sowie die erforderliche Permission Grundlage
jeder Ausführung sind. `API.md` wiederholt diese Garantien nicht. Es nennt zu jedem Endpunkt
lediglich, welche Zugriffsvoraussetzung gilt. Bei erforderlichen Permissions werden die
stabilen Permission-Keys gemäß `DECISIONS.md` ADR-007 verwendet, da sie Bestandteil des
stabilen Vertrags zwischen API-Aufrufer und ConnOps sind, nicht ein internes
Implementierungsdetail.

Sicherheitsrelevante Eigenschaften einzelner externer Schnittstellen — etwa die
Authentifizierung des TopDesk-Webhooks — sind ebenfalls Gegenstand von `SECURITY.md`, nicht
dieses Dokuments.

### Abgrenzung zu `PATTERNS.md` und `TECHNICAL.md`

`PATTERNS.md` beschreibt wiederkehrende Muster, die für die API-Schicht als Ganzes gelten —
etwa, dass Einstiegspunkte keine Fachlogik enthalten oder dass Rückmeldungen einheitlich
dargestellt werden. `API.md` wiederholt diese Muster nicht, sondern wendet sie stillschweigend
auf jeden einzelnen Endpunkt an.

`TECHNICAL.md` beschreibt, dass die API-Schicht als REST-Schnittstelle mit JSON als
Austauschformat umgesetzt ist. `API.md` setzt dies voraus und beschreibt nicht erneut das
zugrunde liegende Protokoll, sondern die fachliche Bedeutung der einzelnen Endpunkte, die
dieses Protokoll nutzen.

### Was dieses Dokument beschreibt — und was nicht

Zu jedem Endpunkt beschreibt dieses Dokument: den fachlichen Zweck, die HTTP-Methode und den
Pfad, die erforderliche Zugriffsvoraussetzung, die wesentliche Struktur von Anfrage und Antwort
sowie fachlich relevante Fehlerfälle.

Dieses Dokument beschreibt nicht die interne Implementierung eines Endpunkts, keine
Datenbankstrukturen und keine vollständige, feldgenaue Auflistung jeder Eigenschaft eines
Rückgabewerts, sofern diese Vollständigkeit keinen fachlichen Erkenntniswert hat. Es dient als
Nachschlagewerk für die fachliche Bedeutung eines Endpunkts, nicht als generierte
Schnittstellenreferenz.

### Zielgruppe

Dieses Dokument richtet sich an Personen, die die API von ConnOps aufrufen oder erweitern —
insbesondere Entwickler des Frontends sowie Entwickler, die die Programmierschnittstelle
erweitern. Es setzt die in `SECURITY.md` beschriebenen Authentifizierungs- und
Autorisierungsmechanismen als bekannt voraus und wiederholt sie nicht.

---

## Kapitel 2 — Authentifizierung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt die Endpunkte, über die sich ein Benutzer an ConnOps anmeldet, abmeldet
und den Status seiner Anmeldung abfragt. Die zugrunde liegenden Mechanismen — Prüfung gegen
Active Directory, Sitzungsverwaltung, Rate-Begrenzung — sind in `SECURITY.md` Kapitel 3 und 4
beschrieben und werden hier nicht wiederholt. Die verwendeten HTTP-Statuscodes sind in Kapitel
13 (Allgemeine API-Konventionen) zentral erklärt und werden hier nicht wiederholt.

### Anmeldung

**Zweck:**
Meldet einen Benutzer mit seinen Active-Directory-Anmeldedaten an und erstellt bei Erfolg eine
Anwendungssitzung.

**HTTP-Methode und Pfad:**
`POST /api/auth/login`

**Zugriffsvoraussetzung:**
Keine. Dieser Endpunkt ist die Voraussetzung dafür, dass eine Sitzung und damit Berechtigungen
überhaupt existieren.

**Anfrage:**
Benutzername und Passwort. Der Benutzername ist auf 1 bis 100 Zeichen begrenzt, das Passwort
auf 1 bis 256 Zeichen; beide unterliegen darüber hinaus keiner weiteren Formatvorgabe.

**Antwort:**
Informationen über den angemeldeten Benutzer einschließlich seiner aktuellen Berechtigungen.

**Fachliche Fehlerfälle:**
- Die Anfrage entspricht nicht der erwarteten Struktur (z. B. leerer Benutzername oder zu
  langes Passwort).
- Die angegebenen Anmeldedaten werden von Active Directory nicht akzeptiert.
- Die Anmeldedaten werden akzeptiert, der Benutzer ist jedoch keiner berechtigten AD-Gruppe
  zugeordnet und erhält deshalb keinen Zugriff.
- Die Anzahl der Anmeldeversuche von derselben Client-Adresse innerhalb des in `SECURITY.md`
  Kapitel 3 beschriebenen Zeitfensters ist überschritten.
- Ein interner Fehler bei der Erstellung der Sitzung verhindert die Anmeldung.

### Abmeldung

**Zweck:**
Beendet die aktuelle Anwendungssitzung des angemeldeten Benutzers.

**HTTP-Methode und Pfad:**
`POST /api/auth/logout`

**Zugriffsvoraussetzung:**
Gültige Anwendungssitzung.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Bestätigung der erfolgreichen Abmeldung.

**Fachliche Fehlerfälle:**
- Es besteht keine gültige Sitzung.

### Statusabfrage der aktuellen Sitzung

**Zweck:**
Liefert Informationen über den angemeldeten Benutzer einschließlich seiner aktuellen
Berechtigungen, ohne eine erneute Anmeldung zu erfordern.

**HTTP-Methode und Pfad:**
`GET /api/auth/me`

**Zugriffsvoraussetzung:**
Gültige Anwendungssitzung.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Informationen über den angemeldeten Benutzer einschließlich seiner aktuellen Berechtigungen.

**Fachliche Fehlerfälle:**
- Es besteht keine gültige Sitzung.

**Hinweise:**
Die zurückgegebenen Informationen entsprechen dem zum Zeitpunkt des Aufrufs gültigen
Berechtigungsstand und werden nicht aus einem früheren Antwortobjekt übernommen.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt ausschließlich die öffentliche Programmierschnittstelle. Es enthält
keine Beschreibung des Prüfverfahrens gegen Active Directory, keine Details zur
Sitzungsverwaltung und keine Beschreibung der Rate-Begrenzung selbst — diese sind Gegenstand
von `SECURITY.md`.

---

## Kapitel 3 — Benutzerverwaltung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt die Endpunkte zur Verwaltung von Active-Directory-Benutzerkonten.
Es ist von Kapitel 2 (Authentifizierung) und von `SECURITY.md` (Autorisierung) klar zu
unterscheiden: Authentifizierung stellt die Identität des Aufrufers fest, Autorisierung prüft,
ob diese Identität eine bestimmte Aktion ausführen darf. Dieses Kapitel setzt beides voraus und
beschreibt ausschließlich die fachlichen Ressourcen und Aktionen der Benutzerverwaltung selbst.

### Benutzersuche

**Zweck:**
Sucht nach Benutzerkonten und liefert die gefundenen Konten mit ihren wesentlichen
Merkmalen zurück.

**HTTP-Methode und Pfad:**
`GET /api/users/search`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `user:search`.

**Anfrage:**
Ein Suchbegriff (Pflichtangabe) sowie optional eine organisatorische Einschränkung.

**Antwort:**
Eine Liste der gefundenen Benutzerkonten mit Kontenkennung, Anzeigename, Aktivierungsstatus,
Sperrstatus, organisatorischer Zuordnung und eindeutiger Kennung innerhalb des Verzeichnisses.

**Fachliche Fehlerfälle:**
- Der übergebene Suchbegriff entspricht nicht der erwarteten Struktur.

**Hinweise:**
Es existiert kein eigener Endpunkt zum Abruf der Details eines einzelnen Benutzerkontos. Die
Detailansicht eines Benutzerkontos stützt sich auf das Ergebnis dieser Suche.

### Benutzer bearbeiten

**Zweck:**
Ändert die Stammdaten eines bestehenden Benutzerkontos.

**HTTP-Methode und Pfad:**
`PUT /api/users/{Benutzerkonto}/edit`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `user:edit`.

**Anfrage:**
Eine oder mehrere der folgenden Angaben: Vorname, Nachname, Anzeigename, Titel, Abteilung,
Standort, Telefonnummer, Mobilnummer, Beschreibung, Ablaufdatum des Kontos. Nicht übergebene
Angaben bleiben unverändert. Nicht vorgesehene zusätzliche Angaben werden abgelehnt.

**Antwort:**
Bestätigung der erfolgreichen Änderung.

**Fachliche Fehlerfälle:**
- Das angegebene Benutzerkonto entspricht nicht der erwarteten Kontenkennung.
- Eine übergebene Angabe entspricht nicht der erwarteten Struktur oder ist nicht vorgesehen.
- Die Änderung kann gegenüber Active Directory nicht durchgeführt werden.

### Benutzer aktivieren

**Zweck:**
Aktiviert ein zuvor deaktiviertes Benutzerkonto.

**HTTP-Methode und Pfad:**
`POST /api/users/{Benutzerkonto}/enable`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `user:enable`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Bestätigung der erfolgreichen Aktivierung.

**Fachliche Fehlerfälle:**
- Das angegebene Benutzerkonto entspricht nicht der erwarteten Kontenkennung.
- Die Aktivierung kann gegenüber Active Directory nicht durchgeführt werden.

### Benutzer deaktivieren

**Zweck:**
Deaktiviert ein bestehendes Benutzerkonto.

**HTTP-Methode und Pfad:**
`POST /api/users/{Benutzerkonto}/disable`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `user:disable`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Bestätigung der erfolgreichen Deaktivierung.

**Fachliche Fehlerfälle:**
- Das angegebene Benutzerkonto entspricht nicht der erwarteten Kontenkennung.
- Die Deaktivierung kann gegenüber Active Directory nicht durchgeführt werden.

### Benutzer entsperren

**Zweck:**
Hebt die Sperrung eines Benutzerkontos auf.

**HTTP-Methode und Pfad:**
`POST /api/users/{Benutzerkonto}/unlock`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `user:unlock`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Bestätigung der erfolgreichen Entsperrung.

**Fachliche Fehlerfälle:**
- Das angegebene Benutzerkonto entspricht nicht der erwarteten Kontenkennung.
- Die Entsperrung kann gegenüber Active Directory nicht durchgeführt werden.

### Passwort zurücksetzen

**Zweck:**
Setzt das Passwort eines Benutzerkontos neu.

**HTTP-Methode und Pfad:**
`POST /api/users/{Benutzerkonto}/reset-password`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `user:reset-password`.

**Anfrage:**
Das neue Passwort sowie optional, ob der Benutzer das Passwort beim nächsten Login ändern muss
und ob er es selbst ändern darf. Das neue Passwort muss die für ConnOps geltenden
Mindestanforderungen erfüllen.

**Antwort:**
Bestätigung der erfolgreichen Zurücksetzung.

**Fachliche Fehlerfälle:**
- Das angegebene Benutzerkonto entspricht nicht der erwarteten Kontenkennung.
- Das angegebene Passwort erfüllt die Mindestanforderungen nicht.
- Die Zurücksetzung kann gegenüber Active Directory nicht durchgeführt werden.

**Hinweise:**
Das neue Passwort wird in der Antwort nicht zurückgegeben.

### Gruppenmitgliedschaften abrufen

**Zweck:**
Liefert die Gruppen, denen ein Benutzerkonto aktuell zugeordnet ist.

**HTTP-Methode und Pfad:**
`GET /api/users/{Benutzerkonto}/groups`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `user:read-groups`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Eine Liste der Gruppen mit Name und eindeutiger Kennung innerhalb des Verzeichnisses.

**Fachliche Fehlerfälle:**
- Das angegebene Benutzerkonto entspricht nicht der erwarteten Kontenkennung.

### Gruppenmitgliedschaft hinzufügen

**Zweck:**
Ordnet ein Benutzerkonto einer Gruppe zu.

**HTTP-Methode und Pfad:**
`POST /api/users/{Benutzerkonto}/groups`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `user:add-group`.

**Anfrage:**
Der Distinguished Name der Gruppe.

**Antwort:**
Bestätigung der erfolgreichen Zuordnung.

**Fachliche Fehlerfälle:**
- Der angegebene Distinguished Name entspricht nicht der erwarteten Struktur.
- Die Zuordnung kann gegenüber Active Directory nicht durchgeführt werden.

### Gruppenmitgliedschaft entfernen

**Zweck:**
Entfernt ein Benutzerkonto aus einer Gruppe.

**HTTP-Methode und Pfad:**
`DELETE /api/users/{Benutzerkonto}/groups/{Distinguished-Name}`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `user:remove-group`.

**Anfrage:**
Kein Inhalt erforderlich; der Distinguished Name der Gruppe ist Bestandteil des Pfads.

**Antwort:**
Bestätigung der erfolgreichen Entfernung.

**Fachliche Fehlerfälle:**
- Der angegebene Distinguished Name entspricht nicht der erwarteten Struktur.
- Die Entfernung kann gegenüber Active Directory nicht durchgeführt werden.

### Verfügbare Gruppen abrufen

**Zweck:**
Liefert alle im Verzeichnis vorhandenen Gruppen, unabhängig von einem bestimmten
Benutzerkonto — etwa zur Auswahl bei der Zuordnung einer neuen Gruppe.

**HTTP-Methode und Pfad:**
`GET /api/users/groups/all`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `user:add-group`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Eine alphabetisch sortierte Liste aller Gruppen mit Name und eindeutiger Kennung innerhalb des
Verzeichnisses, ohne Duplikate.

**Fachliche Fehlerfälle:**
- Die Abfrage kann gegenüber Active Directory nicht durchgeführt werden.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt ausschließlich die öffentliche Programmierschnittstelle. Es enthält
keine Beschreibung des zugrunde liegenden Verzeichnisdienstprotokolls, keine Beschreibung der
Berechtigungsprüfung selbst und keine Aussage zur Protokollierung durchgeführter Aktionen —
diese sind Gegenstand von `SECURITY.md`. Endpunkte zum Anlegen oder Löschen von
Benutzerkonten sind nicht Bestandteil dieses Kapitels, solange ihre Existenz als öffentlicher
Endpunkt nicht verifiziert ist.

---

## Kapitel 4 — Computerverwaltung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt die Endpunkte zur Verwaltung von Active-Directory-Computerkonten. Der
Funktionsumfang ist gegenüber der Benutzerverwaltung (Kapitel 3) bewusst kleiner: Es existieren
ausschließlich Endpunkte zum Suchen sowie zum Aktivieren und Deaktivieren eines Computerkontos.

### Computersuche

**Zweck:**
Sucht nach Computerkonten und liefert die gefundenen Konten mit ihren wesentlichen Merkmalen
zurück.

**HTTP-Methode und Pfad:**
`GET /api/computers/search`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `computer:search`.

**Anfrage:**
Ein Suchbegriff (Pflichtangabe, mindestens zwei Zeichen).

**Antwort:**
Eine Liste der gefundenen Computerkonten mit Name, Aktivierungsstatus und eindeutiger Kennung
innerhalb des Verzeichnisses.

**Fachliche Fehlerfälle:**
- Der übergebene Suchbegriff fehlt oder ist zu kurz.

**Hinweise:**
Es existiert kein eigener Endpunkt zum Abruf der Details eines einzelnen Computerkontos. Die
Detailansicht eines Computerkontos stützt sich auf das Ergebnis dieser Suche.

### Computer aktivieren

**Zweck:**
Aktiviert ein zuvor deaktiviertes Computerkonto.

**HTTP-Methode und Pfad:**
`POST /api/computers/{Computername}/enable`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `computer:enable`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Bestätigung der erfolgreichen Aktivierung.

**Fachliche Fehlerfälle:**
- Der angegebene Computername entspricht nicht der erwarteten Struktur.
- Die Aktivierung kann gegenüber Active Directory nicht durchgeführt werden.

### Computer deaktivieren

**Zweck:**
Deaktiviert ein bestehendes Computerkonto.

**HTTP-Methode und Pfad:**
`POST /api/computers/{Computername}/disable`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `computer:disable`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Bestätigung der erfolgreichen Deaktivierung.

**Fachliche Fehlerfälle:**
- Der angegebene Computername entspricht nicht der erwarteten Struktur.
- Die Deaktivierung kann gegenüber Active Directory nicht durchgeführt werden.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt ausschließlich die öffentliche Programmierschnittstelle für die
Verwaltung von Computerkonten. Es enthält keine Beschreibung des zugrunde liegenden
Verzeichnisdienstprotokolls und keine Aussage zur Protokollierung durchgeführter Aktionen —
diese sind Gegenstand von `SECURITY.md`.

Auf einer Computer-Detailseite im Frontend können zusätzlich Funktionen zu laufenden Sitzungen
und zu Übergabedokumenten sichtbar sein. Diese sind fachlich eigenständige Bereiche mit eigenen
Endpunkten und werden in den jeweils zuständigen Kapiteln dieses Dokuments beschrieben, sobald
diese Kapitel entstehen — nicht in diesem Kapitel.

Endpunkte zum Bearbeiten, Anlegen, Löschen eines Computerkontos oder zur Gruppenzuordnung eines
Computerkontos sind nicht Bestandteil dieses Kapitels, solange ihre Existenz als öffentlicher
Endpunkt nicht verifiziert ist.

---

## Kapitel 5 — Exchange

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, in welcher Form Exchange Bestandteil der öffentlichen
Programmierschnittstelle von ConnOps ist.

### Öffentliche Endpunkte

ConnOps stellt keine öffentlichen API-Endpunkte für Exchange-Funktionen bereit.

### Abgrenzung

Die technische Integration und interne Kommunikation mit Exchange sind Gegenstand von
`TECHNICAL.md`. Die Authentifizierung der Plattform gegenüber Exchange ist Gegenstand von
`SECURITY.md` Kapitel 3.

Fachliche Abläufe, in denen Exchange als beteiligtes System verwendet wird, werden in den
jeweils zuständigen Funktionskapiteln beschrieben.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt bewusst das Fehlen einer öffentlichen Exchange-Schnittstelle. Es
enthält keine Beschreibung interner Aufrufwege oder technischer Integrationsdetails.

---

## Kapitel 6 — Citrix

### Zweck dieses Kapitels

Dieses Kapitel beschreibt die Endpunkte zur Abfrage und Beendigung laufender
Citrix-Sitzungen.

### Sitzung eines Benutzers abfragen

**Zweck:**
Liefert die aktuell laufende Citrix-Sitzung eines bestimmten Benutzers, sofern vorhanden.

**HTTP-Methode und Pfad:**
`GET /api/citrix/session/{Benutzerkonto}`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `citrix:read`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Die laufende Sitzung mit Benutzer-, Client- und Verbindungsinformationen sowie Sitzungsstatus
und Zeitangaben. Besteht keine laufende Sitzung für den angegebenen Benutzer, wird dies als
leeres Ergebnis zurückgegeben, nicht als Fehler.

**Fachliche Fehlerfälle:**
- Das angebundene Citrix-System ist nicht erreichbar oder liefert keine gültige Antwort.

### Sitzung eines Clients abfragen

**Zweck:**
Liefert die aktuell laufende Citrix-Sitzung auf einem bestimmten Client-Rechner, sofern
vorhanden.

**HTTP-Methode und Pfad:**
`GET /api/citrix/client/{Clientname}`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `citrix:read`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Die laufende Sitzung mit Benutzer-, Client- und Verbindungsinformationen sowie Sitzungsstatus
und Zeitangaben. Besteht keine laufende Sitzung für den angegebenen Client, wird dies als
leeres Ergebnis zurückgegeben, nicht als Fehler.

**Fachliche Fehlerfälle:**
- Das angebundene Citrix-System ist nicht erreichbar oder liefert keine gültige Antwort.

### Alle aktiven Sitzungen abfragen

**Zweck:**
Liefert alle derzeit aktiven Citrix-Sitzungen.

**HTTP-Methode und Pfad:**
`GET /api/citrix/active`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `citrix:read`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Eine Liste aller derzeit aktiven Citrix-Sitzungen mit denselben Informationen wie bei der
Abfrage einer einzelnen Sitzung, zusammen mit deren Anzahl.

**Fachliche Fehlerfälle:**
- Das angebundene Citrix-System ist nicht erreichbar oder liefert keine gültige Antwort.

### Sitzung beenden

**Zweck:**
Meldet einen Benutzer von einer laufenden Citrix-Sitzung ab.

**HTTP-Methode und Pfad:**
`POST /api/citrix/logoff`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `citrix:logoff`.

**Anfrage:**
Die eindeutige Kennung der zu beendenden Sitzung (Pflichtangabe). Der Benutzername kann
ergänzend angegeben werden.

**Antwort:**
Bestätigung, dass die Anforderung zur Abmeldung angenommen wurde.

**Fachliche Fehlerfälle:**
- Die eindeutige Kennung der Sitzung fehlt.

**Hinweise:**
Die erfolgreiche Annahme der Anfrage bedeutet nicht, dass die Sitzung bereits beendet wurde.
Die tatsächliche Abmeldung erfolgt durch das Citrix-System asynchron und kann zeitlich
verzögert eintreten.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt ausschließlich die öffentliche Programmierschnittstelle. Es enthält
keine Beschreibung der technischen Anbindung an das Citrix-System und keine Aussage zur
Protokollierung durchgeführter Aktionen — diese sind Gegenstand von `TECHNICAL.md`
beziehungsweise `SECURITY.md`. Weitere öffentliche Citrix-Endpunkte sind derzeit nicht
Bestandteil der Programmierschnittstelle.

---

## Kapitel 7 — TopDesk

### Zweck dieses Kapitels

Dieses Kapitel beschreibt die Endpunkte zur Abfrage, Validierung und Ausführung von
TopDesk-Changes sowie den Endpunkt, über den TopDesk Ereignisse an ConnOps meldet. Die
Trennung von Validierung und Ausführung entspricht dem in `PATTERNS.md` Kapitel 3
beschriebenen Muster; die Begründung, warum Changes ausschließlich durch eine Benutzeraktion
ausgeführt werden, steht in `DECISIONS.md` ADR-012 und wird hier nicht wiederholt.

### Aktuelle Changes abrufen

**Zweck:**
Liefert Changes, die Aufmerksamkeit erfordern — etwa solche mit einem Konflikt, einer Warnung,
einer teilweise fehlgeschlagenen Ausführung oder einem fälligen oder fehlenden Zieldatum.

**HTTP-Methode und Pfad:**
`GET /api/topdesk/changes/active`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `topdesk:read`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Eine Liste der betroffenen Changes mit ihren wesentlichen Merkmalen — unter anderem Typ,
Status, Zieldatum sowie den für die Ausführung ermittelten Zuordnungen und ihrem aktuellen
Bearbeitungszustand — sowie deren Anzahl.

**Fachliche Fehlerfälle:**
- Die Abfrage kann nicht durchgeführt werden.

### Ausstehende Changes abrufen

**Zweck:**
Liefert Changes, die noch nicht fällig sind.

**HTTP-Methode und Pfad:**
`GET /api/topdesk/changes/upcoming`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `topdesk:read`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Eine Liste der ausstehenden Changes mit denselben Merkmalen wie bei den aktuellen Changes,
sowie deren Anzahl.

**Fachliche Fehlerfälle:**
- Die Abfrage kann nicht durchgeführt werden.

### Verlauf abrufen

**Zweck:**
Liefert bereits abgeschlossene sowie nicht mehr aktive Changes.

**HTTP-Methode und Pfad:**
`GET /api/topdesk/changes/history`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `topdesk:read`.

**Anfrage:**
Optionale Einschränkung auf einen Zeitraum, einen Change-Typ und einen Status.

**Antwort:**
Eine Liste der Changes im Verlauf, jeweils einschließlich der zugehörigen
Ausführungsschritte, sowie deren Anzahl.

**Fachliche Fehlerfälle:**
- Die Abfrage kann nicht durchgeführt werden.

### Anzahl aktueller Changes abrufen

**Zweck:**
Liefert die Anzahl der Changes, die Aufmerksamkeit erfordern, ohne die vollständigen
Change-Daten übertragen zu müssen — etwa für eine Zählanzeige im Frontend.

**HTTP-Methode und Pfad:**
`GET /api/topdesk/changes/count`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `topdesk:read`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Die Anzahl der aktuellen Changes.

**Fachliche Fehlerfälle:**
- Die Abfrage kann nicht durchgeführt werden.

**Hinweise:**
Es existiert kein eigener Endpunkt zum Abruf der Detaildaten eines einzelnen Changes. Diese
sind Bestandteil der Antwort der vorstehenden Listen-Endpunkte.

### Change validieren

**Zweck:**
Prüft, ob die für die Ausführung eines Changes notwendigen Voraussetzungen erfüllt sind, ohne
den Change auszuführen oder seinen Zustand zu verändern.

**HTTP-Methode und Pfad:**
`GET /api/topdesk/changes/{Change-Kennung}/validate`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `topdesk:read`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Ob der Change insgesamt als ausführbar gilt, sowie das Ergebnis jeder einzelnen geprüften
Voraussetzung. Welche Voraussetzungen geprüft werden, hängt vom Typ des Changes ab. Ist der
Change noch nicht aufgelöst, wird dies ohne Einzelprüfungen zurückgegeben.

**Fachliche Fehlerfälle:**
- Die angegebene Change-Kennung existiert nicht.

**Hinweise:**
Diese Antwort enthält ausschließlich die Ergebnisse der Prüfung, nicht die fachlichen Inhalte
des Changes selbst. Die tatsächlichen Change-Daten sind Bestandteil der Listen-Endpunkte.

### Change überschreiben

**Zweck:**
Überschreibt einzelne, zuvor automatisch ermittelte Angaben eines Changes durch manuell
festgelegte Werte.

**HTTP-Methode und Pfad:**
`PUT /api/topdesk/changes/{Change-Kennung}/override`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `topdesk:process-single`.

**Anfrage:**
Die zu überschreibenden Angaben.

**Antwort:**
Die aktualisierten Change-Daten, wobei manuell festgelegte Angaben als solche
gekennzeichnet sind.

**Fachliche Fehlerfälle:**
- Die erforderlichen Angaben fehlen.
- Die angegebene Change-Kennung existiert nicht.
- Der Change befindet sich in einem Zustand, in dem ein Überschreiben nicht vorgesehen ist —
  etwa, weil er bereits abgeschlossen ist oder gerade ausgeführt wird.

**Hinweise:**
Befand sich der Change zuvor im Konfliktzustand, wechselt er durch dieses Überschreiben in den
Warnzustand, nicht unmittelbar in den ausführbaren Normalzustand.

### Ausführungsschritt als erledigt markieren

**Zweck:**
Markiert einen fehlgeschlagenen Ausführungsschritt eines Changes manuell als erledigt, etwa
nachdem er außerhalb von ConnOps nachträglich korrigiert wurde.

**HTTP-Methode und Pfad:**
`POST /api/topdesk/changes/{Change-Kennung}/steps/{Ausführungsschritt}/done`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `topdesk:process-single`.

**Anfrage:**
Optional eine Begründung.

**Antwort:**
Bestätigung sowie der sich daraus ergebende Gesamtstatus des Changes und die Anzahl der noch
verbleibenden fehlgeschlagenen Ausführungsschritte.

**Fachliche Fehlerfälle:**
- Die erforderlichen Angaben fehlen.
- Der angegebene Ausführungsschritt wurde für diesen Change nicht gefunden.
- Der angegebene Ausführungsschritt ist bereits erfolgreich abgeschlossen.

**Hinweise:**
Der Gesamtstatus eines Changes wechselt nur dann automatisch in den vollständig abgeschlossenen
Zustand, wenn keine fehlgeschlagenen Ausführungsschritte mehr verbleiben. Das Markieren eines
einzelnen Ausführungsschritts reicht daher nicht notwendigerweise aus, um den gesamten Change
abzuschließen.

### Change ausführen

**Zweck:**
Führt einen zuvor validierten Change tatsächlich aus.

**HTTP-Methode und Pfad:**
`POST /api/topdesk/changes/{Change-Kennung}/execute`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `topdesk:process-single`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Der sich aus der Ausführung ergebende Status des Changes sowie, falls einzelne
Ausführungsschritte fehlgeschlagen sind, deren Fehlerdetails.

**Fachliche Fehlerfälle:**
- Die angegebene Change-Kennung existiert nicht.
- Der Change ist noch nicht aufgelöst.
- Der Change wurde bereits ausgeführt.

**Hinweise:**
Eine erfolgreiche Validierung garantiert nicht, dass der Change zu einem späteren Zeitpunkt
weiterhin ausführbar ist. Zwischen Validierung und Ausführung können sich die zugrunde
liegenden Voraussetzungen ändern. Die Ausführung erfolgt ausschließlich durch diesen Aufruf;
es existiert kein automatisierter Auslöser dafür.

### Eingehende Ereignisse von TopDesk

**Zweck:**
Nimmt Ereignisse von TopDesk entgegen und stößt deren fachliche Verarbeitung an.

**HTTP-Methode und Pfad:**
`POST /api/topdesk/webhook`

**Zugriffsvoraussetzung:**
Keine Anwendungssitzung erforderlich. Die Authentifizierung erfolgt über ein gemeinsames
Geheimnis im Anfrage-Header, wie in `SECURITY.md` Kapitel 3 beschrieben.

**Anfrage:**
Die eindeutige Change-Kennung.

**Antwort:**
Eine Bestätigung, dass das Ereignis zur Verarbeitung angenommen wurde. Wird dasselbe Ereignis
innerhalb kurzer Zeit erneut gemeldet, während die vorherige Verarbeitung noch läuft, wird dies
gesondert als solches gekennzeichnet, ohne dass eine erneute Verarbeitung angestoßen wird.

**Fachliche Fehlerfälle:**
- Das übermittelte Geheimnis ist ungültig oder fehlt.
- Die angegebene Change-Kennung fehlt oder entspricht nicht der erwarteten Struktur.

**Hinweise:**
Dieser Endpunkt bestätigt den Empfang unmittelbar, bevor die eigentliche fachliche Verarbeitung
des gemeldeten Ereignisses erfolgt, entsprechend dem in `PATTERNS.md` Kapitel 3 beschriebenen
Muster der Trennung von Empfang und Verarbeitung. Bei fehlgeschlagener Authentifizierung
enthält die Antwort keinen strukturierten Fehlertext, anders als bei den übrigen Fehlerfällen
dieses Endpunkts.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt ausschließlich die öffentliche Programmierschnittstelle. Es enthält
keine Beschreibung der technischen Umsetzung der Change-Verarbeitung und keine Aussage zur
Protokollierung durchgeführter Aktionen — diese sind Gegenstand von `TECHNICAL.md`
beziehungsweise `SECURITY.md`.

---

## Kapitel 8 — Docusnap

### Zweck dieses Kapitels

Dieses Kapitel beschreibt die Endpunkte zur Einsicht und Pflege des Asset-Bestands, der aus
Docusnap in ConnOps übernommen wird.

### Assets abrufen

**Zweck:**
Liefert den Asset-Bestand.

**HTTP-Methode und Pfad:**
`GET /api/docusnap/assets`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `docusnap:read`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Eine Liste aller Assets mit ihren wesentlichen technischen und organisatorischen Merkmalen,
ihrem Asset-Status sowie einem Vermerk, ob es sich um ein neu hinzugekommenes Asset handelt.
Assets, die seit dem vorherigen Import neu erkannt wurden, stehen am Anfang der Liste.

**Fachliche Fehlerfälle:**
- Der Asset-Bestand kann nicht geladen werden.

**Hinweise:**
Es existiert kein eigener Endpunkt zum Abruf der Details eines einzelnen Assets und keine
serverseitige Such- oder Filterfunktion; dieser Endpunkt liefert stets den vollständigen
Bestand.

### Statistik abrufen

**Zweck:**
Liefert eine zusammenfassende Übersicht über den Asset-Bestand.

**HTTP-Methode und Pfad:**
`GET /api/docusnap/stats`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `docusnap:read`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Die Gesamtzahl der Assets sowie die Anzahl je Asset-Status.

**Fachliche Fehlerfälle:**
- Die Statistik kann nicht geladen werden.

### Asset-Status ändern

**Zweck:**
Ändert den Asset-Status oder den Kommentar eines einzelnen Assets.

**HTTP-Methode und Pfad:**
`POST /api/docusnap/update`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `docusnap:update`.

**Anfrage:**
Die eindeutigen Merkmale des Assets (Pflichtangaben) sowie optional der neue Status und ein
Kommentar.

**Antwort:**
Bestätigung der erfolgreichen Änderung.

**Fachliche Fehlerfälle:**
- Die zur Identifikation erforderlichen Angaben fehlen.
- Das angegebene Asset existiert nicht.

**Hinweise:**
Der Asset-Status kann sich auch ohne Aufruf dieses Endpunkts als Nebeneffekt anderer
fachlicher Vorgänge ändern, etwa im Rahmen der Erstellung eines Übergabedokuments.

### Import anstoßen

**Zweck:**
Liest den aktuellen Asset-Bestand aus der Docusnap-Exportdatei ein und aktualisiert den in
ConnOps geführten Bestand entsprechend.

**HTTP-Methode und Pfad:**
`POST /api/docusnap/import`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `docusnap:import`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Bestätigung, dass der Import durchgeführt wurde, sowie die Anzahl der neu hinzugekommenen und
der aktualisierten Assets.

**Fachliche Fehlerfälle:**
- Der Import kann nicht durchgeführt werden.

**Hinweise:**
Dieser Import erfolgt ausschließlich lesend gegenüber der Docusnap-Exportdatei. ConnOps
schreibt keine Daten zurück an Docusnap. Es existiert kein Endpunkt zum Export der in ConnOps
geführten Asset-Daten. Ein regelmäßiger automatischer Import erfolgt nicht.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt ausschließlich die öffentliche Programmierschnittstelle. Es enthält
keine Beschreibung der Dateiablage, des Importmechanismus oder des Datenformats — diese sind
Gegenstand von `TECHNICAL.md`.

---

## Kapitel 9 — Organisationsverwaltung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt die Endpunkte zur Verwaltung der Organisationsstruktur: Abteilungen
sowie die ihnen zugeordneten Jobrollen, die unter anderem für die automatisierte Verarbeitung
von TopDesk-Changes verwendet werden. Diese Jobrollen sind nicht mit den in Kapitel 10
beschriebenen Berechtigungsrollen zu verwechseln; sie haben keinen Bezug zu Autorisierung.

### Abteilungen abrufen

**Zweck:**
Liefert alle Abteilungen.

**HTTP-Methode und Pfad:**
`GET /api/org/departments`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `org:read`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Eine Liste aller Abteilungen mit ihren Stammdaten.

**Fachliche Fehlerfälle:**
- Die Abfrage kann nicht durchgeführt werden.

### Abteilung anlegen

**Zweck:**
Legt eine neue Abteilung an.

**HTTP-Methode und Pfad:**
`POST /api/org/departments`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `org:write`.

**Anfrage:**
Name und zugeordnete Active-Directory-Organisationseinheit (Pflichtangaben) sowie optional
eine Beschreibung.

**Antwort:**
Die neu angelegte Abteilung.

**Fachliche Fehlerfälle:**
- Die erforderlichen Angaben fehlen.
- Eine Abteilung mit demselben Namen existiert bereits.

### Abteilung bearbeiten

**Zweck:**
Ändert die Stammdaten einer bestehenden Abteilung.

**HTTP-Methode und Pfad:**
`PUT /api/org/departments/{Abteilungs-Id}`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `org:write`.

**Anfrage:**
Name und zugeordnete Active-Directory-Organisationseinheit (Pflichtangaben) sowie optional
eine Beschreibung.

**Antwort:**
Die aktualisierte Abteilung.

**Fachliche Fehlerfälle:**
- Die angegebene Abteilung existiert nicht.
- Die erforderlichen Angaben fehlen.
- Eine andere Abteilung mit demselben Namen existiert bereits.

### Abteilung löschen

**Zweck:**
Entfernt eine Abteilung.

**HTTP-Methode und Pfad:**
`DELETE /api/org/departments/{Abteilungs-Id}`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `org:write`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Bestätigung der erfolgreichen Löschung.

**Fachliche Fehlerfälle:**
- Die angegebene Abteilung existiert nicht.
- Die Abteilung kann nicht gelöscht werden, solange ihr noch Jobrollen zugeordnet sind.

### Jobrollen abrufen

**Zweck:**
Liefert alle vorhandenen Jobrollen einschließlich ihrer organisatorischen Zuordnung.

**HTTP-Methode und Pfad:**
`GET /api/org/roles`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `org:read`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Eine Liste aller Jobrollen mit ihren Stammdaten, einschließlich der zugehörigen Abteilung, der
für die Bereitstellung relevanten AD-Gruppen, der Postfachkonfiguration und etwaiger manuell
auszuführender Aufgaben.

**Fachliche Fehlerfälle:**
- Die Abfrage kann nicht durchgeführt werden.

### Jobrolle anlegen

**Zweck:**
Legt eine neue Jobrolle innerhalb einer Abteilung an.

**HTTP-Methode und Pfad:**
`POST /api/org/roles`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `org:write`.

**Anfrage:**
Zugehörige Abteilung und Name (Pflichtangaben) sowie optional zuzuordnende AD-Gruppen,
Postfachkonfiguration, manuelle Aufgaben und eine Beschreibung.

**Antwort:**
Die neu angelegte Jobrolle.

**Fachliche Fehlerfälle:**
- Die erforderlichen Angaben fehlen.
- Eine Jobrolle mit demselben Namen existiert innerhalb der Abteilung bereits.

### Jobrolle bearbeiten

**Zweck:**
Ändert die Stammdaten einer bestehenden Jobrolle.

**HTTP-Methode und Pfad:**
`PUT /api/org/roles/{Jobrollen-Id}`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `org:write`.

**Anfrage:**
Zugehörige Abteilung und Name (Pflichtangaben) sowie optional zuzuordnende AD-Gruppen,
Postfachkonfiguration, manuelle Aufgaben und eine Beschreibung.

**Antwort:**
Die aktualisierte Jobrolle.

**Fachliche Fehlerfälle:**
- Die angegebene Jobrolle existiert nicht.
- Die erforderlichen Angaben fehlen.
- Eine andere Jobrolle mit demselben Namen existiert innerhalb der Abteilung bereits.

### Jobrolle löschen

**Zweck:**
Entfernt eine Jobrolle.

**HTTP-Methode und Pfad:**
`DELETE /api/org/roles/{Jobrollen-Id}`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `org:write`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Bestätigung der erfolgreichen Löschung.

**Fachliche Fehlerfälle:**
- Die angegebene Jobrolle existiert nicht.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt ausschließlich die öffentliche Programmierschnittstelle für
Abteilungen und Jobrollen. Es enthält keine Beschreibung, wie diese Daten in der
TopDesk-Change-Verarbeitung verwendet werden — das ist Gegenstand von Kapitel 7. Die
Verwaltung von Berechtigungsrollen und Plattform-Einstellungen ist nicht Bestandteil dieses
Kapitels; sie wird in Kapitel 10 beschrieben.

---

## Kapitel 10 — Administration

### Zweck dieses Kapitels

Dieses Kapitel beschreibt die Endpunkte zur Verwaltung der Berechtigungsrollen und der
plattformweiten Einstellungen. Diese Endpunkte betreffen die Konfiguration der Plattform
selbst, nicht fachliche Ressourcen wie Benutzer-, Computer-, Abteilungs- oder Jobrollendaten.

### Berechtigungsrollen abrufen

**Zweck:**
Liefert alle Berechtigungsrollen mit den ihnen jeweils zugeordneten Permissions.

**HTTP-Methode und Pfad:**
`GET /api/admin/roles`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `rbac:manage`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Eine Liste aller Berechtigungsrollen mit ihren jeweils zugeordneten Permissions.

**Fachliche Fehlerfälle:**
- Die Abfrage kann nicht durchgeführt werden.

**Hinweise:**
Es existiert kein Endpunkt zum Anlegen oder Löschen einer Berechtigungsrolle. Die vorhandenen
Rollen sind fest vorgegeben.

### Permissions einer Berechtigungsrolle festlegen

**Zweck:**
Legt fest, welche Permissions einer bestehenden Berechtigungsrolle zugeordnet sind.

**HTTP-Methode und Pfad:**
`PUT /api/admin/roles/{Rollen-Id}/permissions`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `rbac:manage`.

**Anfrage:**
Die vollständige Liste der der Rolle zugeordneten Permissions.

**Antwort:**
Bestätigung der erfolgreichen Änderung.

**Fachliche Fehlerfälle:**
- Die angegebene Berechtigungsrolle existiert nicht.
- Die Permission `rbac:manage` soll einer anderen Rolle als der dafür fest vorgesehenen
  zugewiesen werden.
- Der dafür fest vorgesehenen Rolle soll die Permission `rbac:manage` entzogen werden.

**Hinweise:**
Diese Anfrage ersetzt die vollständige Permission-Zuordnung der angegebenen Rolle; sie ergänzt
nicht lediglich einzelne Permissions. Die Permission `rbac:manage` selbst ist fest an eine
einzelne, dafür fest vorgesehene Rolle gebunden und kann über diesen Endpunkt nicht auf eine
andere Rolle übertragen werden; dadurch existiert zu jedem Zeitpunkt genau eine
Berechtigungsrolle, der die Permission `rbac:manage` zugeordnet ist. Für alle übrigen
Permissions besteht keine entsprechende Einschränkung: Sie können durch die administrative
Rolle beliebigen Rollen zugewiesen oder entzogen werden.

### Health-Einstellungen abrufen

**Zweck:**
Liefert die aktuellen Schwellenwerte für die Systemstatusüberwachung.

**HTTP-Methode und Pfad:**
`GET /api/admin/settings/health`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `rbac:manage`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Die aktuellen Schwellenwerte für die Systemstatusüberwachung.

**Fachliche Fehlerfälle:**
- Die Abfrage kann nicht durchgeführt werden.

### Health-Einstellungen ändern

**Zweck:**
Ändert die Schwellenwerte für die Systemstatusüberwachung.

**HTTP-Methode und Pfad:**
`PUT /api/admin/settings/health`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `rbac:manage`.

**Anfrage:**
Die zu ändernden Schwellenwerte.

**Antwort:**
Bestätigung der erfolgreichen Änderung.

**Fachliche Fehlerfälle:**
- Eine übergebene Angabe entspricht nicht der erwarteten Struktur.

### Audit-Einstellungen abrufen

**Zweck:**
Liefert die aktuelle Aufbewahrungsdauer für das Audit-Log.

**HTTP-Methode und Pfad:**
`GET /api/admin/settings/audit`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `rbac:manage`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Die aktuelle Aufbewahrungsdauer für das Audit-Log.

**Fachliche Fehlerfälle:**
- Die Abfrage kann nicht durchgeführt werden.

### Audit-Einstellungen ändern

**Zweck:**
Ändert die Aufbewahrungsdauer für das Audit-Log.

**HTTP-Methode und Pfad:**
`PUT /api/admin/settings/audit`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `rbac:manage`.

**Anfrage:**
Die neue Aufbewahrungsdauer.

**Antwort:**
Bestätigung der erfolgreichen Änderung.

**Fachliche Fehlerfälle:**
- Die angegebene Aufbewahrungsdauer entspricht nicht der erwarteten Struktur.

### Systemeinstellungen abrufen

**Zweck:**
Liefert die aktuelle Konfiguration der automatisierten TopDesk-Verarbeitung.

**HTTP-Methode und Pfad:**
`GET /api/admin/settings/system`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `rbac:manage`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Ob die automatisierte Verarbeitung aktiviert ist sowie das Intervall, in dem sie erfolgt.

**Fachliche Fehlerfälle:**
- Die Abfrage kann nicht durchgeführt werden.

### Systemeinstellungen ändern

**Zweck:**
Aktiviert oder deaktiviert die automatisierte TopDesk-Verarbeitung und legt deren Intervall
fest.

**HTTP-Methode und Pfad:**
`PUT /api/admin/settings/system`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `rbac:manage`.

**Anfrage:**
Ob die automatisierte Verarbeitung aktiviert sein soll sowie das gewünschte Intervall.

**Antwort:**
Bestätigung der erfolgreichen Änderung.

**Fachliche Fehlerfälle:**
- Eine übergebene Angabe entspricht nicht der erwarteten Struktur.

### TopDesk-Verbindungseinstellungen abrufen

**Zweck:**
Liefert die aktuell hinterlegte Adresse des TopDesk-Systems.

**HTTP-Methode und Pfad:**
`GET /api/admin/settings/topdesk`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `rbac:manage`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Die aktuell hinterlegte Adresse des TopDesk-Systems.

**Fachliche Fehlerfälle:**
- Die Abfrage kann nicht durchgeführt werden.

### TopDesk-Verbindungseinstellungen ändern

**Zweck:**
Ändert die Adresse, unter der ConnOps das TopDesk-System anspricht.

**HTTP-Methode und Pfad:**
`PUT /api/admin/settings/topdesk`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `rbac:manage`.

**Anfrage:**
Die neue Adresse des TopDesk-Systems.

**Antwort:**
Bestätigung der erfolgreichen Änderung.

**Fachliche Fehlerfälle:**
- Die angegebene Adresse entspricht nicht der erwarteten Struktur.
- Unter der angegebenen Adresse kann keine Verbindung zu TopDesk hergestellt werden.

**Hinweise:**
Vor der Übernahme der neuen Adresse wird geprüft, ob unter ihr tatsächlich eine Verbindung zu
TopDesk hergestellt werden kann.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt ausschließlich die öffentliche Programmierschnittstelle für die
Verwaltung von Berechtigungsrollen und Plattform-Einstellungen. Es enthält keine Beschreibung,
wie AD-Gruppen einer Berechtigungsrolle zugeordnet werden — hierfür existiert derzeit kein
öffentlicher Endpunkt; diese Zuordnung erfolgt außerhalb der Anwendung. Die Begründung des in
diesem Kapitel sichtbaren Zusammenhangs zwischen der Permission `rbac:manage` und der dafür
fest vorgesehenen Rolle ist Gegenstand von `SECURITY.md`.

---

## Kapitel 11 — Audit

### Zweck dieses Kapitels

Dieses Kapitel beschreibt die Endpunkte zur Einsicht in das Audit-Log der Plattform.

### Audit-Log durchsuchen

**Zweck:**
Liefert protokollierte Aktionen, eingeschränkt auf die angegebenen Filterkriterien.

**HTTP-Methode und Pfad:**
`GET /api/audit`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `audit:read`.

**Anfrage:**
Optionale Einschränkung auf einen Zeitraum, eine handelnde Person, eine Aktion, ein Ziel, ein
Ergebnis, eine Kategorie sowie einen Suchbegriff. Zusätzlich Angaben zur Seitenweise der
Ergebnisse.

**Antwort:**
Eine Liste der protokollierten Aktionen entsprechend den Filterkriterien sowie deren
Gesamtanzahl.

**Fachliche Fehlerfälle:**
- Die angegebene Kategorie ist nicht bekannt.
- Die Abfrage kann nicht durchgeführt werden.

**Hinweise:**
Es existiert kein eigener Endpunkt zum Abruf eines einzelnen Audit-Log-Eintrags. Welche
Einträge sichtbar sind, hängt zusätzlich von den Berechtigungen der anfragenden Person ab: Für
manche Berechtigungsstufen sind ausschließlich die eigenen protokollierten Aktionen sichtbar,
unabhängig davon, welche handelnde Person als Filter angegeben wird.

### Filterwerte abrufen

**Zweck:**
Liefert die im Audit-Log tatsächlich vorkommenden handelnden Personen und Aktionen zur
Befüllung von Auswahlfeldern.

**HTTP-Methode und Pfad:**
`GET /api/audit/meta`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `audit:read`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Die im Audit-Log vorkommenden handelnden Personen und Aktionen.

**Fachliche Fehlerfälle:**
- Die Abfrage kann nicht durchgeführt werden.

### Audit-Log exportieren

**Zweck:**
Exportiert protokollierte Aktionen, eingeschränkt auf die angegebenen Filterkriterien, als
Datei.

**HTTP-Methode und Pfad:**
`GET /api/audit/export`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `audit:export`.

**Anfrage:**
Dieselben Filterkriterien wie bei der Suche im Audit-Log.

**Antwort:**
Eine CSV-Datei mit allen den Filterkriterien entsprechenden protokollierten Aktionen.

**Fachliche Fehlerfälle:**
- Die angegebene Kategorie ist nicht bekannt.
- Der Export kann nicht durchgeführt werden.

**Hinweise:**
Ein Export enthält höchstens 10.000 Einträge. Bei einer größeren Trefferzahl empfiehlt sich
eine Einschränkung der Filterkriterien.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt ausschließlich die öffentliche Programmierschnittstelle zur Einsicht
in das Audit-Log. Es enthält keine Beschreibung, welche Aktionen protokolliert werden, welche
Informationen ein Audit-Eintrag enthält oder unter welchen Voraussetzungen Einträge erzeugt
werden. Diese Aspekte sind Gegenstand von `SECURITY.md`. Es enthält insbesondere keine Aussage
darüber, ob und wie automatisiert verarbeitete Vorgänge im Audit-Log erkennbar sind.

---

## Kapitel 12 — Systemstatus

### Zweck dieses Kapitels

Dieses Kapitel beschreibt den Endpunkt zur Abfrage des aktuellen Systemstatus von ConnOps.

### Systemstatus abrufen

**Zweck:**
Liefert den aktuellen Status der überwachten Systembereiche von ConnOps. Hierzu gehören
insbesondere die Erreichbarkeit angebundener Systeme, der Zustand interner Dienste, der Stand
automatisierter Verarbeitungen sowie ausgewählte fachliche Statusinformationen.

**HTTP-Methode und Pfad:**
`GET /api/health/overview`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `health:read`.

**Anfrage:**
Kein Inhalt erforderlich.

**Antwort:**
Der Status der überwachten Systembereiche, jeweils einschließlich einer fachlichen
Statuseinstufung sowie der dafür relevanten Detailangaben.

**Fachliche Fehlerfälle:**
Keine eigenständigen fachlichen Fehlerfälle. Kann ein einzelner Systembereich nicht geprüft
werden, wird dies innerhalb der Antwort dieses Bereichs ausgewiesen, ohne dass die
Gesamtanfrage fehlschlägt.

**Hinweise:**
Active Directory und Exchange werden gemeinsam über einen einzigen Status abgebildet, nicht
getrennt, da sie dieselbe zugrunde liegende technische Verbindung nutzen. **Der Status
laufender Citrix-Sitzungen ist nicht Bestandteil dieser Übersicht.** Es existieren keine
Endpunkte zur isolierten Prüfung einzelner Systembereiche; sämtliche Prüfungen werden
gemeinsam im Rahmen dieses Endpunkts durchgeführt.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt ausschließlich die öffentliche Programmierschnittstelle zur Abfrage
des Systemstatus. Es enthält keine Beschreibung, wie die einzelnen Prüfungen technisch
durchgeführt werden, keine Beschreibung der Kriterien, nach denen einzelne Statuseinstufungen
zustande kommen, und keine Aussage zur Häufigkeit, mit der das Frontend diesen Endpunkt
aufruft — diese sind Gegenstand von `TECHNICAL.md`.

---

## Kapitel 13 — Reporting

### Zweck dieses Kapitels

Dieses Kapitel beschreibt die Endpunkte zur Abfrage und zum Export eines zusammenfassenden
Reports über administrative Aktivitäten innerhalb eines gewählten Zeitraums.

### Report abrufen

**Zweck:**
Liefert eine zusammenfassende Übersicht administrativer Aktivitäten innerhalb eines gewählten
Zeitraums. Der Report umfasst Kennzahlen zu Benutzer- und Computerkonten sowie zu
abgeschlossenen TopDesk-Changes.

**HTTP-Methode und Pfad:**
`GET /api/report`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `report:read`.

**Anfrage:**
Ein Zeitraum, entweder als vordefinierte Auswahl (etwa die letzten 7, 14 oder 21 Tage oder der
letzte Monat) oder als frei gewählter Zeitraum mit Start- und Enddatum.

**Antwort:**
Der gewählte Zeitraum sowie die zusammengefassten Kennzahlen der im Report enthaltenen
Bereiche: angelegte, deaktivierte, entsperrte und mit zurückgesetztem Passwort versehene
Benutzerkonten, deaktivierte Computerkonten sowie abgeschlossene TopDesk-Changes, gegliedert
nach Eintritten, Austritten und Änderungen.

**Fachliche Fehlerfälle:**
- Der angegebene Zeitraum entspricht nicht der erwarteten Struktur, oder bei einem frei
  gewählten Zeitraum fehlt das Start- oder Enddatum.

**Hinweise:**
Dieser Report deckt genau einen festgelegten Inhalt ab; es existiert keine Auswahl zwischen
unterschiedlichen Report-Typen. Assets aus Docusnap sind nicht Bestandteil dieses Reports.
Bei den TopDesk-Kennzahlen fließen ausschließlich vollständig abgeschlossene Changes ein;
Changes in Bearbeitung oder mit Konflikt sind nicht enthalten. Kann der TopDesk-Anteil des
Reports nicht ermittelt werden, bleiben die Benutzer- und Computerkennzahlen davon unberührt
und werden dennoch vollständig geliefert; die Antwort weist dies für den betroffenen Bereich
gesondert aus, ohne dass die Gesamtanfrage fehlschlägt.

### Report exportieren

**Zweck:**
Exportiert denselben Report als Datei.

**HTTP-Methode und Pfad:**
`GET /api/report/export`

**Zugriffsvoraussetzung:**
Erforderliche Permission: `report:read`.

**Anfrage:**
Derselbe Zeitraum wie bei der Report-Abfrage sowie das gewünschte Ausgabeformat (PDF oder
CSV).

**Antwort:**
Eine Datei im gewählten Ausgabeformat mit demselben fachlichen Inhalt wie die Report-Abfrage.

**Fachliche Fehlerfälle:**
- Der angegebene Zeitraum entspricht nicht der erwarteten Struktur, oder bei einem frei
  gewählten Zeitraum fehlt das Start- oder Enddatum.
- Das angegebene Ausgabeformat wird nicht unterstützt.

**Hinweise:**
Der Export wird vollständig innerhalb der Anfrage erstellt; die Antwort enthält die fertige
Datei unmittelbar, es gibt keine nachgelagerte Fertigstellung.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt ausschließlich die öffentliche Programmierschnittstelle zur Abfrage
und zum Export des Reports. Es enthält keine Beschreibung der Berechnung der einzelnen
Kennzahlen, keine Beschreibung der Aufbereitung des exportierten Dokuments und keine Aussage
zur Herkunft der zugrunde liegenden Daten — diese sind Gegenstand von `TECHNICAL.md`.

---

## Kapitel 14 — Allgemeine API-Konventionen

### Zweck dieses Kapitels

Dieses Kapitel fasst die Konventionen zusammen, die für alle in diesem Dokument beschriebenen
Endpunkte einheitlich gelten. Es führt keine neuen Konventionen ein, sondern beschreibt
diejenigen, die in den Kapiteln 2–13 bereits durchgängig angewendet wurden.

### HTTP-Statuscodes

Jeder Endpunkt beantwortet eine Anfrage mit einem der folgenden Statuscodes. Die einzelnen
Kapitel dieses Dokuments nennen keine Statuscodes; sie beschreiben stattdessen die fachliche
Bedeutung eines Fehlerfalls. Die Zuordnung zwischen einem beschriebenen Fehlerfall und dem
tatsächlichen Statuscode ergibt sich aus dieser Tabelle:

| HTTP | Bedeutung |
|---|---|
| 200 | Die Anfrage wurde erfolgreich verarbeitet. |
| 400 | Die Anfrage kann aufgrund ungültiger Eingaben nicht verarbeitet werden. |
| 401 | Es besteht keine gültige Anwendungssitzung. |
| 403 | Die erforderliche Permission fehlt. |
| 404 | Die angeforderte Ressource wurde nicht gefunden. |
| 409 | Die Anfrage steht im Konflikt mit dem aktuellen Zustand der betroffenen Ressource. |
| 429 | Die Anfrage wurde aufgrund eines Schutzmechanismus abgelehnt. |
| 500 | Ein unerwarteter interner Fehler ist aufgetreten. |
| 502 | Eine Anfrage an ein angebundenes System konnte nicht erfolgreich verarbeitet werden, weil dieses nicht erreichbar war oder keine gültige Antwort lieferte. |

### Zugriffsvoraussetzung

Jeder Endpunkt nennt eine der folgenden drei Zugriffsvoraussetzungen:

- **Keine** — der Endpunkt ist ohne bestehende Anwendungssitzung aufrufbar. Dies betrifft
  ausschließlich die Anmeldung sowie eingehende Ereignisse externer Systeme, die über einen
  eigenen, in `SECURITY.md` beschriebenen Mechanismus abgesichert sind.
- **Gültige Anwendungssitzung** — der Endpunkt erfordert eine bestehende Anmeldung, aber keine
  darüber hinausgehende Permission.
- **Eine benannte Permission** (etwa `user:enable`) — der Endpunkt erfordert eine bestehende
  Anmeldung sowie die genannte Permission. Permission-Keys sind gemäß `DECISIONS.md` ADR-007
  stabile Bestandteile des API-Vertrags und werden wörtlich genannt.

### Anfrage und Antwort

Anfragen und Antworten werden als JSON übertragen, mit Ausnahme von Endpunkten, die
ausdrücklich eine Datei liefern (etwa Exporte). Anfragen ohne erforderlichen Inhalt werden mit
„Kein Inhalt erforderlich." gekennzeichnet.

Antworten werden entsprechend ihrem fachlichen Inhalt beschrieben, etwa als Bestätigung, Liste
oder zusammenfassende Übersicht. Dieses Dokument beschreibt den fachlichen Inhalt einer
Antwort, nicht ihre vollständige, feldgenaue Struktur, sofern diese Vollständigkeit keinen
fachlichen Erkenntniswert hat, wie in Kapitel 1 festgelegt.

### Fachliche Fehlerfälle

Jeder Endpunkt beschreibt seine Fehlerfälle als Fließtext auf fachlicher Ebene, nicht als
Zuordnung zu einem Statuscode. Verfügt ein Endpunkt über keine eigenständigen fachlichen
Fehlerfälle — etwa, weil er grundsätzlich erfolgreich antwortet und Teilfehler innerhalb der
Antwort ausweist —, wird dies ausdrücklich benannt, statt den Abschnitt wegzulassen.

### Hinweise

Ein Endpunkt erhält einen Hinweis-Abschnitt, wenn sein Verhalten von einer naheliegenden
Erwartung abweicht oder eine für den Aufrufer relevante Eigenschaft besitzt, die sich nicht
bereits aus Zweck, Anfrage, Antwort oder Fehlerfällen ergibt — etwa eine asynchrone
Verarbeitung, eine Einschränkung der sichtbaren Ergebnisse abhängig von der aufrufenden
Person, oder das bewusste Fehlen eines naheliegend erwarteten Endpunkts.

### Pfadparameter

Pfadparameter werden als ausgeschriebene, fachlich benannte Bezeichnungen dargestellt, nicht
als technischer Datenname. Mehrteilige Bezeichnungen werden mit Bindestrich getrennt. Ein
Pfadparameter beschreibt die fachliche Bedeutung der referenzierten Ressource, nicht ihren
technischen Datentyp — beispielsweise `{Benutzerkonto}` statt eines technischen Feldnamens,
`{Change-Kennung}` oder `{Rollen-Id}` statt einer bloßen technischen Kennung.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt Konventionen, die für die Darstellung der Endpunkte in diesem
Dokument gelten. Es trifft keine neuen Aussagen zu Sicherheitsmechanismen, Austauschformaten
oder der technischen Umsetzung — diese sind Gegenstand von `SECURITY.md` und `TECHNICAL.md`.

---

## Kapitel 15 — Verweis auf weiterführende Dokumente

### Stellung dieses Dokuments

`API.md` beschreibt die öffentliche Programmierschnittstelle von ConnOps: ihre Endpunkte, deren
fachliche Bedeutung, Zugriffsvoraussetzungen sowie die projektweit geltenden Konventionen. Es
ersetzt weder `ARCHITECTURE.md` noch `SECURITY.md`, `TECHNICAL.md`, `PATTERNS.md` oder
`DECISIONS.md` und trifft keine eigenen Architektur-, Sicherheits- oder
Technologieentscheidungen.

### Verweisstruktur

| Dokument | Vertieft folgenden Aspekt dieses Dokuments |
|---|---|
| `ARCHITECTURE.md` | Die Verantwortlichkeit der API-Schicht innerhalb des Schichtenmodells |
| `SECURITY.md` | Authentifizierung, Autorisierung, Sitzungsverwaltung und die vollständigen Sicherheitsgarantien hinter jeder Zugriffsvoraussetzung |
| `TECHNICAL.md` | Das zugrunde liegende Kommunikationsprotokoll und die technische Umsetzung der Endpunkte |
| `PATTERNS.md` | Wiederkehrende Muster, die dieses Dokument stillschweigend voraussetzt |
| `DECISIONS.md` | Einzelne, historisch begründete Entscheidungen, auf die einzelne Kapitel verweisen |

Widersprüche zwischen diesem Dokument und anderen Dokumenten werden nicht durch Priorisierung
dieses Dokuments aufgelöst. Maßgeblich ist die Zuständigkeit des jeweiligen Dokuments.

### Ist-Zustand statt Zielbild

Dieses Dokument beschreibt die tatsächlich vorhandene Programmierschnittstelle von ConnOps zum
jeweiligen Zeitpunkt, nicht eine geplante oder angestrebte Schnittstelle. Ein Endpunkt, dessen
Existenz nicht anhand des tatsächlichen Programmcodes verifiziert wurde, ist nicht Bestandteil
dieses Dokuments. Wo ein naheliegend erwarteter Endpunkt nicht existiert, wird dies, sofern für
einen Aufrufer relevant, ausdrücklich vermerkt, statt stillschweigend zu fehlen.

### Erweiterung dieses Dokuments

Neue Endpunkte werden in das jeweils fachlich zuständige Kapitel aufgenommen, sobald ihre
Existenz verifiziert ist. Ein neuer Funktionsbereich ohne bestehendes Kapitel erhält ein neues
Kapitel nach demselben Schema (Zweck, Zugriffsvoraussetzung, Anfrage, Antwort, Fachliche
Fehlerfälle, Hinweise). Änderungen an den in Kapitel 14 beschriebenen Konventionen betreffen
grundsätzlich alle Kapitel dieses Dokuments und werden dort konsistent nachgezogen.

---

Damit ist `API.md` vollständig. Das Dokument beschreibt in sich abgeschlossen die öffentliche
Programmierschnittstelle von ConnOps: Authentifizierung, Benutzer- und Computerverwaltung,
Exchange, Citrix, TopDesk, Docusnap, Organisationsverwaltung, Administration, Audit,
Systemstatus, Reporting sowie die projektweit geltenden API-Konventionen.
