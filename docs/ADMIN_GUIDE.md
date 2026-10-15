# ADMIN_GUIDE.md
# Administrationshandbuch — ConnOps

---

## Kapitel 1 — Einleitung

### Zweck dieses Dokuments

Dieses Dokument beschreibt, wie IT-Administration und IT-Leitung ConnOps im Tagesgeschäft
bedienen: welche Aufgaben durchgeführt werden können, wo diese Funktionen erreichbar sind und
was dabei zu beachten ist.

### Voraussetzungen

Dieses Dokument setzt eine bereits installierte und konfigurierte ConnOps-Instanz voraus.
Installation und Konfiguration sind Gegenstand von `DEPLOYMENT.md`.

### Was dieses Dokument nicht enthält

Dieses Dokument erklärt nicht, warum ConnOps so aufgebaut ist, wie es abgesichert ist, wie es
technisch funktioniert oder welche Schnittstellen intern verwendet werden. Diese Fragen
beantworten `ARCHITECTURE.md`, `SECURITY.md`, `TECHNICAL.md` und `API.md`. Wo eine
Bedienhandlung einen tieferen Hintergrund hat, verweist dieses Dokument auf das zuständige
Dokument, statt den Hintergrund selbst zu erklären.

### Aufbau dieses Dokuments

Die folgenden Kapitel sind nach Aufgabenbereichen gegliedert, nicht nach Software-Komponenten:
Benutzerverwaltung, Computerverwaltung, Sitzungen und Übergabe, TopDesk-Changes,
Asset-Verwaltung, Organisations- und Rechteverwaltung, Auswertung und Berichte,
Systemüberwachung und Statusbewertung sowie Regelaufgaben und Störungen.

### Berechtigungen

Welche Aufgabe in ConnOps ausgeführt werden kann, hängt von der zugewiesenen Rolle ab. Ist
eine in diesem Dokument beschriebene Aufgabe in der eigenen Oberfläche nicht sichtbar oder
nicht ausführbar, kann dies an fehlenden Berechtigungen oder an einem anderen Betriebszustand
der Anwendung liegen.

---

## Kapitel 2 — Benutzerverwaltung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, welche Aufgaben rund um Active-Directory-Benutzerkonten in ConnOps
ausgeführt werden können.

### Benutzerkonto finden

Ein Benutzerkonto wird über die Benutzersuche anhand eines Suchbegriffs gefunden. Das
Suchergebnis zeigt die wesentlichen Merkmale eines Kontos, unter anderem seinen
Aktivierungs- und Sperrstatus. Das ausgewählte Suchergebnis stellt die für die weiteren
Verwaltungsaufgaben erforderlichen Informationen und Funktionen bereit.

### Stammdaten bearbeiten

Die Stammdaten eines gefundenen Benutzerkontos — etwa Name, Titel, Abteilung oder
Kontaktangaben — können geändert werden. Nicht angegebene Felder bleiben unverändert.

### Konto aktivieren, deaktivieren oder entsperren

Ein Benutzerkonto kann aktiviert, deaktiviert oder — bei einer bestehenden Sperrung —
entsperrt werden. Diese Aktionen wirken unmittelbar auf das Active-Directory-Konto.

### Passwort zurücksetzen

Für ein Benutzerkonto kann ein neues Passwort vergeben werden, wahlweise mit der Vorgabe, dass
es beim nächsten Login geändert werden muss. Das vergebene Passwort wird nach der Vergabe an
keiner Stelle in ConnOps erneut angezeigt.

### Gruppenmitgliedschaften verwalten

Die Gruppen, denen ein Benutzerkonto zugeordnet ist, können eingesehen werden. Soweit die
erforderlichen Berechtigungen vorhanden sind, können Gruppenmitgliedschaften verwaltet werden:
eine Zuordnung zu einer weiteren Gruppe sowie die Entfernung aus einer bestehenden Gruppe.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt die in ConnOps verfügbaren Aufgaben der Benutzerverwaltung. Es
enthält keine Aussage zu Konten, die außerhalb von ConnOps im Active Directory verwaltet
werden, und keine Aufgaben zum Anlegen oder Löschen eines Benutzerkontos, sofern diese
Funktionen nicht Bestandteil der vorgesehenen ConnOps-Funktionalität sind.

---

## Kapitel 3 — Computerverwaltung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, welche Aufgaben rund um Active-Directory-Computerkonten in ConnOps
ausgeführt werden können.

### Computer finden

Ein Computer wird über die Computersuche anhand eines Suchbegriffs gefunden. Das
Suchergebnis zeigt den Namen und den Aktivierungsstatus des Kontos. Das ausgewählte
Suchergebnis stellt die für die verfügbaren Verwaltungsaufgaben erforderlichen Informationen
und Funktionen bereit.

### Konto aktivieren oder deaktivieren

Ein Computerkonto kann aktiviert oder deaktiviert werden. Diese Aktion wirkt unmittelbar auf
das Active-Directory-Konto.

### Zusammenhang mit Sitzungen und Asset-Daten

Zu einem Computerkonto können zusätzlich Informationen zu laufenden Sitzungen sowie zum
zugehörigen Asset sichtbar sein. Diese Informationen und die zugehörigen Aufgaben sind
Gegenstand von Kapitel 4 (Sitzungen und Übergabe) beziehungsweise Kapitel 6
(Asset-Verwaltung) dieses Dokuments, nicht dieses Kapitels.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt die in ConnOps verfügbaren Aufgaben der Computerverwaltung. Es
enthält keine Aufgaben zum Bearbeiten der Stammdaten eines Computerkontos, zur Verwaltung von
Gruppenmitgliedschaften oder zum Anlegen oder Löschen eines Computerkontos, sofern diese
Funktionen nicht Bestandteil der vorgesehenen ConnOps-Funktionalität sind. Es enthält
außerdem keine Fernwartungs- oder Remote-Management-Funktionen.

---

## Kapitel 4 — Sitzungen und Übergabe

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, welche Aufgaben rund um laufende Citrix-Sitzungen sowie rund um
Übergabedokumente in ConnOps ausgeführt werden können.

### Sitzung finden

Die laufende Sitzung eines bestimmten Benutzers oder eines bestimmten Computers kann
eingesehen werden. Ebenso können alle derzeit laufenden Sitzungen gemeinsam eingesehen werden.
Besteht keine laufende Sitzung für die gesuchte Person oder den gesuchten Computer, wird dies
als Ergebnis ohne Sitzung angezeigt.

### Sitzung beenden

Eine laufende Sitzung kann beendet werden. ConnOps stößt die Abmeldung der Sitzung an. Die
endgültige Trennung erfolgt nach Verarbeitung durch das Zielsystem; der betroffene Benutzer
wird vor der endgültigen Trennung informiert.

### Übergabedokumente

Die Funktionen zur Erstellung und Verwaltung von Übergabedokumenten werden beschrieben, sobald
die dafür vorgesehenen Bedienabläufe und Funktionen der Oberfläche verifiziert sind.

### Grenzen dieses Kapitels

Für Sitzungen enthält dieses Kapitel keine Funktion, eine Sitzung lediglich zu trennen, ohne
den Benutzer abzumelden, und keine Funktion, eine Nachricht unabhängig von einer Abmeldung an
eine Sitzung zu senden.

---

## Kapitel 5 — TopDesk-Changes bearbeiten

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, welche Aufgaben rund um TopDesk-Changes in ConnOps ausgeführt
werden können.

### Changes einsehen

Changes mit unterschiedlichem Status können jeweils gesondert eingesehen werden. Dazu gehören
insbesondere offene, ausstehende sowie bereits abgeschlossene oder nicht mehr aktive Changes.
Eine Anzahl aktueller Changes ist zusätzlich als Kennzahl verfügbar.

### Change validieren

Vor der Ausführung eines Changes kann geprüft werden, ob die dafür notwendigen Voraussetzungen
erfüllt sind. Diese Prüfung verändert den Change nicht.

### Change überschreiben

Automatisch ermittelte Angaben eines Changes können durch manuell festgelegte Werte ersetzt
werden. Befand sich der Change zuvor in einem Konfliktzustand, wird dieser durch das
Überschreiben aufgelöst und als Warnung gekennzeichnet, nicht unmittelbar als vollständig
unauffällig.

### Ausführungsschritt als erledigt markieren

Ein fehlgeschlagener Ausführungsschritt kann manuell als erledigt markiert werden, etwa
nachdem er außerhalb von ConnOps nachträglich korrigiert wurde. Der Gesamtstatus eines Changes
entspricht erst dann dem vollständig abgeschlossenen Zustand, wenn keine fehlgeschlagenen
Ausführungsschritte mehr verbleiben.

### Change ausführen

Ein zuvor validierter Change kann ausgeführt werden. Zwischen einer Validierung und der
tatsächlichen Ausführung können sich die zugrunde liegenden Voraussetzungen ändern, da die
Ausführung die Validierung nicht automatisch wiederholt. Eine Ausführung erfolgt ausschließlich
durch eine bewusste Benutzeraktion; ConnOps führt Changes nicht selbstständig aus.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt die in ConnOps verfügbaren Aufgaben zur Bearbeitung von
TopDesk-Changes. Es enthält keine Aussage darüber, wie ein Change ursprünglich in ConnOps
gelangt, und keinen automatisierten Ausführungsweg.

---

## Kapitel 6 — Asset-Verwaltung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, welche Aufgaben rund um den aus Docusnap übernommenen
Asset-Bestand in ConnOps ausgeführt werden können.

### Asset-Bestand einsehen

Der Asset-Bestand kann eingesehen werden, einschließlich einer zusammenfassenden Statistik
über die Gesamtzahl der Assets und ihre Verteilung nach Status. Neu hinzugekommene Assets
stehen am Anfang der Übersicht.

### Asset-Status ändern

Der Status oder ein Kommentar zu einem einzelnen Asset kann geändert werden. Der Status eines
Assets kann sich auch ohne eine direkte Änderung in der Asset-Verwaltung als Nebeneffekt eines
anderen Vorgangs ändern, etwa durch die Erstellung eines Übergabedokuments. Die genaue
Bedienung dieses Vorgangs ist in Kapitel 4 beschrieben, sobald die entsprechenden
Bedienabläufe verifiziert sind.

### Asset-Bestand aktualisieren

Der Asset-Bestand kann aus dem Docusnap-Export neu eingelesen werden. Dabei werden neu
hinzugekommene und aktualisierte Assets übernommen. Eine regelmäßige, automatisch
wiederkehrende Aktualisierung findet nicht statt.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt die in ConnOps verfügbaren Aufgaben der Asset-Verwaltung. Es
enthält keine Aussage zu Assets außerhalb dieses Bestands und keine Funktion, Daten aus
ConnOps zurück an Docusnap zu übertragen.

---

## Kapitel 7 — Organisations- und Rechteverwaltung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, welche Aufgaben rund um die Organisationsstruktur und die
Berechtigungen von ConnOps ausgeführt werden können. Es unterscheidet zwischen zwei
unterschiedlichen Konzepten: Jobrollen, die der fachlichen Organisation dienen, und
Berechtigungsrollen, die festlegen, was ein Benutzer in ConnOps tun darf. Diese beiden
Konzepte erfüllen unterschiedliche Zwecke und werden unabhängig voneinander verwaltet.

### Abteilungen verwalten

Abteilungen können eingesehen, angelegt, bearbeitet und gelöscht werden. Eine Abteilung kann
nicht gelöscht werden, solange ihr noch Jobrollen zugeordnet sind.

### Jobrollen verwalten

Jobrollen — organisatorische Rollen innerhalb einer Abteilung, die unter anderem für die
automatisierte Verarbeitung von TopDesk-Changes verwendet werden — können eingesehen,
angelegt, bearbeitet und gelöscht werden.

### Berechtigungsrollen einsehen und anpassen

Die vorhandenen Berechtigungsrollen und die ihnen zugeordneten Permissions können eingesehen
werden. Die Zuordnung der Permissions einer bestehenden Berechtigungsrolle kann angepasst
werden; diese Anpassung ersetzt die gesamte bisherige Zuordnung dieser Rolle. Neue
Berechtigungsrollen können in ConnOps nicht angelegt werden; die vorhandenen Rollen sind fest
vorgegeben.

Eine bestimmte, für die administrative Gesamtverantwortung vorgesehene Berechtigung ist fest
an eine dafür bestimmte Rolle gebunden. Diese Zuordnung kann nicht über die Verwaltung der
Berechtigungsrollen verändert werden.

### Plattform-Einstellungen anpassen

Verschiedene plattformweite Einstellungen können eingesehen und angepasst werden, unter
anderem Schwellenwerte für die Systemüberwachung, die Aufbewahrungsdauer des Audit-Logs, die
Konfiguration der automatisierten TopDesk-Verarbeitung sowie die Verbindungsadresse zu
TopDesk. Bei der Verbindungsadresse zu TopDesk wird vor der Übernahme geprüft, ob unter der
neuen Adresse tatsächlich eine Verbindung hergestellt werden kann.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt die in ConnOps verfügbaren Aufgaben der Organisations- und
Rechteverwaltung. Es enthält keine Aufgabe zur Zuordnung von AD-Gruppen zu
Berechtigungsrollen, da diese Zuordnung außerhalb von ConnOps erfolgt.

---

## Kapitel 8 — Auswertung und Berichte

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, welche Aufgaben rund um das Audit-Log und den zusammenfassenden
Report in ConnOps ausgeführt werden können.

### Audit-Log durchsuchen

Protokollierte Aktionen können durchsucht werden, eingeschränkt auf einen Zeitraum, eine
handelnde Person, eine Aktion, ein Ziel, ein Ergebnis, eine Kategorie oder einen Suchbegriff.
Welche Einträge sichtbar sind, hängt zusätzlich von den eigenen Berechtigungen ab: Für manche
Berechtigungsstufen sind ausschließlich die eigenen protokollierten Aktionen sichtbar.

### Audit-Log exportieren

Die durchsuchten Einträge können als Datei exportiert werden. Ein Export enthält höchstens
10.000 Einträge; bei einer größeren Trefferzahl empfiehlt sich eine engere Eingrenzung der
Suche.

### Report abrufen

Eine zusammenfassende Übersicht über ConnOps-Aktivitäten für einen gewählten Zeitraum kann
abgerufen werden. Der Report umfasst Kennzahlen zu Benutzer- und Computerkonten sowie zu
abgeschlossenen TopDesk-Changes. Assets aus Docusnap sind nicht Bestandteil dieses Reports;
bei den TopDesk-Kennzahlen fließen ausschließlich vollständig abgeschlossene Changes ein.

### Report exportieren

Der Report kann als PDF- oder als CSV-Datei exportiert werden.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt die in ConnOps verfügbaren Aufgaben zur Auswertung. Es enthält
keine Aussage darüber, welche Aktionen protokolliert werden, und keine Aussage darüber, ob
automatisiert verarbeitete Vorgänge im Audit-Log erkennbar sind.

---

## Kapitel 9 — Systemüberwachung und Statusbewertung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, wie der aktuelle Systemstatus von ConnOps eingesehen und bewertet
wird.

### Systemstatus einsehen

Der aktuelle Status mehrerer Systembereiche kann in einer gemeinsamen Übersicht eingesehen
werden: die Erreichbarkeit angebundener Systeme, der Zustand interner Dienste, der Stand
automatisierter Verarbeitungen sowie weitere für den Betrieb relevante Statusinformationen.
Die Übersicht dient dazu, den aktuellen Betriebszustand zu bewerten und Auffälligkeiten
frühzeitig zu erkennen.

### Status bewerten

Zeigt ein Systembereich einen auffälligen Status, ist dieser einzuordnen: Handelt es sich um
einen vorübergehenden, sich von selbst lösenden Zustand, oder um eine Störung, die ein
Eingreifen erfordert? Die weitere Vorgehensweise bei einer Störung ist in Kapitel 10
(Regelaufgaben und Störungen) beschrieben.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt das Einsehen und die Einordnung des Systemstatus. Es enthält keine
Kriterien, nach denen einzelne Statuseinstufungen zustande kommen, und keine Beschreibung, wie
die einzelnen Prüfungen technisch durchgeführt werden.

---

## Kapitel 10 — Regelaufgaben und Störungen

### Zweck dieses Kapitels

Dieses Kapitel beschreibt wiederkehrende Aufgaben, die zur Erhaltung eines stabilen
Systemzustands regelmäßig durchgeführt werden, sowie das Vorgehen bei einer erkannten
Störung.

### Regelmäßige Kontrolle

Neben der laufenden Systemüberwachung aus Kapitel 9 sollten regelmäßig folgende Punkte
kontrolliert werden: ob automatisierte Vorgänge tatsächlich wie vorgesehen laufen und
fachlich plausible Ergebnisse liefern, ob die von ConnOps verwalteten oder aus angebundenen
Systemen übernommenen Daten weiterhin vollständig, aktuell und fachlich plausibel sind, und
ob die plattformweiten Einstellungen weiterhin dem tatsächlichen Bedarf entsprechen.

### Vorgehen bei einer Störung

Eine Störung wird erkennbar, wenn die Systemübersicht einen auffälligen Zustand anzeigt, wenn
eine Regelkontrolle ein unerwartetes Ergebnis liefert, oder wenn eine Beobachtung außerhalb
dieser beiden Quellen auf ein Problem hindeutet, etwa eine Meldung durch einen Nutzer. Zur
weiteren Einordnung und Diagnose können das Audit-Log sowie die in den
Betriebsdokumentationen beschriebenen Diagnosemöglichkeiten herangezogen werden.

### Nach einer Störung

Eine behobene Störung sollte nachbereitet werden: was geschehen ist, was die Ursache war, und
welche Konsequenzen sich daraus für den künftigen Betrieb ergeben.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt die betriebliche Vorgehensweise bei Regelaufgaben und Störungen. Es
enthält keine Anleitung zur Behebung konkreter Störungsbilder und keine Beschreibung
technischer Fehlerursachen.

---

## Kapitel 11 — Grenzen dieses Dokuments

Dieses Dokument beschreibt die Bedienung von ConnOps für IT-Administration und IT-Leitung:
Benutzerverwaltung, Computerverwaltung, Sitzungen und Übergabe, TopDesk-Changes,
Asset-Verwaltung, Organisations- und Rechteverwaltung, Auswertung und Berichte,
Systemüberwachung sowie Regelaufgaben und Störungen.

Dieses Dokument enthält insbesondere nicht:

- die Begründung, warum ConnOps so aufgebaut ist, wie es aufgebaut ist (`ARCHITECTURE.md`),
- die technische Umsetzung der bedienten Funktionen (`TECHNICAL.md`),
- die Sicherheitsmechanismen und ihre Begründung (`SECURITY.md`),
- die Endpunkte, über die die beschriebenen Funktionen technisch umgesetzt sind (`API.md`),
- die Installation und Konfiguration einer ConnOps-Instanz (`DEPLOYMENT.md`),
- die betrieblichen Grundsätze und deren Begründung (`OPERATIONS.md`),
- die Bedienung durch Helpdesk-Mitarbeiter, soweit diese von der hier beschriebenen
  Bedienung abweicht (`USER_GUIDE.md`).

Wo dieses Dokument auf einen dieser Aspekte Bezug nimmt, verweist es auf das jeweils
zuständige Dokument, statt dessen Inhalt vorwegzunehmen oder zu wiederholen.

---

## Kapitel 12 — Verweis auf weiterführende Dokumente

### Stellung dieses Dokuments

`ADMIN_GUIDE.md` beschreibt die Bedienung von ConnOps für IT-Administration und IT-Leitung. Es
ersetzt weder `ARCHITECTURE.md` noch `SECURITY.md`, `TECHNICAL.md`, `API.md`, `DEPLOYMENT.md`
oder `OPERATIONS.md` und begründet keine der dort getroffenen Entscheidungen.

### Verweisstruktur

| Dokument | Vertieft folgenden Aspekt dieses Dokuments |
|---|---|
| `ARCHITECTURE.md` | Die Prinzipien, aus denen sich die beschriebenen Funktionen ableiten |
| `DECISIONS.md` | Einzelne Entscheidungen, auf denen bestimmte Bedienregeln beruhen |
| `SECURITY.md` | Authentifizierung, Berechtigungen und Sicherheitsgarantien |
| `TECHNICAL.md` | Die technische Umsetzung der bedienten Funktionen |
| `API.md` | Die Endpunkte, über die die beschriebenen Funktionen technisch umgesetzt sind |
| `DEPLOYMENT.md` | Installation und Konfiguration einer ConnOps-Instanz |
| `OPERATIONS.md` | Betriebliche Grundsätze und ihre Begründung |
| `USER_GUIDE.md` | Die Bedienung durch Helpdesk-Mitarbeiter |

Widersprüche zwischen diesem Dokument und anderen Dokumenten werden nicht durch Priorisierung
dieses Dokuments aufgelöst. Maßgeblich ist die Zuständigkeit des jeweiligen Dokuments.

### Ist-Zustand statt Zielbild

Dieses Dokument beschreibt die tatsächlich vorhandenen Bedienmöglichkeiten von ConnOps.
Bedienabläufe, deren tatsächliches Verhalten nicht verifiziert ist, sind nicht Bestandteil
dieses Dokuments; wo dies wesentliche Funktionsbereiche betrifft, ist dies ausdrücklich
vermerkt.

### Pflege dieses Dokuments

Dieses Dokument wird angepasst, wenn sich die Bedienung von ConnOps ändert — etwa durch eine
neue Funktion, eine geänderte Oberfläche oder eine verifizierte Ergänzung eines bisher offen
gelassenen Bereichs. Änderungen an der zugrunde liegenden Architektur, Sicherheit oder Technik
werden zunächst in den jeweils zuständigen Dokumenten nachgezogen; betrifft eine solche
Änderung auch die Bedienung von ConnOps, wird dieses Dokument entsprechend nachgeführt.

---

Damit ist `ADMIN_GUIDE.md` vollständig. Das Dokument beschreibt die Bedienung von ConnOps für
IT-Administration und IT-Leitung: Benutzerverwaltung, Computerverwaltung, Sitzungen und
Übergabe, TopDesk-Changes, Asset-Verwaltung, Organisations- und Rechteverwaltung, Auswertung
und Berichte, Systemüberwachung sowie Regelaufgaben und Störungen.
