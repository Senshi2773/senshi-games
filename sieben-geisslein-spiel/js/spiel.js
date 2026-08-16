/* Die sieben Geißlein und der liebe Wolf – Spiellogik */
(function () {
  "use strict";

  // Auf true setzen, wenn selbst aufgenommene MP3s im Ordner stimmen/ liegen
  // (Dateinamen siehe README, z. B. stimmen/verstecken.mp3). Dann werden die
  // Aufnahmen statt der Computer-Stimme abgespielt.
  var EIGENE_STIMMEN = false;

  var NAMEN = ["Lotte", "Max", "Mimi", "Paul", "Frieda", "Emil", "Lina"];

  // ---------- Einstellungen (bleiben gespeichert) ----------
  var einstellungen = {
    ton: true,
    musik: true,
    vorlesen: true,
    schwierig: "klein" // "klein" = ohne Limit, "gross" = nach 4 Fehlversuchen beginnt der Raum neu
  };
  try {
    var gespeichert = JSON.parse(localStorage.getItem("geisslein-einstellungen"));
    if (gespeichert) {
      einstellungen.ton = gespeichert.ton !== false;
      einstellungen.musik = gespeichert.musik !== false;
      einstellungen.vorlesen = gespeichert.vorlesen !== false;
      if (gespeichert.schwierig === "gross") einstellungen.schwierig = "gross";
    }
  } catch (e) { /* Standardwerte behalten */ }

  function einstellungenSpeichern() {
    try {
      localStorage.setItem("geisslein-einstellungen", JSON.stringify(einstellungen));
    } catch (e) { /* z.B. privater Modus – nicht schlimm */ }
  }

  // ---------- Töne (Web Audio, ohne Sounddateien) ----------
  var audioCtx = null;
  function holAudio() {
    if (!einstellungen.ton) return null;
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tonSpielen(frequenzen, dauer, art, lautstaerke) {
    var ctx = holAudio();
    if (!ctx) return;
    var start = ctx.currentTime;
    frequenzen.forEach(function (f, i) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = art || "sine";
      osc.frequency.value = f;
      var t = start + i * dauer;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(lautstaerke || 0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dauer);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dauer + 0.05);
    });
  }

  var klang = {
    tipp: function () { tonSpielen([520], 0.12, "sine", 0.12); },
    plopp: function () { tonSpielen([300, 480], 0.09, "triangle", 0.2); },
    kichern: function (leise) { tonSpielen([740, 880, 990, 880, 1050], 0.09, "sine", leise ? 0.06 : 0.14); },
    richtig: function () { tonSpielen([523, 659, 784], 0.14, "triangle", 0.16); },
    nanu: function () { tonSpielen([420, 350], 0.16, "sine", 0.12); },
    baeh: function () { tonSpielen([340, 260, 200], 0.13, "sawtooth", 0.07); },
    tick: function () { tonSpielen([880], 0.06, "square", 0.05); },
    ding: function () { tonSpielen([1047, 1319], 0.25, "sine", 0.18); },
    ruehr: function () { tonSpielen([260, 300], 0.07, "triangle", 0.08); },
    fanfare: function () { tonSpielen([523, 659, 784, 1047, 784, 1047], 0.16, "triangle", 0.18); },
    mampf: function () { tonSpielen([220, 180, 240, 190], 0.09, "square", 0.09); },

    // Geißlein-"Määäh": Sägezahn mit Vibrato und kräftigem Zittern (Tremolo)
    maeh: function (hoehe) {
      var ctx = holAudio();
      if (!ctx) return;
      var t = ctx.currentTime;
      var grundton = hoehe || 440 + Math.random() * 80;
      var osc = ctx.createOscillator();
      var vibrato = ctx.createOscillator();
      var vibratoStaerke = ctx.createGain();
      var tremolo = ctx.createOscillator();
      var tremoloStaerke = ctx.createGain();
      var zitterGain = ctx.createGain();
      var filter = ctx.createBiquadFilter();
      var gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(grundton, t);
      osc.frequency.linearRampToValueAtTime(grundton * 0.78, t + 0.55);
      vibrato.frequency.value = 6.5;
      vibratoStaerke.gain.value = 28;
      vibrato.connect(vibratoStaerke).connect(osc.frequency);

      // Das typische Meckern: schnelles Lauter-Leiser
      tremolo.frequency.value = 10;
      tremoloStaerke.gain.value = 0.45;
      zitterGain.gain.value = 0.65;
      tremolo.connect(tremoloStaerke).connect(zitterGain.gain);

      filter.type = "lowpass";
      filter.frequency.value = 1600;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.3, t + 0.06);
      gain.gain.setValueAtTime(0.3, t + 0.42);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.62);

      osc.connect(filter).connect(zitterGain).connect(gain).connect(ctx.destination);
      osc.start(t);
      vibrato.start(t);
      tremolo.start(t);
      osc.stop(t + 0.7);
      vibrato.stop(t + 0.7);
      tremolo.stop(t + 0.7);
    },

    // Freundliches "Wuff wuff" vom lieben Wolf
    wuff: function () {
      var ctx = holAudio();
      if (!ctx) return;
      var jetzt = ctx.currentTime;
      [0, 0.24].forEach(function (versatz) {
        var t = jetzt + versatz;
        var osc = ctx.createOscillator();
        var filter = ctx.createBiquadFilter();
        var gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(190, t);
        osc.frequency.exponentialRampToValueAtTime(105, t + 0.13);
        filter.type = "lowpass";
        filter.frequency.value = 550;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.28, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
        osc.connect(filter).connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.2);
      });
    }
  };

  // ---------- Hintergrundmusik: sanfte Melodie mit Bass in Endlosschleife ----------
  var TAKT = 0.36; // Dauer einer Viertelnote in Sekunden
  var MELODIE = [
    [523, 1], [659, 1], [784, 1], [659, 1],
    [880, 1], [784, 2], [0, 1],
    [698, 1], [659, 1], [587, 1], [659, 1],
    [523, 3], [0, 1],
    [587, 1], [659, 1], [698, 1], [587, 1],
    [784, 2], [659, 2],
    [587, 1], [523, 1], [587, 1], [659, 1],
    [523, 3], [0, 1],
    [659, 1], [784, 1], [880, 1], [784, 1],
    [1047, 2], [880, 2],
    [698, 1], [880, 1], [784, 1], [659, 1],
    [587, 3], [0, 1],
    [523, 1], [659, 1], [587, 1], [698, 1],
    [659, 1], [587, 1], [523, 2],
    [587, 1], [659, 1], [587, 1], [494, 1],
    [523, 3], [0, 1]
  ];
  var BASS = [131, 131, 98, 131, 98, 110, 98, 131, 131, 110, 98, 131, 131, 98, 110, 131];
  var musik = { timer: null, gain: null };

  function musikErlaubt() {
    return einstellungen.ton && einstellungen.musik;
  }

  function musikStart() {
    if (!musikErlaubt() || musik.timer) return;
    var ctx = holAudio();
    if (!ctx) return;
    if (!musik.gain) {
      musik.gain = ctx.createGain();
      musik.gain.connect(ctx.destination);
    }
    musik.gain.gain.setTargetAtTime(0.055, ctx.currentTime, 0.2);
    melodieSchleife(ctx.currentTime + 0.15);
  }

  function melodieSchleife(start) {
    var ctx = audioCtx;
    var t = start;
    MELODIE.forEach(function (note) {
      var dauer = note[1] * TAKT;
      if (note[0] > 0) {
        // Zwei leicht verstimmte Sinusstimmen klingen weich, nicht blechern
        [0, 2.5].forEach(function (schwebung, i) {
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = note[0] + schwebung;
          var staerke = i === 0 ? 1 : 0.4;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(staerke, t + 0.05);
          gain.gain.setValueAtTime(staerke, t + dauer * 0.6);
          gain.gain.linearRampToValueAtTime(0.001, t + dauer * 0.97);
          osc.connect(gain).connect(musik.gain);
          osc.start(t);
          osc.stop(t + dauer);
        });
      }
      t += dauer;
    });
    BASS.forEach(function (freq, i) {
      var tb = start + i * 4 * TAKT;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, tb);
      gain.gain.linearRampToValueAtTime(0.5, tb + 0.08);
      gain.gain.setValueAtTime(0.5, tb + 4 * TAKT * 0.5);
      gain.gain.linearRampToValueAtTime(0.001, tb + 4 * TAKT * 0.95);
      osc.connect(gain).connect(musik.gain);
      osc.start(tb);
      osc.stop(tb + 4 * TAKT);
    });
    musik.timer = setTimeout(function () {
      musik.timer = null;
      if (musikErlaubt()) melodieSchleife(t);
    }, (t - start - 0.3) * 1000);
  }

  function musikStopp() {
    if (musik.timer) {
      clearTimeout(musik.timer);
      musik.timer = null;
    }
    if (musik.gain && audioCtx) {
      musik.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
    }
  }

  // Musik darf erst nach der ersten Berührung starten (Regel der Handy-Browser)
  document.addEventListener("pointerdown", function () { musikStart(); });

  // ---------- Vorlesen (eigene Aufnahmen oder Sprachausgabe) ----------
  var deutscheStimme = null;
  function stimmeWaehlen() {
    if (!("speechSynthesis" in window)) return;
    var deutsche = window.speechSynthesis.getVoices().filter(function (stimme) {
      return /^de/i.test(stimme.lang);
    });
    if (!deutsche.length) return;
    var wunschliste = ["natural", "neural", "premium", "enhanced", "siri", "google", "anna", "petra", "helena", "katja", "vicki", "marlene"];
    function rang(stimme) {
      var name = stimme.name.toLowerCase();
      for (var i = 0; i < wunschliste.length; i++) {
        if (name.indexOf(wunschliste[i]) >= 0) return i;
      }
      return wunschliste.length;
    }
    deutsche.sort(function (a, b) { return rang(a) - rang(b); });
    deutscheStimme = deutsche[0];
  }
  if ("speechSynthesis" in window) {
    stimmeWaehlen();
    window.speechSynthesis.onvoiceschanged = stimmeWaehlen;
  }

  function sprachausgabe(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    var sprich = new SpeechSynthesisUtterance(text);
    sprich.lang = "de-DE";
    if (deutscheStimme) sprich.voice = deutscheStimme;
    sprich.rate = 0.95;
    sprich.pitch = 1.05;
    window.speechSynthesis.speak(sprich);
  }

  // schluessel: Dateiname einer eigenen Aufnahme (ohne .mp3), falls vorhanden
  function vorlesen(text, schluessel) {
    if (!einstellungen.vorlesen) return;
    if (EIGENE_STIMMEN && schluessel) {
      var aufnahme = new Audio("stimmen/" + schluessel + ".mp3");
      aufnahme.play().catch(function () { sprachausgabe(text); });
      return;
    }
    sprachausgabe(text);
  }

  var hilfen = {
    verstecken: "Die Geißlein haben sich versteckt – aber Achtung: Nicht in jedem Versteck steckt eins! Tippe auf die Möbel und such gut. Wenn ein Versteck wackelt, kichert da vielleicht jemand.",
    memory: "Tippe auf zwei Karten. Wenn die Bilder gleich sind, hast du ein Paar gefunden!",
    backen: "Der liebe Wolf backt einen Kuchen und du hilfst! Tippe die Zutaten in der richtigen Reihenfolge an – das Rezept oben zeigt dir, was als Nächstes drankommt.",
    fangen: "Fange Kekse, Bonbons, Äpfel und Erdbeeren für das Picknick! Aber Vorsicht: Brokkoli, Zwiebeln und Karotten wollen wir nicht im Korb. Lass sie einfach vorbeifallen!",
    picknick: "Picknickzeit! Tippe auf ein Leckerli und dann auf ein Geißlein oder den Wolf. Guten Appetit!"
  };

  // ---------- Bildschirm-Wechsel ----------
  var aktiverBildschirm = "start";
  function zeige(name) {
    document.querySelectorAll(".screen").forEach(function (s) {
      s.classList.remove("active");
    });
    document.getElementById("screen-" + name).classList.add("active");
    aktiverBildschirm = name;
  }

  // ---------- Fortschrittsanzeige ----------
  function fortschrittBauen(behaelter, anzahl, symbolId) {
    behaelter.innerHTML = "";
    for (var i = 0; i < anzahl; i++) {
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.classList.add("punkt");
      var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "#" + symbolId);
      svg.appendChild(use);
      behaelter.appendChild(svg);
    }
  }
  function fortschrittAn(behaelter, anzahl) {
    var punkte = behaelter.querySelectorAll(".punkt");
    for (var i = 0; i < punkte.length; i++) {
      punkte[i].classList.toggle("an", i < anzahl);
    }
  }

  function mischen(liste) {
    for (var i = liste.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tausch = liste[i];
      liste[i] = liste[j];
      liste[j] = tausch;
    }
    return liste;
  }

  // ---------- Sticker-Album ----------
  var STICKER = [
    { id: "geisslein", sym: "sym-geisslein", name: "Geißlein" },
    { id: "wolf", sym: "sym-wolf", name: "Lieber Wolf" },
    { id: "mama", sym: "sym-mama", name: "Mama Geiß" },
    { id: "keks", sym: "sym-keks", name: "Keks" },
    { id: "apfel", sym: "sym-apfel", name: "Apfel" },
    { id: "erdbeere", sym: "sym-erdbeere", name: "Erdbeere" },
    { id: "bonbon", sym: "sym-bonbon", name: "Bonbon" },
    { id: "kuchen", sym: "sym-kuchen", name: "Kuchen" },
    { id: "blume", sym: "sym-blume", name: "Blume" },
    { id: "uhr", sym: "sym-uhr", name: "Uhr" },
    { id: "herz", sym: "sym-herz", name: "Herz" },
    { id: "mehl", sym: "sym-mehl", name: "Mehlsack" }
  ];

  function stickerLaden() {
    try {
      var liste = JSON.parse(localStorage.getItem("geisslein-sticker"));
      return Array.isArray(liste) ? liste : [];
    } catch (e) { return []; }
  }
  function stickerSpeichern(liste) {
    try { localStorage.setItem("geisslein-sticker", JSON.stringify(liste)); } catch (e) { /* egal */ }
  }
  // Verschenkt einen zufälligen noch fehlenden Sticker (oder null, wenn alle da sind)
  function stickerVergeben() {
    var besitz = stickerLaden();
    var fehlend = STICKER.filter(function (s) { return besitz.indexOf(s.id) < 0; });
    if (!fehlend.length) return null;
    var neu = fehlend[Math.floor(Math.random() * fehlend.length)];
    besitz.push(neu.id);
    stickerSpeichern(besitz);
    return neu;
  }

  var albumGitter = document.getElementById("album-gitter");
  var albumZaehler = document.getElementById("album-zaehler");
  function albumZeigen() {
    var besitz = stickerLaden();
    albumZaehler.textContent = besitz.length + " / " + STICKER.length;
    albumGitter.innerHTML = "";
    STICKER.forEach(function (sticker) {
      var habIhn = besitz.indexOf(sticker.id) >= 0;
      var feld = document.createElement("div");
      feld.className = "album-feld" + (habIhn ? " besitzt" : "");
      feld.innerHTML =
        '<svg viewBox="0 0 100 130"><use href="#' + sticker.sym + '"/></svg>' +
        "<span>" + (habIhn ? sticker.name : "?") + "</span>";
      albumGitter.appendChild(feld);
    });
    zeige("album");
  }
  document.getElementById("btn-album").addEventListener("click", function () {
    klang.tipp();
    albumZeigen();
  });

  // ---------- Jubel & Konfetti ----------
  var jubel = document.getElementById("jubel");
  var jubelText = document.getElementById("jubel-text");
  var jubelSticker = document.getElementById("jubel-sticker");
  var jubelStickerBild = document.getElementById("jubel-sticker-bild");
  var jubelStickerText = document.getElementById("jubel-sticker-text");
  var nochmalSpiel = null;

  function feiern(text, nochmal) {
    nochmalSpiel = nochmal;
    jubelText.textContent = text;
    var sticker = stickerVergeben();
    if (sticker) {
      jubelStickerBild.querySelector("use").setAttribute("href", "#" + sticker.sym);
      jubelStickerText.textContent = "Neuer Sticker: " + sticker.name + "!";
      jubelSticker.hidden = false;
    } else {
      jubelSticker.hidden = true;
    }
    jubel.hidden = false;
    klang.fanfare();
    setTimeout(klang.wuff, 900);
    setTimeout(function () { klang.maeh(480); }, 1350);
    setTimeout(function () { klang.maeh(540); }, 1800);
    vorlesen(text + (sticker ? " Und du bekommst einen neuen Sticker: " + sticker.name + "!" : ""));
    konfettiRegen();
  }

  function konfettiRegen() {
    var farben = ["#e88f9b", "#8fc99b", "#f9d867", "#a9d3e8", "#e0a960"];
    for (var i = 0; i < 60; i++) {
      var stueck = document.createElement("div");
      stueck.className = "konfetti";
      stueck.style.left = Math.random() * 100 + "vw";
      stueck.style.background = farben[i % farben.length];
      stueck.style.animationDuration = 2 + Math.random() * 2.5 + "s";
      stueck.style.animationDelay = Math.random() * 0.8 + "s";
      document.body.appendChild(stueck);
      stueck.addEventListener("animationend", function () { this.remove(); });
    }
  }

  document.getElementById("btn-nochmal").addEventListener("click", function () {
    jubel.hidden = true;
    klang.tipp();
    if (nochmalSpiel) nochmalSpiel();
  });
  document.getElementById("btn-heim").addEventListener("click", function () {
    jubel.hidden = true;
    klang.tipp();
    zeige("start");
  });

  // ---------- Zwischenmeldung (Raumwechsel u.ä.) ----------
  function zwischenmeldung(text, danach, schluessel) {
    var kasten = document.createElement("div");
    kasten.className = "zwischenmeldung";
    kasten.textContent = text;
    document.body.appendChild(kasten);
    klang.richtig();
    vorlesen(text, schluessel);
    setTimeout(function () {
      kasten.classList.add("weg");
      setTimeout(function () {
        kasten.remove();
        if (danach) danach();
      }, 350);
    }, 2400);
  }

  // ==========================================================
  // Spiel 1: Verstecken suchen (nur 7 von ~12 Verstecken sind belegt)
  // ==========================================================
  var versteckFortschritt = document.getElementById("verstecken-fortschritt");
  var versteckAnweisung = document.getElementById("verstecken-anweisung");
  var versucheAnzeige = document.getElementById("versuche-anzeige");
  var szenen = Array.prototype.slice.call(document.querySelectorAll(".zimmer-szene"));
  var raumNamen = {
    wohnzimmer: "im Wohnzimmer",
    kueche: "in der Küche",
    garten: "im Garten"
  };
  var raumWechselText = {
    kueche: "Alle gefunden! Jetzt geht's in die Küche!",
    garten: "Super! Jetzt sucht draußen im Garten!"
  };
  var MAX_FEHLVERSUCHE = 4;
  var raumIndex = 0;
  var gefunden = 0;
  var fehlversuche = 0;
  var hinweisTimer = null;

  function aktiveSzene() { return szenen[raumIndex]; }
  function szenenVerstecke(szene) {
    return Array.prototype.slice.call(szene.querySelectorAll(".versteck"));
  }

  function versteckenStart() {
    raumIndex = 0;
    zeige("verstecken");
    raumZeigen();
    vorlesen(hilfen.verstecken, "verstecken");
    hinweiseStarten();
  }

  // 7 zufällige Verstecke belegen und den Geißlein Namen geben
  function versteckeAuslosen(szene) {
    var alle = szenenVerstecke(szene);
    alle.forEach(function (v) {
      v.classList.remove("belegt", "gefunden", "daneben", "zappelt");
      v.removeAttribute("data-geiss-name");
    });
    var namen = mischen(NAMEN.slice());
    mischen(alle.slice()).slice(0, 7).forEach(function (v, i) {
      v.classList.add("belegt");
      v.setAttribute("data-geiss-name", namen[i]);
    });
  }

  function raumZeigen() {
    gefunden = 0;
    fehlversuche = 0;
    fortschrittBauen(versteckFortschritt, 7, "sym-geisslein");
    versucheZeigen();
    szenen.forEach(function (szene, i) {
      // SVG-Elemente kennen die hidden-Eigenschaft nicht – Attribut direkt setzen
      if (i === raumIndex) szene.removeAttribute("hidden");
      else szene.setAttribute("hidden", "");
    });
    versteckeAuslosen(aktiveSzene());
    var raum = aktiveSzene().getAttribute("data-raum");
    versteckAnweisung.textContent =
      "Raum " + (raumIndex + 1) + " von 3: Findet die sieben Geißlein " + raumNamen[raum] + " – nicht überall steckt eins!";
  }

  // Anzeige der Fehlversuche (nur im Groß-Modus): 4 Herzen
  function versucheZeigen() {
    if (einstellungen.schwierig !== "gross") {
      versucheAnzeige.hidden = true;
      return;
    }
    versucheAnzeige.hidden = false;
    versucheAnzeige.innerHTML = "";
    for (var i = 0; i < MAX_FEHLVERSUCHE; i++) {
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 60 60");
      svg.classList.add("herz");
      if (i < MAX_FEHLVERSUCHE - fehlversuche) svg.classList.add("voll");
      var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "#sym-herz");
      svg.appendChild(use);
      versucheAnzeige.appendChild(svg);
    }
  }

  // Die noch nicht gefundenen Geißlein suchen sich neue Verstecke
  function neuVerstecken() {
    var szene = aktiveSzene();
    var alle = szenenVerstecke(szene);
    var offeneNamen = [];
    alle.forEach(function (v) {
      if (v.classList.contains("belegt") && !v.classList.contains("gefunden")) {
        offeneNamen.push(v.getAttribute("data-geiss-name"));
        v.classList.remove("belegt");
        v.removeAttribute("data-geiss-name");
      }
    });
    var frei = alle.filter(function (v) { return !v.classList.contains("gefunden") && !v.classList.contains("belegt"); });
    mischen(frei).slice(0, offeneNamen.length).forEach(function (v, i) {
      v.classList.add("belegt");
      v.setAttribute("data-geiss-name", offeneNamen[i]);
      v.classList.add("zappelt");
      setTimeout(function () { v.classList.remove("zappelt"); }, 900);
    });
    klang.kichern();
    setTimeout(function () { klang.kichern(); }, 250);
  }

  function versteckTippen(versteck) {
    if (aktiverBildschirm !== "verstecken") return;
    if (versteck.classList.contains("gefunden")) {
      klang.kichern();
      return;
    }

    // Leeres Versteck: Fehlversuch
    if (!versteck.classList.contains("belegt")) {
      versteck.classList.remove("daneben");
      void versteck.getBBox; // (kein Reflow nötig, Klasse reicht)
      versteck.classList.add("daneben");
      setTimeout(function () { versteck.classList.remove("daneben"); }, 600);
      klang.nanu();
      fehlversuche++;
      versucheZeigen();
      if (fehlversuche >= MAX_FEHLVERSUCHE) {
        fehlversuche = 0;
        if (einstellungen.schwierig === "gross") {
          // Harte Variante: Der Raum beginnt von vorn
          setTimeout(function () {
            zwischenmeldung("Ohh! Jetzt verstecken sich alle nochmal – neuer Versuch!", raumZeigen, "raum-neu");
          }, 400);
        } else {
          // Sanfte Variante: Die übrigen Geißlein wechseln ihr Versteck
          versucheZeigen();
          vorlesen("Hihi! Wir verstecken uns woanders!", "neu-verstecken");
          neuVerstecken();
        }
      } else {
        var uebrig = MAX_FEHLVERSUCHE - fehlversuche;
        vorlesen(["Hier ist niemand!", "Leer! Sucht weiter!", "Nanu, hier steckt keins!"][fehlversuche % 3] +
          (einstellungen.schwierig === "gross" ? " Noch " + uebrig + (uebrig === 1 ? " Versuch!" : " Versuche!") : ""));
      }
      return;
    }

    // Treffer!
    versteck.classList.add("gefunden");
    gefunden++;
    fortschrittAn(versteckFortschritt, gefunden);
    klang.plopp();
    setTimeout(function () { klang.maeh(); }, 130);
    var name = versteck.getAttribute("data-geiss-name") || "ein Geißlein";
    var ort = versteck.getAttribute("data-name") || "";
    if (gefunden < 7) {
      vorlesen("Da ist " + name + "! " + ort + "!");
    } else if (raumIndex < szenen.length - 1) {
      raumIndex++;
      var naechster = szenen[raumIndex].getAttribute("data-raum");
      setTimeout(function () {
        zwischenmeldung(raumWechselText[naechster], raumZeigen, "raum-" + naechster);
      }, 1000);
    } else {
      hinweiseStoppen();
      setTimeout(function () {
        feiern("Hurra! Alle Geißlein in allen drei Räumen gefunden! Der liebe Wolf ist mächtig stolz auf euch.", versteckenStart);
      }, 1000);
    }
  }

  document.querySelectorAll(".zimmer-szene .versteck").forEach(function (versteck) {
    versteck.addEventListener("click", function () { versteckTippen(versteck); });
  });

  // Alle paar Sekunden wackelt ein belegtes Versteck und jemand kichert leise
  function hinweiseStarten() {
    hinweiseStoppen();
    hinweisTimer = setInterval(function () {
      if (aktiverBildschirm !== "verstecken") return;
      var kandidaten = szenenVerstecke(aktiveSzene()).filter(function (v) {
        return v.classList.contains("belegt") && !v.classList.contains("gefunden");
      });
      if (!kandidaten.length) return;
      var wer = kandidaten[Math.floor(Math.random() * kandidaten.length)];
      wer.classList.add("zappelt");
      klang.kichern(true);
      setTimeout(function () { wer.classList.remove("zappelt"); }, 900);
    }, 6000);
  }
  function hinweiseStoppen() {
    if (hinweisTimer) {
      clearInterval(hinweisTimer);
      hinweisTimer = null;
    }
  }

  // ==========================================================
  // Spiel 2: Memory (Paare finden)
  // ==========================================================
  var memoryFeld = document.getElementById("memory-feld");
  var memoryFortschritt = document.getElementById("memory-fortschritt");
  var memoryMotive = ["sym-geisslein", "sym-wolf", "sym-mama", "sym-keks", "sym-blume", "sym-uhr", "sym-apfel", "sym-erdbeere"];
  var offeneKarten = [];
  var gefundenePaare = 0;
  var memoryGesperrt = false;

  function memoryStart() {
    zeige("memory");
    gefundenePaare = 0;
    offeneKarten = [];
    memoryGesperrt = false;
    fortschrittBauen(memoryFortschritt, memoryMotive.length, "sym-blume");
    memoryFeld.innerHTML = "";
    var stapel = mischen(memoryMotive.concat(memoryMotive));
    stapel.forEach(function (motiv) {
      var karte = document.createElement("button");
      karte.className = "karte";
      karte.setAttribute("data-motiv", motiv);
      karte.setAttribute("aria-label", "Karte");
      karte.innerHTML =
        '<div class="karte-innen">' +
        '<div class="karte-seite karte-ruecken">🌼</div>' +
        '<div class="karte-seite karte-vorn"><svg viewBox="0 0 100 130"><use href="#' + motiv + '"/></svg></div>' +
        "</div>";
      karte.addEventListener("click", function () { karteTippen(karte); });
      memoryFeld.appendChild(karte);
    });
    vorlesen(hilfen.memory, "memory");
  }

  function karteTippen(karte) {
    if (memoryGesperrt) return;
    if (karte.classList.contains("offen") || karte.classList.contains("fertig")) return;
    klang.tipp();
    karte.classList.add("offen");
    offeneKarten.push(karte);
    if (offeneKarten.length < 2) return;

    memoryGesperrt = true;
    var a = offeneKarten[0];
    var b = offeneKarten[1];
    if (a.getAttribute("data-motiv") === b.getAttribute("data-motiv")) {
      setTimeout(function () {
        a.classList.add("fertig");
        b.classList.add("fertig");
        a.classList.remove("offen");
        b.classList.remove("offen");
        offeneKarten = [];
        memoryGesperrt = false;
        gefundenePaare++;
        fortschrittAn(memoryFortschritt, gefundenePaare);
        klang.richtig();
        if (gefundenePaare === memoryMotive.length) {
          setTimeout(function () {
            feiern("Super! Du hast alle Paare gefunden! Die Geißlein klatschen für dich.", memoryStart);
          }, 700);
        }
      }, 450);
    } else {
      klang.nanu();
      setTimeout(function () {
        a.classList.remove("offen");
        b.classList.remove("offen");
        offeneKarten = [];
        memoryGesperrt = false;
      }, 1100);
    }
  }

  // ==========================================================
  // Spiel 3: Kuchen backen mit dem Wolf
  // ==========================================================
  var backenAnweisung = document.getElementById("backen-anweisung");
  var backenFortschritt = document.getElementById("backen-fortschritt");
  var rezeptLeiste = document.getElementById("rezept");
  var zutatenRegal = document.getElementById("zutaten-regal");
  var schuessel = document.getElementById("schuessel");
  var backofen = document.getElementById("backofen");
  var loeffel = document.getElementById("loeffel");
  var teig = document.getElementById("teig");
  var ofenKuchen = document.getElementById("ofen-kuchen");
  var ofenFeuer = document.getElementById("ofen-feuer");

  var REZEPT = [
    { id: "mehl", sym: "sym-mehl", name: "das Mehl" },
    { id: "butter", sym: "sym-butter", name: "die Butter" },
    { id: "zucker", sym: "sym-zucker", name: "der Zucker" },
    { id: "ei", sym: "sym-ei", name: "das Ei" },
    { id: "milch", sym: "sym-milch", name: "die Milch" },
    { id: "erdbeere", sym: "sym-erdbeere", name: "die Erdbeeren" }
  ];
  var FALSCHE_ZUTATEN = [
    { id: "brokkoli", sym: "sym-brokkoli" },
    { id: "zwiebel", sym: "sym-zwiebel" }
  ];
  var RUEHR_ZIEL = 8;
  var backPhase = "fertig"; // zutaten | ruehren | backen | fertig
  var zutatIndex = 0;
  var geruehrt = 0;
  var backTimer = null;
  var kuchenGebacken = false;
  var falscheZutatGesagt = false;

  function backenStart() {
    zeige("backen");
    backPhase = "zutaten";
    zutatIndex = 0;
    geruehrt = 0;
    falscheZutatGesagt = false;
    if (backTimer) { clearInterval(backTimer); backTimer = null; }
    fortschrittBauen(backenFortschritt, REZEPT.length + 2, "sym-kuchenstueck");
    loeffel.setAttribute("transform", "rotate(0 80 30)");
    teig.setAttribute("ry", "13");
    ofenKuchen.setAttribute("opacity", "0");
    ofenFeuer.setAttribute("opacity", "0.6");
    backofen.classList.remove("backt");
    schuessel.classList.remove("dran");
    backofen.classList.remove("dran");

    // Rezeptleiste
    rezeptLeiste.innerHTML = "";
    REZEPT.forEach(function (zutat, i) {
      var feld = document.createElement("span");
      feld.className = "rezept-feld" + (i === 0 ? " dran" : "");
      feld.setAttribute("data-zutat", zutat.id);
      feld.innerHTML = '<svg viewBox="0 0 60 60"><use href="#' + zutat.sym + '"/></svg>';
      rezeptLeiste.appendChild(feld);
    });

    // Zutatenregal (mit zwei falschen Zutaten, gemischt)
    zutatenRegal.innerHTML = "";
    mischen(REZEPT.concat(FALSCHE_ZUTATEN)).forEach(function (zutat) {
      var knopf = document.createElement("button");
      knopf.className = "zutat";
      knopf.setAttribute("data-zutat", zutat.id);
      knopf.setAttribute("aria-label", "Zutat");
      knopf.innerHTML = '<svg viewBox="0 0 60 60"><use href="#' + zutat.sym + '"/></svg>';
      knopf.addEventListener("click", function () { zutatTippen(knopf, zutat); });
      zutatenRegal.appendChild(knopf);
    });

    backenAnweisung.textContent = "Tippe die Zutaten in der Reihenfolge des Rezepts an!";
    vorlesen(hilfen.backen, "backen");
  }

  function zutatTippen(knopf, zutat) {
    if (backPhase !== "zutaten") return;
    var dran = REZEPT[zutatIndex];
    if (zutat.id === dran.id) {
      klang.plopp();
      knopf.classList.add("verbraucht");
      var rezeptFeld = rezeptLeiste.querySelector('[data-zutat="' + zutat.id + '"]');
      rezeptFeld.classList.remove("dran");
      rezeptFeld.classList.add("fertig");
      zutatIndex++;
      fortschrittAn(backenFortschritt, zutatIndex);
      teig.setAttribute("ry", String(13 + zutatIndex * 1.5));
      if (zutatIndex >= REZEPT.length) {
        backPhase = "ruehren";
        schuessel.classList.add("dran");
        backenAnweisung.textContent = "Alles drin! Jetzt kräftig rühren – tippe auf die Schüssel!";
        vorlesen("Alles drin! Jetzt kräftig rühren! Tippe immer wieder auf die Schüssel!", "ruehren");
      } else {
        rezeptLeiste.querySelector('[data-zutat="' + REZEPT[zutatIndex].id + '"]').classList.add("dran");
        vorlesen("Gut! Jetzt " + REZEPT[zutatIndex].name + "!");
      }
    } else if (REZEPT.some(function (r) { return r.id === zutat.id; })) {
      klang.nanu();
      knopf.classList.add("wackelt-kurz");
      setTimeout(function () { knopf.classList.remove("wackelt-kurz"); }, 500);
      vorlesen("Erst kommt " + dran.name + " – schau aufs Rezept!");
    } else {
      klang.baeh();
      knopf.classList.add("wackelt-kurz");
      setTimeout(function () { knopf.classList.remove("wackelt-kurz"); }, 500);
      if (!falscheZutatGesagt) {
        falscheZutatGesagt = true;
        vorlesen("Igitt, das gehört nicht in den Kuchen!");
      }
    }
  }

  schuessel.addEventListener("click", function () {
    if (backPhase !== "ruehren") return;
    geruehrt++;
    klang.ruehr();
    loeffel.setAttribute("transform", "rotate(" + (geruehrt * 45) + " 80 30)");
    schuessel.classList.remove("ruehrt");
    void schuessel.offsetWidth;
    schuessel.classList.add("ruehrt");
    if (geruehrt >= RUEHR_ZIEL) {
      backPhase = "backen";
      fortschrittAn(backenFortschritt, REZEPT.length + 1);
      schuessel.classList.remove("dran");
      backofen.classList.add("dran");
      backenAnweisung.textContent = "Der Teig ist fertig! Tippe auf den Ofen!";
      vorlesen("Der Teig ist fertig! Jetzt ab in den Ofen – tippe auf den Ofen!", "ofen");
    }
  });

  backofen.addEventListener("click", function () {
    if (backPhase !== "backen") return;
    backPhase = "backt";
    backofen.classList.remove("dran");
    backofen.classList.add("backt");
    ofenKuchen.setAttribute("opacity", "1");
    ofenFeuer.setAttribute("opacity", "1");
    backenAnweisung.textContent = "Der Kuchen backt … mmmh, das duftet!";
    vorlesen("Der Kuchen backt! Warte kurz … das duftet schon herrlich!");
    var ticks = 0;
    backTimer = setInterval(function () {
      ticks++;
      klang.tick();
      if (ticks >= 6) {
        clearInterval(backTimer);
        backTimer = null;
        klang.ding();
        backofen.classList.remove("backt");
        ofenFeuer.setAttribute("opacity", "0.3");
        fortschrittAn(backenFortschritt, REZEPT.length + 2);
        backPhase = "fertig";
        kuchenGebacken = true;
        setTimeout(function () {
          feiern("Dinng! Der Kuchen ist fertig! Der liebe Wolf bringt ihn zum Picknick mit.", backenStart);
        }, 600);
      }
    }, 600);
  });

  // ==========================================================
  // Spiel 4a: Leckerlis fangen (Gemüse fallen lassen!)
  // ==========================================================
  var fangenFeld = document.getElementById("fangen-feld");
  var fangenFortschritt = document.getElementById("fangen-fortschritt");
  var fangenZiel = 10;
  var gefangen = 0;
  var korbInhalt = [];
  var fangenTimer = null;
  var gemueseHinweisGesagt = false;
  var leckereien = ["sym-keks", "sym-apfel", "sym-erdbeere", "sym-bonbon"];
  var gemuese = ["sym-brokkoli", "sym-zwiebel", "sym-karotte"];

  function fangenStart() {
    zeige("fangen");
    gefangen = 0;
    korbInhalt = [];
    gemueseHinweisGesagt = false;
    fortschrittBauen(fangenFortschritt, fangenZiel, "sym-keks");
    fangenFeld.querySelectorAll(".leckerli").forEach(function (l) { l.remove(); });
    fangenStoppen();
    fangenTimer = setInterval(leckerliWerfen, 1250);
    vorlesen(hilfen.fangen, "fangen");
    setTimeout(leckerliWerfen, 600);
  }

  function fangenStoppen() {
    if (fangenTimer) {
      clearInterval(fangenTimer);
      fangenTimer = null;
    }
  }

  function leckerliWerfen() {
    if (aktiverBildschirm !== "fangen" || gefangen >= fangenZiel) return;
    var istGemuese = Math.random() < 0.35;
    var auswahl = istGemuese ? gemuese : leckereien;
    var motiv = auswahl[Math.floor(Math.random() * auswahl.length)];
    var leckerli = document.createElement("button");
    leckerli.className = "leckerli";
    leckerli.setAttribute("data-gut", istGemuese ? "nein" : "ja");
    leckerli.setAttribute("aria-label", istGemuese ? "Gemüse – nicht fangen" : "Leckerli fangen");
    leckerli.innerHTML = '<svg viewBox="0 0 60 60"><use href="#' + motiv + '"/></svg>';
    leckerli.style.left = 5 + Math.random() * 80 + "%";

    var dauer = 5000 + Math.random() * 2500; // langsam genug für kleine Hände
    var startZeit = null;
    var gestoppt = false;

    function fallen(zeit) {
      if (gestoppt) return;
      if (!startZeit) startZeit = zeit;
      var anteil = (zeit - startZeit) / dauer;
      if (anteil >= 1 || aktiverBildschirm !== "fangen") {
        leckerli.remove();
        return;
      }
      var hoehe = fangenFeld.clientHeight;
      leckerli.style.transform =
        "translateY(" + anteil * (hoehe + 90) + "px) rotate(" + anteil * 220 + "deg)";
      requestAnimationFrame(fallen);
    }
    requestAnimationFrame(fallen);

    leckerli.addEventListener("click", function () {
      if (gestoppt) return;
      if (istGemuese) {
        // Kein Fehler, nur eine lustige Erinnerung – das Gemüse fällt weiter
        leckerli.classList.add("igitt");
        klang.baeh();
        if (!gemueseHinweisGesagt) {
          gemueseHinweisGesagt = true;
          vorlesen("Nein danke! Gemüse wollen wir heute nicht fangen.");
        }
        setTimeout(function () { leckerli.classList.remove("igitt"); }, 500);
        return;
      }
      gestoppt = true;
      leckerli.classList.add("gefangen");
      klang.plopp();
      setTimeout(klang.mampf, 120);
      setTimeout(function () { leckerli.remove(); }, 350);
      korbInhalt.push(motiv);
      gefangen++;
      fortschrittAn(fangenFortschritt, gefangen);
      if (gefangen >= fangenZiel) {
        fangenStoppen();
        setTimeout(function () {
          zwischenmeldung("Der Korb ist voll! Auf zum Picknick!", picknickStart, "picknick-los");
        }, 700);
      }
    });

    fangenFeld.appendChild(leckerli);
  }

  // ==========================================================
  // Spiel 4b: Picknick – Leckereien verteilen
  // ==========================================================
  var esserReihe = document.getElementById("esser-reihe");
  var korb = document.getElementById("korb");
  var picknickFortschritt = document.getElementById("picknick-fortschritt");
  var picknickGesamt = 0;
  var verteilt = 0;
  var gewaehltesEssen = null;

  function picknickStart() {
    zeige("picknick");
    verteilt = 0;
    gewaehltesEssen = null;

    // Die sieben Geißlein (mit Namen) und der Wolf setzen sich auf die Decke
    esserReihe.innerHTML = "";
    NAMEN.forEach(function (name, i) {
      var geiss = document.createElement("button");
      geiss.className = "esser geiss-esser";
      geiss.setAttribute("data-tier", "geiss");
      geiss.setAttribute("aria-label", name + " füttern");
      geiss.innerHTML = '<svg viewBox="0 0 100 100"' +
        (i % 2 ? ' style="transform:scaleX(-1)"' : "") +
        '><use href="#sym-geisslein"/></svg>' +
        '<span class="esser-name">' + name + "</span>" +
        '<span class="esser-blase" hidden>😋</span>';
      esserReihe.appendChild(geiss);
    });
    var wolf = document.createElement("button");
    wolf.className = "esser wolf-esser";
    wolf.setAttribute("data-tier", "wolf");
    wolf.setAttribute("aria-label", "Wolf füttern");
    wolf.innerHTML = '<svg viewBox="0 0 120 130"><use href="#sym-wolf"/></svg>' +
      '<span class="esser-name">Wolf</span>' +
      '<span class="esser-blase" hidden>😋</span>';
    esserReihe.appendChild(wolf);

    // Der Korb: die gefangenen Leckereien plus Kuchenstücke vom Wolf
    // (selbstgebackener Kuchen aus dem Backspiel = zwei Stücke extra!)
    korb.innerHTML = "";
    var kuchenteller = document.createElement("div");
    kuchenteller.className = "kuchen-hinweis";
    kuchenteller.innerHTML = '<svg viewBox="0 0 80 64"><use href="#sym-kuchen"/></svg>';
    korb.appendChild(kuchenteller);

    var essen = korbInhalt.slice();
    var kuchenstuecke = kuchenGebacken ? 6 : 4;
    for (var k = 0; k < kuchenstuecke; k++) essen.push("sym-kuchenstueck");
    picknickGesamt = essen.length;
    essen.forEach(function (motiv) {
      var stueck = document.createElement("button");
      stueck.className = "korb-item";
      stueck.setAttribute("aria-label", "Leckerli auswählen");
      stueck.innerHTML = '<svg viewBox="0 0 60 60"><use href="#' + motiv + '"/></svg>';
      stueck.addEventListener("click", function () {
        klang.tipp();
        if (gewaehltesEssen) gewaehltesEssen.classList.remove("gewaehlt");
        gewaehltesEssen = stueck;
        stueck.classList.add("gewaehlt");
      });
      korb.appendChild(stueck);
    });

    fortschrittBauen(picknickFortschritt, Math.min(picknickGesamt, 16), "sym-kuchenstueck");
    vorlesen(hilfen.picknick + (kuchenGebacken ? " Und es gibt euren selbstgebackenen Kuchen!" : " Der liebe Wolf hat sogar einen Kuchen gebacken."), "picknick");
  }

  esserReihe.addEventListener("click", function (ereignis) {
    var esser = ereignis.target.closest(".esser");
    if (!esser) return;
    var istWolf = esser.getAttribute("data-tier") === "wolf";
    if (!gewaehltesEssen) {
      // Ohne Essen: das Tier macht einfach sein Geräusch
      if (istWolf) klang.wuff(); else klang.maeh();
      return;
    }
    // Füttern!
    gewaehltesEssen.remove();
    gewaehltesEssen = null;
    verteilt++;
    fortschrittAn(picknickFortschritt, Math.min(verteilt, 16));
    klang.mampf();
    setTimeout(function () { if (istWolf) klang.wuff(); else klang.maeh(); }, 350);
    esser.classList.remove("isst");
    void esser.offsetWidth; // Animation neu starten
    esser.classList.add("isst");
    var blase = esser.querySelector(".esser-blase");
    blase.hidden = false;
    setTimeout(function () { blase.hidden = true; }, 900);
    if (verteilt >= picknickGesamt) {
      setTimeout(function () {
        feiern("Was für ein schönes Picknick! Alle sind satt und glücklich – und der Kuchen war der Hit!", fangenStart);
      }, 900);
    }
  });

  // ==========================================================
  // Menü und Knöpfe
  // ==========================================================
  var spiele = {
    verstecken: versteckenStart,
    memory: memoryStart,
    backen: backenStart,
    fangen: fangenStart
  };

  document.querySelectorAll("[data-spiel]").forEach(function (taste) {
    taste.addEventListener("click", function () {
      klang.tipp();
      spiele[taste.getAttribute("data-spiel")]();
    });
  });

  // Die Tiere auf dem Startbildschirm machen beim Antippen Geräusche
  document.querySelectorAll("[data-stimme]").forEach(function (figur) {
    figur.addEventListener("pointerdown", function () {
      if (figur.getAttribute("data-stimme") === "wolf") klang.wuff();
      else klang.maeh();
    });
  });

  document.querySelectorAll(".zurueck").forEach(function (taste) {
    taste.addEventListener("click", function () {
      klang.tipp();
      fangenStoppen();
      hinweiseStoppen();
      if (backTimer) { clearInterval(backTimer); backTimer = null; }
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      zeige(taste.getAttribute("data-ziel"));
    });
  });

  document.querySelectorAll("[data-hilfe]").forEach(function (taste) {
    taste.addEventListener("click", function () {
      klang.tipp();
      var schluessel = taste.getAttribute("data-hilfe");
      vorlesen(hilfen[schluessel], schluessel);
    });
  });

  // Schwierigkeit: 🐣 Klein (ohne Limit) / 🦊 Groß (4 Versuche pro Raum)
  var kleinTaste = document.getElementById("btn-klein");
  var grossTaste = document.getElementById("btn-gross");
  function schwierigkeitAnzeigen() {
    kleinTaste.classList.toggle("aktiv", einstellungen.schwierig === "klein");
    grossTaste.classList.toggle("aktiv", einstellungen.schwierig === "gross");
  }
  kleinTaste.addEventListener("click", function () {
    einstellungen.schwierig = "klein";
    einstellungenSpeichern();
    schwierigkeitAnzeigen();
    klang.tipp();
    vorlesen("Klein: Ihr könnt so oft suchen, wie ihr wollt!");
  });
  grossTaste.addEventListener("click", function () {
    einstellungen.schwierig = "gross";
    einstellungenSpeichern();
    schwierigkeitAnzeigen();
    klang.tipp();
    vorlesen("Groß: Nach vier leeren Verstecken verstecken sich alle neu – gut aufpassen!");
  });
  schwierigkeitAnzeigen();

  var tonTaste = document.getElementById("btn-ton");
  var musikTaste = document.getElementById("btn-musik");
  var vorlesenTaste = document.getElementById("btn-vorlesen");

  function tastenAnzeigen() {
    tonTaste.classList.toggle("aus", !einstellungen.ton);
    tonTaste.textContent = einstellungen.ton ? "🔊" : "🔇";
    musikTaste.classList.toggle("aus", !musikErlaubt());
    vorlesenTaste.classList.toggle("aus", !einstellungen.vorlesen);
  }

  tonTaste.addEventListener("click", function () {
    einstellungen.ton = !einstellungen.ton;
    einstellungenSpeichern();
    tastenAnzeigen();
    if (einstellungen.ton) {
      klang.richtig();
      musikStart();
    } else {
      musikStopp();
    }
  });

  musikTaste.addEventListener("click", function () {
    einstellungen.musik = !einstellungen.musik;
    einstellungenSpeichern();
    tastenAnzeigen();
    if (musikErlaubt()) {
      musikStart();
    } else {
      musikStopp();
    }
  });

  vorlesenTaste.addEventListener("click", function () {
    einstellungen.vorlesen = !einstellungen.vorlesen;
    einstellungenSpeichern();
    tastenAnzeigen();
    if (einstellungen.vorlesen) {
      vorlesen("Vorlesen ist an!");
    } else if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  });

  tastenAnzeigen();

  // ---------- Service Worker für Offline-Nutzung ----------
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {
        /* Offline-Modus ist optional */
      });
    });
  }
})();
