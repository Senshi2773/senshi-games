---
name: spiel-deploy
description: Deployt den aktuellen Stand von Königreich 3D auf den bestehenden Artifact-Link des Spielers und pusht die Änderungen in den PR. Einsetzen nach erfolgreichem Test („deploye das Spiel").
---

# Spiel deployen

Reihenfolge strikt einhalten – erst testen (Skill `spiel-testen`), dann deployen.

1. **Build aktuell?**
   ```bash
   cd koenigreich-3d && node build.mjs
   ```

2. **Artifact veröffentlichen** – WICHTIG: immer derselbe Dateipfad, damit die
   bestehende URL des Spielers erhalten bleibt:
   ```bash
   cp koenigreich-3d/artifact.html <scratchpad>/koenigreich-artifact.html
   ```
   Dann `Artifact`-Tool mit genau diesem Pfad aufrufen (Favicon ⚔️ beibehalten,
   sprechendes `label` je Version, z. B. `etappeN-kurzname`).
   Die Spiel-URL des Spielers:
   `https://claude.ai/code/artifact/8b3d4f3b-cbb8-483e-bfe2-acafb9cc57a6`

3. **Committen & pushen** (Branch `claude/mobile-strategy-game-1ckbkx`):
   - `FEATURES.md` aktualisieren (erledigte Punkte abhaken, Neues dokumentieren)
   - Deutsche Commit-Message: Was + Warum + „Getestet:"-Absatz mit Messwerten
   - `git push -u origin claude/mobile-strategy-game-1ckbkx`

4. **Dem Spieler melden:** Link, was neu ist, was getestet wurde, ob der
   Spielstand kompatibel bleibt (Save-Format-Änderungen IMMER erwähnen).
