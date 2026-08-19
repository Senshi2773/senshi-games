# Die sieben Geißlein und der liebe Wolf 🐐🐺

Ein liebevolles Märchenspiel für Kinder **ab 5 Jahren** – frei nach dem Grimm-Märchen,
aber mit einem **lieben Wolf**, der mit den Geißlein spielt statt sie zu erschrecken.

Das Spiel ist eine **Progressive Web App (PWA)**: Sie läuft auf **Android und iPhone**
direkt im Browser, lässt sich wie eine App auf den Startbildschirm legen und
funktioniert danach auch **offline**.

## Die drei Mini-Spiele

| Spiel | So geht's |
|---|---|
| 🙈 **Verstecken suchen** | Drei Räume nacheinander (Wohnzimmer, Küche, Garten) mit je **11–12 Verstecken – aber nur in 7 steckt ein Geißlein**, jede Runde zufällig neu. Man muss also wirklich suchen! Belegte Verstecke wackeln ab und zu und man hört ein leises Kichern. Jedes Geißlein hat einen Namen (Lotte, Max, Mimi, Paul, Frieda, Emil, Lina). |
| 🃏 **Paare finden** | Memory mit acht Motiv-Paaren aus der Geschichte. |
| 🎂 **Kuchen backen** | Mit dem lieben Wolf backen: Zutaten in Rezept-Reihenfolge antippen (Brokkoli und Zwiebel gehören nicht hinein!), kräftig rühren, ab in den Ofen. Der selbstgebackene Kuchen bringt beim Picknick zwei Extra-Stücke. |
| 🧺 **Picknick-Spiel** | Erst fallen Leckereien vom Himmel: Kekse, Bonbons, Äpfel und Erdbeeren fangen – aber Brokkoli, Zwiebeln und Karotten vorbeifallen lassen! Danach das Picknick: alle Leckereien einzeln an die namentlich vorgestellten Geißlein und den Wolf verteilen. |
| 🏅 **Sticker-Album** | Für jedes geschaffte Spiel gibt es einen Sammel-Sticker (12 Stück, bleiben gespeichert). |

**Schwierigkeit beim Verstecken** (Schalter auf dem Startbildschirm, wird gespeichert):

- 🐣 **Klein**: beliebig viele Versuche. Nach vier leeren Verstecken wechseln die
  übrigen Geißlein kichernd ihr Versteck – ein Spiel-Ereignis, keine Strafe.
- 🦊 **Groß**: vier Herzen zeigen die Versuche. Sind sie aufgebraucht, verstecken
  sich alle Geißlein des Raums neu und die Suche im Raum beginnt von vorn.

Kindgerecht umgesetzt:

- **Kein Verlieren möglich** – es gibt nur Erfolgserlebnisse, Jubel und Konfetti.
- **Kein Lesen nötig** – alle Anleitungen werden auf Wunsch **vorgelesen**
  (Sprachausgabe des Geräts, per 🗣️-Taste an/aus).
- **Große Tipp-Flächen**, langsames Tempo, fröhliche Klänge (per 🔊-Taste an/aus).
- **Sanfte Hintergrundmusik** mit Bassbegleitung (per 🎵-Taste an/aus), die
  Geißlein meckern hörbar „Määäh", der liebe Wolf macht „Wuff wuff" – auch die
  Tiere auf dem Startbildschirm antworten beim Antippen. Fürs Vorlesen sucht
  sich das Spiel automatisch die natürlichste deutsche Stimme des Geräts aus.
  Hinweis: Handy-Browser erlauben Ton erst nach der ersten Berührung – die Musik
  beginnt darum mit dem ersten Tippen.
- Keine Werbung, keine Käufe, keine Internetverbindung nötig, keine Datensammlung.

## Eigene Stimmen aufnehmen (statt Computer-Stimme)

Die Ansagen können von der Familie selbst eingesprochen werden – das klingt
schöner als jede Computer-Stimme:

1. Kurze MP3s aufnehmen (Handy-Sprachmemo reicht) und in einen neuen Ordner
   `stimmen/` legen. Dateinamen = Ansage-Schlüssel, z. B.:
   `verstecken.mp3`, `memory.mp3`, `backen.mp3`, `fangen.mp3`, `picknick.mp3`
   (die Spielanleitungen), `ruehren.mp3`, `ofen.mp3`, `raum-kueche.mp3`,
   `raum-garten.mp3`, `raum-neu.mp3`, `neu-verstecken.mp3`, `picknick-los.mp3`.
   Die passenden Texte stehen in `js/spiel.js` (Objekt `hilfen` und die
   `vorlesen(...)`-Aufrufe mit zweitem Parameter).
2. In `js/spiel.js` ganz oben `EIGENE_STIMMEN = true` setzen.
3. Fehlt eine Datei, springt automatisch die Computer-Stimme ein. Dynamische
   Sätze (Namen, Zahlen) werden weiterhin von der Computer-Stimme gesprochen.

## Ausprobieren am Computer

Im Ordner `sieben-geisslein-spiel` einen kleinen Webserver starten:

```bash
python3 -m http.server 8000
```

Dann im Browser `http://localhost:8000` öffnen. (Direktes Öffnen der `index.html`
per Doppelklick funktioniert auch, nur der Offline-Modus ist dann aus.)

## Auf die Handys bringen (ohne App-Store)

1. Den kompletten Ordner `sieben-geisslein-spiel/` per FTP auf den Webspace
   hochladen (z. B. Strato, wie in `../baumann-familienseite/ANLEITUNG-STRATO.md`
   beschrieben) – **wichtig: mit HTTPS aufrufen**, sonst gibt es keinen
   Offline-Modus und keine Installation.
2. Auf dem Handy die Adresse öffnen, z. B. `https://ihre-domain.de/sieben-geisslein-spiel/`.
3. **Android (Chrome):** Menü ⋮ → „App installieren" bzw. „Zum Startbildschirm hinzufügen".
4. **iPhone (Safari):** Teilen-Symbol □↑ → „Zum Home-Bildschirm".

Danach startet das Spiel wie eine richtige App im Vollbild – auch offline.

## Später in die App-Stores?

Der Spielordner ist komplett eigenständig (HTML/CSS/JS ohne Abhängigkeiten) und
kann unverändert mit [Capacitor](https://capacitorjs.com/) in echte
Android-/iOS-Apps verpackt werden, falls eine Veröffentlichung bei Google Play /
im Apple App Store gewünscht ist. Dafür sind Entwicklerkonten bei Google (einmalig
25 $) und Apple (99 $/Jahr) nötig.

## Technik

- Reines HTML/CSS/JavaScript, keine Frameworks, keine Build-Schritte.
- Grafiken als eingebettete SVGs, Töne per Web Audio API synthetisiert –
  dadurch nur wenige, kleine Dateien.
- Vorlesen über die Web Speech API (deutsche Stimme des Geräts).
- `sw.js` (Service Worker) + `manifest.webmanifest` machen die Seite installierbar
  und offline-fähig. Beim Ändern von Dateien die Versionsnummer `CACHE` in
  `sw.js` hochzählen, damit Handys die neue Version laden.

## Test

`tests/rauchtest.js` klickt mit einem echten (unsichtbaren) Chrome-Browser alle
drei Spiele einmal komplett durch und meldet Konsolenfehler:

```bash
npm install playwright   # einmalig
node tests/rauchtest.js
```
