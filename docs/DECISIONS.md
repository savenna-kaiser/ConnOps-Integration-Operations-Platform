# DECISIONS.md
# Architekturentscheidungen — ConnOps

Dieses Dokument hält Architekturentscheidungen von ConnOps fest, die über eine reine
Implementierungswahl hinausgehen. Jede Entscheidung ist einem oder mehreren der in
`ARCHITECTURE.md`, Kapitel 3, beschriebenen Architekturprinzipien zugeordnet.

Dieses Dokument enthält ausschließlich Entscheidungen, die technische oder architektonische
Auswirkungen auf die Plattform haben. Entscheidungen zur Dokumentationsstruktur oder
Projektorganisation werden hier nicht geführt, sofern sie keine Auswirkungen auf die
Plattformarchitektur besitzen.

Format je Entscheidung: Kontext, Entscheidung, Begründung, Konsequenz, Status. Entscheidungen gelten als verbindlich, bis eine neue Entscheidung sie ausdrücklich ändert oder ergänzt — bestehende Einträge werden nicht rückwirkend umformuliert.

---

## ADR-001 — Systeme verbinden, nicht ersetzen

**Kontext:** Active Directory, Exchange On-Prem, Docusnap und TopDesk sind etablierte Fachsysteme mit eigener Datenhoheit.

**Entscheidung:** Die Plattform tritt als Integrationsschicht zwischen diese Systeme und ihre Benutzer, ersetzt jedoch keines der Systeme selbst.

**Begründung:** Ein Ersatz bestehender Fachsysteme wäre mit erheblichem Migrationsaufwand und Risiko verbunden und würde dem Ziel widersprechen, den Arbeitsalltag von Helpdesk und IT-Administration zu vereinfachen, statt neue Systemkomplexität zu schaffen.

**Konsequenz:** Jede neue Integration folgt demselben Muster: Anbindung statt Ablösung. Vorschläge, ein führendes System durch eigene Datenhaltung zu ersetzen, werden nicht umgesetzt.

**Prinzip:** 1 — Systeme verbinden, nicht ersetzen.

**Status:** Verbindlich.

---

## ADR-002 — Führende Systeme als alleinige Datenquelle (Source of Truth)

**Kontext:** Fachliche Daten wie Benutzeridentitäten, Mailboxen oder Serviceprozesse existieren bereits in den angebundenen Systemen.

**Entscheidung:** Jedes externe System bleibt die alleinige Dateninstanz (*Source of Truth*) seines fachlichen Bereichs. Die Plattform hält keine dauerhafte Kopie dieser Daten vor.

**Begründung:** Eine Schattenkopie würde zu Inkonsistenzen führen, sobald sich Daten im führenden System ändern, ohne dass die Plattform davon erfährt.

**Konsequenz:** Fachliche Daten werden bei Bedarf gelesen, nicht repliziert. Die Plattform speichert ausschließlich eigene Daten (siehe ADR-003).

**Prinzip:** 2 — Führende Systeme respektieren.

**Status:** Verbindlich.

---

## ADR-003 — Eigene Daten der Plattform

**Kontext:** Die Plattform koordiniert Workflows und muss dafür Zustände führen, die kein externes System kennt.

**Entscheidung:** Die Plattform speichert ausschließlich Daten, die keinen externen Datenbestand ersetzen: Organisationsstruktur, Change-Queue mit Ausführungshistorie, Plattformkonfiguration und Audit-Log.

**Begründung:** Diese Daten entstehen durch die Tätigkeit der Plattform selbst (siehe `ARCHITECTURE.md`, Kapitel 7) und existieren an keiner anderen Stelle sinnvoll.

**Konsequenz:** Eigene Daten gliedern sich in fachliche Prozessdaten (Organisationsstruktur, Change-Queue) und technische Betriebsdaten (Audit-Log, Plattformkonfiguration) — siehe ADR-009 und ADR-010.

**Prinzip:** 2, 3.

**Status:** Verbindlich.

---

## ADR-004 — PowerShell-Bridge als einziger Zugangspunkt zu AD und Exchange

**Kontext:** Active Directory und Exchange On-Prem können grundsätzlich über mehrere Wege angesprochen werden (u. a. direktes LDAP, REST-Schnittstellen, PowerShell-Remoting).

**Entscheidung:** Der Zugriff auf Active Directory und Exchange erfolgt ausschließlich über eine zentrale PowerShell-Bridge als Dispatcher.

**Begründung:** Eine einzige, zentrale Zugriffsstelle vereinfacht Fehlerdiagnose, Rechteverwaltung und Wartung gegenüber mehreren parallelen Zugriffswegen auf dieselben Systeme.

**Konsequenz:** Neue AD- oder Exchange-Operationen werden als zusätzliche Kommandos im bestehenden Dispatcher ergänzt, nicht über einen neuen, parallelen Zugriffsweg umgesetzt.

**Prinzip:** 7 — Bestehende Patterns bevorzugen.

**Status:** Verbindlich.

---

## ADR-005 — Exchange-Sessions on-demand statt dauerhafter Pool

**Kontext:** Exchange-Operationen erfordern eine PowerShell-Remoting-Session gegen den Exchange-Server.

**Entscheidung:** Exchange-Sessions werden pro Operation geöffnet und wieder geschlossen. Es wird kein dauerhafter Session-Pool vorgehalten.

**Begründung:** Ein dauerhafter Pool erhöht die Komplexität der Ressourcenverwaltung und das Risiko verwaister oder blockierender Sessions, ohne einen für den aktuellen Lastumfang der Plattform notwendigen Vorteil zu bieten.

**Konsequenz:** Jede Exchange-Operation trägt die Kosten des Session-Aufbaus. Diese Entscheidung wird überprüft, falls die Anzahl gleichzeitiger Exchange-Operationen signifikant steigt.

**Prinzip:** 8 — Wartbarkeit vor Komplexität.

**Status:** Verbindlich.

---

## ADR-006 — Permissions statt Rollennamen im Code

**Kontext:** Zugriffskontrolle könnte grundsätzlich über Rollenprüfung oder über feingranulare Berechtigungen umgesetzt werden.

**Entscheidung:** Die API prüft ausschließlich Permissions. Rollennamen werden nicht als technisches Autorisierungskriterium verwendet.

**Begründung:** Rollen sind eine Konfigurationsangelegenheit und ändern sich mit organisatorischen Anforderungen. Eine Prüfung auf Rollennamen im Code würde fachliche Zuständigkeit mit technischer Autorisierungslogik vermischen.

**Konsequenz:** Rollen sind Bündel von Permissions und ausschließlich in der Konfiguration
definiert. Die technische Autorisierungsprüfung erfolgt ausschließlich anhand der
resultierenden Permissions. Der Weg dorthin führt über AD-Gruppe → interne Rolle → Permissions
(siehe `SECURITY.md`, Kapitel 5). Permission-Keys gelten als stabil wie API-Endpunkte (siehe
ADR-007).

**Prinzip:** 4 — Permissions statt Rollen.

**Status:** Verbindlich.

---

## ADR-007 — Permission-Keys als stabiler Vertrag

**Kontext:** Permission-Keys werden sowohl im Code (API-Prüfung) als auch in der Rollenkonfiguration referenziert.

**Entscheidung:** Bestehende Permission-Keys werden nicht umbenannt.

**Begründung:** Eine Umbenennung würde alle darauf verweisenden Rollenzuordnungen stillschweigend brechen und wäre schwer nachvollziehbar fehleranfällig.

**Konsequenz:** Neue Berechtigungsanforderungen erhalten neue, zusätzliche Permission-Keys. Bestehende Keys bleiben über die Projektlaufzeit unverändert.

**Prinzip:** 4, 8.

**Status:** Verbindlich.

---

## ADR-008 — Lose Kopplung der Integrationen

**Kontext:** Active Directory, Exchange, TopDesk und Docusnap sind technisch unabhängige Systeme mit unterschiedlicher Verfügbarkeit.

**Entscheidung:** Jede Integration funktioniert unabhängig von den anderen. Der Ausfall einer Integration darf keine andere beeinträchtigen. Fehler werden innerhalb der jeweiligen Integration abgefangen, nicht propagiert.

**Begründung:** Ohne diese Trennung würde die Störung eines einzelnen externen Systems die gesamte Plattform funktionsunfähig machen, obwohl die übrigen Integrationen unbeeinträchtigt wären.

**Konsequenz:** Jede Integration besitzt eigene Fehlerbehandlung. Die Health-Prüfung erfolgt pro System einzeln.

**Prinzip:** 3 — Lose Kopplung.

**Status:** Verbindlich.

---

## ADR-009 — Zweiteilung der eigenen Daten: fachliche Prozessdaten vs. technische Betriebsdaten

**Kontext:** Die eigenen Daten der Plattform (siehe ADR-003) sind nicht homogen — sie unterscheiden sich in Zweck und Beziehungsstruktur.

**Entscheidung:** Eigene Daten werden in fachliche Prozessdaten (Organisationsstruktur, Change-Queue) und technische Betriebsdaten (Audit-Log, Plattformkonfiguration) unterteilt. Plattformkonfiguration gehört zu den technischen Betriebsdaten, da sie das Verhalten der Plattform beschreibt, nicht den fachlichen Zustand der Organisation.

**Begründung:** Fachliche Prozessdaten stehen in aktiver, referenzieller Beziehung zueinander und sind Gegenstand fachlicher Auflösung durch den Business Layer. Technische Betriebsdaten beschreiben abgeschlossene Ereignisse oder Steuerungsparameter und stehen für sich.

**Konsequenz:** PostgreSQL trägt die fachlichen Prozessdaten, SQLite die technischen Betriebsdaten (siehe ADR-010, ADR-011). Eine Störung in einem Speicher beeinträchtigt die Funktion des anderen nicht.

**Prinzip:** 3, 5, 6.

**Status:** Verbindlich.

---

## ADR-010 — PostgreSQL für fachliche Prozessdaten

**Kontext:** Organisationsstruktur und Change-Queue besitzen zueinander in Beziehung stehende, referenzierende Inhalte.

**Entscheidung:** Organisationsdaten (`org_departments`, `org_roles`) und Change-Queue (`topdesk_changes`, `topdesk_change_steps`) werden in PostgreSQL gespeichert.

**Begründung:** PostgreSQL bildet relationale Beziehungen und referenzielle Integrität zwischen diesen Daten ab, die für die fachliche Auflösung von Changes gegen Organisationsdaten erforderlich sind.

**Konsequenz:** Die konkrete Wahl von PostgreSQL ist eine Implementierungsentscheidung im Sinne von ADR-009; architektonisch verbindlich ist ausschließlich die Zuständigkeit für fachliche Prozessdaten, nicht die Datenbanktechnologie selbst.

**Prinzip:** 3, 8.

**Status:** Verbindlich.

---

## ADR-011 — SQLite für das Audit-Log

**Kontext:** Das Audit-Log protokolliert abgeschlossene administrative Aktionen unabhängig von fachlichen Beziehungen.

**Entscheidung:** Das Audit-Log wird in einer von der fachlichen Datenhaltung getrennten SQLite-Datenbank geführt.

**Begründung:** Ein Audit-Eintrag verändert sich nach seiner Entstehung nicht mehr und benötigt keine relationale Auflösung gegen andere eigene Daten. Die Trennung von der fachlichen Datenhaltung stellt sicher, dass das Audit-Log auch bei einer Störung der fachlichen Datenhaltung funktionsfähig bleibt.

**Konsequenz:** Audit-Ereignisse werden zentral über die definierte Audit-Logging-Komponente erfasst und nicht durch einzelne Komponenten separat geschrieben.

**Prinzip:** 3, 6.

**Status:** Verbindlich.

---

## ADR-012 — Keine automatische Ausführung von TopDesk-Changes

**Kontext:** TopDesk-Changes könnten technisch vollautomatisch verarbeitet und ausgeführt werden.

**Entscheidung:** TopDesk-Changes werden niemals automatisch ausgeführt. Jede Ausführung erfordert eine manuelle Freigabe per Button. Der Scheduler lädt Changes ausschließlich herunter und führt sie nicht aus.

**Begründung:** Automatisierte Änderungen an Benutzerkonten und Postfächern bergen ein Fehlerrisiko, das eine manuelle Kontrollinstanz rechtfertigt, bevor eine Änderung fachlich wirksam wird.

**Konsequenz:** Der Abruf neuer Changes und deren Ausführung bleiben getrennte Prozessschritte. Eine Ausführung erfolgt ausschließlich durch eine explizite Benutzerfreigabe.

**Prinzip:** 6 — Nachvollziehbarkeit vor Automatisierung.

**Status:** Verbindlich.

---

## ADR-013 — Kein Rollback-Mechanismus für ausgeführte Changes

**Kontext:** Ausgeführte Changes könnten grundsätzlich automatisiert rückgängig gemacht werden.

**Entscheidung:** Es existiert kein automatischer Rollback-Mechanismus für bereits ausgeführte Changes.

**Begründung:** Ein automatisierter Rollback über heterogene Systeme (AD, Exchange, TopDesk) hinweg birgt ein höheres Fehlerrisiko als die manuelle Korrektur durch einen Administrator und würde erhebliche zusätzliche Komplexität erfordern.

**Konsequenz:** Fehlerhafte Changes werden über manuelle Nachbearbeitung korrigiert (`markStepDone.js`, manueller Override).

**Prinzip:** 6, 8.

**Status:** Verbindlich.

---

## ADR-014 — Template-ID-Erkennung statt Kategorie

**Kontext:** TopDesk-Changes könnten über das Feld `category` oder über `templateId` typisiert werden.

**Entscheidung:** Die Erkennung des Change-Typs (Eintritt, Austritt, Abteilungswechsel) erfolgt ausschließlich über `templateId`.

**Begründung:** `category` erwies sich als nicht zuverlässig nutzbar für die eindeutige Typisierung; `templateId` liefert eine stabile, eindeutige Zuordnung.

**Konsequenz:** Neue Change-Typen benötigen eine eindeutige Zuordnung im Integrationsmodell von TopDesk.

**Prinzip:** 7.

**Status:** Verbindlich.

---

## ADR-015 — Asynchrone Verarbeitung eingehender Webhook-Ereignisse

**Kontext:** Der TopDesk-Webhook sendet Ereignisse, deren Verarbeitung Zeit in Anspruch nehmen kann.

**Entscheidung:** Die API-Schicht quittiert den Empfang eines Webhook-Ereignisses unmittelbar und übergibt die weitere Verarbeitung an den Business Layer zur asynchronen Bearbeitung.

**Begründung:** Eine synchrone Verarbeitung würde TopDesk auf die vollständige Verarbeitungszeit der Plattform warten lassen und das Risiko von Zeitüberschreitungen auf Seiten von TopDesk erhöhen.

**Konsequenz:** Empfang (Quittierung) und fachliche Verarbeitung sind bewusst getrennte Schritte (siehe `ARCHITECTURE.md`, Kapitel 9.3).

**Prinzip:** 3, 6.

**Status:** Verbindlich.

---

## ADR-016 — Benutzerzentrierung als Bewertungsmaßstab für neue Funktionen

**Kontext:** Der Funktionsumfang der Plattform ist bewusst begrenzt (siehe `PROJECT_CONTEXT.md`, Produktumfang).

**Entscheidung:** Jede neue Funktion muss den Arbeitsalltag von Helpdesk und IT-Administration nachvollziehbar vereinfachen, um in den Produktumfang aufgenommen zu werden.

**Begründung:** Ohne diesen Maßstab würde die Plattform tendenziell zu einem Sammelsystem beliebiger IT-Funktionen anwachsen, statt eine fokussierte Integrationsschicht zu bleiben.

**Konsequenz:** Funktionsvorschläge, die diesen Nutzen nicht klar erkennen lassen, werden nicht in Version 1.0 umgesetzt, sondern auf `ROADMAP.md` verschoben oder verworfen.

**Prinzip:** 9 — Benutzerzentrierung.

**Status:** Verbindlich.

---

## ADR-017 — Keine E-Mail-Benachrichtigungen

**Kontext:** Neue Changes und Ereignisse könnten per E-Mail an Benutzer gemeldet werden.

**Entscheidung:** Die Plattform versendet keine E-Mail-Benachrichtigungen. Der Badge-Counter im Frontend gilt als ausreichend.

**Begründung:** E-Mail-Benachrichtigungen erfordern zusätzliche Infrastruktur (Mail-Relay, Zustellsicherheit) und einen zusätzlichen Kommunikationskanal, dessen Nutzen gegenüber dem bereits vorhandenen Badge-Counter im konkreten Anwendungsfall als nicht gerechtfertigt bewertet wurde.

**Konsequenz:** Diese Entscheidung wird überprüft, falls sich im Betrieb zeigt, dass der Badge-Counter für zeitkritische Änderungen nicht ausreicht.

**Prinzip:** 8.

**Status:** Verbindlich.

---

## ADR-018 — Active Directory als Identitätsquelle

**Kontext:** ConnOps wird innerhalb einer Windows-Domänenumgebung betrieben und benötigt eine
verlässliche Zuordnung von Benutzern zu administrativen Aktionen.

**Entscheidung:** Die Identität von Benutzern wird ausschließlich aus Active Directory
übernommen. ConnOps verwaltet keine eigenen Benutzerkonten und speichert keine
Benutzerpasswörter.

**Begründung:** Eine eigene Benutzerverwaltung würde eine zusätzliche Identitätsquelle schaffen
und dem Grundsatz widersprechen, bestehende führende Systeme zu respektieren.

**Konsequenz:** Nach erfolgreicher Authentifizierung erstellt ConnOps eine eigene
Anwendungssitzung. Autorisierung erfolgt anschließend über das bestehende Permission-Modell.

**Nicht Bestandteil dieser Entscheidung:** Das konkrete technische Authentifizierungsverfahren
gegen Active Directory.

**Prinzip:** 2 — Führende Systeme respektieren.

**Status:** Verbindlich.

---

## ADR-019 — Authentifizierung eingehender TopDesk-Webhooks

**Kontext:** TopDesk übermittelt Ereignisse über eine externe Schnittstelle an ConnOps.
Diese Aufrufe stammen nicht aus einer Benutzeranmeldung und können daher nicht über die
normale Anwendungssitzung abgesichert werden.

**Entscheidung:** Eingehende TopDesk-Webhooks werden über ein separates Shared Secret
authentifiziert.

**Begründung:** Der Mechanismus entspricht dem Integrationsmodell von ConnOps, ist
administrierbar und trennt die Authentifizierung externer Systeme von der Benutzeranmeldung.

**Konsequenz:** Die Webhook-Authentifizierung ist unabhängig von Benutzer-Sessions.
Zusätzliche Netzwerkbeschränkungen können ergänzend umgesetzt werden, ersetzen jedoch nicht
die eigentliche Authentifizierung.

**Prinzip:** 3 — Lose Kopplung.

**Status:** Verbindlich.

---

## ADR-020 — Schutz technischer Secrets außerhalb des Quellcodes

**Kontext:** ConnOps benötigt technische Zugangsdaten für angebundene Systeme und eigene
Sicherheitsmechanismen.

**Entscheidung:** Technische Secrets werden nicht dauerhaft im Quellcode oder in ungeschützten
Konfigurationsdateien gespeichert. Die Anwendung muss Secrets über einen geschützten
Bereitstellungsmechanismus beziehen.

**Begründung:** Ein Zugriff auf Konfigurationsdateien oder Repository-Inhalte darf nicht
automatisch zum Offenlegen technischer Zugangsdaten führen.

**Konsequenz:** Die konkrete technische Umsetzung der Secret-Verwaltung ist abhängig von der
Betriebsumgebung und wird nicht durch diese Entscheidung festgelegt. Der aktuelle
Umsetzungsstand ist in `SECURITY.md`, Kapitel 6, beschrieben.

**Prinzip:** 5 — Konfiguration außerhalb des Codes.

**Status:** Verbindlich.

---

## ADR-021 — Audit-Kategorisierung als feste Anwendungssicht

**Kontext:** Audit-Ereignisse werden für Darstellung, Filterung und Auswertung Kategorien
zugeordnet. Eine Änderung dieser Zuordnung beeinflusst die fachliche Interpretation bereits
erfasster Ereignisse.

**Entscheidung:** Die Zuordnung von Aktionstypen zu Audit-Kategorien ist Bestandteil der
Anwendungslogik und wird nicht als frei konfigurierbare Einstellung zur Laufzeit bereitgestellt.

**Begründung:** Eine fehlerhafte oder unvollständige Zuordnung könnte dazu führen, dass
Audit-Ereignisse in Auswertungen falsch dargestellt oder nicht mehr einer erwarteten Kategorie
zugeordnet werden. Die Kategorien beschreiben die Bedeutung von Ereignissen, nicht eine
Benutzerpräferenz. Sie gehören damit zur fachlichen Anwendungssicht und nicht zu den
veränderlichen Konfigurationswerten im Sinne von Prinzip 5.

**Konsequenz:** Neue Aktionstypen oder Änderungen bestehender Zuordnungen werden als
Softwareänderung umgesetzt und versioniert nachvollziehbar angepasst. Betriebsparameter wie
Aufbewahrungsdauer oder Filtereinstellungen können davon unabhängig konfigurierbar sein.

**Prinzip:** 5 — Konfiguration außerhalb des Codes.

**Status:** Verbindlich.

---

## ADR-022 — Lebenszyklus von Übergabedokumenten

**Kontext:** Übergabedokumente (Geräteübergabe-Protokolle) besitzen Nachweischarakter für die
interne Dokumentation abgeschlossener Übergaben.

**Entscheidung:** Ein Übergabedokument darf nach seiner Erstellung genau einmal durch die
Ergänzung einer Unterschrift verändert werden. Nach Abschluss gilt das Dokument als
unveränderlich.

**Begründung:** Ein Nachweisdokument verliert seine Beweiskraft, wenn es nach Abschluss noch
verändert werden kann. Unveränderlichkeit nach Signatur ist deshalb eine bewusste
Fachentscheidung zur Nachvollziehbarkeit, keine technische Restriktion.

**Konsequenz:** Änderungen an einem bereits signierten Dokument sind nicht vorgesehen.
Korrekturen erfolgen durch die Erstellung eines neuen Übergabedokuments; das ursprüngliche
Dokument bleibt als historischer Nachweis erhalten.

**Prinzip:** 6 — Nachvollziehbarkeit vor Automatisierung.

**Status:** Verbindlich.

---

## ADR-023 — Grafische Unterschrift statt qualifizierter elektronischer Signatur

**Kontext:** Für Übergabedokumente wird ein Nachweis der Bestätigung durch den Empfänger
benötigt.

**Entscheidung:** Für Übergabedokumente wird eine grafische Unterschrift als interner Nachweis
verwendet. Qualifizierte elektronische Signaturen nach eIDAS sind nicht Bestandteil von
ConnOps.

**Begründung:** ConnOps stellt einen internen Beleg bereit, keinen rechtsverbindlichen
Vertragsnachweis. Der Aufwand einer qualifizierten elektronischen Signatur steht in keinem
Verhältnis zum internen Verwendungszweck.

**Konsequenz:** Die grafische Unterschrift dient ausschließlich als interner Nachweis und
stellt keine qualifizierte oder fortgeschrittene elektronische Signatur im rechtlichen Sinne
dar. Sollte ConnOps in einem Kontext mit echtem Vertragscharakter eingesetzt werden, ist diese
Entscheidung neu zu bewerten.

**Prinzip:** 8 — Wartbarkeit vor Komplexität.

**Status:** Verbindlich.

---

## ADR-024 — DPAPI für technische Konfigurationssecrets

**Kontext:** ADR-020 legt fest, dass technische Secrets nicht dauerhaft ungeschützt gespeichert
werden dürfen, ohne einen konkreten Schutzmechanismus festzulegen.

**Entscheidung:** Technische Konfigurationssecrets werden maschinenbezogen per Windows-DPAPI
verschlüsselt statt im Klartext gespeichert.

**Begründung:** Windows-DPAPI schützt technische Konfigurationssecrets maschinenbezogen, ohne
dass ein eigenes Schlüsselverwaltungssystem betrieben werden muss.

**Konsequenz:** Diese Entscheidung setzt einen festen, dedizierten technischen Kontext für den
Backend-Prozess voraus. Die konkrete technische Umsetzung ist Gegenstand von `TECHNICAL.md`
beziehungsweise `SECURITY.md`.

**Prinzip:** 5 — Konfiguration außerhalb des Codes.

**Status:** Verbindlich.

---

## ADR-025 — Trennung von Webserver und Anwendungsserver

**Kontext:** ConnOps benötigt eine durchgängige Transportverschlüsselung (siehe `SECURITY.md`
Kapitel 7), die der Node.js-Prozess selbst nicht bereitstellt.

**Entscheidung:** ConnOps wird über einen vorgeschalteten Webserver bereitgestellt. Der
Webserver übernimmt die HTTPS-Terminierung und die Auslieferung statischer Frontend-Inhalte;
der Backend-Prozess stellt ausschließlich die API bereit und läuft als eigener Windows-Dienst.

**Begründung:** Die Trennung von Webserver und Anwendungsserver vermeidet, dass der
Anwendungscode Aufgaben wie Zertifikatsverwaltung und Auslieferung statischer Inhalte selbst
übernehmen muss, für die etablierte, dedizierte Komponenten bestehen.

**Konsequenz:** Der Backend-Prozess muss Anfragen korrekt verarbeiten, die über den
vorgeschalteten Webserver weitergeleitet werden, insbesondere hinsichtlich der Herkunftsangaben
einer Anfrage (siehe `SECURITY.md` Kapitel 7). Die konkrete technische Umsetzung ist Gegenstand
von `TECHNICAL.md` beziehungsweise `DEPLOYMENT.md`.

**Prinzip:** 3, 8.

**Status:** Verbindlich.

---

*Dieses Dokument wird um neue Einträge ergänzt, sobald weitere Architekturentscheidungen bewusst getroffen werden. Bestehende Einträge werden nicht rückwirkend verändert; eine Revision einer Entscheidung erhält einen neuen ADR-Eintrag mit Verweis auf den ursprünglichen Eintrag.*
