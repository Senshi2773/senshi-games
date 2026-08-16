# Entwicklungs-Team „Königreich 3D" – Agenten, Skills & Studio-Abgleich

Stand: 15.08.2026 (Etappe 12)

## Das Team

**Agenten** (`.claude/agents/`) – eigenständige Rollen mit eigenem Arbeitsauftrag:

| Agent | Rolle im Studio | Macht |
|---|---|---|
| produzent | Producer / Projektleitung | Backlog, Etappenplanung, Agent-Koordination, Release-Checklisten |
| spiel-designer | Game Designer | Specs für neue Mechaniken, Progression, Abnahmekriterien |
| balance-analyst | Systems Designer (Zahlen) | rechnet Wirtschaft/Kampf/Progression durch, read-only |
| feature-entwickler | Gameplay-Programmierer | setzt Features/Bugfixes in `src/main.js` um |
| grafik-artist | 3D-Artist / Art Director / Animator / VFX | Low-Poly-Modelle, Animationen, Licht, Partikel (nur Optik) |
| sound-designer | Sound Designer | synthetische WebAudio-Effekte, Klangkonzept |
| spieltester | QA-Tester (Funktion) | Headless-Testsuite, Screenshots, Messwerte |
| ui-ux-tester | UI/UX- & Frontend-Tester | Touch-Ziele, Viewports 320→Tablet, Bedien-Flüsse |
| engine-pruefer | Engine-/Performance-Programmierer (Audit) | Draw-Calls, Speicherlecks, Frame-Budget |
| verifizierer | QA-Lead / Abnahme | adversariale Prüfung gegen die wörtliche Anforderung |

**Skills** (`.claude/skills/`) – feste Rezepte:

| Skill | Zweck |
|---|---|
| /spiel-testen | Build + Smoke-Suite (Standard nach jeder Änderung) |
| /release-check | volle Abnahme-Pipeline vor jedem Deployment |
| /spiel-deploy | Artifact auf dieselbe URL + Commit/Push in den PR |
| /neues-gebaeude | 13-Punkte-Checkliste für neue Gebäudetypen |

## Standard-Ablauf einer Etappe

```
Spieler-Wunsch
  → produzent (Etappe schneiden)
  → spiel-designer (Spec, bei vagen Wünschen)  + balance-analyst (Zahlen)
  → feature-entwickler (Code)  ∥  grafik-artist / sound-designer (Optik/Audio)
  → /release-check:  spieltester → verifizierer → ui-ux-tester → engine-pruefer
  → /spiel-deploy  → Bericht an den Spieler
```

## Abgleich mit einer echten Spieleentwicklungsfirma

Referenz: typische Rollen eines kleinen/mittleren Studios (Indie bis ~50 Personen).

| Studio-Rolle | Hier abgedeckt durch | Status |
|---|---|---|
| Producer / Project Manager | produzent | ✅ |
| Game Designer (Mechaniken) | spiel-designer | ✅ |
| Systems/Economy Designer | balance-analyst + spiel-designer | ✅ |
| Level Designer | spiel-designer (Karte ist prozedural: `genMap`) | ✅ |
| Gameplay Programmer | feature-entwickler | ✅ |
| Engine-/Graphics-Programmierer | engine-pruefer (Audit) + feature-entwickler (Umsetzung) | ✅ |
| UI-Programmierer | feature-entwickler (`template.html`), geprüft vom ui-ux-tester | ✅ |
| Tools-Programmierer | DBG-Debug-API + Skills (Testgerüste) | ✅ |
| Art Director / 3D-Artist | grafik-artist (Stil-Bibel im Agenten) | ✅ |
| Animator / VFX-Artist | grafik-artist (prozedurale Animation, Partikel) | ✅ |
| UI/UX-Designer | ui-ux-tester (Prüfung + Vorschläge), Entwurf beim spiel-designer | ✅ |
| Sound Designer | sound-designer | ✅ |
| Komponist (Musik) | bewusst nicht: Oszillator-Loops nerven; echte Musik bräuchte Audiodateien und bricht das Eine-Datei-Offline-Prinzip | ⚠️ bewusste Lücke |
| QA-Tester | spieltester | ✅ |
| QA-Lead / Abnahme | verifizierer | ✅ |
| Kompatibilitäts-QA (Geräte) | ui-ux-tester (Viewports); echte Geräte testet der Spieler | ✅ teilweise |
| Build-/Release-Engineer (DevOps) | /spiel-deploy + /release-check + `build.mjs` | ✅ |
| Narrative Designer | entfällt (kaum Story); bei Bedarf spiel-designer | ➖ nicht nötig |
| Lokalisierung | entfällt (Spiel ist deutsch, ein Spieler) | ➖ nicht nötig |
| Community/Support | der Spieler meldet direkt im Chat | ➖ nicht nötig |
| Marketing / Monetarisierung / Data Analyst | entfällt (privates Spiel, keine Käufe, keine Telemetrie) | ➖ nicht nötig |
| Recht/Lizenzen | entfällt (eigene Assets, MIT-artige Abhängigkeit Three.js) | ➖ nicht nötig |

**Fazit:** Alle produktionsrelevanten Studio-Rollen sind besetzt (10 Agenten +
4 Skills). Die einzige echte Lücke ist Musik – eine bewusste technische
Entscheidung. Rollen wie Marketing/Lokalisierung entfallen, weil das Spiel ein
privates Ein-Spieler-Projekt ist; sollte sich das ändern, sind das die ersten
Rollen, die als Agenten nachzurüsten wären.
