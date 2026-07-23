# DEPLOYMENT.md
# Installation und Aktualisierung — ConnOps

---

## Kapitel 1 — Einleitung

### Zweck dieses Dokuments

Dieses Dokument beschreibt, wie ConnOps in einen lauffähigen Zustand versetzt wird: die
Erstinstallation sowie jede spätere Aktualisierung. Es setzt die in `TECHNICAL.md`
beschriebene Infrastruktur und die in `SECURITY.md` beschriebenen Schutzmechanismen als
gegeben voraus und beschreibt, wie diese tatsächlich hergestellt werden.

`DEPLOYMENT.md` trifft keine eigenen Architektur-, Sicherheits- oder Technologie-
entscheidungen. Es begründet nicht, warum ConnOps auf eine bestimmte Weise aufgebaut ist,
sondern beschreibt, wie ein bereits festgelegter Aufbau tatsächlich hergestellt wird.

### Abgrenzung zu `TECHNICAL.md`

`TECHNICAL.md` beschreibt, welche Infrastruktur ConnOps voraussetzt und wie ihre Komponenten
zusammenarbeiten. `DEPLOYMENT.md` setzt diese Beschreibung voraus und beschreibt, wie diese
Infrastruktur tatsächlich bereitgestellt und ConnOps darauf eingerichtet wird. Es wiederholt
keine architektonischen oder technischen Begründungen aus `TECHNICAL.md`.

### Abgrenzung zu `OPERATIONS.md`

Wie in `OPERATIONS.md` Kapitel 1 festgelegt, endet die Zuständigkeit dieses Dokuments dort, wo
ConnOps einen lauffähigen Zustand erreicht hat und in den Dauerbetrieb übergeht. Ein Vorgang,
der ConnOps in einen neuen, lauffähigen Zustand versetzt — etwa eine Aktualisierung —, gehört
auch dann in dieses Dokument, wenn er im laufenden Betrieb angestoßen wird. Die Überwachung
und Diagnose des bereits laufenden Systems ist nicht Gegenstand dieses Dokuments.

### Abgrenzung zu `ADMIN_GUIDE.md`

`ADMIN_GUIDE.md` richtet sich an die tägliche Bedienung einer bereits eingerichteten
Instanz von ConnOps. `DEPLOYMENT.md` beschreibt demgegenüber die Einrichtung selbst. Eine
Handlungsanleitung zur Installation oder Aktualisierung gehört in dieses Dokument, auch wenn
sie im Aufbau einer Schritt-für-Schritt-Anleitung ähnelt — der Unterschied liegt im Gegenstand
(Einrichtung vs. laufende Bedienung), nicht im Schreibstil.

### Zielgruppe

Dieses Dokument richtet sich an Personen, die ConnOps installieren oder aktualisieren —
insbesondere IT-Administration. Es setzt die in `TECHNICAL.md` beschriebenen Grundlagen als
bekannt voraus.

---

## Kapitel 2 — Bereitstellungsgrundsätze

### Zweck dieses Kapitels

Dieses Kapitel legt die grundsätzlichen Anforderungen fest, nach denen ConnOps installiert
und aktualisiert wird, bevor einzelne Bereitstellungsschritte beschrieben werden.

### Nachvollziehbarer Zielzustand

Jede Installation und jede Aktualisierung führt zu einem eindeutig feststellbaren Zielzustand.
Eine Bereitstellung gilt erst dann als abgeschlossen, wenn dieser Zielzustand erreicht und
überprüfbar ist — nicht bereits dann, wenn die dafür notwendigen Schritte ausgeführt wurden.

### Voraussetzungen vor Beginn prüfen

Eine Bereitstellung setzt voraus, dass ihre notwendigen Voraussetzungen vollständig erfüllt
sind. Nur so kann der angestrebte Zielzustand zuverlässig erreicht werden.

### Trennung von Anwendung und Betriebsdaten

Die Anwendung und die im Betrieb entstandenen Daten werden als unterschiedliche Bestandteile
der Bereitstellung betrachtet. Änderungen an der Anwendung dürfen die Integrität der
Betriebsdaten nicht beeinträchtigen. Diese Trennung bildet die Grundlage für Aktualisierung,
Datensicherung und Wiederherstellung, wie in `OPERATIONS.md` Kapitel 7 beschrieben.

### Wiederholbarkeit

Eine Bereitstellung soll unter gleichen Voraussetzungen zum gleichen Ergebnis führen. Das
Ergebnis darf nicht von nicht dokumentierten Umgebungsbedingungen oder manuellen
Einzelentscheidungen abhängen.

### Grenzen dieses Kapitels

Dieses Kapitel legt Grundsätze für die Bereitstellung fest, nicht deren konkrete technische
Umsetzung. Welche Voraussetzungen im Einzelnen gelten und wie eine Bereitstellung tatsächlich
abläuft, beschreiben die folgenden Kapitel.

---

## Kapitel 3 — Systemvoraussetzungen

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, was vor Beginn einer Installation bereits vorhanden sein muss. Es
beschreibt keine Bereitstellungsschritte und keine Konfiguration — diese sind Gegenstand der
folgenden Kapitel.

### Zielplattform

ConnOps wird auf Windows Server betrieben, innerhalb der eigenen Netzwerkinfrastruktur der
Organisation, wie in `TECHNICAL.md` Kapitel 4 beschrieben.

### Laufzeitumgebung

Die Zielplattform muss eine Node.js-Laufzeitumgebung sowie PowerShell bereitstellen können, wie
in `TECHNICAL.md` Kapitel 2 beschrieben.

### Datenhaltung

Für die zentrale Plattformdatenhaltung muss eine PostgreSQL-Datenbank erreichbar sein, wie in
`TECHNICAL.md` Kapitel 5 beschrieben. Für lokale, interne Datenhaltung innerhalb einzelner
Komponenten wird keine separate Datenbankbereitstellung vorausgesetzt.

### Netzwerkinfrastruktur

Die Bereitstellung berücksichtigt einen vorgeschalteten Webserver, der die
Transportverschlüsselung gegenüber dem Client übernimmt und Anfragen an das Backend
weiterleitet, wie in `DECISIONS.md` ADR-025 festgelegt.

Der ConnOps-Server muss über das Netzwerk erreichbar sein, und die für den Betrieb
erforderlichen externen Systeme müssen vom ConnOps-Server aus erreichbar sein.

### Externe Systeme

Folgende externe Systeme müssen vom ConnOps-Server aus erreichbar sein: Active Directory,
Exchange On-Prem, TopDesk, Docusnap sowie der Citrix Delivery Controller, wie in `TECHNICAL.md`
Kapitel 6 beschrieben.

### Sicherheitsvoraussetzungen

Die Zielplattform muss die sichere Ablage und Nutzung technischer Konfigurationssecrets gemäß
den Vorgaben aus `SECURITY.md` unterstützen.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt Voraussetzungen, die vor Beginn einer Installation bereits erfüllt
sein müssen. Es enthält keine konkreten Versions-, Kapazitäts- oder Konfigurationsangaben, da
diese nicht als verbindliche Mindestanforderung festgelegt sind. Es enthält außerdem keine
Aussage darüber, wie ConnOps als Dienst eingerichtet oder wie eine Sicherheitsvoraussetzung
konkret konfiguriert wird — das ist Gegenstand der folgenden Kapitel.

---

## Kapitel 4 — Erstinstallation

### Zweck dieses Kapitels

Dieses Kapitel beschreibt den Zustandsübergang von einer Zielplattform, die die in Kapitel 3
beschriebenen Voraussetzungen erfüllt, zu einer lauffähigen ConnOps-Instanz.

### Ausgangszustand

Die Erstinstallation setzt voraus, dass die in Kapitel 3 beschriebenen Voraussetzungen
vollständig erfüllt sind, bevor sie beginnt, wie in Kapitel 2 als Grundsatz festgelegt.

### Bereitstellung der Anwendung

Die Anwendungskomponenten von ConnOps werden auf der Zielplattform bereitgestellt. Nach diesem
Schritt befinden sich die für den Betrieb erforderlichen Komponenten am vorgesehenen Ort, sind
jedoch noch nicht vollständig in den Betriebszustand überführt.

### Einrichtung als Dienst

Das Backend wird als Windows-Dienst eingerichtet, der unter einer dafür vorgesehenen,
dedizierten technischen Identität läuft, wie in `TECHNICAL.md` Kapitel 4 und `SECURITY.md`
Kapitel 3 beschrieben. Im Anschluss ist ConnOps als Dienst registriert, jedoch noch nicht
notwendigerweise lauffähig, da die Konfiguration noch aussteht.

### Herstellung der Datenhaltung

Die für ConnOps vorgesehene Datenhaltung wird für die erstmalige Nutzung vorbereitet, wie in
`TECHNICAL.md` Kapitel 5 beschrieben.

### Zielzustand der Erstinstallation

Die Erstinstallation gilt als abgeschlossen, wenn ConnOps als Dienst registriert ist und die
erforderlichen technischen Grundlagen vorhanden sind. Die Herstellung des betriebsbereiten
Zustands erfolgt anschließend durch die Konfiguration gemäß Kapitel 5.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt den Zustandsübergang der Erstinstallation. Es enthält keine
Konfigurationsschritte — diese sind Gegenstand von Kapitel 5 — und keine Beschreibung
konkreter Bedienoberflächen oder Befehle, mit denen dieser Übergang ausgeführt wird — diese
sind, soweit erforderlich, Gegenstand von `ADMIN_GUIDE.md`.

---

## Kapitel 5 — Konfiguration

### Zweck dieses Kapitels

Dieses Kapitel beschreibt den Zustandsübergang von einer installierten, aber noch nicht
betriebsbereiten ConnOps-Instanz zu einer für den vorgesehenen Betrieb konfigurierten
Instanz.

### Bindung der technischen Identität

Die in Kapitel 4 eingerichtete technische Identität des Dienstes verfügt über die für den
Betrieb erforderlichen Berechtigungen für die in Kapitel 3 genannten externen Systeme, wie in
`SECURITY.md` Kapitel 3 beschrieben.

### Schutz technischer Konfigurationssecrets

Die technischen Zugangsdaten zu externen Systemen sowie weitere für den Betrieb erforderliche
Konfigurationssecrets werden so abgelegt, dass sie an die in Kapitel 4 eingerichtete technische
Identität des Dienstes gebunden sind, wie in `SECURITY.md` Kapitel 6 beschrieben. Diese Bindung
ist die konkrete Umsetzung der in Kapitel 3 dieses Dokuments beschriebenen
Sicherheitsvoraussetzung.

### Konfiguration der externen Anbindungen

Die für die einzelnen externen Systeme erforderlichen Verbindungsangaben werden hinterlegt,
soweit sie nicht bereits durch die Bindung der technischen Identität abgedeckt sind — etwa
Verbindungsangaben zu Systemen, die über ein eigenes Geheimnis angebunden werden, wie in
`TECHNICAL.md` Kapitel 6 beschrieben.

### Konfiguration des vorgeschalteten Webservers

Der in Kapitel 3 beschriebene vorgeschaltete Webserver wird so eingerichtet, dass er Anfragen
an das Backend weiterleitet und die Transportverschlüsselung gegenüber dem Client
bereitstellt, wie in `DECISIONS.md` ADR-025 festgelegt.

### Zielzustand der Konfiguration

Die Konfiguration gilt als abgeschlossen, wenn die technische Identität über die
erforderlichen Berechtigungen verfügt, alle technischen Konfigurationssecrets geschützt
hinterlegt sind, die externen Anbindungen konfiguriert sind und der vorgeschaltete Webserver
eingerichtet ist. Damit ist der in Kapitel 4 vorbereitete betriebsbereite Zustand
hergestellt.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt den Zustandsübergang der Konfiguration. Es enthält keine
Beschreibung konkreter Konfigurationswerte, Dateien oder Bedienoberflächen, mit denen diese
Konfiguration vorgenommen wird — diese sind, soweit erforderlich, Gegenstand von
`ADMIN_GUIDE.md`.

---

## Kapitel 6 — Aktualisierung

### Zweck dieses Kapitels

Dieses Kapitel beschreibt den technischen Zustandsübergang einer bereits betriebsbereiten
ConnOps-Instanz auf einen neuen Anwendungsstand. Die betriebliche Einordnung, Planung und
Auswirkungseinschätzung einer Aktualisierung ist Gegenstand von `OPERATIONS.md` Kapitel 8; dort
wird begründet, wann und unter welchen Rahmenbedingungen eine Aktualisierung durchgeführt wird.
Dieses Kapitel beschreibt, was während des Übergangs selbst geschieht.

### Ausgangszustand

Eine Aktualisierung setzt eine bereits betriebsbereite ConnOps-Instanz voraus, deren
Betriebsdaten und Konfiguration dem aktuellen Betriebszustand entsprechen.

### Überführung der Anwendungskomponenten

Die Anwendungskomponenten von ConnOps werden auf den neuen Anwendungsstand überführt. Die im
Betrieb entstandenen Daten bleiben davon unberührt, wie in Kapitel 2 als Grundsatz der
Trennung von Anwendung und Betriebsdaten festgelegt.

### Anpassung der Datenhaltung

Erfordert der neue Anwendungsstand eine veränderte Struktur der Datenhaltung, wird diese
Struktur angepasst, ohne die Integrität der bestehenden Daten zu beeinträchtigen, wie in
`TECHNICAL.md` Kapitel 5 beschrieben.

### Zielzustand der Aktualisierung

Die Aktualisierung gilt als abgeschlossen, wenn die Anwendungskomponenten dem neuen
Anwendungsstand entsprechen, die Datenhaltung mit diesem Stand konsistent ist und ConnOps
wieder betriebsbereit ist. Die Wiederherstellbarkeit des vorherigen Zustands im Fehlerfall ist
Gegenstand von Kapitel 7 dieses Dokuments.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt den technischen Zustandsübergang der Aktualisierung. Es enthält
keine betriebliche Planung, keine Auswirkungseinschätzung und keine Festlegung eines
Aktualisierungsintervalls — diese sind Gegenstand von `OPERATIONS.md`. Es enthält außerdem
keine Beschreibung konkreter Aktualisierungswerkzeuge oder -befehle — diese sind, soweit
erforderlich, Gegenstand von `ADMIN_GUIDE.md`.

---

## Kapitel 7 — Rückwärtskompatibilität und Rollback

### Zweck dieses Kapitels

Dieses Kapitel beschreibt, wie nach einer fehlgeschlagenen oder nicht funktionsfähigen
Aktualisierung ein vorheriger, funktionsfähiger Zustand wieder erreicht werden kann. Es
beschreibt keine allgemeine Datensicherung — diese ist als betriebliche Verantwortung
Gegenstand von `OPERATIONS.md` Kapitel 7 — sondern ausschließlich den Weg zurück im
unmittelbaren Anschluss an eine Aktualisierung.

### Voraussetzung für einen Rollback

Ein Rollback setzt voraus, dass der vor der Aktualisierung bestehende Zustand der
Anwendungskomponenten sowie ein mit diesem Zustand kompatibler Zustand der Datenhaltung
verfügbar sind. Diese Verfügbarkeit ist eine Voraussetzung, die vor Beginn einer
Aktualisierung erfüllt sein muss, entsprechend dem in Kapitel 2 festgelegten Grundsatz,
Voraussetzungen vor Beginn zu prüfen.

### Rückkehr zum vorherigen Zustand

Ein Rollback überführt die Anwendungskomponenten zurück auf den vor der Aktualisierung
bestehenden Stand. War die Aktualisierung mit einer Anpassung der Datenhaltung gemäß Kapitel 6
verbunden, muss diese Anpassung beim Rollback berücksichtigt werden, damit
Anwendungskomponenten und Datenhaltung wieder einen zusammenpassenden Zustand bilden.

### Rückwärtskompatibilität

Ob ein vorheriger Anwendungsstand mit einer bereits angepassten Datenhaltung weiterhin
zusammenarbeiten kann, hängt von der jeweiligen Aktualisierung ab. Diese Eigenschaft wird vor
einer Aktualisierung eingeschätzt, nicht erst im Rollback-Fall.

### Zielzustand nach einem Rollback

Ein Rollback gilt als abgeschlossen, wenn ConnOps wieder in einem funktionsfähigen Zustand
betrieben werden kann, der mit dem Zustand vor der Aktualisierung konsistent ist.

### Grenzen dieses Kapitels

Dieses Kapitel beschreibt den Weg zurück im unmittelbaren Anschluss an eine Aktualisierung. Es
enthält kein allgemeines Datensicherungskonzept — das ist Gegenstand von `OPERATIONS.md`
Kapitel 7 — und keine Beschreibung konkreter Rollback-Werkzeuge oder -befehle.

---

## Kapitel 8 — Grenzen dieses Dokuments

Dieses Dokument beschreibt die Bereitstellung von ConnOps: Systemvoraussetzungen,
Erstinstallation, Konfiguration, Aktualisierung sowie Rückwärtskompatibilität und Rollback. Es
trifft keine Architektur-, Sicherheits- oder Technologieentscheidungen und beschreibt keine
konkreten Bedien- oder Arbeitsanweisungen.

Dieses Dokument enthält insbesondere nicht:

- die Begründung, warum ConnOps so aufgebaut ist, wie es aufgebaut ist (`ARCHITECTURE.md`),
- die technische Umsetzung der Plattform und ihrer Systembereiche (`TECHNICAL.md`),
- die Sicherheitsmechanismen und ihre Begründung (`SECURITY.md`),
- die Endpunkte der bereitgestellten Anwendung (`API.md`),
- die betriebliche Einordnung, Planung und Überwachung nach erfolgter Bereitstellung
  (`OPERATIONS.md`),
- konkrete Bedienschritte für IT-Administration (`ADMIN_GUIDE.md`).

Wo dieses Dokument auf einen dieser Aspekte Bezug nimmt, verweist es auf das jeweils
zuständige Dokument, statt dessen Inhalt vorwegzunehmen oder zu wiederholen.

---

## Kapitel 9 — Verweis auf weiterführende Dokumente

### Stellung dieses Dokuments

`DEPLOYMENT.md` beschreibt die Bereitstellung von ConnOps auf normativer Ebene: Voraussetzungen
und Zustandsübergänge, nicht Bedienhandlungen. Es ersetzt weder `ARCHITECTURE.md` noch
`SECURITY.md`, `TECHNICAL.md`, `API.md` oder `OPERATIONS.md` und trifft keine eigenen
Architektur-, Sicherheits- oder Technologieentscheidungen.

### Verweisstruktur

| Dokument | Vertieft folgenden Aspekt dieses Dokuments |
|---|---|
| `ARCHITECTURE.md` | Die Prinzipien, aus denen sich Bereitstellungsanforderungen ableiten |
| `DECISIONS.md` | Architektur- und Technologieentscheidungen, auf denen einzelne Bereitstellungsschritte beruhen |
| `PATTERNS.md` | Wiederkehrende Implementierungsmuster, die den technischen Grundlagen dieses Dokuments zugrunde liegen |
| `SECURITY.md` | Sicherheitsmechanismen, die während der Bereitstellung hergestellt werden |
| `TECHNICAL.md` | Die technische Umsetzung der bereitgestellten Systembereiche |
| `API.md` | Die Endpunkte der bereitgestellten Anwendung |
| `OPERATIONS.md` | Betriebliche Einordnung, Planung und Überwachung nach erfolgter Bereitstellung |
| `ADMIN_GUIDE.md` | Konkrete Bedienhandlungen, soweit diese zur Durchführung der Bereitstellung erforderlich sind |

Widersprüche zwischen diesem Dokument und anderen Dokumenten werden nicht durch Priorisierung
dieses Dokuments aufgelöst. Maßgeblich ist die Zuständigkeit des jeweiligen Dokuments.

### Ist-Zustand statt Zielbild

Dieses Dokument beschreibt Bereitstellungsanforderungen, die unabhängig vom konkreten
technischen Stand von ConnOps gelten. Wo eine Anforderung eine technische Umsetzung
voraussetzt, die noch nicht abschließend festgelegt ist, wird dies nicht vorweggenommen; die
Anforderung bleibt gültig, sobald die technische Umsetzung feststeht.

### Pflege dieses Dokuments

Dieses Dokument wird angepasst, wenn sich die Bereitstellungsanforderungen an ConnOps
grundsätzlich ändern — etwa durch eine neue Systemvoraussetzung oder einen veränderten
Aktualisierungsweg. Änderungen an der zugrunde liegenden Architektur, Sicherheit oder Technik
werden zunächst in den jeweils zuständigen Dokumenten nachgezogen; betrifft eine solche
Änderung auch die Bereitstellung von ConnOps, wird dieses Dokument entsprechend nachgeführt.

---

Damit ist `DEPLOYMENT.md` vollständig. Das Dokument beschreibt in sich abgeschlossen die
Bereitstellung von ConnOps: Bereitstellungsgrundsätze, Systemvoraussetzungen,
Erstinstallation, Konfiguration, Aktualisierung sowie Rückwärtskompatibilität und Rollback.
