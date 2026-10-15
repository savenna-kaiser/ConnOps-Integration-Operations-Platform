/**
 * handoverService.js – Übergabedokument-Verwaltung
 *
 * - PDF generieren (PDFKit, kein Branding noch – kommt später)
 * - Dokumente speichern unter data/handover/<hostname>/
 * - Dokumente auflisten und abrufen
 */

const fs   = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { PDFDocument: PdfLibDocument } = require("pdf-lib");
const { applyLetterhead, CONTENT_TOP, CONTENT_BOTTOM } = require("./pdfLetterhead");
const db = require("../data/db");

const HANDOVER_DIR = path.join(__dirname, "../data/handover");

// ─── Verzeichnis sicherstellen ────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Dateiname ────────────────────────────────────────────────────────────────

function buildFilename(hostname, sam, date) {
  const d = date || new Date().toISOString().slice(0, 10);
  return `${hostname}_${sam}_${d}.pdf`;
}

// ─── PDF generieren ───────────────────────────────────────────────────────────

function generatePDF(data) {
  return new Promise((resolve, reject) => {
    const {
      hostname,
      biosSerial,
      modell,
      mitarbeiter,        // { name, sam, abteilung }
      datum,              // ISO-String
      ausgehaendigtVon,   // Name des IT-Mitarbeiters
      zubehoer,           // Array von { label, checked }
      bemerkung,
    } = data;

    const doc = new PDFDocument({ size: "A4", margin: 60 });
    const buffers = [];

    let signatureBox = null; // wird weiter unten gesetzt, vor doc.end()
    doc.on("data", chunk => buffers.push(chunk));
    doc.on("end",  ()    => resolve({ buffer: Buffer.concat(buffers), signatureBox }));
    doc.on("error", reject);

    applyLetterhead(doc); // MUSS vor dem ersten Inhalt aufgerufen werden

    const W = doc.page.width - 120; // Nutzbreite
    const BRAND = "#1e40af";
    const MUTED = "#6b7280";
    const LINE  = "#e5e7eb";

    // ── Header ──────────────────────────────────────────────────────────────
    // Adresszeile/Logo entfaellt hier bewusst — steht bereits im echten
    // Briefpapier-Hintergrund, keine doppelte Absenderangabe noetig.
    doc
      .fontSize(20)
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .text("Übergabedokument IT-Ausstattung", 60, CONTENT_TOP);

    // Trennlinie
    doc
      .moveTo(60, CONTENT_TOP + 28)
      .lineTo(60 + W, CONTENT_TOP + 28)
      .lineWidth(2)
      .strokeColor(BRAND)
      .stroke();

    // ── Metadaten ────────────────────────────────────────────────────────────
    let y = CONTENT_TOP + 44;

    function row(label, value, yPos) {
      doc.fontSize(9).fillColor(MUTED).font("Helvetica").text(label, 60, yPos);
      doc.fontSize(10).fillColor("#111827").font("Helvetica-Bold").text(value || "–", 200, yPos);
    }

    const datumFormatted = datum
      ? new Date(datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
      : new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

    row("Datum der Übergabe",   datumFormatted,                 y);       y += 20;
    row("Mitarbeiter",          mitarbeiter.name,               y);       y += 20;
    row("Personalnummer / SAM", mitarbeiter.sam,                y);       y += 20;
    row("Abteilung",            mitarbeiter.abteilung || "–",   y);       y += 20;
    row("Ausgehändigt von",     ausgehaendigtVon || "–",        y);       y += 28;

    // Trennlinie
    doc.moveTo(60, y).lineTo(60 + W, y).lineWidth(0.5).strokeColor(LINE).stroke();
    y += 16;

    // ── Gerät ────────────────────────────────────────────────────────────────
    doc
      .fontSize(12)
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .text("Ausgehändigtes Gerät", 60, y);
    y += 20;

    // Tabellenkopf
    doc
      .rect(60, y, W, 22)
      .fill("#f3f4f6");

    doc.fontSize(9).fillColor(MUTED).font("Helvetica-Bold");
    doc.text("Hostname",    70,  y + 7, { width: 140, lineBreak: false });
    doc.text("Modell",      220, y + 7, { width: 170, lineBreak: false });
    doc.text("Service Tag", 400, y + 7, { width: 140, lineBreak: false });
    y += 22;

    // Tabellenzeile
    doc
      .rect(60, y, W, 24)
      .lineWidth(0.5)
      .strokeColor(LINE)
      .stroke();

    doc.fontSize(10).fillColor("#111827").font("Helvetica");
    doc.text(hostname    || "–", 70,  y + 7, { width: 140, lineBreak: false });
    doc.text(modell      || "–", 220, y + 7, { width: 170, lineBreak: false });
    doc.text(biosSerial  || "–", 400, y + 7, { width: 140, lineBreak: false });
    y += 36;

    // ── Zubehör ──────────────────────────────────────────────────────────────
    doc
      .moveTo(60, y).lineTo(60 + W, y)
      .lineWidth(0.5).strokeColor(LINE).stroke();
    y += 16;

    doc
      .fontSize(12)
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .text("Mitgeliefertes Zubehör", 60, y);
    y += 20;

    // Nur tatsaechlich ausgewaehltes Zubehoer anzeigen — nicht ausgewaehlte
    // Artikel werden bewusst nicht mehr aufgelistet (waren vorher zusaetzlich
    // grau/durchgestrichen gelistet, das ist jetzt entfernt).
    const checked = (zubehoer || []).filter(z => z.checked);

    if (checked.length === 0) {
      doc.fontSize(10).fillColor(MUTED).font("Helvetica").text("Kein Zubehör ausgewählt.", 60, y);
      y += 18;
    } else {
      checked.forEach(z => {
        // Bullet-Punkt (•) statt Haekchen (✓) — ✓/☐ gehoeren nicht zur
        // Standard-WinAnsi-Kodierung der eingebauten Helvetica-Schriftart
        // und wurden deshalb als Ersatzzeichen ("&") dargestellt. "•" ist
        // Teil der Standardkodierung und rendert zuverlaessig als Kreis.
        doc.fontSize(10).fillColor("#16a34a").font("Helvetica-Bold").text("•", 60, y);
        doc.fontSize(10).fillColor("#111827").font("Helvetica").text(z.label, 80, y);
        y += 18;
      });
    }

    y += 8;

    // ── Bemerkung ────────────────────────────────────────────────────────────
    if (bemerkung && bemerkung.trim()) {
      doc.moveTo(60, y).lineTo(60 + W, y).lineWidth(0.5).strokeColor(LINE).stroke();
      y += 16;

      doc.fontSize(12).fillColor(BRAND).font("Helvetica-Bold").text("Bemerkung", 60, y);
      y += 18;
      doc.fontSize(10).fillColor("#111827").font("Helvetica").text(bemerkung.trim(), 60, y, { width: W });
      y += doc.heightOfString(bemerkung.trim(), { width: W }) + 12;
    }

    // ── Unterschrift-Bereich ─────────────────────────────────────────────────
    // Platz für spätere digitale Unterschrift
    // Block braucht ca. 130pt (Bestätigungstext + Linien + Platzhalter-Hinweis) -
    // nie tiefer als CONTENT_BOTTOM, sonst würde er in die Fußzeile hineinragen.
    const SIGNATURE_BLOCK_HEIGHT = 130;
    const maxSigY = doc.page.height - CONTENT_BOTTOM - SIGNATURE_BLOCK_HEIGHT;
    const sigY = Math.min(Math.max(y + 20, doc.page.height - 200), maxSigY);

    doc.moveTo(60, sigY).lineTo(60 + W, sigY).lineWidth(0.5).strokeColor(LINE).stroke();

    doc.fontSize(12).fillColor(BRAND).font("Helvetica-Bold")
       .text("Bestätigung", 60, sigY + 12);

    doc.fontSize(10).fillColor("#111827").font("Helvetica")
       .text(
         `Ich bestätige den Empfang der oben aufgeführten IT-Ausstattung am ${datumFormatted}.`,
         60, sigY + 30, { width: W }
       );

    // Unterschrift-Linie (nur Mitarbeiter — "Ausgehändigt von" steht bereits
    // als Name in den Metadaten oben, eine zusätzliche IT-Unterschriftszeile
    // ist redundant und wurde entfernt)
    const lineY = sigY + 80;
    doc.moveTo(60, lineY).lineTo(60 + W, lineY).lineWidth(0.5).strokeColor("#9ca3af").stroke();

    doc.fontSize(8).fillColor(MUTED).font("Helvetica");
    doc.text("Datum, Unterschrift Mitarbeiter", 60, lineY + 5);

    // Signaturflaeche Mitarbeiter (oberhalb der Linie) — Koordinaten werden
    // mit zurueckgegeben, damit addSignature() spaeter (pdf-lib) exakt weiss,
    // wo die Unterschrift eingefuegt werden muss. pdfkit-Koordinaten sind
    // top-left-basiert; die Umrechnung fuer pdf-lib (bottom-left) passiert
    // erst in addSignature().
    signatureBox = { x: 65, y: lineY - 42, width: 190, height: 38 };

    doc.end();
  });
}

// ─── Dokument speichern ───────────────────────────────────────────────────────

async function saveHandover(data) {
  const { hostname, mitarbeiter, datum } = data;
  const dir = path.join(HANDOVER_DIR, hostname);
  ensureDir(dir);

  const filename = buildFilename(hostname, mitarbeiter.sam, datum?.slice(0, 10));
  const filepath = path.join(dir, filename);

  const { buffer, signatureBox } = await generatePDF(data);
  fs.writeFileSync(filepath, buffer);

  // Signierstatus + Position der Unterschriftsflaeche in PostgreSQL tracken
  // (nicht als Einzeldatei je PDF — siehe Gespraech zur digitalen Signatur).
  // ON CONFLICT DO UPDATE statt DO NOTHING: falls unter demselben Dateinamen
  // (gleicher Hostname+SAM+Datum) bereits eine Zeile existiert — z.B. weil
  // die alte PDF-Datei manuell geloescht und neu erstellt wurde — muss der
  // Signierstatus zurueckgesetzt werden. Eine neu erzeugte Datei ist IMMER
  // unsigniert, unabhaengig vom Zustand einer gleichnamigen Vorgaenger-Zeile.
  await db.query(
    `INSERT INTO handover_documents (hostname, filename, signed, sig_x, sig_y, sig_width, sig_height)
     VALUES ($1, $2, false, $3, $4, $5, $6)
     ON CONFLICT (hostname, filename) DO UPDATE SET
       signed     = false,
       signed_at  = NULL,
       sig_x      = EXCLUDED.sig_x,
       sig_y      = EXCLUDED.sig_y,
       sig_width  = EXCLUDED.sig_width,
       sig_height = EXCLUDED.sig_height,
       created_at = NOW()`,
    [hostname, filename, signatureBox.x, signatureBox.y, signatureBox.width, signatureBox.height]
  );

  return {
    filename,
    filepath,
    hostname,
    sam:       mitarbeiter.sam,
    name:      mitarbeiter.name,
    abteilung: mitarbeiter.abteilung,
    datum:     datum || new Date().toISOString().slice(0, 10),
    zubehoer:  (data.zubehoer || []).filter(z => z.checked).map(z => z.label),
    signed:    false,
  };
}

// ─── Dokumente eines Assets auflisten ────────────────────────────────────────

// Reichert eine Liste von Dokumenten (aus dem Dateisystem gelesen) mit dem
// Signierstatus aus PostgreSQL an. Dateien ohne DB-Zeile (z.B. sehr alte
// Dokumente von vor diesem Feature) gelten als "nicht signiert".
async function attachSignedStatus(docs) {
  if (docs.length === 0) return docs;
  const { rows } = await db.query(
    `SELECT hostname, filename, signed FROM handover_documents
     WHERE (hostname, filename) IN (${docs.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(",")})`,
    docs.flatMap(d => [d.hostname, d.filename])
  );
  const signedMap = new Map(rows.map(r => [`${r.hostname}::${r.filename}`, r.signed]));
  return docs.map(d => ({ ...d, signed: signedMap.get(`${d.hostname}::${d.filename}`) ?? false }));
}

async function listHandovers(hostname) {
  const dir = path.join(HANDOVER_DIR, hostname);
  if (!fs.existsSync(dir)) return [];

  const docs = fs.readdirSync(dir)
    .filter(f => f.endsWith(".pdf"))
    .map(filename => {
      // Dateiname: HOSTNAME_SAM_DATUM.pdf
      const parts = filename.replace(".pdf", "").split("_");
      const stat  = fs.statSync(path.join(dir, filename));
      return {
        filename,
        hostname: parts[0] || hostname,
        sam:      parts[1] || "",
        datum:    parts[2] || "",
        size:     stat.size,
        createdAt: stat.birthtime.toISOString(),
      };
    })
    .sort((a, b) => b.datum.localeCompare(a.datum));

  return attachSignedStatus(docs);
}

// ─── Datei-Pfad für Download ──────────────────────────────────────────────────

function getHandoverPath(hostname, filename) {
  const filepath = path.join(HANDOVER_DIR, hostname, filename);
  if (!fs.existsSync(filepath)) return null;
  // Sicherheit: kein Path-Traversal
  const resolved = path.resolve(filepath);
  const base     = path.resolve(HANDOVER_DIR);
  if (!resolved.startsWith(base)) return null;
  return resolved;
}

// ─── Alle Dokumente eines Benutzers (SAM) ────────────────────────────────────
// Durchsucht alle Hostname-Verzeichnisse nach Dateien die den SAM enthalten

async function listHandoversBySam(sam) {
  if (!fs.existsSync(HANDOVER_DIR)) return [];

  const result = [];
  const hostDirs = fs.readdirSync(HANDOVER_DIR).filter(d =>
    fs.statSync(path.join(HANDOVER_DIR, d)).isDirectory()
  );

  hostDirs.forEach(hostname => {
    const dir = path.join(HANDOVER_DIR, hostname);
    fs.readdirSync(dir)
      .filter(f => f.endsWith(".pdf") && f.includes(`_${sam}_`))
      .forEach(filename => {
        const parts = filename.replace(".pdf", "").split("_");
        const stat  = fs.statSync(path.join(dir, filename));
        result.push({
          filename,
          hostname,
          sam:       parts[1] || sam,
          datum:     parts[2] || "",
          size:      stat.size,
          createdAt: stat.birthtime.toISOString(),
        });
      });
  });

  const sorted = result.sort((a, b) => b.datum.localeCompare(a.datum));
  return attachSignedStatus(sorted);
}

// ─── Signatur nachträglich einfügen ──────────────────────────────────────────
// Nutzt pdf-lib (kann bestehende PDFs oeffnen+veraendern, anders als pdfkit,
// das nur neue PDFs erzeugen kann). Einmal signiert = unveraenderlich, ein
// zweiter Versuch wird abgelehnt (siehe Pruefung unten).

async function addSignature(hostname, filename, signatureDataUrl) {
  const { rows } = await db.query(
    `SELECT * FROM handover_documents WHERE hostname = $1 AND filename = $2`,
    [hostname, filename]
  );
  if (rows.length === 0) {
    throw new Error("Dokument nicht in der Datenbank erfasst (evtl. sehr altes Dokument von vor diesem Feature).");
  }
  const record = rows[0];
  if (record.signed) {
    throw new Error("Dokument ist bereits signiert und kann nicht erneut geaendert werden.");
  }

  const filepath = getHandoverPath(hostname, filename);
  if (!filepath) {
    throw new Error("PDF-Datei nicht gefunden.");
  }

  // Base64-PNG aus dem data:-URL extrahieren (Signatur-Pad liefert
  // z.B. "data:image/png;base64,iVBORw0KG...")
  const match = signatureDataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) {
    throw new Error("Ungueltiges Signatur-Format (erwartet PNG als data:-URL).");
  }
  const signatureBytes = Buffer.from(match[1], "base64");

  const existingPdfBytes = fs.readFileSync(filepath);
  const pdfDoc = await PdfLibDocument.load(existingPdfBytes);
  const page   = pdfDoc.getPages()[0];
  const pngImage = await pdfDoc.embedPng(signatureBytes);

  // Koordinaten-Umrechnung: pdfkit ist top-left-basiert, pdf-lib ist
  // bottom-left-basiert (PDF-Standard). y-Umrechnung: pageHeight - topY - height.
  const pageHeight = page.getHeight();
  const x = record.sig_x;
  const y = pageHeight - record.sig_y - record.sig_height;

  page.drawImage(pngImage, { x, y, width: record.sig_width, height: record.sig_height });

  const updatedPdfBytes = await pdfDoc.save();
  fs.writeFileSync(filepath, updatedPdfBytes);

  await db.query(
    `UPDATE handover_documents SET signed = true, signed_at = NOW() WHERE hostname = $1 AND filename = $2`,
    [hostname, filename]
  );

  return { ok: true };
}

module.exports = {
  saveHandover,
  listHandovers,
  listHandoversBySam,
  getHandoverPath,
  addSignature,
};