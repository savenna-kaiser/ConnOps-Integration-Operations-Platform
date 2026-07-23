# OPERATIONS.md
# Betrieb — ConnOps

---

## Kapitel 1 — Einleitung

### Zweck dieses Dokuments

Dieses Dokument beschreibt, wie ConnOps im laufenden Betrieb überwacht, diagnostiziert und wo
notwendig eingegriffen wird. Es setzt eine bereits installierte, lauffähige Instanz voraus und
beschreibt keine Installation oder Erstinbetriebnahme — das ist Gegenstand von `DEPLOYMENT.md`.

`OPERATIONS.md` trifft keine eigenen Architektur-, Sicherheits- oder Technologieentscheidungen.
Es beschreibt, wie die in `TECHNICAL.md` beschriebene Infrastruktur und die in `SECURITY.md`
beschriebenen Mechanismen im laufenden Betrieb beobachtet und gepflegt werden.

### Abgrenzung zu `TECHNICAL.md` und `SECURITY.md`

`TECHNICAL.md` beschreibt, welche Komponenten existieren und wie sie technisch zusammenarbeiten.
`SECURITY.md` beschreibt, wie diese Komponenten abgesichert sind, einschließlich der
Protokollierung sicherheitsrelevanter Ereignisse. `OPERATIONS.md` setzt beides voraus und
beschreibt, wie der laufende Betrieb dieser bereits bestehenden Struktur überwacht wird — etwa,
welche Signale auf ein Problem hindeuten und wie darauf reagiert wird. Es wiederholt weder die
Architektur noch die Sicherheitsmechanismen selbst.

### Abgrenzung zu `DEPLOYMENT.md`

`DEPLOYMENT.md` beschreibt die einmalige oder wiederholte Herstellung eines lauffähigen
Zustands: Installation, Aktualisierung, Systemvoraussetzungen. `OPERATIONS.md` beschreibt den
danach folgenden Dauerzustand: Überwachung, Fehlerdiagnose, wiederkehrende Wartungsaufgaben. Ein
Vorgang, der ConnOps in einen neuen, lauffähigen Zustand versetzt — etwa eine Aktualisierung —
gehört auch dann in `DEPLOYMENT.md`, wenn er im laufenden Betrieb angestoßen wird.

### Abgrenzung zu `ADMIN_GUIDE.md`

`ADMIN_GUIDE.md` beschreibt die Bedienung von ConnOps für IT-Administration und IT-Leitung als
konkrete Handlungsanleitung. `OPERATIONS.md` beschreibt demgegenüber, was im Betrieb zu
beobachten ist und warum — es begründet, statt Schritt für Schritt anzuleiten. Wo eine in
diesem Dokument beschriebene Beobachtung eine konkrete Bedienhandlung erfordert, wird auf
`ADMIN_GUIDE.md` verwiesen, statt die Handlung hier auszuformulieren.

### Zielgruppe

Dieses Dokument richtet sich an Personen, die für den laufenden Betrieb von ConnOps
verantwortlich sind — insbesondere IT-Administration und IT-Leitung. Es setzt die in
`TECHNICAL.md` und `SECURITY.md` beschriebenen Grundlagen als bekannt voraus.

---

## Kapitel 2 — Betriebsgrundsätze

### Zweck dieses Kapitels

Dieses Kapitel legt die grundsätzliche Haltung fest, aus der heraus ConnOps betrieben wird,
bevor einzelne Betriebsaufgaben beschrieben werden. Es ist die normative Grundlage für alle
folgenden Kapitel dieses Dokuments.

### Kontinuierlicher Betrieb statt einmaliger Einrichtung

ConnOps wird als dauerhaft laufender Dienst betrieben, nicht als einmalig eingerichtetes und
danach unbeobachtetes System. Der Betrieb endet nicht mit der erfolgreichen Installation,
sondern beginnt dort erst. Diese Unterscheidung ist die Grundlage für die Abgrenzung dieses
Dokuments zu `DEPLOYMENT.md`, wie in Kapitel 1 festgelegt.

### Überwachung vor Bedienung

Der laufende Betrieb erfordert in erster Linie Beobachtung, nicht fortlaufende aktive
Bedienung. ConnOps ist so konzipiert, dass es im Normalzustand ohne wiederkehrende manuelle
Eingriffe funktioniert; die betriebliche Aufgabe besteht darin, zuverlässig zu erkennen, wann
dieser Normalzustand verlassen wird.

### Störungen früh erkennen

Eine Störung soll erkennbar sein, bevor sie zu einem für die Nutzer spürbaren Ausfall oder zu
einem fachlichen Schaden führt. Dieser Grundsatz begründet die kontinuierliche Überwachung der
in den folgenden Kapiteln beschriebenen Systembereiche.

### Nachvollziehbarkeit betrieblicher Eingriffe

Betriebliche Eingriffe sollen nachvollziehbar sein. Werden Vorgänge automatisiert
durchgeführt, muss ihr Ergebnis ebenso nachvollziehbar bleiben wie bei einem manuell
ausgelösten Eingriff. Dieser Grundsatz entspricht dem in `ARCHITECTURE.md` beschriebenen
Prinzip der Nachvollziehbarkeit.

### Keine Wiederholung von Architektur, Sicherheit oder Deployment

Dieses Dokument beschreibt den Betrieb der bestehenden Architektur, nicht die Architektur
selbst. Wo eine betriebliche Beobachtung eine architektonische, sicherheitsrelevante oder
installationsbezogene Grundlage voraussetzt, wird auf das jeweils zuständige Dokument
verwiesen, wie in Kapitel 1 festgelegt.

### Grenzen dieses Kapitels

Dieses Kapitel legt Grundsätze für den Betrieb fest, nicht deren konkrete technische
Umsetzung. Welche Systembereiche tatsächlich überwacht werden, welche Informationen dafür
herangezogen werden und welche Maßnahmen daraus folgen, beschreiben die folgenden Kapitel.

---

## Kapitel 3 — Überwachung des Systemzustands

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, wie der Zustand von ConnOps im laufenden Betrieb beobachtet wird.

### Ziel der Systemüberwachung

Die Systemüberwachung dient dazu, jederzeit erkennen zu können, ob ConnOps sich im
Normalzustand befindet oder ob ein Systembereich Aufmerksamkeit erfordert — bevor daraus ein
für die Nutzer spürbarer Ausfall oder ein fachlicher Schaden entsteht, wie in Kapitel 2
festgelegt.

### Systemstatus als zentrale Betriebsübersicht

ConnOps stellt eine zentrale, zusammenfassende Übersicht über die überwachten Systembereiche
bereit, wie in `API.md` Kapitel 12 beschrieben. Diese Übersicht bildet den zentralen
Einstiegspunkt für die betriebliche Beurteilung des Systemzustands. Ergibt sich daraus ein
auffälliger Zustand, können zur weiteren Einordnung zusätzliche Informationsquellen
herangezogen werden.

### Bewertung von Warn- und Fehlerzuständen

Ein Systembereich, der als auffällig oder nicht erreichbar ausgewiesen wird, erfordert eine
Einordnung: Handelt es sich um einen vorübergehenden, sich von selbst lösenden Zustand, oder um
eine Störung, die ein Eingreifen erfordert? Diese Einordnung ist Gegenstand von Kapitel 6
(Störungen und Fehlerbehandlung) dieses Dokuments und wird hier nicht vorweggenommen.

### Regelmäßige Überprüfung

Die Systemübersicht wird regelmäßig überprüft und nicht ausschließlich bei bereits vermuteten
Problemen herangezogen. Eine ausschließlich reaktive Betrachtung — erst bei einer gemeldeten
Störung — würde dem in Kapitel 2 festgelegten Grundsatz widersprechen, Störungen früh zu
erkennen.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt die betriebliche Bedeutung der Systemübersicht. Es enthält keine
Beschreibung des zugrunde liegenden Endpunkts selbst — das ist Gegenstand von `API.md` — und
keine Beschreibung, wie die einzelnen Prüfungen technisch durchgeführt werden — das ist
Gegenstand von `TECHNICAL.md`. Es enthält außerdem keine Kriterien, nach denen einzelne
Statuseinstufungen zustande kommen, wie bereits in `API.md` Kapitel 12 festgelegt.

---

## Kapitel 4 — Protokollierung und Diagnose

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, wie vorhandene Informationsquellen zur Diagnose eines
Betriebsproblems genutzt werden, nachdem die in Kapitel 3 beschriebene Systemübersicht einen
auffälligen Zustand angezeigt hat.

### Nachvollziehbarkeit von Ereignissen

Ein im Betrieb aufgetretenes Ereignis soll im Nachhinein nachvollzogen werden können: was
geschehen ist, welche Ereignisse vorausgingen und welches Ergebnis daraus entstanden ist. Diese
Nachvollziehbarkeit ist Voraussetzung dafür, eine Störung nicht nur zu beheben, sondern auch
ihre Ursache zu verstehen.

### Audit-Log als fachliche Informationsquelle

Das Audit-Log, wie in `SECURITY.md` beschrieben und über die in `API.md` Kapitel 11
beschriebenen Endpunkte einsehbar, ist die maßgebliche Informationsquelle für die fachliche
Nachvollziehbarkeit administrativer Aktionen: wer wann welche Aktion mit welchem Ergebnis
durchgeführt hat. Für die betriebliche Diagnose ist das Audit-Log insbesondere dann relevant,
wenn ein auffälliger Systemzustand mit einer vorangegangenen administrativen Aktion in
Zusammenhang stehen könnte.

### Technische Diagnosequellen

Für die technische Diagnose eines Betriebsproblems können zusätzlich technische Protokolle der
Laufzeitumgebung oder angebundener Komponenten herangezogen werden. Welche technischen
Diagnosequellen im Einzelnen zur Verfügung stehen, ist Gegenstand von `TECHNICAL.md`
beziehungsweise `DEPLOYMENT.md`.

### Zusammenführung mehrerer Informationsquellen

Eine vollständige Diagnose stützt sich häufig auf mehrere Informationsquellen gemeinsam: die
Systemübersicht zeigt, dass ein Zustand auffällig ist; das Audit-Log zeigt, ob eine
vorangegangene administrative Aktion damit in Zusammenhang steht; technische Protokolle zeigen,
was auf technischer Ebene tatsächlich geschehen ist. Erst die gemeinsame Betrachtung dieser
Informationsquellen ermöglicht in der Regel eine belastbare Einordnung eines Betriebsproblems.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt methodisch, wie vorhandene Informationsquellen zur Diagnose genutzt
werden. Es enthält keine Aussage darüber, welche Aktionen protokolliert werden — das ist
Gegenstand von `SECURITY.md` — und keine Auflistung konkreter technischer Protokolldateien oder
ihrer Speicherorte — das ist Gegenstand von `TECHNICAL.md` beziehungsweise `DEPLOYMENT.md`.

---

## Kapitel 5 — Wiederkehrende Betriebsaufgaben

### Zweck dieses Kapitels

Dieses Kapitel beschreibt den Regelbetrieb von ConnOps: Aufgaben, die nicht durch ein
konkretes Ereignis ausgelöst werden, sondern der Erhaltung eines stabilen Systemzustands
dienen.

### Regelmäßige Kontrolle statt ereignisbezogenes Eingreifen

Regelbetrieb bedeutet, bestimmte Aspekte von ConnOps regelmäßig zu überprüfen, unabhängig
davon, ob ein konkreter Anlass dafür besteht. Diese Kontrolle ergänzt die in Kapitel 3
beschriebene Systemübersicht um Aspekte, die sich nicht unmittelbar in einer Statuseinstufung
niederschlagen, deren Vernachlässigung aber mittelfristig zu einer Störung führen kann.

### Überprüfung automatisierter Prozesse

ConnOps führt bestimmte Vorgänge automatisiert und wiederkehrend aus. Der Regelbetrieb umfasst
die Kontrolle, dass diese Prozesse wie vorgesehen ausgeführt werden und ihre Ergebnisse
fachlich plausibel sind.

### Überprüfung der Datenqualität

Die von ConnOps verwalteten oder übernommenen Daten können im Zeitverlauf veralten oder
inkonsistent werden, ohne dass dies zu einer erkennbaren Störung führt. Der Regelbetrieb
umfasst die Kontrolle, dass diese Daten weiterhin vollständig, aktuell und fachlich plausibel
sind.

### Pflege betrieblicher Einstellungen

Bestimmte Einstellungen von ConnOps sind betrieblichen Rahmenbedingungen unterworfen und können
im Zeitverlauf angepasst werden müssen. Der Regelbetrieb umfasst die Überprüfung, ob diese
Einstellungen weiterhin dem tatsächlichen Bedarf entsprechen.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt, welche Arten wiederkehrender Betriebsaufgaben bestehen und warum sie
notwendig sind. Es enthält keine Anleitung zur Durchführung einzelner Aufgaben — das ist
Gegenstand von `ADMIN_GUIDE.md` — und keine Beschreibung der zugrunde liegenden Endpunkte oder
Konfigurationswerte — das ist Gegenstand von `API.md` beziehungsweise `TECHNICAL.md`.

---

## Kapitel 6 — Störungen und Fehlerbehandlung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt den betrieblichen Umgang mit Störungen: wie eine Störung erkannt,
eingeordnet, behoben und nachbereitet wird.

### Erkennen einer Störung

Eine Störung wird erkennbar, wenn die in Kapitel 3 beschriebene Systemübersicht einen
auffälligen Zustand anzeigt, wenn eine wiederkehrende Betriebsaufgabe gemäß Kapitel 5 ein
unerwartetes Ergebnis liefert, oder wenn eine Beobachtung außerhalb dieser beiden Quellen auf
ein Problem hindeutet, etwa eine Meldung durch einen Nutzer.

### Einordnung der Störung

Nicht jede erkannte Auffälligkeit erfordert dieselbe Reaktion. Eine Störung wird danach
eingeordnet, welche Auswirkungen sie auf den Betrieb von ConnOps sowie auf die fachliche
Korrektheit der von ConnOps verwalteten Daten hat. Diese Einordnung bestimmt, mit welcher
Dringlichkeit und über welchen Weg eine Störung weiterbearbeitet wird.

### Ziel der Fehlerbehandlung

Die Fehlerbehandlung verfolgt zwei Ziele: die unmittelbare Wiederherstellung eines
funktionsfähigen Zustands sowie, davon unabhängig, das Verständnis der zugrunde liegenden
Ursache. Eine Störung, deren Ursache ungeklärt bleibt, kann erneut auftreten, ohne dass
geeignete Maßnahmen zu ihrer Vermeidung getroffen werden können.

### Dokumentation und Nachbereitung

Eine Störung wird nach ihrer Behebung nachbereitet: Was ist geschehen, was war die Ursache, und
welche Konsequenzen sich daraus für den künftigen Betrieb oder für die Weiterentwicklung von
ConnOps ergeben. Diese Nachbereitung führt den in Kapitel 4 beschriebenen Grundsatz der
Nachvollziehbarkeit von Ereignissen konsequent fort — sie endet nicht mit der Diagnose, sondern
schließt die Behebung und ihre Auswertung mit ein.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt den betrieblichen Ablauf der Fehlerbehandlung. Es enthält keine
Anleitung zur Behebung konkreter Störungsbilder — das ist Gegenstand von `ADMIN_GUIDE.md` —
und keine Beschreibung technischer Fehlerursachen oder ihrer Behebung auf Code-Ebene.

---

## Kapitel 7 — Datensicherung und Wiederherstellung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt die betriebliche Anforderung an die Sicherung der für den Betrieb
von ConnOps erforderlichen Daten und Konfigurationen, unabhängig davon, mit welchem
technischen Verfahren diese Anforderung umgesetzt wird.

### Ziel der Datensicherung

Die für den Betrieb erforderlichen Daten müssen so gesichert werden, dass sie nach einem
Ausfall oder Datenverlust wiederhergestellt werden können. Dies betrifft sowohl die in
`ARCHITECTURE.md` Kapitel 7 beschriebenen eigenen Daten der Plattform als auch die für den
Betrieb notwendige Konfiguration.

### Wiederherstellbarkeit als Betriebsanforderung

Eine Datensicherung erfüllt ihren Zweck nur, wenn aus ihr tatsächlich ein funktionsfähiger
Zustand wiederhergestellt werden kann. Die bloße Existenz einer Sicherung ist keine
hinreichende Betriebsanforderung; die Anforderung ist erst erfüllt, wenn die
Wiederherstellbarkeit sichergestellt ist.

### Regelmäßige Überprüfung der Wiederherstellbarkeit

Die Wiederherstellbarkeit wird regelmäßig überprüft, nicht erst im tatsächlichen
Ausfallfall angenommen. Eine Sicherung, deren Wiederherstellbarkeit ungeprüft bleibt, stellt
kein verlässliches Sicherheitsnetz für den Betrieb dar.

### Verantwortlichkeit

Die Sicherstellung einer funktionsfähigen Datensicherung gehört zu den dauerhaften Aufgaben
des Betriebs. Dies gilt unabhängig davon, welche technische Komponente oder welches Verfahren
die Datensicherung umsetzt.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt ausschließlich die betriebliche Anforderung an Datensicherung und
Wiederherstellbarkeit. Die technische Umsetzung des Sicherungsverfahrens sowie dessen
Einrichtung und Durchführung sind Gegenstand von `TECHNICAL.md` beziehungsweise
`DEPLOYMENT.md`.

---

## Kapitel 8 — Wartung und Aktualisierung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt die betriebliche Einordnung geplanter Wartungs- und
Aktualisierungsvorgänge sowie deren Auswirkungen auf den laufenden Betrieb. Es beschreibt
nicht die Durchführung selbst — das ist Gegenstand von `DEPLOYMENT.md`, wie in Kapitel 1
festgelegt.

### Wartung als geplanter Eingriff

Wartung und Aktualisierung unterscheiden sich von der in Kapitel 6 beschriebenen
Störungsbehandlung dadurch, dass sie geplant und nicht durch eine bereits eingetretene Störung
ausgelöst erfolgen. Ein geplanter Eingriff soll zu einem Zeitpunkt und unter
Rahmenbedingungen stattfinden, die vom Betrieb bewusst gewählt werden und nicht durch eine
bereits eingetretene Störung bestimmt sind.

### Auswirkungen auf den laufenden Betrieb

Ein Wartungs- oder Aktualisierungsvorgang kann den laufenden Betrieb von ConnOps
vorübergehend einschränken oder unterbrechen. Diese Auswirkung wird vor der Durchführung
eingeschätzt, damit sie zu einem Zeitpunkt erfolgt, an dem sie den geringstmöglichen Einfluss
auf die Nutzung von ConnOps hat.

### Wartungsfenster

Ein planbarer Eingriff mit erwarteter Betriebsauswirkung wird innerhalb eines dafür
vorgesehenen Zeitraums durchgeführt, der vor seiner Durchführung bekannt gemacht wird. Dieser
Zeitraum wird so gewählt, dass die in Kapitel 5 beschriebenen wiederkehrenden Betriebsaufgaben
und die reguläre Nutzung von ConnOps möglichst wenig beeinträchtigt werden.

### Aktualisierung als wiederkehrender Betriebsprozess

Eine Aktualisierung von ConnOps ist kein einmaliges Ereignis, sondern ein wiederkehrender
Bestandteil des Betriebs. Sie wird in denselben betrieblichen Rahmen eingeordnet wie andere
geplante Eingriffe: mit Auswirkungseinschätzung und Wartungsfenster, unabhängig von Anlass
oder Häufigkeit.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt die betriebliche Einordnung von Wartung und Aktualisierung. Es
enthält keine Beschreibung des Installations- oder Aktualisierungsvorgangs selbst, keine
Angabe zu Aktualisierungsintervallen und keine technischen Voraussetzungen — diese sind
Gegenstand von `DEPLOYMENT.md`.

---

## Kapitel 9 — Grenzen dieses Dokuments

Dieses Dokument beschreibt den laufenden Betrieb von ConnOps: Beobachtung, Diagnose,
Regelbetrieb, Fehlerbehandlung, Datensicherung sowie Wartung und Aktualisierung auf
betrieblicher Ebene. Es trifft keine Architektur-, Sicherheits- oder
Technologieentscheidungen und beschreibt keine konkreten Bedien- oder Arbeitsanweisungen.

Dieses Dokument enthält insbesondere nicht:

- die Begründung, warum ConnOps so aufgebaut ist, wie es aufgebaut ist (`ARCHITECTURE.md`),
- die technische Umsetzung der beschriebenen Systembereiche (`TECHNICAL.md`),
- die Sicherheitsmechanismen und ihre Begründung (`SECURITY.md`),
- die Endpunkte, über die betriebliche Informationen abgerufen werden (`API.md`),
- die Installation, Aktualisierung und Systemvoraussetzungen von ConnOps (`DEPLOYMENT.md`),
- konkrete Bedienschritte für IT-Administration oder Helpdesk (`ADMIN_GUIDE.md`,
  `USER_GUIDE.md`).

Wo dieses Dokument auf einen dieser Aspekte Bezug nimmt, verweist es auf das jeweils
zuständige Dokument, statt dessen Inhalt vorwegzunehmen oder zu wiederholen.

---

## Kapitel 10 — Verweis auf weiterführende Dokumente

### Stellung dieses Dokuments

`OPERATIONS.md` beschreibt den laufenden Betrieb von ConnOps auf betrieblicher Ebene. Es
ersetzt weder `ARCHITECTURE.md` noch `SECURITY.md`, `TECHNICAL.md`, `API.md` oder
`DEPLOYMENT.md` und trifft keine eigenen Architektur-, Sicherheits- oder
Technologieentscheidungen.

### Verweisstruktur

| Dokument | Vertieft folgenden Aspekt dieses Dokuments |
|---|---|
| `ARCHITECTURE.md` | Die Prinzipien, aus denen sich betriebliche Anforderungen ableiten |
| `DECISIONS.md` | Architektur- und Technologieentscheidungen, auf denen einzelne betriebliche Grundsätze beruhen |
| `PATTERNS.md` | Wiederkehrende Implementierungsmuster, die den technischen Grundlagen dieses Dokuments zugrunde liegen |
| `SECURITY.md` | Sicherheitsmechanismen und Protokollierung, die dieses Dokument voraussetzt |
| `TECHNICAL.md` | Die technische Umsetzung der überwachten Systembereiche |
| `API.md` | Die Endpunkte, über die betriebliche Informationen abgerufen werden |
| `DEPLOYMENT.md` | Installation, Aktualisierung und technische Umsetzung der Datensicherung |
| `ADMIN_GUIDE.md` | Konkrete Bedienhandlungen für IT-Administration und IT-Leitung |

Widersprüche zwischen diesem Dokument und anderen Dokumenten werden nicht durch Priorisierung
dieses Dokuments aufgelöst. Maßgeblich ist die Zuständigkeit des jeweiligen Dokuments.

### Ist-Zustand statt Zielbild

Dieses Dokument beschreibt betriebliche Grundsätze, die unabhängig vom konkreten technischen
Stand von ConnOps gelten. Wo ein betrieblicher Grundsatz eine technische Umsetzung
voraussetzt, die noch nicht abschließend festgelegt ist — etwa das konkrete
Datensicherungsverfahren —, wird dies nicht vorweggenommen; der Grundsatz bleibt gültig,
sobald die technische Umsetzung feststeht.

### Pflege dieses Dokuments

Dieses Dokument wird angepasst, wenn sich die betrieblichen Anforderungen an ConnOps
grundsätzlich ändern — etwa durch einen neuen Systembereich, der überwacht werden muss, oder
eine veränderte Einordnung von Störungen. Änderungen an der zugrunde liegenden Architektur,
Sicherheit oder Technik werden zunächst in den jeweils zuständigen Dokumenten nachgezogen;
betrifft eine solche Änderung auch den Betrieb von ConnOps, wird dieses Dokument entsprechend
nachgeführt.

---

Damit ist `OPERATIONS.md` vollständig. Das Dokument beschreibt in sich abgeschlossen den
laufenden Betrieb von ConnOps: Betriebsgrundsätze, Überwachung des Systemzustands,
Protokollierung und Diagnose, wiederkehrende Betriebsaufgaben, Störungen und
Fehlerbehandlung, Datensicherung und Wiederherstellung sowie Wartung und Aktualisierung.
