# ⚔️ Königreich 3D – Aufbau & Verteidigung

Die **Echt-3D-Version** des Aufbau-Strategiespiels (WebGL/Three.js): dieselbe Spielmechanik
wie die 2.5D-Version in `../koenigreich/`, aber mit richtiger 3D-Grafik – drehbare Kamera,
dynamische Schatten, Sonnenlauf mit Tag/Nacht, animiertes Wasser und Low-Poly-Look.

## 🎮 Steuerung

| Geste | Aktion |
|---|---|
| Ein Finger ziehen | Karte bewegen |
| Zwei Finger kneifen | Zoomen |
| Zwei Finger drehen | Kamera drehen |
| Tippen | Auswählen / Bauplatz wählen |
| Maus: Rad = Zoom, Q/E = Drehen | (Desktop) |

## 🛠️ Entwicklung

```bash
npm install        # three.js + esbuild
node build.mjs     # erzeugt index.html (eigenständig) und artifact.html
```

- `src/main.js` – kompletter Spielcode (Logik + 3D-Rendering)
- `template.html` – UI/CSS-Gerüst, in das der gebündelte Code eingebettet wird
- `index.html` – **generiert**, vollständig eigenständig (three.js inline, offline-fähig)

## ✨ Technik

- Three.js, komplett in eine HTML-Datei gebündelt (~550 kB, keine externen Requests)
- Terrain als eingefärbtes Höhen-Mesh aus Rausch-Feldern (organische Küsten, Hügel,
  Sandstrände, Seegrund), Wasser mit Vertex-Wellen-Shader
- Alle Gebäude prozedural aus Low-Poly-Primitiven, Echtzeit-Schatten (PCF-Soft-Shadow-Map)
- Wälder/Felsen/Grasbüschel als InstancedMesh (wenige Draw-Calls, mobiltauglich)
- Tag-/Nacht-Zyklus: wandernde Sonne, Dämmerungsfarben, Mondlicht, Sternenhimmel,
  emissive Fenster bei Nacht
- Spielstand-Autosave im localStorage
