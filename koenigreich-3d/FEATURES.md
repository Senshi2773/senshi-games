# 📋 Geplante Features & Korrekturen (Wunschliste)

Stand: 15.08.2026 – vom Spieler gesammelt, Umsetzung erfolgt auf Zuruf.

## ✅ Umgesetzt (Etappe 1, 15.08.2026)

1. ✅ **Kamera-Steuerung: Hoch/Runter war verdreht** – vertikale Zieh-Richtung invertiert.

2. ✅ **Baumfäll-Animation** – Bäume kippen jetzt sichtbar um (mit Aufprall,
   Blätter-Partikeln und Sound), bleiben kurz liegen und versinken dann.

3. ✅ **Arbeiter-System wie in Age of Empires** – Holzfäller und Steinbruch bekommen
   automatisch bis zu 2 Arbeiter aus der Bevölkerung. Sie laufen sichtbar zu
   Bäumen/Felsen im Einzugsgebiet, hacken dort (Partikel + Sound), tragen die
   Ladung zurück (sichtbar geschultert) und liefern Rohstoffe ab.
   - Einzugsgebiet vergrößert: Holzfäller Radius 5, Steinbruch Radius 4.
   - Bäume werden nach 3 Fuhren tatsächlich gefällt (mit Animation).
   - Der **Wald wächst langsam nach** (neue Bäume neben bestehenden).
   - Info-Panel zeigt Arbeiter und Ressourcen im Gebiet.

4. ✅ **Mehr Aufbauzeit** – erste Welle nach 5:30 (statt 3:00), Folgewellen alle ~3:10.

5. ✅ **Mauern** – neues Bauwerk (10 Holz + 15 Stein, 420 HP). Mauern blockieren
   Räuber (und alle Einheiten); festgelaufene Räuber greifen die Mauer an.
   Segmente richten sich automatisch an Nachbar-Mauern aus.

## 🔭 Später

6. ✅ **Handelsplattform / Markt.** (Etappe 5, 15.08.2026)
   **Markt** (2×2, ab Rathaus 2): Marktplatz mit zwei Ständen (gestreifte
   Markisen, Fässer, Kisten). Beim Antippen öffnet sich das Handels-Panel:
   alle 5 Rohstoffe in 50er-Paketen kaufen/verkaufen, Kurse verbessern sich
   mit jeder Ausbaustufe (Verkauf +8 %, Einkauf −6 % je Stufe); dazu passives
   Gold-Einkommen.

7. ✅ **KI-Gegner auf der Karte.** (Etappe 6, 15.08.2026)
   **Fürst Ragnar** siedelt sich auf der anderen Inselseite an (rote Standarten
   an allen Gebäuden) und baut sein Lager selbstständig aus: Rathaus, Häuser,
   Holzfäller, Farmen, Kasernen, Türme. Er sammelt Truppen, hält Wachen an der
   Basis und schickt nach einer Schonfrist (~6 Min.) regelmäßig Angriffstrupps
   gegen dein Dorf (rote Krieger, Richtungspfeil zeigt hin).
   **Zurückschlagen:** Feindliches Gebäude antippen → „⚔️ Armee: Angriff!" –
   deine Soldaten/Ritter marschieren hin, kämpfen gegen die Wachen und reißen
   Gebäude nieder. **Wird sein rotes Rathaus zerstört: SIEG** (+400 Gold).
   Die KI wird gespeichert und in bestehenden Spielständen automatisch
   nachgerüstet. (Zweiter KI-Gegner: mit der Mehr-Insel-Welt, Punkt 13.)

## ✅ Umgesetzt (Etappe 2, 15.08.2026)

8. ✅ **Gebäude-Stufen 1–3.** Alle Hauptgebäude sind ausbaubar (Button im
   Info-Panel). Jede Stufe bringt spürbare Verbesserungen:
   - Wohnhaus: +5/+8/+12 Bevölkerung, mehr Steuern · Rathaus: +5/+10/+16
   - Holzfäller/Steinbruch: 2/3/4 Arbeiter, mehr Ertrag je Fuhre, größerer Radius
   - Bauernhof: 1,0/1,5/2,2 Nahrung/s · Wachturm: mehr Schaden/Reichweite/Feuerrate
   - Kaserne: Armee-Limit +6/+8/+10 · alle: mehr Trefferpunkte
   - Sichtbar: Gebäude wachsen leicht, Stufen-Wimpel am Mast (Gold/Grün).
   - Andere Gebäude können nie höher sein als das Rathaus.

9. ✅ **Bedürfnis-System.** Drei Bedürfnisse ergeben die Zufriedenheit 😊 (HUD-Chip,
   antippen zeigt Aufschlüsselung): 🌾 Nahrung, 🛡️ Sicherheit (Soldaten/Türme vs.
   Wellenstärke), 🏠 Wohnraum (freie Kapazität). Wirkung: Bevölkerung wächst nur
   bei ≥ 60 %, Steuereinnahmen skalieren mit der Zufriedenheit, Rathaus-Ausbau
   verlangt ≥ 70 % + Bevölkerungsschwelle (10 bzw. 20).

### 🐛 Außerdem behoben (Spieler-Meldung: „Man sieht keine Gegner und es geht nicht weiter")
- Räuber konnten mit Zufalls-Versatz **im Wasser spawnen** und hingen dort unsichtbar
  fest → Spawn wird jetzt immer auf begehbares Land korrigiert.
- **Anti-Festhäng-Logik**: Räuber ohne Fortschritt (8 s, keine Mauer schuld) setzen an
  einem neuen Landepunkt an; nach 4 Minuten zieht sich eine hängende Welle komplett
  zurück (Failsafe – das Spiel geht immer weiter).
- **Sichtbarkeit**: roter Richtungspfeil am Bildschirmrand zeigt während eines Angriffs
  zum nächsten Gegner; jeder Räuber hat einen roten Bodenring.

10. ✅ **Terraforming – Terrain umbauen.** (Etappe 3, 15.08.2026)
    Zwei neue Werkzeuge in der Bauleiste: **„See ausheben"** (25 Gold, macht aus
    freiem Grasland Wasser) und **„Land aufschütten"** (30 Stein + 15 Holz, macht
    aus Ufer-Wasser neues Bauland). Das Gelände (Höhen, Ufer, Farben) wird live
    neu berechnet; Terraforming wird gespeichert.

11. ✅ **Gehege / Tierhaltung.** (Etappe 3)
    **Rentier-Gehege** (2×2, Zaun mit animierten Rentieren, Heu + Futtertrog):
    produziert Nahrung (0,8/1,2/1,8 je Stufe), pro Ausbaustufe ein Rentier mehr
    (2/3/4 sichtbar). Reittier-Nutzung fürs Militär kommt mit dem Militär-Ausbau.
    Dazu **Fischerhütte** (1×1): Arbeiter angeln sichtbar am Ufer von Seen im
    Einzugsgebiet (7 Nahrung/Fuhre, per Ausbau mehr) – See ausheben + Fischerhütte
    ergibt die erste Terraforming-Produktionskette.

12. ✅ **Verschiedene Ausbau-Richtungen.** (Etappe 5)
    Ab Rathaus Stufe 2 wählbar (Rathaus antippen): **⚔️ Militär-Doktrin**
    (+25 % Truppen-Stärke/HP, +20 % Turmschaden, Ausbildung 20 % billiger) oder
    **🏛️ Wirtschafts-Doktrin** (+20 % Produktion aller Betriebe und Arbeiter,
    +25 % Steuern). Wechsel jederzeit für 200 Gold; die aktive Doktrin steht im
    Rathaus-Panel und wird gespeichert.

13. ✅ **Schifffahrt & Besiedlung anderer Inseln.** (Etappe 7, 15.08.2026)
    - **Karte auf 64×64 vergrößert mit drei Inseln**: große Hauptinsel (Start)
      und zwei weitere. **Fürst Ragnar siedelt jetzt bevorzugt auf seiner
      eigenen Insel** und schickt seine Angriffe **per Schiff** (Boote sichtbar
      auf See, Richtungspfeil warnt).
    - **Hafen** (ab Rathaus 2, am Ufer bauen): Steg, Bootshaus, Laterne. Startet
      **Siedler-Expeditionen**: Ziel auf einer anderen Insel antippen →
      Segelschiff läuft aus → am Ziel entsteht ein **Vorposten** (Palisade,
      Wachhütte, Flagge) als neue Siedlung.
    - **Siedlungsgebiet-Mechanik** (Anno-Prinzip): Gebäude nur noch im Umkreis
      von Rathaus (R11, wächst je Stufe) oder Vorposten (R8, ausbaubar) —
      Expansion braucht Vorposten.
    - **Armee-Überfahrt**: Angriffsbefehl auf Ragnars Insel → Soldaten laufen
      zum Hafen, schiffen sich ein (jede Einheit ein Boot, Konvoi segelt) und
      landen am Feindufer; Heimreise automatisch per Ruderboot.
    - Terraforming kann **Landbrücken** schaffen (Insel-Zugehörigkeit wird live
      neu berechnet). Räuberwellen spawnen nur noch auf der Spieler-Insel.
    - ⚠️ Kartenformat geändert → alte Spielstände starten neu (Save v2).

14. ✅ **Material-Ketten + Tiefen-Bergbau** (Etappe 4, 15.08.2026 – erste Stufe).
    - Neue Rohstoffe: **⛏️ Erz** und **⚙️ Eisen** (HUD-Chips erscheinen erst,
      wenn die Kette freigeschaltet ist).
    - **Erzmine** (ab Rathaus Stufe 3, neben Felsen): fördert Erz aus der Tiefe –
      Förderturm, Stollen und Lore als 3D-Modell.
    - **Schmiede** (ab Rathaus Stufe 2): schmilzt Erz + Holz kontinuierlich zu
      Eisen (Esse mit Glut, Amboss, Schornstein-Rauch).
    - Eisen schaltet frei: **🛡️ Ritter** (Kaserne ab Stufe 3; doppelt so stark
      wie Soldaten, eigenes 3D-Modell mit Helm, Schwert und Schild) und wird für
      die **Ausbaustufen 4–5** wichtiger Gebäude benötigt.
    - Später gemäß Wunschliste: weitere Materialien (Lithium …), Geräte, Fahrzeuge.

### ✅ Außerdem in Etappe 4: **5 Ausbaustufen statt 3**
    (In Etappe 8 auf 35 Stufen erweitert, siehe Punkt 15.)

## 🚀 Etappe 8 (15.08.2026): Zeitalter bis Stufe 35 – Neuzeit & Zukunft

15. ✅ **7 Zeitalter, Stufen bis 35.**
    🏰 Mittelalter (1–5) → ⚜️ Renaissance (6–10) → 🏭 Industriezeitalter (11–15) →
    ✈️ Moderne (16–20) → 💻 Digitalzeitalter (21–25) → 🚀 Raumfahrt (26–30) →
    🔮 Zukunft (31–35). Ausbaukosten ab Stufe 6 prozedural (mit Epochen-Ressourcen),
    Zeitalter-Anzeige im HUD, große Meldung bei jedem Epochenwechsel.
    - **Neue Ressourcen:** 🔩 Stahl (Stahlwerk, ab Rathaus 11: Eisen+Holzkohle),
      🛢️ Öl (Bohrturm, ab 16), 🔋 Lithium (tiefe Minen ab Stufe 21 + Planeten).
    - **Neue Einheiten** (Kaserne): 🛡️ **Panzer** (ab 16, 420 HP/48 Schaden),
      ✈️ **Flugzeug** (ab 18 – **fliegt** über Wasser und Mauern, 3D-Modell mit
      drehendem Propeller), ⚡ **Laser-Trooper** (ab 31, 80 Schaden, roter
      Laser-Effekt, leuchtendes Visier).
    - Tausender-Formatierung im HUD (8.890k), Armee-Limit global gedeckelt.

18. ✅ **Ruinen & Reparatur** (15.08.2026, Spieler-Meldung).
    - Zerstörte Gebäude verschwinden nicht mehr, sondern werden zu **qualmenden
      Ruinen** (Trümmerhaufen mit verkohlten Balken). Sie behalten Bauplatz,
      Ausbaustufe und – wichtig – **das Siedlungsgebiet** (zerstörter Vorposten
      sperrt die Insel nicht mehr!).
    - **Reparieren**: Ruine antippen → „🔨 Reparieren" (≈60 % der Baukosten,
      skaliert mit Stufe) → Gebäude ist mit 60 % HP wieder in Betrieb, Stufe
      bleibt erhalten. Alternativ „Trümmer räumen" für Platz.
    - Ruinen produzieren nichts, zählen nicht für Bevölkerung/Armee, Mauer-Ruinen
      blockieren nicht mehr, Gegner ignorieren Ruinen; Ruinen werden gespeichert.
    - **Bauplatz-Feedback**: Ist ein Platz ungültig, sagt das Spiel jetzt warum
      („Außerhalb des Siedlungsgebiets…", „Hafen braucht Wasserkachel").

17. ✅ **Ressourcen-Balance & Kampf-Beute** (15.08.2026).
    - **Aufforstung:** Wald wächst mit dem Zeitalter schneller nach (Stufe 35:
      ~6×) und neue Bäume sprießen bevorzugt in Holzfäller-Einzugsgebieten –
      Holz bleibt dauerhaft verfügbar. Stein/Erz/Öl/Nahrung/Lithium sind ohnehin
      unerschöpflich.
    - **Beute von Gegnern:** Räuber droppen Gold + Holz + Nahrung (skaliert mit
      der Welle); Ragnars Krieger zusätzlich Eisen, ab der Moderne auch Stahl.
      Beute wird gesammelt und als „💰 Beute: …"-Meldung angezeigt.
    - **Plündern:** Zerstörte KI-Gebäude geben ~40 % ihrer Baukosten als Beute.

19. ✅ **Mauern verbinden sich, Tore & Türme in der Mauer** (Etappe 11, 15.08.2026,
    Spieler-Meldung).
    - **Mauer-Verbindungen:** Mauersegmente bestehen jetzt aus Pfeiler + vier
      Verbindungsarmen und schließen automatisch lückenlos an Nachbarn an –
      auch an Ecken, T-Stücken und Kreuzungen. Freistehende Mauern zeigen ein
      kurzes Standardsegment.
    - **🚪 Tor** (neues Gebäude, 25 Holz + 20 Stein, ausbaubar): wird direkt in
      die Mauerlinie gebaut und richtet sich automatisch an ihr aus (zwei
      Flankentürme, Bogen, offene Torflügel). **Eigene Einheiten passieren das
      Tor, Feinde nicht** – die Wegfindung unterscheidet jetzt Freund/Feind.
    - **Türme in der Mauer:** Wehrtürme verbinden sich mit angrenzenden
      Mauern/Toren zu einer durchgehenden Befestigungslinie.

20. ✅ **Agenten & Skills für die Spielentwicklung** (15.08.2026, auf Wunsch).
    Im Repo unter `.claude/` als wiederverwendbare Werkzeuge:
    - **Agenten:** `spieltester` (Headless-Playwright-Tests + Screenshots),
      `feature-entwickler` (kennt die Architektur von main.js und alle
      Integrationspunkte), `balance-analyst` (rechnet Progression/Kampf durch,
      read-only).
    - **Skills:** `/spiel-testen` (Build + Smoke-Suite), `/spiel-deploy`
      (Artifact + PR, gleiche URL), `/neues-gebaeude` (13-Punkte-Checkliste
      für neue Gebäudetypen).

## 🔧 Etappen 13–15 (15.08.2026): Befunde der Agenten-Prüfrunde behoben

21. ✅ **Spiellogik-Fixes** (Etappe 13, Befunde von verifizierer/balance-analyst).
    - Wachturm schließt die Mauerlinie jetzt wirklich: Feinde können die
      Turm-Kachel nicht mehr passieren (eigene Einheiten schon); festhängende
      Gegner greifen Türme in der Linie an wie Mauern.
    - Tor-HP 350 → 480 (war schwächer als die Mauer = Sollbruchstelle).
    - Markt-Exploit geschlossen: Kaufen bleibt auf jeder Stufe teurer als
      Verkaufen (vorher ab Stufe 7 Geld-Perpetuum-mobile).

22. ✅ **UI/Touch-Überarbeitung** (Etappe 14, Befunde des ui-ux-testers).
    Systemknöpfe (Pause/Ton/Menü) immer sichtbar und 44 px groß; Topbar auf
    schmalen Handys mehrzeilig (Gold/Bevölkerung/Zufriedenheit sofort sichtbar);
    „✓ Bauen" bricht nicht mehr um; Info-Panel mit ✕-Button und ≥44-px-Buttons;
    Zahlen ab 1 Mio. als „1.2M".

23. ✅ **Balance-Überarbeitung** (Etappe 15, Befunde des balance-analysts).
    - Ausbaukosten ab Stufe 6 wachsen aus den Handkosten des jeweiligen
      Gebäudes weiter: kein Preissturz bei L6, Mauern/Häuser bleiben billig,
      Türme bezahlbar (Verteidigung skaliert wieder mit).
    - Eisen-Engpass entschärft (Wachstum 1,15 statt 1,22; Schmelzrate +55 %/
      Stufe), Epochen-Ressourcen nur noch für Großbauten.
    - Zufriedenheits-Deadlock behoben (Sicherheitsbedarf bei Welle 40
      gedeckelt), Einheiten skalieren mit der Kasernen-Stufe (+6 %/Stufe),
      Armee-Limit 60, Wellen entschärft (Anzahl w·1,0, HP-Wachstum 0,12),
      Beute normalisiert (Gold skaliert, Holz-Flut gedeckelt).

24. ✅ **Engine-Optimierung** (Etappe 16, Befunde des engine-pruefers).
    GPU-Speicherleck beim Zerstören/Reparieren/Abreißen dicht (dispose an
    allen Entfern-Pfaden), Schattenwerfer 1114 → 549, Baum-Fällen/Nachwachsen
    ohne Vegetations-Voll-Rebuild (Slot-System), Icon-GL-Kontext wird nach
    dem Menü-Aufbau freigegeben (40 → 2 Lichter), Animations-Referenzen
    gecacht. Heap unter Last 17,4 → 14,9 MB.

25. ✅ **Grafik-Politur** (Etappe 18, Spieler-Wunsch „schöner, weicher,
    natürlicher").
    Weiche Schattenkanten (PCFSoft), wärmeres goldenes Licht mit
    Tagesverlaufs-Füllicht, glühende Dämmerung, Distanz-Nebel; Figuren mit
    rundem Kopf (4 Hauttöne), Schultern, Gürtel und typischer Ausstattung
    je Einheit (Helm/Speer/Schild, Vollhelm mit Federbusch, Laser-Visier);
    echter Gang-Zyklus mit Arm-/Beinschwung, weichem Eindrehen, Vorlehnen
    und Idle-Atmen.

26. ✅ **USP-Paket: Die faire Zeitalter-Reise** (Etappe 17, aus der
    Marktanalyse des markt-analysts).
    - **📖 Stadt-Chronik:** Das Spiel protokolliert Meilensteine automatisch
      (Spielstart mit generiertem Reichsnamen, jeder Epochenwechsel und
      Rathaus-Ausbau, erste Mauer/Tor/Turm/Hafen, erster Vorposten, Sieg
      über Ragnar, jeder Planet, Rekord-Wellen) – mit Mini-Foto der Stadt
      zum jeweiligen Zeitpunkt. Neuer 📖-Knopf öffnet die Zeitleiste.
      Beim Epochenwechsel: 4-Sekunden-Kamerafahrt um das Rathaus (jede
      Eingabe bricht sie ab).
    - **✅ Anti-Timer-Siegel** im Start- und Chronik-Overlay: „Keine
      Wartezeiten · Keine Werbung · Keine Käufe · Kein Konto – für immer."
    - **💾 Spielstand kopieren/einfügen** (Chronik-Overlay): Save als Text
      in die Zwischenablage – als Backup und zum Teilen der eigenen Stadt
      (z. B. per Messenger), ganz ohne Server. Ungültige Importe werden
      abgewiesen, der alte Stand bleibt unangetastet.
    - Save-Format: neues Feld `chronicle` (v2-kompatibel, alte Stände
      laden fehlerfrei mit leerer Chronik).

27. ✅ **Große Inselwelt: 128×128, 7–8 Inseln, Biome, Minimap** (Etappe 19,
    15.08.2026, Spieler-Wunsch „viel zu wenig und mega kleine Inseln").
    - Karte auf 128×128 vervierfacht: 1 große Heimatinsel, 2–3 mittlere,
      3–4 kleine — seed-deterministisch verteilt, Startposition dynamisch.
    - **Insel-Biome** mit eigenem Look und Ressourcen-Boni für dortige
      Betriebe: 🌲 Waldland (Holz ×1,25, dichter Wald), ❄️ Schneeland
      (Stein+Erz ×1,25, weiße Nadelbäume), 🌋 Vulkanland (Erz+Öl ×1,3,
      Glutadern), 🏜️ Wüste (Gold ×1,25/Öl ×1,2), 🌿 Wiese (Nahrung ×1,15).
      Bonus-Zeile im Gebäude-Panel, Chronik-Einträge je Erst-Besiedlung;
      Ragnar siedelt auf einer mittleren Insel.
    - **🗺️ Minimap**: Übersichtskarte in Biomfarben mit Markern (Rathaus
      gold, Gebäude weiß, Vorposten grün, Ragnar rot, Angreifer orange)
      und Kamera-Rechteck; Tippen springt dorthin. Roter Pulspunkt am
      Knopf während eines Angriffs.
    - ⚠️ Kartenformat geändert → **Save v3**: alte Spielstände starten
      neu, die Stadt-Chronik wird übernommen („Aufbruch in eine neue
      Welt"-Eintrag).
    - Performance abgesichert: Terrain-Auflösung angepasst, Vegetation
      gedeckelt — 52 Draw-Calls Baseline bei 4-facher Fläche.

28. ✅ **Baumenü** (Etappe 20, Spieler-Wunsch). Bauleiste versteckt; 🔨-Knopf
    öffnet ein Bottom-Sheet mit Kategorien Wirtschaft/Militär/Infrastruktur.
    Nicht Freigeschaltetes ist unsichtbar; Freischaltungen melden sich per
    Toast + Gold-Badge am Knopf.

29. ✅ **Funktionsgebäude & Truppen-Entwicklung** (Etappen 21a/21b,
    Spieler-Wunsch, Spec vom spiel-designer).
    - 🔬 **Forschungsakademie**: je Einheit 3 Zweige (Waffen +10 %/
      Panzerung +12 %/Antrieb +8 %) × 3 Stufen, 15–40 s, retroaktiv,
      sichtbare Modell-Aufsätze (Brustplatte/Seitenschürzen). Wissen
      übersteht Ruinen.
    - 🏭 **Fahrzeugfabrik** / 🛩️ **Flugfeld**: schalten Panzer/Flieger
      frei und bilden sie aus, Armee-Beitrag, Luftpatrouille zählt wie
      3 Türme, Vulkan −10 % Fahrzeugkosten.
    - 🏺 **Speicherhaus** (Sammler-Aura +15–30 %), 🍺 **Taverne** +
      🎭 **Theater** (Kultur als 4. Bedürfnis ab Renaissance),
      🗼 **Leuchtturm** (Schiffe +40–60 %, Expeditionen −25 %),
      ⛑️ **Lazarett** (Heil-Aura, Schnee +25 %), 🎖️ **Verteidigungs-HQ**
      (Armee bis 75, Reparatur-Aura für Befestigungen, max. 1).

30. ✅ **Nacht-Sichtbarkeit & Hafen-Umbau** (Spieler-Meldungen).
    - Nacht ist jetzt eine helle Mondlicht-Szene (gemessene Bildhelligkeit
      46 % des Tages statt 7 %) — spielbar auf dem Handy, Stimmung bleibt
      (Sterne, leuchtende Fenster/Laternen).
    - Hafen komplett neu: richtet sich automatisch zur Wasserseite aus
      (auch bestehende Häfen beim Laden), Steg führt mit Pfählen übers
      Wasser, Bootshaus mit Tor zur See, Steg-Laterne (leuchtet nachts),
      vertäutes Ruderboot. Leuchtturm dreht sich ebenfalls zum Wasser.

16. ✅ **Zufällig generierte Planeten.**
    **Raumhafen** (ab Rathaus 26, mit Startrampe, Rakete, Kontrollturm und
    Antennenschüssel): „🚀 Raumschiff starten" → Rakete hebt sichtbar mit
    Flammen ab → nach der Mission wird ein **zufälliger Planet** generiert
    (Name wie „Braion-31", Typ: Kristallwelt/Eisplanet/Vulkanplanet/
    Wüstenplanet/Goldmond) und **kolonisiert**: Er liefert dauerhaft Ressourcen
    (v. a. Lithium). Kosten steigen je Kolonie; kolonisierte Planeten sind als
    farbige Himmelskörper am Firmament sichtbar; Kolonien-Liste im Raumhafen-Panel.
