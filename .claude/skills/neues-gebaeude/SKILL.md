---
name: neues-gebaeude
description: Rezept zum Hinzufügen eines neuen Gebäudetyps in Königreich 3D – alle Integrationspunkte in der richtigen Reihenfolge, damit nichts vergessen wird (Panel, Wirtschaft, Save, Icons). Einsetzen, wenn ein neues Gebäude oder eine neue Produktionskette gebaut werden soll.
---

# Neues Gebäude einbauen (koenigreich-3d/src/main.js)

Checkliste in dieser Reihenfolge abarbeiten – jeder Punkt hat feste Ankerstellen:

1. **`BT`-Eintrag** (Abschnitt SPIELDATEN): `{ name, w, h, hp, cost, desc }` plus
   passendes Verhalten-Flag:
   - `prod:{res:rate}` = passive Produktion (braucht 2 Arbeiter via workRatio)
   - `gather:{res,amount}, needs:'tree'|'rock'|'water', radius` = Arbeiter-Betrieb
   - `smelt` = Umwandler (Branch in `economy()` ergänzen!)
   - `tower:{...}` / `wall:true` / `gate:true` / `market` / `harbor` / `space`
   - `cap:` Bevölkerung, `gold:` Steuern, `req:` Mindest-Rathausstufe (zeigt 🔒)
2. **`BUILDABLE`**: an sinnvoller Position einfügen (Bauleisten-Reihenfolge).
3. **`UPG`**: 4 Kostenstufen (Stufe 2–5); ab 6 rechnet `upgradeCost()` automatisch.
4. **Skalierungs-Helfer** prüfen: eigene Rate in `prodRate`/`smeltRate` ergänzen,
   falls das Gebäude produziert/umwandelt.
5. **3D-Modell**: Case in `makeBuilding(t)` – Low-Poly aus `bx(w,h,d,mat,x,y,z)`,
   `cyl`, `prism`; Materialien aus `M` oder `std(0xRRGGBB)`. Fundament-Box ~0.4
   tief versenken (Hanglagen!). Animierte Teile per `name` markieren und im
   Gebäude-Abschnitt der `loop()` ansteuern.
6. **`PENNANT_Y`**: Höhe für Stufen-Wimpel eintragen.
7. **`SMOKE_OFF`**: optional Schornstein-Versatz für Rauch.
8. **Info-Panel**: Stats-Zeile und ggf. Buttons in `showBuildingInfo` (Muster:
   `b.market`/`b.harbor`/`b.space`-Branches).
9. **Wirtschaft**: Branch in `economy()` falls Sonderlogik; `bd.ruin` wird dort
   bereits übersprungen.
10. **Placement-Sonderregeln**: falls nötig in `canPlace` (Muster: `harbor` braucht
    Wassernachbar) und Hinweis in `placingHint`.
11. **Save/Load**: Gebäude werden generisch gespeichert (`t,x,y,hp,l,r`) – nur
    NEUE Zustandsfelder brauchen Einträge in `save()` UND `load()`.
12. **Icon**: automatisch (`makeIcon` rendert das 3D-Modell) – nichts zu tun.
13. **Build + Test**: `node build.mjs`, dann Skill `spiel-testen`; neues Gebäude
    per `DBG.addBuilding` platzieren und Screenshot machen.
