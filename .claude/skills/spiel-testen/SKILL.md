---
name: spiel-testen
description: Baut Königreich 3D und fährt die Playwright-Smoke-Suite im Headless-Chromium (Start, Bauen, Kampf, Screenshots). Einsetzen nach Code-Änderungen am Spiel oder auf Zuruf („teste das Spiel").
---

# Spiel bauen und testen

1. **Build:**
   ```bash
   cd koenigreich-3d && node build.mjs
   ```
   Bricht bei Syntaxfehlern ab → zuerst fixen.

2. **Testskript** ins Scratchpad legen (Vorlagen liegen dort oft schon: `smoke3d.js`,
   `stage*.js`). Grundgerüst:
   ```js
   const { chromium } = require('playwright-core');
   const browser = await chromium.launch({
     executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
     args: ['--no-sandbox','--enable-unsafe-swiftshader'] });
   const page = await browser.newPage({ viewport:{width:390,height:844},
     hasTouch:true, deviceScaleFactor:2 });
   // pageerror + console-error sammeln!
   await page.goto('file:///…/koenigreich-3d/index.html?dbg=1');
   await page.click('#btnStart', { timeout: 30000 });
   ```

3. **Debug-API `window.DBG`** (nur mit `?dbg=1`): `state`, `cam`,
   `addBuilding/spawnSoldier/spawnEnemy/spawnAiRaid/tryUpgrade/destroyBuilding/
   repairBuilding/fellTree/applyTerraform/startExpedition/satisfaction/isleOf`,
   Getter `soldiers/enemies/aiGuards/treeList/expeditions`.

4. **Zeitlupe beachten:** SwiftShader ⇒ Spielzeit ≈ 0,3× Echtzeit. Wartezeiten
   verdreifachen oder State-Timer direkt setzen.

5. **Pflicht-Checks:** keine Konsolenfehler · Rathaus per Tap wählbar · ein Gebäude
   über die echte UI bauen (Karte antippen → `#pbOk`) · Ressourcen steigen ·
   `page.reload()` erhält den Spielstand.

6. Screenshots der geprüften Features machen (Kamera per `DBG.cam` ausrichten)
   und im Ergebnis auflisten.
