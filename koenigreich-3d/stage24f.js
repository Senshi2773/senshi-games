// Etappe 24f – Hotfix-Tests: Schürf-Kontext, Helden-Kampfgefühl, Jagd-Quest-Garantien
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const URL = 'file:///workspace/senshi-games/koenigreich-3d/index.html?dbg=1';
const SHOT = __dirname + '/shots';
require('fs').mkdirSync(SHOT, { recursive: true });

let pass = 0, fail = 0;
const t = (name, ok, info) => {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (info !== undefined ? '  [' + JSON.stringify(info) + ']' : ''));
  ok ? pass++ : fail++;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(URL);
  await page.waitForFunction(() => window.DBG && !document.getElementById('btnStart').disabled, null, { timeout: 30000 });
  await page.click('#btnStart');
  await page.waitForTimeout(400);

  // ---------- Setup: Reich + Held ----------
  const setup = await page.evaluate(() => {
    const D = window.DBG, S = D.state;
    Object.assign(S.res, { holz: 9000, stein: 9000, nahrung: 9000, gold: 9000, eisen: 900, stahl: 300 });
    const [SX, SY] = D.start;
    let hall = null;
    outer:
    for (let ry = -10; ry <= 10; ry++) for (let rx = -10; rx <= 10; rx++)
      if (D.canPlace('heldenhalle', SX + rx, SY + ry)) { hall = D.addBuilding('heldenhalle', SX + rx, SY + ry, undefined, true); break outer; }
    const rec = D.recruitHero();
    S.hero.auto = 0;                       // manuell steuern (Held bleibt stehen)
    D.enterEgo();
    return { hall: !!hall, rec, ego: D.egoMode, view: D.heroView };
  });
  t('Setup: Heldenhalle + Held + Ego-Modus (Third-Person)', setup.hall && setup.rec && setup.ego && setup.view === 'tp', setup);

  // ---------- Regression 24e (a): Third-Person-Abstand ----------
  await page.waitForFunction(() => window.DBG.egoBlend === 1, null, { timeout: 15000 });   // Blende fertig
  await page.waitForTimeout(400);          // Folgekamera einschwingen
  const tpd = await page.evaluate(() => window.DBG.camHeroDist());
  t('24e-Regression: TP-Kameraabstand ~5 (3,0–6,5)', tpd >= 3.0 && tpd <= 6.5, tpd);

  // ================= Befund 1: Schürf-Spot-Kontext =================
  const b1a = await page.evaluate(() => {
    const D = window.DBG, S = D.state;
    D.speed = 1;
    const hero = D.heroUnit;
    const spots = (S.mineSpots || []).filter(s => s.left > 0);
    let sp = spots[0], bd = 1e9;
    for (const s of spots) { const d = Math.hypot(s.x - D.start[0], s.y - D.start[1]); if (d < bd) { bd = d; sp = s; } }
    S.hero.pfanne = 0; delete S.hero.pfanneHint;
    D.setHeroPos(sp.x + 1.5, sp.y);
    D.tpSnapNow();
    const an = Math.atan2(sp.y - hero.y, sp.x - hero.x);
    D.egoYaw = an + 50 * Math.PI / 180;    // 50° am Spot vorbeischauen
    // Pitch −40° (Test: Bodenblick in Third-Person)
    while (D.egoPitch > -40 * Math.PI / 180 + 0.01) D.egoInput(0, 0, 0, 20);
    const c = D.egoContext();
    return { act: c && c.act, icon: c && c.icon, disabled: !!(c && c.disabled), pitch: D.egoPitch, spot: [sp.x, sp.y] };
  });
  t('B1: ohne Pfanne, Blick 50° daneben + Pitch −40° → ⛏️-Kontext angeboten (disabled)',
    b1a.act === 'mineNo' && b1a.icon === '⛏️' && b1a.disabled, b1a);

  // Einmaliger Hinweis-Toast beim Annähern (spotT-Takt 0,7 s abwarten)
  await page.waitForTimeout(1300);
  const b1b = await page.evaluate(() => ({
    hint: window.DBG.state.hero.pfanneHint,
    toast: document.getElementById('toasts').innerText.includes('Goldpfanne'),
  }));
  t('B1: Annäherungs-Hinweis „Goldpfanne" kommt automatisch + einmalig (Flag gesetzt)', b1b.hint === 1 && b1b.toast, b1b);

  // Button sichtbar & ausgegraut? (HUD-Takt abwarten)
  await page.waitForTimeout(400);
  const b1c = await page.evaluate(() => {
    const b = document.getElementById('egoAct');
    return { disp: b.style.display, txt: b.textContent, op: b.style.opacity, filter: b.style.filter };
  });
  t('B1: ⛏️-Button sichtbar, aber ausgegraut', b1c.disp === 'flex' && b1c.txt === '⛏️' && b1c.op === '0.45', b1c);
  await page.screenshot({ path: SHOT + '/b1_spot_ohne_pfanne.png' });

  // Tap auf den ausgegrauten Button → erklärender Toast
  const b1d = await page.evaluate(() => {
    document.getElementById('toasts').innerHTML = '';
    const r = window.DBG.egoAction();
    return { r, toast: document.getElementById('toasts').innerText };
  });
  t('B1: Tap ohne Pfanne → Hinweis-Toast (Schmiede, 15 🪵 + 20 🪙)',
    b1d.r === true && b1d.toast.includes('Goldpfanne') && b1d.toast.includes('15 🪵') && b1d.toast.includes('20 🪙'), b1d.toast);

  // Mit Pfanne: Schürfrunde startet unabhängig von Blick-Yaw/-Pitch
  const b1e = await page.evaluate(() => {
    const D = window.DBG;
    D.state.hero.pfanne = 1;
    const c = D.egoContext();
    const started = D.egoAction();
    return { act: c && c.act, disabled: !!(c && c.disabled), started, mining: !!D.mining, pitch: D.egoPitch };
  });
  t('B1: mit Pfanne (Pitch −40°, Yaw 50° daneben) → Kontext „mine", Schürfrunde startet',
    b1e.act === 'mine' && !b1e.disabled && b1e.started && b1e.mining, b1e);
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT + '/b1_spot_mit_pfanne_schuerft.png' });

  // ================= Befund 2: Helden-Kampf =================
  const b2a = await page.evaluate(() => {
    const D = window.DBG;
    if (D.mining) D.egoAction();           // Schürfen beenden
    const H = D.HERO_ITEMS;
    const cd0 = D.heroAtkCd();             // Holzknüppel
    D.state.hero.equip.w = 'stahlklinge';
    const cd3 = D.heroAtkCd();
    D.state.hero.equip.w = 'energieklinge';
    const cd4 = D.heroAtkCd();
    D.state.hero.equip.w = 'holzknueppel';
    return {
      dmg: [H.holzknueppel.dmg, H.eisenschwert.dmg, H.ritterklinge.dmg, H.stahlklinge.dmg, H.energieklinge.dmg],
      cd0, cd3, cd4, heroDmg: D.heroDmg(), soldier: D.effUnitStats('soldier').dmg,
    };
  });
  t('B2: Waffenschaden 14/22/30 – Stahl 38/Energie 55 unverändert',
    JSON.stringify(b2a.dmg) === JSON.stringify([14, 22, 30, 38, 55]), b2a.dmg);
  t('B2: Schlag-CD 0,65 s (leicht) / 0,8 s (Stahl+Energie, DPS-Deckel)', b2a.cd0 === 0.65 && b2a.cd3 === 0.8 && b2a.cd4 === 0.8);
  t('B2: Held (14) schlägt jetzt härter als Basis-Soldat (11)', b2a.heroDmg >= b2a.soldier, { hero: b2a.heroDmg, soldier: b2a.soldier });

  // Stagger + Rückstoß, CD-Freeze (Pause → deterministische Ticks)
  const b2b = await page.evaluate(() => {
    const D = window.DBG, hero = D.heroUnit;
    D.speed = 0;
    hero.cd = 0;
    D.spawnEnemy(hero.x + 0.6, hero.y);
    const e = D.enemies[D.enemies.length - 1];
    e.cd = 0.5;
    const hp0 = e.hp, d0 = Math.hypot(e.x - hero.x, e.y - hero.y);
    D.egoYaw = Math.atan2(e.y - hero.y, e.x - hero.x);
    const hit = D.heroAttack();
    const d1 = Math.hypot(e.x - hero.x, e.y - hero.y);
    const p1 = [e.x, e.y];
    // 3×0,1 s: eingefroren (Position/CD unverändert)
    for (let i = 0; i < 3; i++) D.enemyTick(0.1);
    const frozen = e.x === p1[0] && e.y === p1[1] && e.cd === 0.5;
    const stAfter = e.staggerT;
    // Stagger auslaufen lassen → Gegner agiert wieder (CD zählt runter)
    D.enemyTick(0.2); D.enemyTick(0.3);
    const acts = e.cd < 0.5;
    const res = { hit, dmg: hp0 - e.hp, stagger0: 0.4, knock: d1 - d0, frozen, stAfter, acts };
    return res;
  });
  t('B2: Treffer → 0,4 s Stagger (Position + Angriffs-CD frieren 3×0,1 s lang)',
    b2b.hit && b2b.frozen && Math.abs(b2b.stAfter - 0.1) < 1e-9, b2b);
  t('B2: Rückstoß ≈ 0,3 Kacheln', b2b.knock > 0.25 && b2b.knock < 0.35, b2b.knock);
  t('B2: Schaden 14 kommt an', Math.abs(b2b.dmg - 14) < 0.01, b2b.dmg);
  t('B2: nach Stagger agiert der Gegner wieder (CD zählt)', b2b.acts);
  await page.screenshot({ path: SHOT + '/b2_kampf_stagger.png' });

  const b2c = await page.evaluate(() => {
    const D = window.DBG;
    const boss = { boss: true, x: 0, y: 0, hp: 100 };
    D.applyStagger(boss);
    // Aufräumen: Testgegner entfernen
    for (const e of D.enemies) e.hp = 0;
    D.enemyTick(0.01);
    return { bossStagger: boss.staggerT, bossMoved: boss.x !== 0 || boss.y !== 0, enemies: D.enemies.length };
  });
  t('B2: Boss staggert NICHT (kein staggerT, kein Rückstoß)', b2c.bossStagger === undefined && !b2c.bossMoved, b2c);

  // ================= Befund 3: Jagd-Quests =================
  // (b) 20 Rerolls: nur insel-heimische Arten
  const b3a = await page.evaluate(() => {
    const D = window.DBG;
    let jagd = 0, mism = [];
    for (let i = 0; i < 20; i++) {
      for (const o of D.rerollOffers()) {
        if (o.typ !== 'jagd') continue;
        jagd++;
        const bio = D.isles[o.param.isle] && D.isles[o.param.isle].biome;
        if (D.WILD_ARTS[o.param.art].biome !== bio) mism.push([o.param.art, bio]);
      }
    }
    return { jagd, mism };
  });
  t('B3: 20 Rerolls – jede Jagd-Art passt zum Insel-Biom', b3a.jagd > 0 && b3a.mism.length === 0, b3a);

  // (a) Annahme → sofort ≥2 Tiere der Art auf der Quest-Insel; (c) Marker aufs Tier
  const b3b = await page.evaluate(() => {
    const D = window.DBG, S = D.state;
    D.clearWildlife();
    let q = null;
    for (let i = 0; i < 30 && !q; i++) q = D.rerollOffers().find(o => o.typ === 'jagd');
    if (!q) return { err: 'kein Jagd-Angebot' };
    D.acceptQuest(q);
    D.trackQuest(q.id);
    const alive = D.wildlife.filter(a => a.art === q.param.art && a.parent === q.param.isle);
    const tp = D.questTargetPos(q);
    const onAnimal = alive.some(a => tp && Math.hypot(a.x - tp[0], a.y - tp[1]) < 0.01);
    // Held neben das nächste Tier stellen und hinschauen (Screenshot)
    if (alive.length) {
      const a0 = alive[0];
      D.setHeroPos(a0.x + 2, a0.y + 0.4);
      D.egoYaw = Math.atan2(a0.y - D.heroUnit.y, a0.x - D.heroUnit.x);
      while (D.egoPitch < -0.25) D.egoInput(0, 0, 0, -10);   // Pitch zurück Richtung Horizont
      D.tpSnapNow();
    }
    return { art: q.param.art, isle: q.param.isle, need: q.need, alive: alive.length, tp, onAnimal, id: q.id };
  });
  t('B3: Jagd-Quest angenommen → sofort ≥2 Tiere der Art auf der Quest-Insel', !b3b.err && b3b.alive >= 2, b3b);
  t('B3: questTargetPos zeigt aufs nächste Quest-Tier (nicht Inselmitte)', b3b.onAnimal, b3b.tp);
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOT + '/b3_questtiere_gespawnt.png' });
  // Minimap mit ❗-Marker
  await page.evaluate(() => { window.DBG.openMap(); window.DBG.drawMinimap(); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: SHOT + '/b3_minimap_marker.png' });
  await page.evaluate(() => { const o = document.getElementById('mapOv'); if (o) o.style.display = 'none'; });

  // Quest komplett durchspielen: Kills zählen, Spawner füllt nach, Abgabe klappt
  const b3c = await page.evaluate(() => {
    const D = window.DBG, S = D.state;
    const q = S.quests.active.find(a => a.typ === 'jagd');
    if (!q) return { err: 'Quest weg' };
    const done0 = S.quests.done;
    let refills = 0, guard = 40;
    while (q.have < q.need && guard-- > 0) {
      const a = D.wildlife.find(w => w.art === q.param.art && w.parent === q.param.isle);
      if (!a) { D.wildSpawnT = 0; D.wildTick(0.1); refills++; continue; }   // 45-s-Takt: ensureQuestWild
      a.heroHit = 1; a.hp = 0;
      D.wildTick(0.01);
    }
    const phase = q.phase;
    const ok = D.completeQuest(q.id);
    return { have: q.have, need: q.need, phase, ok, refills, done: S.quests.done - done0 };
  });
  t('B3: Kills zählen bis zum Abschluss (Spawner füllt bei Bedarf nach)',
    !b3c.err && b3c.have === b3c.need && b3c.phase === 'abgeben' && b3c.ok && b3c.done === 1, b3c);

  // (d) Spawnraum-Failsafes: zugebaute Heimatinsel → Quest-Kachel findet sich trotzdem
  const b3d = await page.evaluate(() => {
    const D = window.DBG, [SX, SY] = D.start;
    let placed = 0;
    for (let ring = 2; ring <= 12 && placed < 30; ring++)
      for (let a = 0; a < 16 && placed < 30; a++) {
        const x = Math.round(SX + Math.cos(a * 0.39) * ring), y = Math.round(SY + Math.sin(a * 0.39) * ring);
        if (D.canPlace('haus', x, y)) { D.addBuilding('haus', x, y, undefined, true); placed++; }
      }
    const home = D.isleParent[D.playerIsle()] || 0;
    const g = D.findWildTile(home), qg = D.findQuestWildTile(home);
    return { placed, general: !!g, quest: !!qg };
  });
  t('B3: dicht bebaute Heimatinsel – genereller Spawn (8→6→4) und Quest-Spawn finden Kacheln',
    b3d.general && b3d.quest, b3d);

  // ---------- Regression 24d K33: Lager-Isolation ----------
  const k33 = await page.evaluate(() => {
    const D = window.DBG, S = D.state;
    D.speed = 0;
    D.spawnIntruderCamp();
    const camp = S.quests.camp;
    if (!camp) return { err: 'kein Lager' };
    let kas = null;
    for (let ry = -12; ry <= 12 && !kas; ry++) for (let rx = -12; rx <= 12 && !kas; rx++)
      if (D.canPlace('kaserne', D.start[0] + rx, D.start[1] + ry)) kas = D.addBuilding('kaserne', D.start[0] + rx, D.start[1] + ry, undefined, true);
    if (kas) { D.spawnSoldier(kas); const s = D.soldiers[D.soldiers.length - 1]; s.x = camp.x + 1; s.y = camp.y + 1; }
    return { n: D.campEnemies.length, camp: [camp.x, camp.y], soldier: D.soldiers.length };
  });
  await page.evaluate(() => { window.DBG.speed = 1; });
  await page.waitForTimeout(3000);
  const k33b = await page.evaluate(() => {
    const D = window.DBG;
    const s = D.soldiers[D.soldiers.length - 1];
    return {
      campAlive: D.campEnemies.length,
      campFullHp: D.campEnemies.every(e => e.hp === e.maxhp),
      soldierHp: s ? s.hp : null, soldierMax: s ? s.maxhp : null,
      waveActive: D.state.waveActive,
    };
  });
  t('24d-K33-Regression: Soldat und Lager-Räuber ignorieren sich (volle HP beidseitig)',
    !k33.err && k33b.campAlive === k33.n && k33b.campFullHp && k33b.soldierHp === k33b.soldierMax, { k33, k33b });

  // ---------- Konsole ----------
  t('0 Konsolenfehler', errors.length === 0, errors.slice(0, 4));

  console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
