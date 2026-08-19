/* Rauchtest: spielt alle Mini-Spiele einmal komplett durch.
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

  // Spiel 1: Verstecken – drei Räume, je 7 von ~12 Verstecken belegt
  await page.click('[data-spiel="verstecken"]');
  for (let raum = 0; raum < 3; raum++) {
    await page.waitForTimeout(400);
    const alle = await page.$$(".zimmer-szene:not([hidden]) .versteck");
    const belegt = await page.$$(".zimmer-szene:not([hidden]) .versteck.belegt");
    pruefe(`Raum ${raum + 1}: mindestens 11 Verstecke`, alle.length >= 11);
    pruefe(`Raum ${raum + 1}: genau 7 belegt`, belegt.length === 7);
    for (const s of belegt) await s.dispatchEvent("click");
    // Zwischenmeldung (2,75 s) bzw. Jubel abwarten
    await page.waitForTimeout(raum < 2 ? 4200 : 1400);
  }
  pruefe("Jubel nach 3 Räumen", await page.$eval("#jubel", (el) => !el.hidden));
  pruefe("Sticker im Jubel", await page.$eval("#jubel-sticker", (el) => !el.hidden));
  await page.click("#btn-heim");

  // Spiel 2: Memory – 8 Paare anhand der Motive lösen
  await page.click('[data-spiel="memory"]');
  await page.waitForTimeout(300);
  const motive = await page.$$eval(".karte", (ks) => ks.map((k) => k.getAttribute("data-motiv")));
  pruefe("16 Memory-Karten", motive.length === 16);
  const gruppen = {};
  motive.forEach((m, i) => (gruppen[m] = gruppen[m] || []).push(i));
  for (const m of Object.keys(gruppen)) {
    const [a, b] = gruppen[m];
    await page.click(`.karte:nth-child(${a + 1})`);
    await page.click(`.karte:nth-child(${b + 1})`);
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(1200);
  pruefe("Jubel nach Memory", await page.$eval("#jubel", (el) => !el.hidden));
  await page.click("#btn-heim");

  // Spiel 3: Kuchen backen – Zutaten in Rezept-Reihenfolge, rühren, backen
  await page.click('[data-spiel="backen"]');
  await page.waitForTimeout(300);
  pruefe("8 Zutaten im Regal", (await page.$$(".zutat")).length === 8);
  // Falsche Zutat zuerst: darf nichts kaputt machen
  await page.click('.zutat[data-zutat="brokkoli"]');
  for (const id of ["mehl", "butter", "zucker", "ei", "milch", "erdbeere"]) {
    await page.click('.zutat[data-zutat="' + id + '"]');
    await page.waitForTimeout(120);
  }
  pruefe("Alle Rezeptfelder abgehakt", (await page.$$(".rezept-feld.fertig")).length === 6);
  for (let i = 0; i < 8; i++) {
    await page.$eval("#schuessel", (el) => el.click());
    await page.waitForTimeout(80);
  }
  await page.$eval("#backofen", (el) => el.click());
  await page.waitForTimeout(4600); // 6 Ticks à 0,6 s + Jubel
  pruefe("Jubel nach dem Backen", await page.$eval("#jubel", (el) => !el.hidden));
  await page.click("#btn-heim");

  // Spiel 4a: Leckerlis fangen – nur Süßes/Obst antippen, Gemüse fällt durch
  await page.click('[data-spiel="fangen"]');
  let gemueseGesehen = false;
  for (let runde = 0; runde < 120; runde++) {
    const gemuese = await page.$('.leckerli[data-gut="nein"]');
    if (gemuese && !gemueseGesehen) {
      gemueseGesehen = true;
      await gemuese.dispatchEvent("click"); // darf NICHT zählen
    }
    const gut = await page.$('.leckerli[data-gut="ja"]:not(.gefangen)');
    if (gut) { try { await gut.dispatchEvent("click"); } catch (e) { /* schon weg */ } }
    const punkte = await page.$$eval("#fangen-fortschritt .punkt.an", (p) => p.length);
    if (punkte >= 10) break;
    await page.waitForTimeout(350);
  }
  pruefe("Gemüse ist gefallen", gemueseGesehen);

  // Zwischenmeldung → Picknick
  await page.waitForTimeout(4500);
  pruefe("Picknick-Bildschirm aktiv", await page.$eval("#screen-picknick", (el) => el.classList.contains("active")));
  const esser = await page.$$(".esser");
  pruefe("7 Geißlein + 1 Wolf am Picknick", esser.length === 8);
  pruefe("Geißlein haben Namen", await page.$eval(".esser-name", (el) => el.textContent.length > 1));

  // Spiel 4b: alle Leckereien verteilen (10 gefangene + 6 Kuchenstücke, weil gebacken)
  const anzahlLeckereien = (await page.$$(".korb-item")).length;
  pruefe("16 Leckereien im Korb (mit Extra-Kuchen)", anzahlLeckereien === 16);
  let sicherung = 0;
  while (sicherung < 40) {
    const item = await page.$(".korb-item");
    if (!item) break;
    await item.dispatchEvent("click");
    const ziel = (await page.$$(".esser"))[sicherung % 8];
    await ziel.dispatchEvent("click");
    await page.waitForTimeout(140);
    sicherung++;
  }
  pruefe("Alle Leckereien verteilt", sicherung === anzahlLeckereien);
  await page.waitForTimeout(1600);
  pruefe("Jubel nach Picknick", await page.$eval("#jubel", (el) => !el.hidden));
  await page.click("#btn-heim");

  // Sticker-Album: nach 4 geschafften Spielen sind 4 Sticker da
  await page.click("#btn-album");
  pruefe("Album zeigt 4 Sticker", (await page.$$(".album-feld.besitzt")).length === 4);
  pruefe("Zähler stimmt", await page.$eval("#album-zaehler", (el) => el.textContent.trim() === "4 / 12"));

  pruefe("Keine Konsolenfehler", fehler.length === 0);
  if (fehler.length) console.error(fehler);
  await browser.close();
})();
