/* Randfall-Tests: Einstellungen, Fehlversuche, Schwierigkeit, Abbrüche, Wiederholung.
   Voraussetzung: npm install playwright  (Chromium wird ggf. mitinstalliert) */
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  // Optional: CHROMIUM_PFAD=/pfad/zu/chromium, falls Playwright keinen Browser findet
  const browser = await chromium.launch(
    process.env.CHROMIUM_PFAD ? { executablePath: process.env.CHROMIUM_PFAD } : {}
  );
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const fehler = [];
  page.on("console", (m) => { if (m.type() === "error") fehler.push(m.text()); });
  page.on("pageerror", (e) => fehler.push(String(e)));

  const url = "file://" + path.resolve(__dirname, "..", "index.html");
  await page.goto(url);

  function pruefe(name, wahr) {
    if (!wahr) {
      console.error("FEHLER: " + name);
      process.exitCode = 1;
    } else {
      console.log("OK: " + name);
    }
  }

  // --- Einstellungs-Toggles ---
  await page.click("#btn-ton");
  pruefe("Ton-Taste zeigt aus-Zustand", await page.$eval("#btn-ton", (el) => el.textContent === "🔇" && el.classList.contains("aus")));
  await page.click("#btn-vorlesen");
  await page.click("#btn-gross");
  await page.reload();
  pruefe("Ton bleibt nach Neuladen aus", await page.$eval("#btn-ton", (el) => el.textContent === "🔇"));
  pruefe("Groß-Modus bleibt gespeichert", await page.$eval("#btn-gross", (el) => el.classList.contains("aktiv")));
  await page.click("#btn-ton");
  pruefe("Ton wieder an", await page.$eval("#btn-ton", (el) => el.textContent === "🔊"));

  // --- Verstecken im Groß-Modus: 4 Fehlversuche => Raum beginnt von vorn ---
  await page.click('[data-spiel="verstecken"]');
  await page.waitForTimeout(300);
  pruefe("Herzen sichtbar im Groß-Modus", await page.$eval("#versuche-anzeige", (el) => !el.hidden));
  pruefe("4 volle Herzen", (await page.$$("#versuche-anzeige .herz.voll")).length === 4);

  // Erst ein Geißlein finden ...
  const treffer = await page.$(".zimmer-szene:not([hidden]) .versteck.belegt");
  await treffer.dispatchEvent("click");
  pruefe("1 Geißlein gefunden", (await page.$$eval("#verstecken-fortschritt .punkt.an", (p) => p.length)) === 1);

  // ... dann 4 leere Verstecke antippen
  for (let i = 0; i < 4; i++) {
    const leer = await page.$(".zimmer-szene:not([hidden]) .versteck:not(.belegt):not(.gefunden)");
    await leer.dispatchEvent("click");
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(3400); // Zwischenmeldung abwarten
  pruefe("Groß: Raum beginnt von vorn", (await page.$$eval("#verstecken-fortschritt .punkt.an", (p) => p.length)) === 0);
  pruefe("Groß: wieder 7 belegt", (await page.$$(".zimmer-szene:not([hidden]) .versteck.belegt")).length === 7);
  pruefe("Groß: Herzen wieder voll", (await page.$$("#versuche-anzeige .herz.voll")).length === 4);
  await page.click("#screen-verstecken .zurueck");

  // --- Verstecken im Klein-Modus: 4 Fehlversuche => Geißlein verstecken sich neu, Fortschritt bleibt ---
  await page.click("#btn-klein");
  await page.click('[data-spiel="verstecken"]');
  await page.waitForTimeout(300);
  pruefe("Keine Herzen im Klein-Modus", await page.$eval("#versuche-anzeige", (el) => el.hidden));
  const treffer2 = await page.$(".zimmer-szene:not([hidden]) .versteck.belegt");
  await treffer2.dispatchEvent("click");
  for (let i = 0; i < 4; i++) {
    const leer = await page.$(".zimmer-szene:not([hidden]) .versteck:not(.belegt):not(.gefunden)");
    await leer.dispatchEvent("click");
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(400);
  pruefe("Klein: Fortschritt bleibt erhalten", (await page.$$eval("#verstecken-fortschritt .punkt.an", (p) => p.length)) === 1);
  pruefe("Klein: 6 Geißlein neu versteckt", (await page.$$(".zimmer-szene:not([hidden]) .versteck.belegt:not(.gefunden)")).length === 6);

  // Doppel-Tipp auf gefundenes Versteck zählt nicht doppelt
  const gefunden = await page.$(".zimmer-szene:not([hidden]) .versteck.gefunden");
  await gefunden.dispatchEvent("click");
  pruefe("Doppel-Tipp zählt nur einmal", (await page.$$eval("#verstecken-fortschritt .punkt.an", (p) => p.length)) === 1);
  await page.click("#screen-verstecken .zurueck");

  // --- Memory: dritte Karte während Prüfphase wird ignoriert ---
  await page.click('[data-spiel="memory"]');
  await page.waitForTimeout(300);
  const motive = await page.$$eval(".karte", (ks) => ks.map((k) => k.getAttribute("data-motiv")));
  const ersteIdx = 0;
  const andereIdx = motive.findIndex((m, i) => i > 0 && m !== motive[0]);
  const dritteIdx = motive.findIndex((m, i) => i !== ersteIdx && i !== andereIdx);
  await page.click(`.karte:nth-child(${ersteIdx + 1})`);
  await page.click(`.karte:nth-child(${andereIdx + 1})`);
  await page.click(`.karte:nth-child(${dritteIdx + 1})`);
  pruefe("Dritte Karte bleibt zu (gesperrt)", !(await page.$eval(`.karte:nth-child(${dritteIdx + 1})`, (el) => el.classList.contains("offen"))));
  await page.waitForTimeout(1300);
  pruefe("Ungleiches Paar klappt wieder zu", (await page.$$eval(".karte.offen", (k) => k.length)) === 0);
  await page.click("#screen-memory .zurueck");

  // --- Backen: Schüssel und Ofen reagieren nur in ihrer Phase ---
  await page.click('[data-spiel="backen"]');
  await page.waitForTimeout(300);
  await page.$eval("#backofen", (el) => el.click()); // zu früh – darf nichts tun
  await page.$eval("#schuessel", (el) => el.click()); // zu früh – darf nichts tun
  pruefe("Backofen zu früh ohne Wirkung", !(await page.$eval("#backofen", (el) => el.classList.contains("backt"))));
  // Falsche Reihenfolge: Milch vor Mehl
  await page.click('.zutat[data-zutat="milch"]');
  pruefe("Falsche Reihenfolge hakt nichts ab", (await page.$$(".rezept-feld.fertig")).length === 0);
  await page.click("#screen-backen .zurueck");

  // --- Fangen: Gemüse zählt nicht, Zurück stoppt das Spiel ---
  await page.click('[data-spiel="fangen"]');
  let gemuese = null;
  for (let i = 0; i < 40 && !gemuese; i++) {
    gemuese = await page.$('.leckerli[data-gut="nein"]');
    if (!gemuese) await page.waitForTimeout(300);
  }
  pruefe("Gemüse taucht auf", !!gemuese);
  if (gemuese) {
    await gemuese.dispatchEvent("click");
    pruefe("Gemüse-Tipp zählt nicht", (await page.$$eval("#fangen-fortschritt .punkt.an", (p) => p.length)) === 0);
  }
  await page.click("#screen-fangen .zurueck");
  await page.waitForTimeout(2600); // länger als das Spawn-Intervall
  pruefe("Nach Zurück fallen keine Leckerlis mehr", (await page.$$eval("#fangen-feld .leckerli", (l) => l.length)) === 0);

  pruefe("Keine Konsolenfehler", fehler.length === 0);
  if (fehler.length) console.error(fehler);
  await browser.close();
})();
