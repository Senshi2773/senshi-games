---
name: release-check
description: Komplette Abnahme-Pipeline vor einem Deployment von Königreich 3D – Build, Funktionstest, UI/UX-Stichprobe, Engine-Metriken und unabhängige Verifikation der neuen Änderungen. Einsetzen vor jedem Release („mach den Release-Check").
---

# Release-Check (vor jedem Deployment)

Pipeline in dieser Reihenfolge; bricht ein Schritt, erst fixen, dann von vorn.

1. **Build:** `cd koenigreich-3d && node build.mjs` – 0 Fehler.
2. **Funktionstest:** spieltester-Agent mit der Standard-Suite (Start, Bauen
   über echte UI, Wirtschaft, Kampf, Reload) – 0 Konsolenfehler.
3. **Neue Änderungen abnehmen:** verifizierer-Agent mit der wörtlichen
   Anforderung der Etappe (aus dem Spieler-Wunsch / FEATURES.md) – jede
   Zusage PASS, inkl. Alt-Save-Ladetest.
4. **UI-Stichprobe:** ui-ux-tester mindestens mit 320×568 und 390×844 –
   kein Overflow, Touch-Ziele ≥ 44 px in geänderten UI-Bereichen.
5. **Engine-Metriken** (nur bei Grafik-/Modell-Änderungen): engine-pruefer –
   Draw-Calls/Heap gegenüber letzter Messung nicht auffällig gewachsen,
   Leck-Test sauber.
6. **Doku:** FEATURES.md aktualisiert? Save-Format-Änderung notiert?
7. Danach Skill `spiel-deploy` (gleiche Artifact-URL!) und dem Spieler
   berichten: was neu, was getestet, Save-Kompatibilität.

Abkürzung erlaubt: Bei Mini-Fixes (reine Zahlen-/Text-Änderung) reichen
Schritte 1, 2, 6, 7 – im Bericht als „Kurz-Check" kennzeichnen.
