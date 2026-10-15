# ConnOps – Einrichtung der Software-Voraussetzungen auf einer neuen Maschine

Zielgruppe: IT-Fachkräfte, die mit *diesem* Projekt noch nicht vertraut
sind. Grundlegende Windows-Server-Kenntnisse werden vorausgesetzt,
PowerShell-Erfahrung **nicht** — jeder Schritt ist so genau beschrieben,
dass er ohne Vorwissen zur Kommandozeile nachvollziehbar ist.

Dieser Ablauf wurde am 03.09.2026 vollständig auf einer echten, frisch
aufgesetzten Testmaschine durchgeführt und funktioniert wie beschrieben.

---

## 0. Bevor die VM überhaupt erstellt wird: Backup-Partition einplanen

Für ConnOps-Backups sollte eine **separate Partition** eingeplant
werden, statt sie nachträglich auf dem System-Laufwerk unterzubringen.
Das gehört in die VM-Erstellung selbst, nicht in die spätere
Software-Installation.

**Konvention:**
- Laufwerksbuchstabe: **`D:`**
- Mindestgröße: **5 GB**

---

## 1. Dateien auf die Zielmaschine kopieren

Den vollständigen Ordner `ConnOps-Prerequisites` (enthält das
Installationsskript sowie die beiden Installer-Dateien für Node.js und
PostgreSQL) nach

```
C:\ConnOps-Prerequisites
```

kopieren. Bewusst **nicht** unter `C:\ConnOps` (das ist das spätere
Git-Arbeitsverzeichnis von ConnOps selbst — eine Vermischung würde
Risiken bei einem künftigen `git clone`/Neuaufbau schaffen).

---

## 2. PowerShell als Administrator öffnen

Alle folgenden Befehle müssen in einer PowerShell-Sitzung ausgeführt
werden, die **als Administrator** gestartet wurde — ohne das schlagen
die Installationsschritte fehl.

1. Rechtsklick auf das **Startmenü** (Windows-Symbol unten links)
2. Je nach Windows-Version erscheint entweder **„Windows PowerShell
   (Administrator)"** oder **„Terminal (Administrator)"** — anklicken
3. Bei der Sicherheitsabfrage („Möchten Sie zulassen, dass diese App
   Änderungen vornimmt?") auf **„Ja"** klicken

---

## 3. In den Ordner wechseln und Dateien entsperren

```powershell
cd C:\ConnOps-Prerequisites
Get-ChildItem -Recurse | Unblock-File
```

**Warum dieser Schritt nötig ist:** Windows markiert Dateien, die von
„außerhalb" kommen (Netzwerkfreigabe, Download, E-Mail-Anhang)
automatisch mit einer unsichtbaren Sperre. Ohne diesen Schritt
verweigert PowerShell oft die Ausführung mit einer Fehlermeldung wie
*„ist nicht digital signiert"*. `-Recurse` entsperrt alle Dateien im
Ordner auf einmal (Skript und beide Installer).

**Optionale Kontrolle, ob es geklappt hat:**
```powershell
Get-Item .\Install-Prerequisites.ps1 -Stream Zone.Identifier
```
Erscheint die Fehlermeldung *„Der alternative Datenstrom ... konnte
nicht geöffnet werden"* (`AlternateDataStreamNotFound`), war das
Entsperren erfolgreich — das ist die **erwartete, korrekte** Reaktion,
keine echte Fehlfunktion.

---

## 4. Installationsskript ausführen

```powershell
.\Install-Prerequisites.ps1 -PgSuperuserPassword "IhrEigenesPasswort"
```

`"IhrEigenesPasswort"` durch ein selbst gewähltes, sicheres Passwort
ersetzen (nicht wörtlich übernehmen).

> 🔑 **Dieses Passwort unbedingt notieren/sicher aufbewahren.** Es wird
> dem `postgres`-Superuser-Konto zugewiesen, das der Installer anlegt.
> Es wird **später erneut gebraucht**, um die Datenbankrollen
> einzurichten (`GRANT itops_app TO connops_deploy`, siehe
> `INSTALL_PREREQUISITES.md`) — ohne dieses Passwort kommt man dann
> nicht mehr in die Datenbank hinein.

Das Skript installiert automatisch und ohne weitere Interaktion:
- **Node.js v24.18.0**
- **PostgreSQL 18** (nur die Server-Software — Datenbankrollen und
  Berechtigungen bleiben bewusst ein separater, manueller Schritt)
- **RSAT-AD-PowerShell** (Active Directory-Modul)

Jeder bereits installierte Bestandteil wird automatisch übersprungen —
das Skript kann gefahrlos mehrfach ausgeführt werden.

**Erwartete Ausgabe** (jeweils `[OK]` bei allen drei Punkten):
```
[OK]    PowerShell laeuft als Administrator.
=== Node.js v24.18.0 ===
[OK]    Node.js installiert. ...
=== PostgreSQL 18 (nur Server-Installation) ===
[OK]    PostgreSQL 18 installiert.
=== Active Directory-PowerShell-Modul (RSAT-AD-PowerShell) ===
[OK]    RSAT-AD-PowerShell installiert.
```

---

## 5. Neue PowerShell-Sitzung öffnen

Das aktuelle Fenster schließen und ein **neues** PowerShell-Fenster
**als Administrator** öffnen (siehe Schritt 2) — notwendig, damit
Node.js im Systempfad (`PATH`) sichtbar wird.

---

## 6. Installation bestätigen

```powershell
cd C:\ConnOps\deployment\verify
.\Verify.ps1 -Category Voraussetzungen
```

**Erwartete Ausgabe:**
```
=== ConnOps Verify ===
  [OK]     Node.js installiert
  [OK]     npm installiert
  [OK]     ActiveDirectory-Modul verfuegbar
  [OK]     PostgreSQL-Dienst laeuft lokal
=== Zusammenfassung ===
4 von 4 Pruefungen bestanden.
Installation vollstaendig und korrekt.
```

Zeigt jede der vier Zeilen `[OK]`, sind die Software-Voraussetzungen
vollständig eingerichtet.

---

## Was jetzt noch fehlt (nicht Teil dieser Anleitung)

Diese Anleitung deckt ausschließlich die **Software-Installation** ab.
Für den weiteren `install`-Ablauf sind zusätzlich folgende, bewusst
**manuelle** administrative Schritte nötig — siehe
`INSTALL_PREREQUISITES.md` für Details:

- PostgreSQL-Rollen `itops_app`/`connops_deploy` anlegen + `GRANT`
- AD-Konto `Service_ConnOps` bereitstellen
- TLS-Zertifikat von der internen CA beschaffen
