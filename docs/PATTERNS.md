# PATTERNS.md
# Implementierungsmuster — ConnOps

---

## Kapitel 1 — Einleitung

### Zweck dieses Dokuments

Dieses Dokument beschreibt wiederkehrende Implementierungsmuster von ConnOps: Lösungswege, die
innerhalb der Plattform wiederholt angewendet werden und bei neuen, vergleichbaren Aufgaben
erneut angewendet werden sollen, statt jedes Mal neu entschieden zu werden. Es setzt
`ARCHITECTURE.md` Prinzip 7 („Bestehende Patterns bevorzugen") sowie Kapitel 9
(Komponentenarchitektur) voraus und macht die dort geforderte Konsistenz der Umsetzung konkret
greifbar.

Neue Funktionen orientieren sich grundsätzlich an bestehenden Mustern. Von einem etablierten
Muster wird nur abgewichen, wenn dafür ein nachvollziehbarer technischer oder fachlicher Grund
besteht.

`PATTERNS.md` trifft damit keine eigenen Architekturentscheidungen. Ein Muster in diesem
Dokument ist die wiederholte Anwendung einer bereits an anderer Stelle getroffenen Entscheidung
— es begründet diese Entscheidung nicht erneut, sondern zeigt, wie sie gleichbleibend
umgesetzt wird.

### Abgrenzung zu `ARCHITECTURE.md`, `TECHNICAL.md` und `DECISIONS.md`

`ARCHITECTURE.md` legt fest, dass Konsistenz in der Umsetzung ein Architekturprinzip ist
(Prinzip 7). `TECHNICAL.md` beschreibt, welche Technologien existieren und wie Komponenten
grundsätzlich zusammenarbeiten. `DECISIONS.md` hält einzelne, historisch begründete
Entscheidungen fest. `PATTERNS.md` unterscheidet sich von allen dreien: Es beschreibt, wie eine
wiederkehrende Art von Aufgabe innerhalb des durch diese Dokumente vorgegebenen Rahmens gelöst
wird, damit vergleichbare Aufgaben nicht wiederholt unterschiedlich gelöst werden.

Ein Muster ersetzt keine Entscheidung aus `DECISIONS.md` und keine Technologieaussage aus
`TECHNICAL.md`. Wo ein Muster auf einer bereits getroffenen Entscheidung aufbaut, verweist
dieses Dokument darauf, statt sie zu wiederholen.

### Was ein Muster ist — und was nicht

Ein Muster in diesem Dokument ist eine wiederholt angewendete, etablierte Lösung für eine
wiederkehrende Art von Aufgabe, zusammen mit der Begründung, weshalb dieses Muster innerhalb
von ConnOps bevorzugt angewendet wird.

Kein Muster im Sinne dieses Dokuments ist eine einmalige Implementierungsentscheidung ohne
Wiederholungscharakter, eine reine Auflistung des aktuellen Code-Bestands oder eine Anleitung
zur Bedienung eines Werkzeugs. Diese Inhalte gehören, je nach Fall, in `TECHNICAL.md`,
`DECISIONS.md` oder außerhalb der Projektdokumentation in Werkzeugdokumentation Dritter.

### Aufbau eines Musters

Jedes in diesem Dokument beschriebene Muster folgt demselben Schema:

- **Kontext** — die wiederkehrende Art von Aufgabe, für die dieses Muster gilt.
- **Muster** — der Lösungsweg selbst, so beschrieben, dass er auf neue Fälle derselben Art
  übertragbar ist.
- **Begründung** — weshalb dieser Lösungsweg dem naheliegenden Alternativweg vorgezogen wird.
- **Grenzen** — in welchen Fällen dieses Muster nicht gilt oder nicht sinnvoll anwendbar ist.

Dieses Schema ist verbindlich für alle folgenden Kapitel. Es stellt sicher, dass dieses
Dokument ein Katalog wiederverwendbarer Lösungen bleibt und nicht zu einer losen Sammlung
technischer Beobachtungen wird.

### Zielgruppe

Dieses Dokument richtet sich an Personen, die neue Funktionen oder Komponenten für ConnOps
entwickeln und dabei auf bereits etablierte Lösungswege zurückgreifen möchten, statt für eine
wiederkehrende Aufgabe eine neue, abweichende Lösung zu entwerfen. Es dient nicht als
Einstiegstutorial für die eingesetzten Technologien und setzt die in `TECHNICAL.md`
beschriebenen Grundlagen als bekannt voraus.

---

## Kapitel 2 — Zentrale Zugriffspunkte

### Zweck dieses Kapitels

Dieses Kapitel beschreibt ein Muster, das innerhalb von ConnOps mehrfach unabhängig
voneinander angewendet wird: Für einen Ressourcentyp existiert ein zentral verantworteter
technischer Einstiegspunkt, über den jeder Zugriff erfolgt. Es ist von dem in Kapitel 3
beschriebenen Verarbeitungsfluss zu unterscheiden — dort geht es um den Weg einer Anfrage durch
das System, hier um die Bündelung des Zugriffs auf eine bestimmte Ressource.

### Muster: Zentraler Zugriffspunkt je Ressourcentyp

**Kontext:**
Ein Ressourcentyp — eine projektweit genutzte externe oder interne Funktionseinheit,
beispielsweise ein externes System, eine Datenhaltung oder ein Querschnittsdienst — könnte
technisch von mehreren Stellen im Code aus direkt angesprochen werden.

**Muster:**
Für jeden Ressourcentyp existiert ein zentral verantworteter Zugriffspunkt. Komponenten
greifen ausschließlich über diesen Zugriffspunkt auf die Ressource zu. Dieses Muster
entspricht dem allgemein bekannten Single-Entry-Point-Prinzip für gemeinsam genutzte
Ressourcen.

**Begründung:**
Ein zentral verantworteter Zugriffspunkt macht Fehlerdiagnose, Erweiterung und Kontrolle an
einer Stelle möglich, statt über verstreute, potenziell inkonsistente Einzelimplementierungen.
Dieses Muster ist die praktische Konsequenz aus `ARCHITECTURE.md` Prinzip 7 (Bestehende
Patterns bevorzugen) und Prinzip 8 (Wartbarkeit vor Komplexität).

**Grenzen:**
Das Muster ist nicht für rein lokale Hilfsfunktionen gedacht, deren Nutzung auf eine einzelne
Komponente beschränkt bleibt. Ein zentraler Zugriffspunkt lohnt sich erst dann, wenn dieselbe
Ressource von mehreren Komponenten verwendet wird oder voraussichtlich wiederverwendet wird.

### Anwendungen dieses Musters innerhalb von ConnOps

Dieses Muster ist innerhalb von ConnOps an mehreren Stellen unabhängig voneinander
angewendet:

- **Active Directory und Exchange:** Ein zentraler Dispatcher ist der alleinige Zugangspunkt,
  wie in `DECISIONS.md` ADR-004 festgelegt.
- **Datenhaltung:** Der Zugriff auf PostgreSQL und SQLite erfolgt ausschließlich über eine
  zentrale Datenzugriffsschicht, wie in `TECHNICAL.md` Kapitel 5 beschrieben.
- **Protokollierung:** Administrative Aktionen werden ausschließlich über eine zentrale
  Audit-Komponente erfasst, wie in `DECISIONS.md` ADR-011 festgelegt.
- **Autorisierung:** Die Prüfung von Berechtigungen erfolgt ausschließlich über eine zentrale
  Autorisierungsprüfung, wie in `SECURITY.md` Kapitel 5 beschrieben.
- **Frontend-Kommunikation:** Das Frontend kommuniziert ausschließlich über einen zentralen
  API-Client mit dem Backend, wie in `TECHNICAL.md` Kapitel 2 beschrieben.

Allen Anwendungen gemeinsam ist, dass Änderungen am Zugriff ausschließlich an einer zentralen
Stelle erfolgen. Komponenten, die dieselbe Ressource verwenden, profitieren dadurch
automatisch von Fehlerkorrekturen und Erweiterungen.

Jede dieser Anwendungen ist eine eigenständige, bereits an anderer Stelle getroffene
Entscheidung. Dieses Kapitel führt sie als gemeinsames Muster zusammen, um sichtbar zu machen,
dass es sich um dieselbe wiederkehrende Lösung handelt — nicht um fünf unabhängige Einzelfälle.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt das Muster und seine bestehenden Anwendungen. Es begründet nicht
erneut, warum die jeweilige zugrunde liegende Entscheidung getroffen wurde — diese
Begründungen stehen in den referenzierten Dokumenten.

---

## Kapitel 3 — Verarbeitungsfluss

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, wie eine Anfrage oder ein Ereignis durch die Schichten von ConnOps
läuft. Es ist von dem in Kapitel 2 beschriebenen Muster zentraler Zugriffspunkte zu
unterscheiden: Dort ging es um die Bündelung des Zugriffs auf eine Ressource, hier um die
Reihenfolge und Verantwortungsteilung, bevor eine solche Ressource überhaupt erreicht wird.

### Muster: Schichtenpfad für externe Integrationen

**Kontext:**
ConnOps führt wiederkehrend Vorgänge aus, die eine Anfrage entgegennehmen, fachlich verarbeiten
und dabei ein externes System oder eine eigene Datenhaltung ansprechen.

**Muster:**
Eine Anfrage durchläuft stets denselben Schichtenpfad: Die API-Schicht nimmt die Anfrage
entgegen und prüft die Berechtigung. Der Business Layer entscheidet über die fachliche
Verarbeitung. Die eigentliche Kommunikation mit einem externen System erfolgt über die
Worker-Schicht oder eine direkte Integration, abhängig vom Zielsystem. Keine fachliche
Verantwortung wird übersprungen. Jede Anfrage durchläuft die für ihren Anwendungsfall
vorgesehenen Schichten.

**Begründung:**
Ein einheitlicher Pfad stellt sicher, dass Berechtigungsprüfung und fachliche Entscheidung
immer an derselben Stelle stattfinden, unabhängig davon, welches externe System am Ende der
Kette steht. Dieses Muster ist die praktische Umsetzung des in `ARCHITECTURE.md` Kapitel 5
beschriebenen Schichtenmodells.

**Grenzen:**
Das Muster gilt für Vorgänge, die von einer Anfrage ausgelöst werden. Es beschreibt nicht,
wie ein eingehendes Ereignis eines externen Systems verarbeitet wird — dafür gilt das
nachfolgende Muster.

### Muster: Trennung von Empfang und Verarbeitung

**Kontext:**
Ein Vorgang kann von außen ausgelöst werden, ohne dass ConnOps den Zeitpunkt oder die
Verarbeitungsdauer selbst bestimmt — etwa durch ein meldendes externes System, einen
Scheduler oder eine andere Quelle eingehender Ereignisse.

**Muster:**
Der Empfang eines eingehenden Ereignisses und seine fachliche Verarbeitung sind zwei getrennte
Verantwortlichkeiten. Der Empfang wird unmittelbar quittiert oder entgegengenommen. Die
fachliche Verarbeitung erfolgt danach, unabhängig von der Zeit, die sie in Anspruch nimmt.

**Begründung:**
Eine auslösende Quelle soll nicht auf die vollständige fachliche Verarbeitung warten müssen.
Die Trennung von Empfang und Verarbeitung entkoppelt beides zeitlich voneinander. Dieses
Muster ist die praktische Umsetzung von `DECISIONS.md` ADR-015 und ist nicht auf seinen
ursprünglichen Anwendungsfall beschränkt — es gilt grundsätzlich für jede Quelle eingehender
Ereignisse.

**Grenzen:**
Das Muster gilt für Vorgänge, deren fachliche Verarbeitung nicht unmittelbar für die
Quittierung des Empfangs erforderlich ist. Erfordert eine Rückmeldung zwingend das Ergebnis
der fachlichen Verarbeitung, ist eine synchrone Verarbeitung stattdessen sachgerecht.

### Muster: Trennung von Adapter und Domäne

**Kontext:**
Ein Vorgang benötigt sowohl eine technische Anbindung an seinen jeweiligen Auslöser als auch
eine fachliche Verarbeitung seines Inhalts.

**Muster:**
Die technische Entgegennahme einer Anfrage oder eines Ereignisses und deren fachliche
Verarbeitung sind getrennt. Die entgegennehmende Komponente übersetzt zwischen der jeweiligen
technischen Form — Anfrage, Ereignis oder Datei — und internen Domänenobjekten; die fachliche
Verarbeitung kennt die ursprüngliche technische Form nicht.

**Begründung:**
Diese Trennung ermöglicht, die fachliche Verarbeitung unabhängig davon zu prüfen und zu
erweitern, auf welchem technischen Weg ein Vorgang ausgelöst wurde. Dieses Muster ist die
praktische Umsetzung der in `ARCHITECTURE.md` Kapitel 5.2 und 5.3 beschriebenen
Verantwortlichkeitsgrenze und gilt unabhängig vom auslösenden Mechanismus.

**Grenzen:**
Das Muster gilt unabhängig von der Größe eines Vorgangs. Auch ein fachlich einfacher Vorgang
hält diese Trennung ein, um Ausnahmen von der Regel zu vermeiden.

### Muster: Orchestrierung statt Fachlogik im Einstiegspunkt

**Kontext:**
Ein Einstiegspunkt — eine Route oder eine vergleichbare entgegennehmende Komponente — könnte
technisch auch fachliche Entscheidungen selbst treffen, statt sie weiterzureichen.

**Muster:**
Einstiegskomponenten koordinieren ausschließlich den Ablauf. Fachliche Entscheidungen liegen
im Business Layer.

**Begründung:**
Ein Einstiegspunkt, der zugleich fachlich entscheidet, vermischt technische Anbindung und
fachliche Verantwortung an derselben Stelle. Dieses Muster ist die praktische Umsetzung der
in `ARCHITECTURE.md` Kapitel 5.2 beschriebenen Grenze der API-Schicht, wonach diese keine
Geschäftslogik enthält.

**Grenzen:**
Das Muster gilt für fachliche Entscheidungen. Rein technische Ablaufsteuerung — etwa welche
nachgelagerte Komponente als Nächstes angesprochen wird — verbleibt im Einstiegspunkt, ohne
dass dies eine fachliche Entscheidung darstellt.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt den Weg eines Vorgangs durch die Schichten von ConnOps und die
Verantwortungsteilung entlang dieses Wegs. Es enthält keine Aussagen darüber, welche Ressource
am Ende dieses Weges angesprochen wird — das ist Gegenstand von Kapitel 2.

---

## Kapitel 4 — Vertrauensgrenzen und Schutzmuster

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, wie ConnOps mit Daten und Anfragen umgeht, die eine Vertrauensgrenze
überschreiten. Es setzt den in `ARCHITECTURE.md` Kapitel 8.3 beschriebenen Begriff der
Vertrauensgrenze voraus und beschreibt, welche wiederkehrenden Muster ConnOps an diesen
Grenzen anwendet.

### Muster: Validierung an der Vertrauensgrenze

**Kontext:**
Daten überschreiten eine Vertrauensgrenze zwischen zwei Komponenten unterschiedlicher
Vertrauenswürdigkeit. Dies betrifft insbesondere Benutzereingaben, eingehende Ereignisse
externer Systeme sowie andere Datenquellen außerhalb der Verantwortung der verarbeitenden
Komponente.

**Muster:**
Jede Eingabe wird unmittelbar nach Überschreiten der Vertrauensgrenze validiert, bevor sie an
die fachliche Verarbeitung weitergegeben wird.

**Begründung:**
Die Fachlogik arbeitet dadurch ausschließlich mit bereits geprüften Daten. Validierungsregeln
müssen so nicht in jeder nachgelagerten Komponente erneut umgesetzt werden. Dieses Muster ist
unabhängig davon, mit welchem technischen Mittel eine Prüfung erfolgt.

**Grenzen:**
Interne Datenflüsse zwischen Komponenten benötigen keine erneute Validierung, solange die
Vertrauensgrenze nicht erneut überschritten wird.

### Muster: Zentrale Validierungsdefinition

**Kontext:**
Validierungsregeln für Eingaben könnten wiederholt an jeder Stelle neu definiert werden, an der
eine Eingabe geprüft wird.

**Muster:**
Wiederverwendbare Validierungsregeln werden grundsätzlich zentral definiert und von dort
referenziert. Lokale Prüfungen direkt an einer einzelnen Stelle sind nur für fachliche oder
sicherheitsspezifische Prüfungen vorgesehen, die sich nicht als wiederverwendbare Regel
ausdrücken lassen.

**Begründung:**
Eine zentrale Definition verhindert, dass dieselbe Regel an mehreren Stellen unterschiedlich
formuliert wird und dadurch auseinanderläuft.

**Grenzen:**
Neue Validierungsregeln werden grundsätzlich zentral definiert; bestehende lokale
Validierungen werden schrittweise im Rahmen ohnehin anstehender Weiterentwicklung überführt,
nicht durch einen eigenständigen, dedizierten Umbau.

### Muster: Fail Fast

**Kontext:**
Eine Voraussetzung für die Durchführung eines Vorgangs — eine gültige Eingabe, eine
erforderliche Berechtigung, ein benötigtes Geheimnis, eine notwendige Konfiguration oder ein
erreichbares System — kann fehlen.

**Muster:**
Fehlt eine Grundvoraussetzung, wird der Vorgang unmittelbar abgebrochen, statt teilweise
fortgesetzt zu werden.

**Begründung:**
Ein frühzeitiger Abbruch verhindert Teiloperationen, reduziert Folgefehler und macht die
eigentliche Fehlerursache leichter nachvollziehbar. Dieses Muster unterstützt die in
`ARCHITECTURE.md` Prinzip 6 geforderte Nachvollziehbarkeit.

**Grenzen:**
Das Muster gilt für Grundvoraussetzungen, deren Fehlen den Vorgang fachlich unmöglich macht.
Es gilt nicht für optionale Bedingungen, deren Fehlen lediglich eine eingeschränkte, aber
weiterhin sinnvolle Durchführung zur Folge hat.

### Muster: Mehrstufige Schutzmechanismen

**Kontext:**
Ein einzelner Schutzmechanismus — etwa eine Authentifizierungsprüfung — könnte theoretisch als
alleinige Absicherung eines schützenswerten Vorgangs oder Werts dienen.

**Muster:**
Sicherheitsrelevante Vorgänge und Werte werden durch mehrere, sich ergänzende Mechanismen
abgesichert, nicht durch einen einzelnen. Diese Mechanismen ersetzen sich nicht gegenseitig,
sondern wirken zusammen. Dieses Muster entspricht dem allgemein bekannten Prinzip Defense in
Depth.

**Begründung:**
Fällt einer von mehreren sich ergänzenden Mechanismen aus oder wird umgangen, bleibt der
Schutz durch die verbleibenden Mechanismen bestehen. Dieses Muster zeigt sich wiederholt in
`SECURITY.md`, etwa im Zusammenspiel von Authentifizierung, Autorisierung und Protokollierung.

**Grenzen:**
Das Muster rechtfertigt nicht, einen fehlenden grundlegenden Schutzmechanismus mit dem
Verweis auf andere Mechanismen unbegründet zu belassen. Jeder Mechanismus muss für sich
genommen wirksam sein; ihr Zusammenwirken ist eine zusätzliche, keine ersetzende Eigenschaft.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt Muster im Umgang mit Vertrauensgrenzen. Es enthält keine
Beschreibung konkreter Validierungsbibliotheken oder -werkzeuge und keine vollständige
Aufzählung aller in ConnOps eingesetzten Sicherheitsmechanismen — diese sind Gegenstand von
`SECURITY.md`.

---

## Kapitel 5 — Zustands- und Interaktionsmuster

### Zweck dieses Kapitels

Dieses Kapitel ergänzt die in Kapitel 2–4 beschriebenen Implementierungsmuster um
wiederkehrende Muster des Frontends und der Benutzerinteraktion.

### Muster: Trennung von Darstellung und Anwendungszustand

**Kontext:**
Das Frontend stellt Daten dar und ermöglicht Benutzerinteraktionen.

**Muster:**
Darstellende Komponenten des Frontends enthalten keine fachliche Geschäftslogik und verwalten
keinen gemeinsam genutzten Anwendungszustand. Sie beziehen ihren Zustand über dafür
vorgesehene Komponenten oder Dienste.

**Begründung:**
Dadurch bleibt die Darstellung austauschbar und der Anwendungszustand konsistent. Dieses
Muster ist die Übertragung der bereits in Kapitel 3 beschriebenen Trennung von Adapter und
Domäne auf das Frontend.

**Grenzen:**
Rein lokale Darstellungszustände — etwa, ob ein Dialog gerade geöffnet ist — dürfen
selbstverständlich in der jeweiligen Komponente selbst verbleiben.

### Muster: Zentraler Zugriff auf Backend-Funktionen

**Kontext:**
Das Frontend benötigt Zugriff auf Backend-Funktionen, ohne selbst mit dem zugrunde liegenden
Kommunikationsprotokoll zu arbeiten.

**Muster:**
Das Frontend kommuniziert ausschließlich über einen zentralen Zugriffspunkt mit dem Backend.
Kein Teil des Frontends spricht das Backend auf einem anderen Weg an.

**Begründung:**
Die Bündelung des Backend-Zugriffs verhindert unterschiedliche Kommunikationswege innerhalb
des Frontends und stellt sicher, dass Änderungen am Backend-Zugriff nur an einer Stelle
erfolgen müssen. Die allgemeine Begründung dieses Musters ist in Kapitel 2 beschrieben.

**Grenzen:**
Dieses Muster übernimmt die allgemeinen Grenzen des in Kapitel 2 beschriebenen zentralen
Zugriffspunkts und konkretisiert sie für das Frontend.

### Muster: Benutzerbestätigung vor irreversiblen Aktionen

**Kontext:**
Eine Benutzeraktion kann eine Auswirkung auslösen, die nicht oder nur schwer rückgängig zu
machen ist.

**Muster:**
Vorgänge mit nicht oder nur schwer rückgängig zu machenden Auswirkungen werden vor ihrer
Ausführung ausdrücklich bestätigt.

**Begründung:**
Eine ausdrückliche Bestätigung verhindert, dass eine folgenreiche Aktion versehentlich durch
eine einzelne, unbedachte Interaktion ausgelöst wird. Dieses Muster ergänzt auf der Ebene der
Benutzerinteraktion das in `ARCHITECTURE.md` Prinzip 6 (Nachvollziehbarkeit vor Automatisierung)
beschriebene Prinzip.

**Grenzen:**
Das Muster gilt für Aktionen mit tatsächlich schwerwiegender oder schwer umkehrbarer
Auswirkung. Eine Bestätigung vor jeder beliebigen Aktion würde das Muster entwerten, indem sie
zu einer routinemäßig weggeklickten Formalität würde, statt eine bewusste Entscheidung
auszulösen.

### Muster: Einheitliche Rückmeldung

**Kontext:**
Eine Benutzeraktion kann erfolgreich sein, einen fachlichen Hinweis auslösen, an einer
Validierung scheitern oder an einem technischen Fehler scheitern.

**Muster:**
Erfolgreiche Vorgänge, fachliche Hinweise, Validierungsfehler und technische Fehler werden
jeweils einheitlich dargestellt, unabhängig davon, welcher Teil der Anwendung die Rückmeldung
auslöst.

**Begründung:**
Eine einheitliche Darstellung macht für den Benutzer erkennbar, um welche Art von Rückmeldung
es sich handelt, ohne dass er dies aus uneinheitlichen Darstellungsformen erst erschließen
muss.

**Grenzen:**
Das Muster betrifft die Art der Darstellung einer Rückmeldung, nicht ihren fachlichen Inhalt.
Welche Rückmeldung im Einzelfall angemessen ist, bleibt eine fachliche Entscheidung der
jeweiligen Komponente.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt Muster des Frontends. Es enthält keine Aussagen zur
Authentifizierung von Benutzern — diese ist Gegenstand von `SECURITY.md` —, keine Beschreibung
einer konkreten Frontend-Technologie — diese ist Gegenstand von `TECHNICAL.md` — und keine
fachlichen Geschäftsprozesse.

---

## Kapitel 6 — Konsistenzmuster

### Zweck dieses Kapitels

Dieses Kapitel beschreibt Muster, die nicht einen bestimmten Teil des Systems betreffen,
sondern die Art, wie ConnOps als Ganzes mit Wiederholung und Weiterentwicklung umgeht. Es
bildet den Abschluss dieses Dokuments: Die vorangegangenen Kapitel beschrieben Muster für
bestimmte Aufgabenarten — dieses Kapitel beschreibt das Muster hinter den Mustern.

### Muster: Spezifisch vor allgemein

**Kontext:**
Mehrere Regeln, die auf denselben Fall zutreffen könnten, müssen in einer bestimmten
Reihenfolge geprüft oder registriert werden — etwa bei Regelauflösung, Zuordnung, Auswahl oder
Priorisierung.

**Muster:**
Eine spezifischere Regel wird vor einer allgemeineren Regel geprüft oder registriert.

**Begründung:**
Würde die allgemeinere Regel zuerst greifen, würde sie die spezifischere Regel verdecken, ohne
dass dies an der spezifischeren Regel selbst erkennbar wäre. Dieses Muster ist unabhängig vom
technischen Mechanismus, der die Reihenfolge umsetzt.

**Grenzen:**
Das Muster gilt, sobald mehrere Regeln auf denselben Fall zutreffen können. Bei sich
gegenseitig ausschließenden Regeln ist die Reihenfolge ohne Bedeutung.

### Muster: Bestehende Muster weiterführen

**Kontext:**
Ein bereits an anderer Stelle etabliertes Muster ist noch nicht überall dort umgesetzt, wo es
gelten würde — etwa weil es erst nach der ursprünglichen Umsetzung eines Bereichs entstanden
ist.

**Muster:**
Neue Implementierungen orientieren sich an bestehenden Mustern. Bereiche, die einem Muster
noch nicht entsprechen, werden bei ohnehin anstehenden Änderungen schrittweise angeglichen,
statt in einem eigenständigen, dedizierten Umbau überführt zu werden.

**Begründung:**
Neue Funktionen bleiben dadurch von Anfang an konsistent mit bestehenden Bereichen.
Gleichzeitig können bestehende Abweichungen schrittweise im Rahmen regulärer
Weiterentwicklung reduziert werden, ohne eigenständige Angleichungsprojekte zu erzeugen.
Dieses Muster ist bereits in Kapitel 4 an der zentralen Validierungsdefinition sichtbar
geworden.

**Grenzen:**
Das Muster gilt für Inkonsistenzen ohne akute Auswirkung. Betrifft eine Abweichung von einem
etablierten Muster hingegen ein aktuelles Risiko — etwa eine Sicherheitslücke —, ist eine
schrittweise Angleichung nicht ausreichend; hier ist gezieltes, vorgezogenes Handeln
angemessen.

### Muster: Konvention vor Individualität

**Kontext:**
Eine neue Komponente steht wiederholt vor Aufgaben, für die innerhalb von ConnOps bereits ein
etablierter Lösungsweg existiert — etwa Datenzugriff, Fehlerbehandlung, Validierung oder
Kommunikation mit einer externen Ressource.

**Muster:**
Bestehende Konventionen werden bevorzugt fortgeführt. Abweichungen von einer bestehenden
Konvention stellen begründete Ausnahmen dar und werden nur gewählt, wenn die bestehende
Konvention den neuen Anwendungsfall nachweislich nicht angemessen unterstützt.

**Begründung:**
Dieses Muster ist die zusammenfassende Konsequenz aller vorangegangenen Kapitel dieses
Dokuments und die unmittelbare Umsetzung von `ARCHITECTURE.md` Prinzip 7 (Bestehende Patterns
bevorzugen). Ohne dieses Muster würde jedes einzelne der vorangegangenen Muster für sich
bestehen bleiben, ohne dass ein Grundsatz erkennbar wäre, der sie verbindet.

**Grenzen:**
Das Muster rechtfertigt nicht die Fortführung einer Konvention, die sich als grundsätzlich
fehlerhaft erwiesen hat. In diesem Fall ist die Korrektur der Konvention selbst angemessen,
nicht ihre unveränderte Fortführung.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt Muster auf der Ebene des Gesamtsystems. Es enthält keine Bewertung
einzelner, konkreter Stellen im aktuellen Code-Bestand, an denen ein Muster bereits angewendet
oder noch nicht angewendet ist — eine solche Bewertung wäre Projektwissen im Sinne von
`HANDOVER.md`, nicht zeitloser Inhalt dieses Dokuments. Ebenso legt dieses Kapitel keine neuen
projektweiten Konventionen fest. Neue Konventionen entstehen durch Architekturentscheidungen
und werden anschließend als Muster dokumentiert.

---

## Kapitel 7 — Verweis auf weiterführende Dokumente

### Stellung dieses Dokuments

`PATTERNS.md` dokumentiert die innerhalb von ConnOps etablierten, wiederkehrenden
Implementierungsmuster: zentrale Zugriffspunkte, Verarbeitungsfluss, Vertrauensgrenzen und
Schutzmuster, Zustands- und Interaktionsmuster sowie projektweite Konsistenzmuster. Es ersetzt
weder `ARCHITECTURE.md` noch `DECISIONS.md` noch `TECHNICAL.md` und trifft keine eigenen
Architektur- oder Technologieentscheidungen.

### Einordnung in die Dokumentationsstruktur

| Dokument | Zuständig für |
|---|---|
| `ARCHITECTURE.md` | Architekturprinzipien, aus denen Muster abgeleitet sind |
| `DECISIONS.md` | Einmalige, historisch begründete Einzelentscheidungen |
| `TECHNICAL.md` | Konkrete Technologien und ihre Umsetzung |
| `SECURITY.md` | Vollständige Sicherheitsimplementierung |
| `API.md` | Öffentliche Programmierschnittstellen und ihre fachliche Semantik |

### Erweiterung dieses Dokuments

Neue Muster werden aufgenommen, wenn sich ein Lösungsweg projektweit wiederholt und als
allgemeines Implementierungsmuster etabliert hat. Einmalige Entscheidungen gehören nach
`DECISIONS.md`; neue Architekturprinzipien nach `ARCHITECTURE.md`; technische Details nach
`TECHNICAL.md`.

---

Damit ist `PATTERNS.md` vollständig. Das Dokument beschreibt in sich abgeschlossen die
wiederkehrenden Implementierungsmuster von ConnOps und ihre Begründung innerhalb des durch
`ARCHITECTURE.md` und `DECISIONS.md` vorgegebenen Rahmens.
