/**
 * dumpComputerSearch.js – EINMAL-Diagnose, rein lesend: ruft
 * adClient.searchComputers() mit demselben Code auf, den auch die echte
 * Route (routes/computers.js, GET /search) benutzt - um zu sehen, was
 * ConnOps SELBST fuer ein bestimmtes Computerobjekt zurueckbekommt,
 * statt eine eigene, parallele AD-Abfrage zu bauen.
 *
 * Hintergrund (12.09.2026): Nutzer meldet, dass derselbe Computer bei
 * zwei Personen ueber denselben ConnOps-Weg (Benutzer -> Citrix-
 * Arbeitsplatz-Bereich) unterschiedlich angezeigt wird (aktiv vs.
 * deaktiviert), obwohl der AD-Status seit Monaten unveraendert ist UND
 * das Objekt laut direkter AD-Pruefung nur EINMAL existiert. Zwei
 * Objekte mit gleichem Namen (urspruengliche Hypothese) damit
 * widerlegt.
 *
 * Da adClient.searchComputers() beide OUs durchsucht:
 *   OU=COMPUTER,...              (aktiv)
 *   OU=Computers,OU=_Inactive,...  (inaktiv)
 * und es laut Nutzer nur EIN Objekt gibt, sollte diese Funktion genau
 * EINEN Treffer liefern. Zeigt sie stattdessen mehr als einen, oder
 * einen Enabled-Wert, der der direkten AD-Pruefung widerspricht, liegt
 * das Problem nicht in AD selbst, sondern im ConnOps-seitigen
 * Suchpfad (SearchComputers-Cmd in psWorker.ps1, oder Caching/
 * Verarbeitung danach) - das waere dann der naechste Ansatzpunkt.
 *
 * WICHTIG / Annahme, die noch nicht bestaetigt ist: searchComputers()
 * erwartet ein credential-Argument. In der echten Route kommt das aus
 * der eingeloggten Admin-Session (req.audit.getCredential()). Hier wird
 * stattdessen null uebergeben, in der Annahme, dass die PowerShell-
 * Bridge (powershellBridge.js/psWorker.ps1, hier nicht vorliegend) ohne
 * explizites credential auf einen Standard-Service-Account zurueckfaellt
 * (analog zur bereits gesehenen Konvention bei Citrix:
 * CITRIX_SERVICE_ACCOUNT/CITRIX_SERVICE_PASSWORD in adClient.js). Falls
 * das NICHT stimmt, wird dieses Skript vermutlich mit einem klaren
 * Auth-Fehler abbrechen - dann bräuchten wir stattdessen
 * powershellBridge.js, um zu sehen, wie credential=null dort behandelt
 * wird.
 *
 * Rein lesend: SearchComputers fuehrt laut adClient.js/computers.js
 * keine Aenderung durch (nur EnableComputer/DisableComputer schreiben).
 *
 * Nutzung:
 *   node tools/dumpComputerSearch.js <Computername oder Teil davon>
 */

require('dotenv').config();
require('../services/loadSecrets').loadSecrets();

const adClient = require('../services/adClient');

async function main() {
  const query = process.argv[2];
  if (!query || query.length < 2) {
    console.error('Bitte einen Suchbegriff angeben (min. 2 Zeichen), z.B.:');
    console.error('  node tools/dumpComputerSearch.js PC-0123');
    process.exit(1);
  }

  console.log('─────────────────────────────────────────────');
  console.log('EINMAL-DIAGNOSE (rein lesend): Computer-Suche wie ConnOps selbst');
  console.log('─────────────────────────────────────────────');
  console.log(`Suchbegriff: "${query}"`);
  console.log('Ruft adClient.searchComputers() auf - denselben Code, den auch');
  console.log('GET /api/computers/search (routes/computers.js) nutzt.\n');

  let results;
  try {
    results = await adClient.searchComputers(query, null);
  } catch (err) {
    console.error('Fehlgeschlagen:', err.message);
    console.error('');
    console.error('Falls dies ein Auth-/Credential-Fehler ist: die Annahme im Kopfkommentar');
    console.error('(credential=null faellt auf einen Standard-Service-Account zurueck) war');
    console.error('vermutlich falsch - dann brauchen wir powershellBridge.js, um zu sehen,');
    console.error('wie ein credential fuer diesen Aufruf tatsaechlich beschafft werden muss.');
    process.exit(1);
  }

  console.log(`Anzahl Treffer: ${Array.isArray(results) ? results.length : '(kein Array - siehe Rohantwort unten)'}\n`);
  console.log('Vollstaendige Rohantwort:');
  console.log(JSON.stringify(results, null, 2));
  console.log('');

  if (Array.isArray(results) && results.length > 1) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`⚠ ACHTUNG: ${results.length} Treffer fuer einen Suchbegriff, obwohl laut`);
    console.log('  direkter AD-Pruefung nur EIN Objekt existiert. Das wuerde erklaeren,');
    console.log('  warum unterschiedliche Personen unterschiedliche Treffer sehen -');
    console.log('  vermutlich matcht die Suche zusaetzlich einen anderen Namen/Alias,');
    console.log('  oder liefert Duplikate aus den zwei durchsuchten OUs.');
    console.log('  Bitte pruefen: sind die distinguishedName-Werte unten wirklich');
    console.log('  identisch, oder tatsaechlich unterschiedliche Objekte?');
  } else if (Array.isArray(results) && results.length === 1) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Genau EIN Treffer, wie erwartet. Relevant zum Abgleich mit der');
    console.log('direkten AD-Pruefung: das "enabled"/"Enabled"-Feld (Feldname siehe');
    console.log('Rohantwort oben) und der distinguishedName.');
    console.log('');
    console.log('Falls dieser EINE Treffer bereits einen Status zeigt, der NICHT zur');
    console.log('direkten AD-Pruefung passt, liegt der Fehler nicht in Mehrdeutigkeit,');
    console.log('sondern darin, WIE SearchComputers (psWorker.ps1) den Status ausliest');
    console.log('oder benennt (z.B. verwechseltes Feld, invertierte Logik, oder ein');
    console.log('zwischengeschalteter Cache zwischen dieser Funktion und der Route).');
  } else if (Array.isArray(results) && results.length === 0) {
    console.log('Kein Treffer - ggf. Suchbegriff anpassen (z.B. Teilstring statt');
    console.log('vollem Namen, oder Groß-/Kleinschreibung/Sonderzeichen pruefen).');
  }
}

main().catch(err => {
  console.error('Unerwarteter Fehler:', err.message);
  process.exit(1);
});
