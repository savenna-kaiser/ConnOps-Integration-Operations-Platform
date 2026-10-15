# DOCUMENTATION.md
# Dokumentationsstandard — IT-Operations-Plattform

---

## Kapitel 1 — Einleitung

### Zweck dieses Dokuments

Dieses Dokument definiert den verbindlichen Standard für die gesamte Projektdokumentation der IT-Operations-Plattform. Es legt fest, welche Dokumente existieren, welchen Zweck jedes einzelne erfüllt, wie sie sich gegeneinander abgrenzen, in welchem Stil sie verfasst werden und wie sie aufeinander verweisen.

`DOCUMENTATION.md` beschreibt damit nicht die Plattform selbst, sondern die Art und Weise, wie über die Plattform geschrieben wird. Es ist die Grundlage, auf der alle weiteren Dokumente — `TECHNICAL.md`, `SECURITY.md`, `API.md`, `PATTERNS.md`, `DEPLOYMENT.md`, `OPERATIONS.md`, `DECISIONS.md`, `HANDOVER.md` und die übrigen — konsistent entstehen, ohne dass Fragen zu Zuständigkeit, Stil oder Terminologie in jedem einzelnen Dokument neu geklärt werden müssen.

### Geltungsbereich

Dieses Dokument gilt für jedes Dokument der Projektdokumentation mit Ausnahme von `PROJECT_CONTEXT.md`. `PROJECT_CONTEXT.md` regelt die Zusammenarbeit zwischen Projektverantwortlichem und KI-Unterstützung und steht damit außerhalb der hier beschriebenen Dokumentenhierarchie — es ist Voraussetzung dieser Zusammenarbeit, nicht Teil ihres Ergebnisses.

Für alle übrigen Dokumente — unabhängig davon, ob sie bereits bestehen oder erst zukünftig entstehen — gelten die in diesem Dokument festgelegten Regeln zu Zuständigkeit, Stil, Terminologie und Verweisstruktur verbindlich.

### Norm und Instanz

Die Projektdokumentation unterscheidet zwei Ebenen, die nicht miteinander vermischt werden:

Die **normative Ebene** legt fest, *wie* dokumentiert wird — welche Dokumente es gibt, wofür sie zuständig sind, in welchem Stil sie verfasst werden und welche Begriffe verbindlich sind. `DOCUMENTATION.md` ist das einzige Dokument dieser Ebene.

Die **operative Ebene** beschreibt den *aktuellen Zustand* der Dokumentation — welche Dokumente bereits existieren, welche Kapitel fertiggestellt sind, welche Reihenfolge als Nächstes ansteht. `HANDOVER.md` ist ein Dokument dieser Ebene.

Diese Trennung ist keine bloße Ordnungsfrage, sondern verhindert eine bestimmte Art von Drift: Ohne sie neigt ein Status-Dokument dazu, im Lauf der Zeit selbst Struktur- oder Stilentscheidungen zu treffen, weil an dieser Stelle gerade eine Lücke sichtbar wird. `HANDOVER.md` legt deshalb keine eigenen Regeln zu Zuständigkeit, Stil oder Struktur fest. Es wendet die in `DOCUMENTATION.md` festgelegten Regeln an und bildet ausschließlich den Fortschritt ab. Entsteht beim Schreiben von `HANDOVER.md` das Bedürfnis, eine neue Regel festzulegen, ist das ein Zeichen dafür, dass diese Regel in `DOCUMENTATION.md` gehört — nicht dorthin, wo sie zuerst auffällt.

### Prioritätsmodell

Widersprechen sich Aussagen verschiedener Dokumente, gilt folgende Rangfolge:

`ARCHITECTURE.md` > `DOCUMENTATION.md` > Fachdokumente (`TECHNICAL.md`, `SECURITY.md`, `API.md`, `PATTERNS.md`, `DEPLOYMENT.md`, `OPERATIONS.md`, `DECISIONS.md` u. a.) > `HANDOVER.md`

`ARCHITECTURE.md` steht an oberster Stelle, weil es die architektonische Systemwahrheit der Plattform beschreibt. Das Dokumentationssystem beschreibt, wie über diese Wahrheit geschrieben wird — es steht ihr nicht über- oder gleichgeordnet. Ein Dokumentationsstandard, der Vorrang vor der Architektur selbst hätte, würde die Dokumentation zur eigentlichen Systemwahrheit erheben und wäre damit seinerseits eine Architekturentscheidung, die diesem Dokument nicht zusteht.

`DOCUMENTATION.md` steht über den Fachdokumenten, weil diese sich in Zuständigkeit, Stil und Terminologie an den hier festgelegten Standard halten, nicht umgekehrt. `HANDOVER.md` steht an letzter Stelle, da es als Instanz der operativen Ebene (siehe oben) keine normativen Aussagen trifft, sondern ausschließlich Zustand beschreibt; im Konfliktfall gilt stets die normative Aussage, nicht die zuletzt notierte Statusangabe.

Aus dieser Rangfolge folgt eine Einschränkung, die ausdrücklich festgehalten wird, da sie sonst leicht übersehen oder umgekehrt ausgelegt werden könnte: `DOCUMENTATION.md` stellt keine Anforderungen an `ARCHITECTURE.md`. Es bleibt gegenüber der Architektur reaktiv — es bildet ab, wie über bestehende und zukünftige Architekturentscheidungen geschrieben wird, ohne selbst zu verlangen, dass die Architektur bestimmte Formen annimmt, um dokumentierbar zu sein. Ein Dokumentationsstandard, der die Architektur an seine eigene Struktur anpassen wollte, würde die in diesem Abschnitt festgelegte Rangfolge faktisch umkehren.

Diese Abgrenzung lässt sich absolut fassen: `DOCUMENTATION.md` beschreibt ausschließlich die Dokumentation bestehender und zukünftiger Architektur- und Fachentscheidungen. Es begründet selbst keine fachlichen oder architektonischen Entscheidungen — jede inhaltliche Aussage dieser Art gehört in `ARCHITECTURE.md` oder das jeweils zuständige Fachdokument, nicht in dieses Dokument.

### Lebenszyklus und Änderungskontrolle

Die in diesem Dokument beschriebene Zeitlosigkeit ist eine Zielsetzung, keine automatische Eigenschaft. Damit `DOCUMENTATION.md` nicht schleichend veraltet, während sich die Dokumentation weiterentwickelt, gilt folgende Regel:

Ändert sich die Dokumentenhierarchie, die Zuständigkeit eines Dokuments, ein Grundsatz des Schreibstils oder ein verbindlicher Fachbegriff, wird `DOCUMENTATION.md` entsprechend angepasst. Änderungen, die ausschließlich den Fortschritt einzelner Dokumente betreffen — etwa welches Kapitel gerade fertiggestellt wurde — werden ausschließlich in `HANDOVER.md` nachgeführt, ohne dieses Dokument zu berühren.

Diese Regel überträgt das aus `ARCHITECTURE.md` (Kapitel 11.2 und 12.3) bekannte Prinzip der Pflegekriterien auf die Dokumentationsebene selbst: Ein Standarddokument, das bei jedem Fortschrittsschritt angepasst werden müsste, beschreibt keinen Standard, sondern einen Zwischenstand.

### Abgrenzung

Dieses Dokument trifft keine Architekturentscheidungen und bewertet keine. Es enthält keine inhaltlichen Aussagen über die Plattform, ihre Komponenten oder ihre Funktionsweise. Solche Aussagen gehören in die jeweils fachlich zuständigen Dokumente — `ARCHITECTURE.md`, `TECHNICAL.md`, `SECURITY.md` und so weiter.

`DOCUMENTATION.md` beantwortet ausschließlich, *wie* dokumentiert wird — nicht, *was* dokumentiert wird. Wo diese Grenze im Einzelfall verläuft, wird in den folgenden Kapiteln anhand der Dokumentenhierarchie und der Zuständigkeitstabelle konkretisiert.

### Zielgruppe

Dieses Dokument richtet sich an jeden, der an der Projektdokumentation mitschreibt — den Projektverantwortlichen ebenso wie KI-gestützte Autoren in zukünftigen Chat-Sessions. Es setzt keine Kenntnis der Plattform selbst voraus, sondern ausschließlich die Bereitschaft, die hier festgelegten Regeln beim Schreiben oder Ändern eines beliebigen Projektdokuments anzuwenden.

---

## Kapitel 2 — Dokumentenhierarchie und Zuständigkeiten

### Zweck dieses Kapitels

Dieses Kapitel legt verbindlich fest, welche Dokumente die Projektdokumentation umfasst, in welcher Abhängigkeitsbeziehung sie zueinander stehen und wofür jedes einzelne zuständig ist. Es operationalisiert damit die in Kapitel 1 festgelegte Norm-Instanz-Trennung und das Prioritätsmodell, ohne neue Designentscheidungen zu treffen: Die hier beschriebene Hierarchie entspricht der bereits etablierten Struktur, wird an dieser Stelle jedoch erstmals normativ statt operativ festgehalten.

### Die Dokumentenhierarchie

```
PRODUCT.md          — Vision, Ziele, Produktphilosophie (fachlich)
ROADMAP.md          — Phasen, Abhängigkeiten, Weiterentwicklung
      │
      ▼
ARCHITECTURE.md     — Warum: Architekturprinzipien, Strukturen, Verantwortlichkeiten
      │
      ▼
DOCUMENTATION.md    — Wie dokumentiert wird: Dokumentgrenzen, Schreibstil,
                       Terminologie, Verweisstruktur
      │
 ┌────┼─────────────────────────┐
 ▼    ▼                         ▼
PATTERNS.md    SECURITY.md    TECHNICAL.md
      │              │              │
      └──────┬────────┘              │
             ▼                      ▼
         DEPLOYMENT.md          API.md
             ▼
         OPERATIONS.md
             ▼
     ADMIN_GUIDE.md / USER_GUIDE.md
```

`DECISIONS.md` und `GLOSSARY.md` sind keiner festen Stufe dieser Hierarchie zugeordnet. `DECISIONS.md` begleitet sämtliche S-Klasse-Dokumente und dokumentiert historische Einzelentscheidungen unabhängig von deren fachlicher Zuständigkeit — es wird gepflegt, sobald eine einzelne Architektur- oder Technologieentscheidung historisch festgehalten werden soll, unabhängig davon, aus welchem Fachdokument diese Entscheidung stammt. Es hängt inhaltlich von `ARCHITECTURE.md` ab, nicht von einer bestimmten Position im Ablauf. `GLOSSARY.md` entsteht zuletzt, da es Begriffe aus allen anderen Dokumenten zusammenführt und daher deren Existenz voraussetzt.

`HANDOVER.md` ist nicht Teil dieser Hierarchie. Es gehört, wie in Kapitel 1 festgelegt, der operativen Ebene an und bildet den jeweils aktuellen Bearbeitungsstand dieser Hierarchie ab, ohne selbst eine Stufe von ihr zu sein.

### Zuständigkeit pro Dokument

| Dokument | Zuständig für |
|---|---|
| `PRODUCT.md` | Vision, Produktphilosophie, Zielgruppe |
| `ROADMAP.md` | Geplante Weiterentwicklung, Phasen, Abhängigkeiten |
| `ARCHITECTURE.md` | Warum — Architekturprinzipien, Strukturen, Verantwortlichkeiten |
| `DOCUMENTATION.md` | Wie dokumentiert wird — Dokumentgrenzen, Zuständigkeiten, Schreibstil, Terminologie, Verweisstruktur |
| `TECHNICAL.md` | Wie umgesetzt wird — Infrastruktur, Konfiguration, Verbindungsdetails |
| `PATTERNS.md` | Wiederkehrende Implementierungsmuster |
| `SECURITY.md` | Vollständige Sicherheitsimplementierung |
| `API.md` | Endpunkte, Parameter, Rückgabewerte |
| `DEPLOYMENT.md` | Installation, Setup, Systemvoraussetzungen |
| `OPERATIONS.md` | Betrieb, Fehlerdiagnose, Monitoring |
| `DECISIONS.md` | Historisch begründete Einzelentscheidungen (ADRs) |
| `ADMIN_GUIDE.md` | Bedienung für IT-Administration und IT-Leitung |
| `USER_GUIDE.md` | Bedienung für Helpdesk |
| `GLOSSARY.md` | Begriffsdefinitionen, abgeleitet aus allen anderen Dokumenten |

### Grundregel: Ein Thema, ein Master-Dokument

Jedes fachliche Thema hat genau ein Dokument, das für seine vollständige und maßgebliche Darstellung zuständig ist. Wird ein Thema in einem anderen Dokument berührt, wird darauf verwiesen, nicht dupliziert. Diese Regel gilt unabhängig von der Position eines Dokuments in der Hierarchie und ist bereits in Kapitel 1 als Teil des Prioritätsmodells angelegt: Ein Fachdokument, das eine Aussage von `ARCHITECTURE.md` oder `DOCUMENTATION.md` wiederholt statt auf sie zu verweisen, riskiert, bei einer späteren Änderung der Quelle stillschweigend falsch zu werden.

Wo diese Zuständigkeit im Einzelfall nicht eindeutig ist — etwa wenn ein neues Thema entsteht, das keiner bestehenden Zeile der obigen Tabelle eindeutig zuzuordnen ist — wird dies als offene Frage behandelt und dem Projektverantwortlichen zur Entscheidung vorgelegt, nicht selbständig einem Dokument zugewiesen.

### Verhältnis zu `ARCHITECTURE.md` Kapitel 12

`ARCHITECTURE.md` Kapitel 12 enthält bereits eine Verweisstruktur, die beschreibt, welchen Aspekt von `ARCHITECTURE.md` welches Dokument vertieft. Diese Verweisstruktur bleibt unverändert gültig und wird durch dieses Kapitel nicht ersetzt, sondern um die Gesamthierarchie und die Zuständigkeit einzelner Dokumente untereinander erweitert — also auch dort, wo kein direkter Bezug zu `ARCHITECTURE.md` besteht (etwa zwischen `PATTERNS.md` und `DEPLOYMENT.md`).

---

## Kapitel 3 — Schreibstil

### Zweck dieses Kapitels

Dieses Kapitel legt den verbindlichen Schreibstil für alle Dokumente fest, die dieser Norm unterliegen (siehe Kapitel 1, Geltungsbereich). Es operationalisiert nicht die Struktur der Dokumentation — das leistet Kapitel 2 —, sondern die sprachliche und stilistische Form, in der jedes Dokument unabhängig von seinem Inhalt verfasst wird.

Die hier festgelegten Regeln sind im Verlauf der Arbeit an `ARCHITECTURE.md` entstanden und werden an dieser Stelle erstmals als eigenständiger, dokumentübergreifender Standard festgehalten, statt implizit in jedem neuen Dokument erneut angewendet zu werden.

### Zeitlos formulieren

Dokumente, die diesem Standard unterliegen, vermeiden Versionsnummern, Datumsangaben, offene Aufgaben (TODOs) und Roadmap-Inhalte. Eine Aussage wird so formuliert, dass sie unabhängig vom aktuellen Bearbeitungsstand des Projekts gültig bleibt.

Diese Regel gilt uneingeschränkt für `ARCHITECTURE.md` und die Fachdokumente. Sie gilt nicht für `HANDOVER.md`, da dieses Dokument gemäß Kapitel 1 der operativen Ebene angehört und seinem Zweck nach gerade den aktuellen, zeitgebundenen Bearbeitungsstand abbildet. Diese Ausnahme ist keine Abweichung vom Prinzip, sondern Folge der in Kapitel 1 festgelegten Norm-Instanz-Trennung.

### Architektur statt Implementierung

Dokumente der normativen und architektonischen Ebene enthalten keinen Code, keine Konfigurationswerte, keine API-Endpunkte und keine konkreten Tabellenstrukturen. Solche Inhalte gehören in die dafür zuständigen Fachdokumente (siehe Kapitel 2, Zuständigkeitstabelle).

Diese Regel schützt die in Kapitel 1 beschriebene Zeitlosigkeit auf sprachlicher Ebene: Implementierungsdetails ändern sich naturgemäß häufiger als architektonische Prinzipien. Ein Dokument, das beide vermischt, veraltet an seinen implementierungsnahen Stellen schneller, als es seinem eigentlichen Zweck entspricht.

### Begründen statt nur beschreiben

Jede inhaltliche Aussage erklärt, warum eine Entscheidung so getroffen wurde — nicht nur, was entschieden wurde. Eine reine Beschreibung des Ist-Zustands ohne Begründung gilt als unvollständig im Sinne dieses Standards.

Diese Regel ist kein rein stilistisches Anliegen. Ein Dokument, das nur beschreibt, kann bei künftigen Änderungen nicht mehr unterscheiden, ob eine bestehende Aussage bewusst so gewählt wurde oder zufällig entstanden ist. Die Begründung ist damit selbst ein Bestandteil der Nachvollziehbarkeit, nicht nur der Lesbarkeit.

### Verantwortlichkeiten und Grenzen explizit nennen

Jede beschriebene Komponente, jedes Dokument und jede Zuständigkeit erhält sowohl eine Darstellung dessen, wofür sie zuständig ist, als auch eine Darstellung dessen, wofür sie ausdrücklich nicht zuständig ist. Die Grenze gilt als ebenso wichtig wie die Verantwortlichkeit selbst und wird nicht als Nebensatz, sondern als eigener Gedanke behandelt.

Dieses Kapitel selbst folgt dieser Regel: Es beschreibt nicht nur, was zeitlos formuliert werden soll, sondern auch, wo diese Regel ausdrücklich nicht gilt (siehe oben, `HANDOVER.md`).

### Keine Marketing-Sprache

Die Sprache bleibt sachlich-technisch. Begriffe wie „innovativ", „zukunftssicher" oder „state-of-the-art" werden nicht verwendet, da sie keine überprüfbare Aussage enthalten und einer zeitlosen, begründungsbasierten Darstellung widersprechen.

### Projektsprache konsistent verwenden

Bestimmte Begriffe sind für die gesamte Projektdokumentation verbindlich festgelegt und werden nicht durch Synonyme ersetzt, auch nicht aus stilistischer Variation. Die vollständige, verbindliche Terminologieliste ist Gegenstand von Kapitel 4 dieses Dokuments; dieser Abschnitt legt lediglich das Prinzip fest, nach dem Kapitel 4 aufgebaut ist.

Eine feste Terminologie ist notwendig, weil unterschiedliche Bezeichnungen für denselben Begriff in verschiedenen Dokumenten den Eindruck erwecken können, es handle sich um unterschiedliche Konzepte — was der in Kapitel 2 festgelegten Grundregel „ein Thema, ein Master-Dokument" widersprechen würde.

### Spezialdokumente nicht duplizieren

Gehört ein Thema in die Zuständigkeit eines anderen Dokuments, wird darauf verwiesen, nicht kopiert. Diese Regel ist die sprachliche Umsetzung der bereits in Kapitel 2 festgelegten Grundregel „ein Thema, ein Master-Dokument" und wird hier als Stilregel wiederholt, weil sie sich unmittelbar auf die Formulierung einzelner Sätze auswirkt: Ein Satz, der Inhalte eines anderen Dokuments in eigenen Worten wiedergibt, statt auf das Dokument zu verweisen, verstößt gegen diese Regel auch dann, wenn er nicht wörtlich kopiert.

### Zielgruppe berücksichtigen

Der Schreibstil setzt grundlegende Kenntnisse der eingesetzten Technologien voraus. Dokumente dieses Standards dienen nicht als Benutzer- oder Installationshandbuch.

### Stilklassen

Die vorstehenden Stilregeln gelten nicht für alle Dokumente in gleicher Ausprägung. Stattdessen gehört jedes Dokument genau einer von zwei Stilklassen an. Diese Klassifikation ist ein Querschnittsmerkmal: Sie verändert weder die in Kapitel 2 festgelegte Zuständigkeit eines Dokuments noch seine Position in der Dokumentenhierarchie. Ein Dokument hat also weiterhin eine Zuständigkeit (Kapitel 2), eine Einordnung als Norm oder Instanz (Kapitel 1) und zusätzlich eine Stilklasse (dieses Kapitel) — diese drei Einordnungen sind unabhängig voneinander und werden nicht miteinander vermischt.

#### S-Klasse (Systemdokumentation)

Für Dokumente der S-Klasse gelten alle vorstehenden Regeln dieses Kapitels vollständig und ohne Einschränkung: zeitlose Formulierung, Begründung statt Beschreibung, keine Implementierungsdetails, referenzielle Struktur statt Duplikation, sachlich-technische Sprache ohne Handlungsanweisungen.

Der S-Klasse gehören an: `PRODUCT.md`, `ROADMAP.md`, `ARCHITECTURE.md`, `DOCUMENTATION.md`, `TECHNICAL.md`, `SECURITY.md`, `API.md`, `PATTERNS.md`, `DEPLOYMENT.md`, `OPERATIONS.md`, `DECISIONS.md`, `GLOSSARY.md`.

`PRODUCT.md` und `ROADMAP.md` gehören der S-Klasse an, obwohl sie keine technische Architektur im engeren Sinn beschreiben. Maßgeblich für die Zuordnung ist nicht der technische Inhalt, sondern die stilistische Eigenschaft: Beide Dokumente sind zeitlos formuliert beziehungsweise begründend (im Fall von `ROADMAP.md`: die Begründung geplanter Phasen), und keines von beiden ist als Handlungsanleitung für eine ausführende Person gedacht. Die S-Klasse ist damit keine rein technische, sondern eine stilistische Kategorie.

Die Zugehörigkeit zur S-Klasse beschreibt demnach den Schreibstil eines Dokuments — erklärend, begründend, systembeschreibend, ohne Handlungsanweisungen —, nicht dessen Änderungsfrequenz. `ROADMAP.md` bildet deshalb trotz seiner fortlaufenden Fortschreibung eine S-Klasse-Ausnahme hinsichtlich der zeitlichen Stabilität, nicht hinsichtlich des Schreibstils: Es bleibt ein Dokument, das Entscheidungen und Planungen begründet, keine Arbeitsanweisungen gibt, und erfüllt damit die stilistischen Kriterien der S-Klasse vollständig, auch wenn es sich inhaltlich fortentwickelt.

#### O-Klasse (Operations- und Benutzerführung)

Für Dokumente der O-Klasse gilt ein anderes Optimierungsziel: Handlungsorientierung vor Begründungstiefe. Diese Dokumente sind darauf ausgelegt, dass eine Person im Arbeitsalltag eine Aufgabe unmittelbar ausführen kann, ohne zuvor die architektonische Herleitung nachvollziehen zu müssen.

Für Dokumente der O-Klasse gilt abweichend von der S-Klasse: Sie dürfen implementierungsnah und direkt ausführbar formuliert sein, sie beschränken sich auf das für die Nutzung Relevante, und eine Begründung wird nur ergänzt, wenn sie dem Verständnis der Handlung unmittelbar dient — sie ist hier keine Pflicht, sondern eine Option. Die übrigen Regeln dieses Kapitels — insbesondere feste Terminologie (Kapitel 4) und der Verweis statt Duplikation bei Themen, die einem S-Klasse-Dokument gehören — gelten unverändert auch für die O-Klasse.

Der O-Klasse gehören an: `ADMIN_GUIDE.md`, `USER_GUIDE.md`.

#### Dokumente außerhalb der Stilklassen

`HANDOVER.md` ist keiner Stilklasse zugeordnet. Wie in Kapitel 1 festgelegt, gehört `HANDOVER.md` der operativen Instanzebene an, nicht der normativen Ebene, auf die sich die Stilklassen beziehen. Eine Zuordnung zu S- oder O-Klasse würde `HANDOVER.md` fälschlich als Teil der Dokumentationsnorm behandeln, obwohl es diese Norm nur anwendet und den aktuellen Bearbeitungsstand abbildet. Diese Sonderstellung ist keine Lücke im Stilmodell, sondern folgt zwingend aus der in Kapitel 1 getroffenen Unterscheidung.

#### Grundregel der Trennung

Ein Dokument gehört genau einer Stilklasse an. Mischformen innerhalb eines einzelnen Dokuments sind unzulässig: Ein O-Klasse-Dokument begründet keine Architekturentscheidungen und wiederholt sie nicht — es verweist auf das zuständige S-Klasse-Dokument. Ein S-Klasse-Dokument enthält umgekehrt keine schrittweisen Handlungsanweisungen — diese gehören ausschließlich in die O-Klasse.

---

## Kapitel 4 — Terminologie

### Zweck dieses Kapitels

Dieses Kapitel legt die verbindliche Terminologie fest, die in allen Dokumenten der S-Klasse und der O-Klasse gleichermaßen verwendet wird (siehe Kapitel 3, Stilklassen). Ein hier definierter Begriff bezeichnet in jedem Dokument dasselbe Konzept und wird nicht durch ein Synonym ersetzt, auch nicht aus sprachlicher Variation.

Diese Festlegung ist mehr als eine Wortliste: Ein Begriff ist eine semantische Schnittstelle zwischen Dokumenten. Wird ein Begriff in einem Dokument abweichend verwendet, entsteht nicht nur eine stilistische Unschärfe, sondern eine inhaltliche Mehrdeutigkeit — ein Leser kann nicht mehr sicher sein, ob zwei unterschiedlich benannte Konzepte tatsächlich verschieden sind oder nur unterschiedlich formuliert wurden. Diese Eindeutigkeit ist Voraussetzung für die in Kapitel 2 festgelegte Grundregel „ein Thema, ein Master-Dokument": Ohne feste Terminologie könnte dieselbe Sache in zwei Dokumenten unter zwei Namen behandelt werden, ohne dass dies als Redundanz erkennbar wäre.

### Verbindliche Begriffe

Die folgenden Begriffe sind für die gesamte Projektdokumentation festgelegt:

| Begriff | Bedeutung |
|---|---|
| *Source of Truth* | Führendes System für einen fachlichen Datenbestand |
| *Führendes System* | Externes System mit fachlicher Datenverantwortung |
| *Integrationsschicht* | Die Plattform als vermittelnde Ebene zwischen Benutzern und externen Systemen |
| *Eigene Daten* | Daten, die ausschließlich der Plattform gehören und keinen externen Bestand ersetzen |
| *Worker-Schicht* | Ausführungsebene über die PowerShell-Bridge |
| *Fachliche Verantwortung* | Datenhoheit eines externen Systems über seinen Aufgabenbereich |
| *Architektonisch verbindlich* | Nicht ohne triftigen Grund änderbar |

Diese Liste ist nicht abschließend im Sinne einer einmaligen Festlegung, sondern wird erweitert, sobald ein neues Fachdokument einen Begriff einführt, der dokumentübergreifend verwendet werden soll (siehe Abschnitt „Pflege der Terminologie" unten).

### Verhältnis zu `GLOSSARY.md`

Die in diesem Kapitel geführte Liste und `GLOSSARY.md` unterscheiden sich in Zweck und Zeitpunkt, nicht im Anspruch auf Richtigkeit. Dieses Kapitel legt Begriffe *normativ* fest, bevor oder während sie verwendet werden — es ist die Quelle, nicht die Sammlung. `GLOSSARY.md` entsteht, wie in Kapitel 2 festgelegt, zuletzt aus allen anderen Dokumenten und stellt eine für Leser aufbereitete, vollständige Zusammenschau aller in der Dokumentation verwendeten Begriffe dar — einschließlich solcher, die möglicherweise nur lokal in einem einzelnen Fachdokument definiert sind und keinen dokumentübergreifenden Charakter haben.

Widerspricht `GLOSSARY.md` einer Definition in diesem Kapitel, gilt gemäß dem in Kapitel 1 festgelegten Prioritätsmodell die Definition in `DOCUMENTATION.md` als maßgeblich, da `GLOSSARY.md` als abgeleitetes Fachdokument unterhalb von `DOCUMENTATION.md` steht.

### Pflege der Terminologie

Ein neuer projektweiter Begriff wird in dieses Kapitel aufgenommen, sobald er in mehr als einem Dokument verwendet werden soll. Ein Begriff, der ausschließlich innerhalb eines einzelnen Fachdokuments verwendet wird und dort abschließend erklärt ist, muss nicht in dieses Kapitel aufgenommen werden — er ist lokal, nicht projektweit, und wird bei Bedarf direkt in `GLOSSARY.md` erfasst, sobald dieses Dokument entsteht.

Diese Unterscheidung folgt derselben Änderungslogik wie in Kapitel 1 für die Dokumentenhierarchie festgelegt: Ein projektweiter Begriff ist eine normative Festlegung und gehört damit in dieses Dokument. Ein lokaler Begriff ist fachlicher Inhalt und gehört in das jeweils zuständige Fachdokument.

---

## Kapitel 5 — Verweisstruktur

### Zweck dieses Kapitels

Dieses Kapitel legt fest, wie Dokumente formal aufeinander verweisen. Es operationalisiert damit zwei Prinzipien, die in den vorangegangenen Kapiteln bereits inhaltlich festgelegt, aber noch nicht als eigenes Regelwerk ausformuliert wurden: die Grundregel „ein Thema, ein Master-Dokument" (Kapitel 2) und die Stilregel „Spezialdokumente nicht duplizieren" (Kapitel 3). Beide setzen voraus, dass ein Verweis eindeutig, auffindbar und in seiner Bedeutung konsistent ist — dieses Kapitel legt fest, wie das erreicht wird.

### Grundform eines Verweises

Ein Verweis nennt das Zieldokument explizit beim Dateinamen (z. B. `TECHNICAL.md`) und, wo sinnvoll, das dort behandelte Kapitel oder Thema in Worten — nicht die Kapitelnummer des Zieldokuments. Eine Verweisformulierung wie „siehe `SECURITY.md`, Abschnitt zur RBAC-Konfiguration" ist demnach einer Formulierung wie „siehe `SECURITY.md`, Kapitel 4.2" vorzuziehen.

Diese Regel begründet sich aus der in Kapitel 1 festgelegten Zeitlosigkeit: Kapitelnummern eines anderen Dokuments verschieben sich, sobald dieses Dokument erweitert wird, ohne dass der Verweis selbst angepasst wird. Ein thematischer Verweis bleibt hingegen auch dann korrekt, wenn sich die Gliederung des Zieldokuments ändert, solange das Thema dort weiterhin behandelt wird.

#### Ausnahme für abgeschlossene S-Klasse-Referenzdokumente

Die vorstehende Regel gilt nicht für S-Klasse-Dokumente, deren Struktur als abgeschlossen behandelt wird und nicht mehr verändert wird — insbesondere `ARCHITECTURE.md`. In diesen Fällen sind Kapitelnummern als stabile Anker zulässig, da das Risiko einer nachträglichen Verschiebung entfällt, sobald ein Dokument nicht mehr erweitert wird.

Diese Ausnahme setzt voraus, dass der Abschluss eines Dokuments eindeutig feststellbar ist. Der Abschluss eines S-Klasse-Dokuments wird in `HANDOVER.md` als Status vermerkt (siehe Kapitel 1, Norm und Instanz) und gilt ab diesem Zeitpunkt als gegeben. Wird ein als abgeschlossen geführtes Dokument dennoch erweitert und seine Kapitelstruktur dadurch verändert, werden alle numerischen Verweise auf dieses Dokument im Zuge der nächsten Bearbeitung des jeweils verweisenden Dokuments auf thematische Verweise umgestellt — reaktiv, nach derselben Logik wie im Abschnitt „Umgang mit Konflikten zwischen Verweis und Ziel" unten beschrieben.

### Verweisrichtung folgt dem Prioritätsmodell

Ein Verweis läuft in der Regel von einem untergeordneten zu einem übergeordneten oder gleichrangigen Dokument im Sinne des in Kapitel 1 festgelegten Prioritätsmodells — beispielsweise verweist `TECHNICAL.md` auf ein in `ARCHITECTURE.md` beschriebenes Prinzip, nicht umgekehrt. `ARCHITECTURE.md` und `DOCUMENTATION.md` verweisen nicht auf Inhalte von Fachdokumenten, da dies eine Abhängigkeit der normativen von der fachlichen Ebene herstellen würde, die dem Prioritätsmodell widerspricht.

Eine Ausnahme bilden reine Orientierungsverweise, wie sie bereits in `ARCHITECTURE.md` Kapitel 1 (Abgrenzungstabelle) und Kapitel 12 (Verweisstruktur) verwendet werden: Dort wird für ein Thema, das nicht Gegenstand von `ARCHITECTURE.md` ist, auf das zuständige Fachdokument verwiesen, ohne inhaltlich auf dessen Aussagen zurückzugreifen oder von ihnen abhängig zu sein. Diese Art von Verweis dient der Navigation, nicht der inhaltlichen Herleitung, und ist mit dem Prioritätsmodell vereinbar.

### Verweise zwischen gleichrangigen Fachdokumenten

Fachdokumente derselben Ebene (siehe Kapitel 2, Zuständigkeitstabelle) dürfen wechselseitig aufeinander verweisen, etwa wenn `DEPLOYMENT.md` eine in `SECURITY.md` beschriebene Voraussetzung referenziert. Ein solcher Verweis ersetzt nicht die eigenständige Zuständigkeit des verweisenden Dokuments: Ein Fachdokument, das ein Thema nur noch aus Verweisen auf andere Fachdokumente zusammensetzt, ohne einen eigenen inhaltlichen Kern zu behalten, hat in Wahrheit keine eigene Zuständigkeit mehr und sollte gemäß Kapitel 2 daraufhin überprüft werden, ob es überhaupt als eigenständiges Dokument gerechtfertigt ist.

### Umgang mit Konflikten zwischen Verweis und Ziel

Verändert sich ein Zieldokument so, dass ein bestehender Verweis nicht mehr korrekt ist — etwa weil ein referenziertes Thema dort nicht mehr behandelt wird —, wird der Verweis bei der nächsten Bearbeitung des verweisenden Dokuments korrigiert. Es besteht keine automatische Prüfpflicht bei jeder Änderung eines Zieldokuments; die Korrektur erfolgt reaktiv, sobald der Widerspruch auffällt. Diese Regelung folgt derselben Logik wie die Lebenszyklusregel in Kapitel 1: Ein System, das bei jeder Einzeländerung eine vollständige Prüfung aller Verweise verlangt, ist auf Dauer nicht wartbar — es verschiebt lediglich den Zeitpunkt der Korrektur auf den nächsten sinnvollen Bearbeitungsanlass.

### Verweise auf `HANDOVER.md`

Dokumente der S-Klasse und der O-Klasse verweisen nicht auf `HANDOVER.md` und hängen inhaltlich nicht von ihm ab. `HANDOVER.md` verweist umgekehrt auf die übrigen Dokumente, um den Bearbeitungsstand einzuordnen. Diese Richtung ist zwingend: Ein normatives oder fachliches Dokument, das auf ein Statusdokument verweist, würde seine eigene Zeitlosigkeit an einen sich ständig ändernden Zustand koppeln — genau das, was die Norm-Instanz-Trennung aus Kapitel 1 verhindern soll.

---

## Kapitel 6 — Änderungs- und Reviewprozess

### Zweck dieses Kapitels

Dieses Kapitel legt fest, wie eine Änderung an einem Dokument der Projektdokumentation entsteht, geprüft und wirksam wird. Es schließt damit den in den Kapiteln 1 bis 5 beschriebenen Rahmen zu einem vollständigen System: Die vorangegangenen Kapitel legen fest, was gilt, wie es strukturiert, formuliert, benannt und referenziert wird — dieses Kapitel legt fest, wie sich dieser Zustand selbst kontrolliert verändert.

### Änderungsarten

Eine Änderung an einem Dokument fällt in eine der folgenden Kategorien, die zugleich bestimmt, welches Dokument von der Änderung betroffen ist:

- **Inhaltliche Änderung** — betrifft die fachliche Aussage eines Fachdokuments oder von `ARCHITECTURE.md` und richtet sich nach dessen Zuständigkeit (Kapitel 2).
- **Strukturelle Änderung** — betrifft die Dokumentenhierarchie, eine Zuständigkeit oder die Norm-Instanz-Trennung selbst und richtet sich nach Kapitel 1 oder Kapitel 2 dieses Dokuments.
- **Stilistische Änderung** — betrifft eine Regel aus Kapitel 3, etwa eine Stilklasse oder ihre Zuordnung.
- **Terminologische Änderung** — betrifft einen Begriff aus Kapitel 4.

Diese Einordnung entscheidet, welches Dokument angepasst wird, nicht nur, wer daran mitwirkt. Eine inhaltliche Änderung an `TECHNICAL.md` erfordert keine Anpassung von `DOCUMENTATION.md`; eine strukturelle Änderung an der Dokumentenhierarchie hingegen schon, unabhängig davon, in welchem Fachdokument sie zuerst sichtbar wurde.

### Rollen

An jeder Änderung wirken drei Rollen mit, unabhängig davon, welche Person oder welches Werkzeug eine Rolle im Einzelfall ausfüllt:

Der **Autor** strukturiert und formuliert eine Änderung, weist auf Lücken, Widersprüche oder fehlende Informationen hin und trifft dabei keine Architektur- oder Strukturentscheidung selbst.

Der **Reviewer** prüft eine vorgeschlagene Änderung auf Konsistenz mit den bestehenden Dokumenten, erkennt fehlende Aspekte oder Widersprüche und bewertet die langfristige Tragfähigkeit einer Änderung. Die Rolle des Reviewers ist von der Rolle des Autors organisatorisch getrennt: Wer eine Änderung formuliert, gibt sie nicht zugleich selbst frei.

Der **Projektverantwortliche** trifft die eigentliche Entscheidung. Er wählt zwischen Alternativen, wo mehrere bestehen, und gibt eine Änderung verbindlich frei. Diese Rolle ist nicht delegierbar: Weder Autor noch Reviewer ersetzen die abschließende Entscheidung des Projektverantwortlichen.

Diese drei Rollen sind eine normative Verallgemeinerung der in `HANDOVER.md` beschriebenen konkreten Rollenverteilung. `HANDOVER.md` benennt, welche konkreten Personen oder Werkzeuge diese Rollen zum jeweiligen Zeitpunkt ausfüllen; dieses Kapitel legt lediglich fest, dass es diese drei Rollen und ihre Trennung geben muss, unabhängig davon, wer sie ausfüllt. Ändert sich die konkrete Besetzung einer Rolle, wird dies in `HANDOVER.md` nachgeführt, nicht in diesem Kapitel.

Dieselbe Person darf mehrere dieser Rollen wahrnehmen, sofern die funktionale Trennung zwischen Ausarbeitung, Prüfung und Entscheidung dabei erhalten bleibt. Die Rollentrennung verlangt demnach nicht drei unterschiedliche Personen oder Werkzeuge, sondern drei unterscheidbare Schritte innerhalb des Änderungsprozesses.

### Ablauf einer Änderung

Eine Änderung durchläuft folgende Schritte:

1. Eine Änderung wird vorgeschlagen und in eine der oben genannten Änderungsarten eingeordnet.
2. Der Autor arbeitet die Änderung im betroffenen Dokument aus und weist dabei auf offene Fragen oder mögliche Widersprüche zu bestehenden Dokumenten hin, statt sie eigenständig aufzulösen.
3. Der Reviewer prüft die Änderung auf Konsistenz mit den bestehenden Dokumenten, insbesondere mit `ARCHITECTURE.md` und `DOCUMENTATION.md`, und benennt Risiken oder Alternativen, ohne selbst zu entscheiden.
4. Der Projektverantwortliche entscheidet über die Änderung, insbesondere dort, wo Autor und Reviewer mehrere gleichwertige Optionen aufgezeigt haben.
5. Die Änderung gilt als wirksam, sobald sie im betroffenen Dokument freigegeben eingearbeitet ist.

Dieser Ablauf gilt kapitelweise: Eine Änderung an einem einzelnen Kapitel eines Dokuments durchläuft diesen Prozess unabhängig von anderen, noch ausstehenden Kapiteln desselben Dokuments.

### Konsistenzbedingung

Eine Änderung gilt erst als abgeschlossen, wenn sie mit den bestehenden Kapiteln von `DOCUMENTATION.md` sowie mit `ARCHITECTURE.md` vereinbar ist und keine widersprüchliche Parallelregel zu einer bereits bestehenden Festlegung erzeugt. Entsteht ein Widerspruch, wird dieser vor der Freigabe aufgelöst, nicht nachträglich in einem separaten Korrekturschritt — mit Ausnahme von Verweisen, für die die reaktive Korrekturregel aus Kapitel 5 gilt.

### Verhältnis zu `HANDOVER.md`

`HANDOVER.md` beschreibt denselben Prozess auf operativer Ebene: konkrete Rollenbesetzung, aktueller Bearbeitungsstand, nächste anstehende Schritte. Dieses Kapitel verallgemeinert diesen Prozess zu einer dauerhaften Regel, die unabhängig vom aktuellen Projektstand gilt. Widerspricht eine Angabe in `HANDOVER.md` diesem Kapitel — etwa weil sich die Rollentrennung faktisch anders vollzieht als hier beschrieben —, gilt gemäß dem Prioritätsmodell aus Kapitel 1 dieses Kapitel als maßgeblich, und `HANDOVER.md` wird entsprechend angepasst, nicht umgekehrt.

---

Damit ist `DOCUMENTATION.md` vollständig. Das Dokument beschreibt in sich abgeschlossen den Standard, nach dem die gesamte Projektdokumentation der IT-Operations-Plattform entsteht: seine eigene Norm-Instanz-Trennung, die Hierarchie und Zuständigkeit der Dokumente, ihren Schreibstil, ihre Terminologie, ihre Verweisstruktur und den Prozess, nach dem sich all dies kontrolliert weiterentwickelt.
