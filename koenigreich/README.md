# ⚔️ Königreich – Aufbau & Verteidigung

Ein Aufbau-Strategiespiel im Stil von *Age of Empires* / *Settlement Survival* – komplett
als einzelne HTML-Datei, optimiert fürs Handy (Touch-Steuerung), ohne Installation und
ohne Internetverbindung spielbar.

## 📱 Auf dem Handy spielen

**Am einfachsten über GitHub Pages:**

1. Im Repository auf GitHub: **Settings → Pages → Source: „Deploy from a branch"**,
   Branch `main` (Ordner `/`) wählen und speichern.
2. Nach ca. 1 Minute ist das Spiel erreichbar unter:
   `https://<dein-benutzername>.github.io/private/koenigreich/`
3. Link auf dem Handy öffnen – fertig. Über „Zum Startbildschirm hinzufügen" läuft es
   wie eine App im Vollbild.

Alternativ: die Datei `index.html` aufs Handy schicken (z. B. per Mail/Cloud) und im
Browser öffnen – das Spiel ist vollständig offline-fähig.

## 🎮 So spielst du

| Geste | Aktion |
|---|---|
| Ziehen | Karte bewegen |
| Zwei Finger kneifen | Zoomen |
| Tippen | Gebäude/Baum auswählen, Bauplatz wählen |

- **Rohstoffe:** Holz 🪵, Stein 🪨, Nahrung 🌾 und Gold 🪙.
- **Holzfäller** neben Bäume, **Steinbruch** neben Felsen bauen – die Umgebung bestimmt
  die Produktionsrate.
- **Wohnhäuser** erhöhen die Bevölkerung; mehr Bevölkerung = mehr Arbeiter = mehr Produktion.
- Dein Volk **isst Nahrung** – ohne Bauernhöfe wandern Bewohner ab.
- In regelmäßigen **Wellen** greifen Räuber an: **Wachtürme** bauen und in der **Kaserne**
  Soldaten ausbilden. Fällt das **Rathaus**, ist das Spiel verloren.
- Einzelne Bäume kannst du antippen und **fällen** für Sofort-Holz.
- Der Spielstand wird **automatisch gespeichert** (im Browser).

## ✨ Technik & Grafik

- Isometrische 2.5D-Grafik, komplett prozedural im Canvas gerendert (keine Bild-Assets):
  Fachwerkhäuser, Tag-/Nacht-Zyklus mit leuchtenden Fenstern und Sternenhimmel,
  animiertes Wasser, schwankende Bäume, Rauch- und Kampfpartikel, ziehende Wolken
  mit Schatten.
- Zufällig generierte Insel-Karte (pro Spielstand ein eigener Seed).
- Läuft in jedem modernen Browser (Chrome, Safari, Firefox) – eine Datei, keine
  Abhängigkeiten.
