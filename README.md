# 🎮 senshi-games

Meine Spiele-Projekte — entwickelt mit Claude Code.

## ⚔️ Königreich 3D — Aufbau & Verteidigung

Ein echtes 3D-Aufbau-Strategiespiel (Three.js) im Stil von *Age of Empires* /
*Anno* / *Settlement Survival* — als **einzelne Offline-HTML-Datei**, optimiert
fürs Handy.

**Spielen:** `koenigreich-3d/index.html` im Browser öffnen — keine Installation,
kein Server, kein Konto. ✅ Keine Wartezeiten · Keine Werbung · Keine Käufe.

- 🏰 **7 Zeitalter, 35 Ausbaustufen**: Mittelalter → Zukunft, mit Panzern,
  Flugzeugen, Laser-Truppen und Raumschiffen
- 🗺️ **128×128-Inselwelt** mit 7–8 Inseln und Biomen (Wald, Schnee, Vulkan,
  Wüste) samt Ressourcen-Boni, Minimap, Schifffahrt und Siedler-Expeditionen
- 🔬 **Forschung & Funktionsgebäude**: Akademie (Truppen-Upgrades mit sichtbaren
  Modell-Aufsätzen), Fahrzeugfabrik, Flugfeld, Lazarett, Leuchtturm,
  Verteidigungs-HQ, Kultur-Gebäude
- ⚔️ **Verteidigung & KI**: Räuberwellen, KI-Gegner „Fürst Ragnar",
  verbundene Mauern mit Toren und Wehrtürmen, Ruinen mit Reparatur
- 🚀 **Planeten-Kolonien**, 📖 **Stadt-Chronik** mit Mini-Fotos der eigenen
  Stadt, 💾 Spielstand-Export per Zwischenablage

Details und Feature-Historie: [`koenigreich-3d/FEATURES.md`](koenigreich-3d/FEATURES.md)

**Entwickeln:** `cd koenigreich-3d && node build.mjs` baut die spielfertige
`index.html` aus `src/main.js` + `template.html`.

### 🕰️ Königreich (Legacy)

`koenigreich/` enthält die ursprüngliche 2.5D-Version (Canvas-Iso-Sprites) —
der Vorgänger, aus dem Königreich 3D entstanden ist.

## 🛠️ Entwicklungs-Team (Claude Code)

`.claude/` enthält das komplette Spielentwicklungs-Studio als Agenten und
Skills: spieltester, feature-entwickler, balance-analyst, verifizierer,
ui-ux-tester, engine-pruefer, spiel-designer, grafik-artist, sound-designer,
produzent und markt-analyst — plus die Skills `/spiel-testen`, `/spiel-deploy`,
`/neues-gebaeude` und `/release-check`. Der Abgleich mit echten Studio-Rollen
steht in [`.claude/TEAM.md`](.claude/TEAM.md).
