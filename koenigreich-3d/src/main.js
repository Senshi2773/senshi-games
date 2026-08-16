// Königreich 3D – Aufbau-Strategiespiel (Three.js)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ============================== GRUNDLAGEN ==============================
const MAP = 128, C = MAP/2, TL = 2;           // Kachelanzahl, Kachelgröße in Weltmetern
const SAVEKEY = 'koenigreich3d_save_v3';      // v3: große Inselwelt (128x128) mit Biomen
const SAVEKEY_V2 = 'koenigreich3d_save_v2';   // Vorgänger-Format: nur die Chronik wird übernommen
let ISLES = [];                               // Inseln aus dem Seed (genMap): {x,y,r,cls,biome}
let SX = C, SY = C;                           // Spieler-Startpunkt (dynamisch auf der Heimatinsel)
const lerp = (a,b,t)=>a+(b-a)*t;
const clamp = (v,a,b)=>v<a?a:(v>b?b:v);
const dist = (x1,y1,x2,y2)=>Math.hypot(x2-x1,y2-y1);
const wx = (x)=>(x-C)*TL, wz = (y)=>(y-C)*TL;   // Kachel- → Weltkoordinaten
const inMap = (x,y)=>x>=0 && y>=0 && x<MAP && y<MAP;
const idx = (x,y)=>y*MAP+x;

// Admin-Konsole (Etappe 25c): build.mjs setzt window.__ADMIN__ NUR in artifact.html
// (privater Build). Ohne Flag entsteht keinerlei Admin-UI im DOM.
const IS_ADMIN = !!window.__ADMIN__;
// Transiente Cheats – bewusst NICHT im Save: nach einem Reload sind sie wieder aus.
const ADMIN = { god:false, happy:false };

function mulberry32(a){ return function(){ a|=0; a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a>>>15, 1|a); t = t + Math.imul(t ^ t>>>7, 61|t) ^ t;
  return ((t ^ t>>>14) >>> 0) / 4294967296; }; }
function noiseGrid(rng, n){
  const a = new Float32Array(n*n);
  for (let i=0;i<n*n;i++) a[i] = rng();
  const g = (x,y)=>a[((y%n+n)%n)*n + ((x%n+n)%n)];
  return (x,y)=>{
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const sx = (x-x0)*(x-x0)*(3-2*(x-x0)), sy = (y-y0)*(y-y0)*(3-2*(y-y0));
    return lerp(lerp(g(x0,y0),g(x0+1,y0),sx), lerp(g(x0,y0+1),g(x0+1,y0+1),sx), sy);
  };
}

// ============================== SPIELDATEN ==============================
const BT = {
  rathaus:    { name:'Rathaus', w:2, h:2, hp:650, cost:{}, cap:5, gold:0.12,
                desc:'Das Herz deines Reiches – verliere es nicht!' },
  haus:       { name:'Wohnhaus', cat:'eco', w:1, h:1, hp:130, cost:{holz:30}, cap:5, gold:0.06,
                desc:'+5 Bevölkerung und zahlt Steuern.' },
  holzfaeller:{ name:'Holzfäller', cat:'eco', w:1, h:1, hp:110, cost:{holz:25},
                gather:{res:'holz', amount:12, lvlAdd:4.5}, needs:'tree', radius:5, isleWide:true,
                desc:'Arbeiter fällen automatisch Bäume auf der ganzen Insel – lange Wege kosten Zeit.' },
  steinbruch: { name:'Steinbruch', cat:'eco', w:1, h:1, hp:150, cost:{holz:50},
                gather:{res:'stein', amount:5}, needs:'rock', radius:4,
                desc:'Arbeiter bauen Felsen im Einzugsgebiet ab.' },
  farm:       { name:'Bauernhof', cat:'eco', w:2, h:2, hp:120, cost:{holz:40,stein:10}, prod:{nahrung:1.0},
                desc:'Erzeugt Nahrung für dein Volk.' },
  kaserne:    { name:'Kaserne', cat:'mil', w:2, h:2, hp:280, cost:{holz:80,stein:60}, trains:true,
                desc:'Bildet Soldaten zur Verteidigung aus.' },
  turm:       { name:'Wachturm', cat:'mil', w:1, h:1, hp:300, cost:{holz:30,stein:80},
                tower:{range:6, dmg:14, cd:0.9}, desc:'Beschießt Angreifer automatisch.' },
  mauer:      { name:'Mauer', cat:'mil', w:1, h:1, hp:420, cost:{holz:10,stein:15}, wall:true,
                desc:'Hält Räuber auf – verbindet sich mit Mauern, Toren und Türmen.' },
  tor:        { name:'Tor', cat:'mil', w:1, h:1, hp:480, cost:{holz:25,stein:20}, wall:true, gate:true,
                desc:'Durchgang in der Mauer: eigene Einheiten passieren, Feinde nicht.' },
  fischer:    { name:'Fischerhütte', cat:'eco', w:1, h:1, hp:110, cost:{holz:35},
                gather:{res:'nahrung', amount:7}, needs:'water', radius:3,
                desc:'Arbeiter fischen im nahen Gewässer.' },
  mine:       { name:'Erzmine', cat:'eco', w:1, h:1, hp:160, cost:{holz:90,stein:40},
                prod:{erz:0.4}, needs:'rock', radius:3, req:3,
                desc:'Fördert Erz aus der Tiefe – neben Felsen bauen.' },
  schmiede:   { name:'Schmiede', cat:'eco', w:1, h:1, hp:150, cost:{holz:70,stein:50}, smelt:true, req:2,
                desc:'Schmilzt Erz und Holz zu Eisen für Waffen und Ausbauten.' },
  markt:      { name:'Markt', cat:'infra', w:2, h:2, hp:180, cost:{holz:80,stein:40}, gold:0.15, market:true, req:2,
                desc:'Handelsplatz: Rohstoffe kaufen und verkaufen.' },
  hafen:      { name:'Hafen', cat:'infra', w:1, h:1, hp:200, cost:{holz:60,stein:20}, harbor:true, req:2,
                desc:'Am Ufer bauen! Startet Expeditionen zu anderen Inseln.' },
  vorposten:  { name:'Vorposten', w:1, h:1, hp:300, cost:{}, cap:5, settlement:true,
                desc:'Neue Siedlung – erweitert dein Baugebiet auf dieser Insel.' },
  __vorp:     { name:'Vorposten gründen', w:1, h:1, hp:1, cost:{holz:200,nahrung:100,gold:80}, vorp:true,
                desc:'Siedlerschiff entsenden: gründet einen Vorposten am Zielort.' },
  stahlwerk:  { name:'Stahlwerk', cat:'eco', w:2, h:2, hp:260, cost:{stein:180,eisen:60,gold:80}, smelt:'stahl', req:11,
                desc:'Industriezeitalter: schmilzt Eisen + Holzkohle zu Stahl.' },
  bohrturm:   { name:'Bohrturm', cat:'eco', w:1, h:1, hp:200, cost:{stahl:60,stein:120,gold:120}, prod:{oel:0.3}, req:16,
                desc:'Moderne: fördert Öl für Fahrzeuge und Fabriken.' },
  raumhafen:  { name:'Raumhafen', cat:'infra', w:2, h:2, hp:500, cost:{stahl:300,oel:200,gold:500}, space:true, req:26,
                desc:'Raumfahrt: entsendet Raumschiffe zu zufällig generierten Planeten.' },
  gehege:     { name:'Rentier-Gehege', cat:'eco', w:2, h:2, hp:130, cost:{holz:55,stein:15},
                prod:{nahrung:0.8}, desc:'Rentiere liefern Fleisch – später auch Reittiere.' },
  akademie:   { name:'Forschungsakademie', cat:'infra', w:2, h:2, hp:220, cost:{holz:140,stein:100,gold:60}, academy:true, req:6,
                desc:'Erforscht Truppen-Upgrades: Waffen, Panzerung und Antrieb.' },
  fabrik:     { name:'Fahrzeugfabrik', cat:'mil', w:2, h:2, hp:320, cost:{stein:150,stahl:80,gold:150}, vehicles:'panzer', req:16,
                desc:'Moderne: Hier laufen Panzer vom Band – die Fabrikstufe stärkt sie.' },
  flugfeld:   { name:'Flugfeld', cat:'mil', w:2, h:2, hp:260, cost:{stahl:100,oel:40,gold:180}, vehicles:'flieger', req:18,
                desc:'Bildet Flugzeuge aus; Luftpatrouillen erhöhen die Sicherheit deines Volkes.' },
  speicher:   { name:'Speicherhaus', cat:'eco', w:1, h:1, hp:180, cost:{holz:70,stein:30}, depot:true, radius:6, req:3,
                desc:'Kurze Wege: Sammler im Umkreis liefern je Fuhre mehr ab.' },
  taverne:    { name:'Taverne', cat:'infra', w:1, h:1, hp:140, cost:{holz:60,stein:20,gold:25}, kultur:[12,4], req:4,
                desc:'Bier und Musik: liefert Kultur – ab der Renaissance ein echtes Bedürfnis.' },
  leuchtturm: { name:'Leuchtturm', cat:'infra', w:1, h:1, hp:200, cost:{holz:40,stein:110,gold:30}, coast:true, req:7,
                desc:'Am Ufer bauen! Deine Schiffe segeln schneller, Expeditionen werden günstiger.' },
  lazarett:   { name:'Lazarett', cat:'mil', w:1, h:1, hp:180, cost:{holz:90,stein:60,gold:40}, heal:true, radius:8, req:8,
                desc:'Versorgt & repariert eigene Einheiten im Umkreis – aber nie mitten im Gefecht.' },
  hq:         { name:'Verteidigungs-HQ', cat:'mil', w:2, h:2, hp:400, cost:{stein:200,eisen:60,gold:100}, hq:true, radius:7, req:12,
                desc:'Oberkommando (nur 1×): hebt den Armee-Deckel und flickt Befestigungen im Umkreis.' },
  theater:    { name:'Theater', cat:'infra', w:2, h:2, hp:260, cost:{holz:120,stein:180,gold:120,eisen:20}, kultur:[30,8], gold:0.1, req:13,
                desc:'Die große Bühne: viel Kultur und etwas Gold aus dem Eintritt.' },
  heldenhalle:{ name:'Heldenhalle', cat:'mil', w:2, h:2, hp:320, cost:{holz:120,stein:80,gold:50}, heroHall:true, req:3,
                desc:'Rekrutiert einen Helden – tippe ihn an und steuere ihn aus der Ego-Perspektive.' },
  __see:      { name:'See ausheben', cat:'infra', w:1, h:1, hp:1, cost:{gold:25}, terra:'see',
                desc:'Hebt einen kleinen See aus – Grundlage für Fischerei.' },
  __wiese:    { name:'Land aufschütten', cat:'infra', w:1, h:1, hp:1, cost:{stein:30,holz:15}, terra:'wiese',
                desc:'Schüttet Wasser zu neuem Bauland auf.' },
};
const BUILDABLE = ['haus','holzfaeller','farm','fischer','gehege','steinbruch','mine','schmiede','speicher','markt','hafen','taverne','akademie','leuchtturm','theater','turm','mauer','tor','kaserne','heldenhalle','lazarett','hq','fabrik','flugfeld','stahlwerk','bohrturm','raumhafen','__see','__wiese'];
const COSTICON = { holz:'🪵', stein:'🪨', nahrung:'🌾', gold:'🪙', erz:'⛏️', eisen:'⚙️',
  stahl:'🔩', oel:'🛢️', lithium:'🔋' };
const SOLDIER_COST = { nahrung:40, gold:15 };
const RITTER_COST = { nahrung:60, gold:30, eisen:15 };
const PANZER_COST = { stahl:40, oel:20, gold:100 };
const FLIEGER_COST = { stahl:60, oel:40, gold:150 };
const LASER_COST = { lithium:20, stahl:40, gold:250 };

// --- Zeitalter: 7 Epochen über 35 Stufen (Rathaus-Stufe bestimmt die Epoche) ---
const ERAS = [
  { min:1,  name:'Mittelalter',       icon:'🏰' },
  { min:6,  name:'Renaissance',       icon:'⚜️' },
  { min:11, name:'Industriezeitalter',icon:'🏭' },
  { min:16, name:'Moderne',           icon:'✈️' },
  { min:21, name:'Digitalzeitalter',  icon:'💻' },
  { min:26, name:'Raumfahrt',         icon:'🚀' },
  { min:31, name:'Zukunft',           icon:'🔮' },
];
function eraOf(l){ let e = ERAS[0]; for (const x of ERAS) if (l>=x.min) e = x; return e; }
function fmt(n){
  n = Math.floor(n);
  if (n >= 1e6)   return (n/1e6).toFixed(1).replace('.0','')+'M';
  if (n >= 10000) return (n/1000).toFixed(1).replace('.0','')+'k';
  return ''+n;
}

// --- Ausbaustufen: Stufe 2–5 handgemacht, ab 6 prozedural bis 35 ---
const MAXLVL = 35;
const UPG = {
  rathaus:    [{holz:120,stein:80},{holz:260,stein:200,gold:80},{holz:420,stein:340,gold:150,eisen:20},{holz:650,stein:520,gold:280,eisen:60}],
  haus:       [{holz:40,stein:15},{holz:90,stein:45},{holz:150,stein:90,gold:20},{holz:240,stein:150,gold:50}],
  holzfaeller:[{holz:60,stein:20},{holz:120,stein:60},{holz:200,stein:110},{holz:320,stein:190,eisen:10}],
  steinbruch: [{holz:80,stein:20},{holz:150,stein:70},{holz:240,stein:130},{holz:380,stein:220,eisen:10}],
  farm:       [{holz:70,stein:25},{holz:140,stein:70},{holz:230,stein:130},{holz:360,stein:210,eisen:10}],
  turm:       [{holz:40,stein:90},{holz:70,stein:170,gold:40},{holz:110,stein:280,gold:90,eisen:15},{holz:170,stein:430,gold:160,eisen:40}],
  kaserne:    [{holz:90,stein:80},{holz:160,stein:150,gold:60},{holz:260,stein:250,gold:120,eisen:20},{holz:400,stein:380,gold:220,eisen:60}],
  fischer:    [{holz:70,stein:20},{holz:130,stein:60},{holz:210,stein:110},{holz:330,stein:180,eisen:10}],
  gehege:     [{holz:80,stein:30},{holz:150,stein:80,gold:30},{holz:240,stein:140,gold:70},{holz:380,stein:220,gold:130,eisen:15}],
  mine:       [{holz:150,stein:80},{holz:240,stein:140,gold:50},{holz:380,stein:230,gold:110},{holz:560,stein:360,gold:200}],
  schmiede:   [{holz:110,stein:80},{holz:190,stein:140,gold:60},{holz:300,stein:230,gold:130},{holz:460,stein:360,gold:240}],
  markt:      [{holz:120,stein:60,gold:40},{holz:200,stein:110,gold:90},{holz:320,stein:180,gold:170},{holz:480,stein:280,gold:300}],
  hafen:      [{holz:90,stein:40},{holz:160,stein:80,gold:40},{holz:260,stein:140,gold:90},{holz:400,stein:220,gold:160}],
  vorposten:  [{holz:100,stein:60},{holz:180,stein:120},{holz:280,stein:200,gold:60},{holz:420,stein:300,gold:120}],
  mauer:      [{stein:30,holz:12},{stein:55,holz:20},{stein:90,holz:35},{stein:140,holz:55}],
  tor:        [{stein:40,holz:30},{stein:70,holz:50},{stein:110,holz:80},{stein:170,holz:120}],
  stahlwerk:  [{stein:260,eisen:90,gold:120},{stein:400,eisen:150,gold:200},{stein:600,eisen:240,gold:320},{stein:900,eisen:380,gold:500}],
  bohrturm:   [{stahl:90,stein:180,gold:180},{stahl:150,stein:280,gold:290},{stahl:240,stein:430,gold:450},{stahl:380,stein:650,gold:700}],
  raumhafen:  [{stahl:450,oel:300,gold:750},{stahl:700,oel:470,gold:1150},{stahl:1050,oel:700,gold:1750},{stahl:1600,oel:1050,gold:2650}],
  akademie:   [{holz:180,stein:130,gold:80},{holz:300,stein:220,gold:150},{holz:470,stein:350,gold:260,eisen:10},{holz:720,stein:540,gold:420,eisen:30}],
  fabrik:     [{stein:210,stahl:120,gold:220},{stein:320,stahl:190,gold:350},{stein:490,stahl:300,gold:550},{stein:740,stahl:460,gold:850}],
  flugfeld:   [{stahl:150,oel:60,gold:260},{stahl:240,oel:95,gold:410},{stahl:370,oel:150,gold:640},{stahl:570,oel:230,gold:990}],
  speicher:   [{holz:90,stein:45},{holz:160,stein:90},{holz:260,stein:150},{holz:400,stein:240,eisen:10}],
  taverne:    [{holz:80,stein:30,gold:20},{holz:150,stein:60,gold:45},{holz:240,stein:110,gold:90},{holz:380,stein:180,gold:160}],
  leuchtturm: [{holz:60,stein:150,gold:40},{holz:100,stein:250,gold:80},{holz:160,stein:390,gold:150},{holz:250,stein:600,gold:260}],
  lazarett:   [{holz:120,stein:90,gold:55},{holz:200,stein:150,gold:100},{holz:320,stein:240,gold:180},{holz:500,stein:380,gold:300,eisen:15}],
  theater:    [{holz:160,stein:240,gold:170,eisen:30},{holz:260,stein:380,gold:280,eisen:55},{holz:400,stein:580,gold:440,eisen:90},{holz:620,stein:880,gold:680,eisen:140}],
  hq:         [{stein:280,eisen:90,gold:150},{stein:430,eisen:140,gold:240},{stein:650,eisen:220,gold:380},{stein:980,eisen:340,gold:590}],
  heldenhalle:[{holz:150,stein:100,gold:60},{holz:250,stein:170,gold:110},{holz:390,stein:270,gold:190,eisen:15},{holz:600,stein:420,gold:320,eisen:40}],
};
function rathausPopNeed(l){ return Math.round(8*l); }        // Bevölkerung für Rathaus-Stufe l+1
const lvlOf = (bd)=>bd.lvl||1;
function upgradeCost(bd){
  const a = UPG[bd.t];
  if (!a || lvlOf(bd) >= MAXLVL) return null;
  const L = lvlOf(bd);
  if (L <= a.length) return a[L-1];                          // Stufe 2–5: handgemacht
  // ab Stufe 6: prozedural – wächst aus den Handkosten DIESES Gebäudes weiter
  // (kein Preissprung bei L6, Mauern bleiben billig, Rathaus teuer);
  // Eisen wächst bewusst langsamer – es ist die Engpass-Ressource der Kette
  const GR = { eisen:1.15, stahl:1.18, oel:1.18, lithium:1.18 };
  const r10 = (v)=>Math.max(5, Math.round(v/10)*10);
  const last = a[a.length-1], c = {};
  for (const k in last) c[k] = r10(last[k]*Math.pow(GR[k]||1.22, L-a.length));
  if (!BT[bd.t].wall && bd.t!=='haus'){                      // Epochen-Ressourcen nur für Großbauten
    if (L >= 11 && !c.stahl)   c.stahl   = r10(28*Math.pow(1.18,L-10));
    if (L >= 16 && !c.oel)     c.oel     = r10(24*Math.pow(1.18,L-15));
    if (L >= 26 && !c.lithium) c.lithium = r10(16*Math.pow(1.18,L-25));
  }
  return c;
}
function maxHp(bd){ return Math.round(BT[bd.t].hp * (1+0.35*(lvlOf(bd)-1))); }
function bCap(bd){ if (!BT[bd.t].cap || bd.ruin) return 0;
  const l = lvlOf(bd);
  return bd.t==='rathaus'
    ? Math.round(5 + (l-1)*6 + Math.pow(l,1.6))
    : Math.round(5 + (l-1)*4);
}
function gatherWorkers(bd){ return Math.min(6, 1+lvlOf(bd)); }
function gatherAmount(bd){
  return Math.round((BT[bd.t].gather.amount + (lvlOf(bd)-1)*(BT[bd.t].gather.lvlAdd||3)) * (isEco()?1.2:1)
    * biomeBonus(bd, BT[bd.t].gather.res) * depotBonus(bd));
}
// --- Speicherhaus: Logistik-Aura (+15 % je Fuhre, +3 %/Stufe ab 2, Deckel +30 %) ---
function depotAura(bd){ return Math.min(0.30, 0.15 + 0.03*(lvlOf(bd)-1)); }
function depotBonus(bd){
  if (!state) return 1;
  const [cx,cy] = buildingCenter(bd);
  let best = 0;                                    // nur das beste Speicherhaus zählt
  for (const s of state.buildings){
    if (s.t!=='speicher' || s.ruin) continue;
    const c = buildingCenter(s);
    if (dist(cx,cy,c[0],c[1]) <= 6.01) best = Math.max(best, depotAura(s));
  }
  return 1 + best;
}
// --- Kultur (Taverne/Theater): globale Punkte, Wiesen-Biom feiert +15 % ---
function kulturPoints(){
  let p = 0;
  for (const bd of state.buildings){
    const k = BT[bd.t].kultur;
    if (!k || bd.ruin) continue;
    p += (k[0] + k[1]*(lvlOf(bd)-1)) * (biomeOfBuilding(bd)==='wiese' ? 1.15 : 1);
  }
  return p;
}
// --- Leuchtturm: bestes intaktes Exemplar zählt (Ragnars Schiffe bleiben unberührt) ---
function lighthouseLvl(){
  let l = 0;
  for (const bd of state.buildings) if (bd.t==='leuchtturm' && !bd.ruin) l = Math.max(l, lvlOf(bd));
  return l;
}
function shipSpeedFactor(){
  const l = lighthouseLvl();
  return l ? 1 + Math.min(0.60, 0.40 + 0.05*(l-1)) : 1;
}
function vorpCost(){ return lighthouseLvl() ? scaleCost(BT.__vorp.cost, 0.75) : BT.__vorp.cost; }
// --- Verteidigungs-HQ: hebt den Armee-Deckel (Ruine → sofort zurück auf 60) ---
function hqLvl(){
  let l = 0;
  for (const bd of state.buildings) if (bd.t==='hq' && !bd.ruin) l = Math.max(l, lvlOf(bd));
  return l;
}
function gatherRadius(bd){ return BT[bd.t].radius + Math.min(6, lvlOf(bd)-1); }
function prodRate(bd){
  const base = { farm:1.0, gehege:0.8, mine:0.4, bohrturm:0.3 }[bd.t];
  let r = base !== undefined ? base : BT[bd.t].prod[Object.keys(BT[bd.t].prod)[0]];
  r *= 1 + 0.45*(lvlOf(bd)-1);
  return r * (isEco()?1.2:1) * biomeBonus(bd, Object.keys(BT[bd.t].prod)[0]);
}
function smeltRate(bd){ return (bd.t==='stahlwerk'?0.2:0.25) * (1+0.55*(lvlOf(bd)-1)) * (isEco()?1.2:1); }
function towerStats(bd){ const l = lvlOf(bd);
  return { range:6+Math.min(8,l-1), dmg:Math.round((14+(l-1)*7)*(isMil()?1.2:1)),
    cd:Math.max(0.25, 0.9-(l-1)*0.05) }; }
function goldRate(bd){ return (BT[bd.t].gold||0)*lvlOf(bd)*(isEco()?1.25:1)*biomeBonus(bd,'gold'); }
function armyCap(){ let c = 0;
  for (const bd of state.buildings){
    if (bd.ruin) continue;
    if (bd.t==='kaserne') c += 4+2*lvlOf(bd);
    else if (bd.t==='fabrik' || bd.t==='flugfeld') c += 2+lvlOf(bd);
  }
  // globaler Deckel 60; das Verteidigungs-HQ hebt ihn auf bis zu 75
  return Math.min(c, Math.min(75, 60 + 3*hqLvl())); }
function rathausLvl(){ const r = state.buildings.find(b=>b.t==='rathaus'); return r ? lvlOf(r) : 1; }

// --- Ausbau-Richtungen (Doktrin): Militär vs. Wirtschaft ---
const isEco = ()=>state && state.doctrine==='eco';
const isMil = ()=>state && state.doctrine==='mil';
function scaleCost(c, f){
  const o = {};
  for (const k in c) o[k] = Math.ceil(c[k]*f);
  return o;
}

// --- Markt: Handelskurse (Gold je Einheit; besser mit Ausbaustufe) ---
const TRADE_VAL = { holz:0.3, stein:0.4, nahrung:0.35, erz:0.8, eisen:2.0 };
function sellRate(bd,k){ return TRADE_VAL[k]*0.7*(1+0.04*(lvlOf(bd)-1)); }
function buyRate(bd,k){
  const b = TRADE_VAL[k]*1.5*Math.max(0.55, 1-0.03*(lvlOf(bd)-1));
  return Math.max(b, sellRate(bd,k)*1.15);   // Kaufen bleibt immer teurer als Verkaufen
}

// --- Bedürfnisse: Nahrung, Sicherheit, Wohnraum (+ Kultur ab Renaissance) → Zufriedenheit ---
function satisfaction(){
  const cap = popCap();
  // „Dankbare Bürger“ (24d): +5 pp solange der Timer läuft, Ergebnis bleibt bei 1,0 geklemmt
  const grat = (state.quests && state.quests.gratitude > 0) ? 0.05 : 0;
  const food = clamp(state.res.nahrung / (state.pop*2+8), 0, 1);
  const towers = state.buildings.reduce((n,b)=>n+(b.t==='turm'?1:0), 0);
  // Luftpatrouille: jedes intakte Flugfeld zählt wie 3 Wachtürme
  const airf = state.buildings.reduce((n,b)=>n+(b.t==='flugfeld' && !b.ruin ?1:0), 0);
  // Der Held zählt fürs Sicherheitsgefühl fix wie 3 Soldaten (nicht wenn er am Boden liegt)
  const heroN = (state.hero && !(state.hero.respawn>0)) ? 3 : 0;
  const safety = clamp((state.soldiersOwned + heroN + towers*2 + airf*6) / (2+Math.min(state.wave,40)*1.1), 0, 1);
  const housing = cap<=0 ? 0.5 : clamp(1.6 - state.pop/cap, 0.55, 1);
  // Kultur wird erst ab Rathaus 6 zum Bedürfnis – Alt-Stände bleiben davor unverändert;
  // Sockel 0,3 („Feste auf dem Marktplatz“) verhindert den Deadlock ohne Kultur-Gebäude
  if (rathausLvl() >= 6){
    const kultur = clamp(0.3 + kulturPoints()/Math.max(1, state.pop), 0, 1);
    const total = clamp(food*0.40 + safety*0.25 + housing*0.20 + kultur*0.15 + grat, 0, 1);
    return { food, safety, housing, kultur, total: ADMIN.happy ? 1 : total };
  }
  const total = clamp(food*0.45 + safety*0.3 + housing*0.25 + grat, 0, 1);
  return { food, safety, housing, total: ADMIN.happy ? 1 : total };
}

let state = null, gameStarted = false, gameOver = false;
function newState(seed){
  return { seed, time:26,
    res:{ holz:90, stein:40, nahrung:70, gold:25, erz:0, eisen:0, stahl:0, oel:0, lithium:0 },
    pop:4, buildings:[], chopped:[], regrown:[], terra:[], wave:1, waveTimer:330,
    waveActive:false, soldiersOwned:0, popTick:0, muted:false, doctrine:null,
    ais:[], newLordT:0, lordsWon:0,
    planets:[], chronicle:[], research:{}, researchJob:null,
    dungeons:{ cleared:{} },
    quests:{ offers:[], active:[], done:0, seedCtr:0, gratitude:0, camp:null },
    seenUnlocks: BUILDABLE.filter(t=>!BT[t].req || BT[t].req<=1) };
}

// ============================== KARTE ==============================
let tiles, treeMap, rockMap, occ, aiOcc, treeList, rockList;
const BIOMES = ['wald','schnee','vulkan','wueste','wiese'];
const BIOME_NAME = { wiese:'Wiesenland', wald:'Waldland', schnee:'Schneeland',
  vulkan:'Vulkanland', wueste:'Wüstenland' };
// Inseln aus dem Seed würfeln: 1 große Heimatinsel, 2–3 mittlere, 3–4 kleine (7–8 gesamt)
function genIsles(rng){
  const isles = [];
  const place = (r, cls)=>{
    // Wunsch: ~10 Kacheln Wasser zwischen Inseln, Rand ≥ 6; Failsafe: Abstand lockern
    for (const gap of [10, 6, 3]){
      for (let tries=0;tries<300;tries++){
        const m = r+6;
        const x = m + rng()*(MAP-2*m), y = m + rng()*(MAP-2*m);
        if (isles.some(I=>dist(x,y,I.x,I.y) < I.r + r + gap)) continue;
        isles.push({ x:Math.round(x), y:Math.round(y), r, cls });
        return;
      }
    }
  };
  place(19 + rng()*3, 'gross');
  const nMed = rng()<0.5 ? 2 : 3;
  const nSm = (rng()<0.5 ? 3 : 4) + (nMed===2 ? 1 : 0);     // gesamt immer 7 oder 8
  for (let i=0;i<nMed;i++) place(12 + rng()*3, 'mittel');
  for (let i=0;i<nSm;i++)  place(7 + rng()*3, 'klein');
  // Biome: Heimat immer Wiese; Rest gemischt, jedes andere Biom mindestens einmal
  isles[0].biome = 'wiese';
  const rest = ['wald','schnee','vulkan','wueste'];
  while (rest.length < isles.length-1) rest.push(BIOMES[(rng()*BIOMES.length)|0]);
  for (let i=rest.length-1;i>0;i--){ const j=(rng()*(i+1))|0; const t=rest[i]; rest[i]=rest[j]; rest[j]=t; }
  for (let i=1;i<isles.length;i++) isles[i].biome = rest[i-1];
  return isles;
}
// Startpunkt: Kachel auf der Heimatinsel mit möglichst viel Land im Umkreis
function findStart(){
  const I = ISLES[0], R = Math.ceil(I.r);
  let best = null, bestScore = -1;
  for (let y=I.y-R;y<=I.y+R;y++) for (let x=I.x-R;x<=I.x+R;x++){
    if (!inMap(x,y) || tiles[idx(x,y)]!==2) continue;
    let land = 0;
    for (let dy=-5;dy<=5;dy++) for (let dx=-5;dx<=5;dx++)
      if (inMap(x+dx,y+dy) && tiles[idx(x+dx,y+dy)]===2) land++;
    const score = land - dist(x,y,I.x,I.y)*0.6;
    if (score > bestScore){ bestScore = score; best = [x,y]; }
  }
  return best || [I.x, I.y];
}
function genMap(){
  const rng = mulberry32(state.seed);
  ISLES = genIsles(mulberry32(state.seed ^ 0x15b3c7));
  const n1 = noiseGrid(rng, 24), n2 = noiseGrid(rng, 48);
  tiles = new Uint8Array(MAP*MAP);
  treeMap = new Uint8Array(MAP*MAP);
  rockMap = new Uint8Array(MAP*MAP);
  occ = new Int16Array(MAP*MAP);
  aiOcc = new Int16Array(MAP*MAP);
  for (let y=0;y<MAP;y++) for (let x=0;x<MAP;x++){
    let e = n1(x/6,y/6)*0.65 + n2(x/2.6,y/2.6)*0.35;
    // Mehrere Inseln: stärkste Insel-Nähe bestimmt die Landmasse
    let f = 0;
    for (const I of ISLES) f = Math.max(f, clamp(1 - dist(x,y,I.x,I.y)/I.r, 0, 1));
    e = e * clamp(f*2.0, 0, 1) + f*0.12;
    tiles[idx(x,y)] = e < 0.30 ? 0 : (e < 0.345 ? 1 : 2);
  }
  const st = findStart();
  SX = st[0]; SY = st[1];
  state.startX = SX; state.startY = SY;
  for (let y=SY-5;y<=SY+5;y++) for (let x=SX-5;x<=SX+5;x++)
    if (inMap(x,y) && dist(x,y,SX,SY) <= 5.5) tiles[idx(x,y)] = 2;
  computeIsles();                        // Biome jetzt schon für die Baum-/Felsdichte nötig
  for (let y=1;y<MAP-1;y++) for (let x=1;x<MAP-1;x++){
    const k = idx(x,y);
    if (tiles[k] !== 2) continue;
    if (dist(x,y,SX,SY) < 3.6) continue;
    const bio = isleBiome[isleId[k]] || 'wiese';
    // Baumdichte je Biom: Wald dicht, Schnee spärlich, Vulkan/Wüste fast kahl
    const dens = bio==='wald'?1.6 : bio==='schnee'?0.35 : bio==='vulkan'?0.08 : bio==='wueste'?0.15 : 1;
    const f = n2(x/2.1+9.7, y/2.1+3.3);
    if (f > (bio==='wald'?0.54:0.60) && rng() < 0.75*dens) treeMap[k] = 1 + Math.floor(rng()*3);
    else if (n1(x/3.4+5.1, y/3.4+8.8) > (bio==='vulkan'?0.58:0.68) && rng() < (bio==='vulkan'?0.62:0.30))
      rockMap[k] = 1 + Math.floor(rng()*2);
  }
  // Scatter-Deckel: Bestand deterministisch ausdünnen (Instanz- und Renderbudget)
  const thin = (map, cap, salt)=>{
    let n = 0;
    for (let i=0;i<MAP*MAP;i++) if (map[i]) n++;
    if (n <= cap) return;
    const tr = mulberry32(state.seed ^ salt), keep = cap/n;
    for (let i=0;i<MAP*MAP;i++) if (map[i] && tr() > keep) map[i] = 0;
  };
  thin(treeMap, 800, 0x7f3a2b);
  thin(rockMap, 140, 0x2b9d44);
  const ensure = (map, n)=>{
    let count = 0;
    for (let y=0;y<MAP;y++) for (let x=0;x<MAP;x++)
      if (map[idx(x,y)] && dist(x,y,SX,SY) < 10) count++;
    let tries = 0;
    while (count < n && tries++ < 400){
      const a = rng()*Math.PI*2, r = 5 + rng()*4;
      const x = Math.round(SX + Math.cos(a)*r), y = Math.round(SY + Math.sin(a)*r);
      if (inMap(x,y) && tiles[idx(x,y)]===2 && !treeMap[idx(x,y)] && !rockMap[idx(x,y)] && !occ[idx(x,y)]){
        map[idx(x,y)] = 1 + Math.floor(rng()*2); count++;
      }
    }
  };
  ensure(treeMap, 8); ensure(rockMap, 4);
  for (const i of state.chopped) treeMap[i] = 0;
  // Nachgewachsene Bäume wiederherstellen
  for (const r of (state.regrown||[]))
    if (inMap(r.x,r.y) && tiles[idx(r.x,r.y)]===2 && !treeMap[idx(r.x,r.y)] && !rockMap[idx(r.x,r.y)])
      treeMap[idx(r.x,r.y)] = r.v;
  // Terraforming (Seen/aufgeschüttetes Land) wieder anwenden
  for (const t of (state.terra||[])){
    const k = idx(t.x,t.y);
    tiles[k] = t.w;
    if (t.w===0){ treeMap[k] = 0; rockMap[k] = 0; }
  }
  treeList = []; rockList = [];
  const rng2 = mulberry32(state.seed ^ 0x9e3779b9);
  for (let y=0;y<MAP;y++) for (let x=0;x<MAP;x++){
    const r = rng2();
    const bio = isleBiome[isleId[idx(x,y)]] || 'wiese';
    if (treeMap[idx(x,y)]) treeList.push({x,y,v:treeMap[idx(x,y)],ph:r*7,ox:(r-0.5)*0.7,oy:(rng2()-0.5)*0.7,s:0.75+rng2()*0.5,b:bio,sn:bio==='schnee'});
    if (rockMap[idx(x,y)]) rockList.push({x,y,v:rockMap[idx(x,y)],ph:r*7,s:0.8+rng2()*0.5});
  }
  computeIsles();                        // final: inkl. Terraforming-Änderungen
  invalidateTreeCache();                 // neuer Baum-Bestand + neue Insel-IDs
}
// Insel-Zugehörigkeit jeder Landkachel (Flutfüllung) + Biom je Landmasse
let isleId = null, isleBiome = null, isleParent = null, isleAreaP = null;
function computeIsles(){
  isleId = new Int16Array(MAP*MAP);
  let next = 0;
  const sumX = [0], sumY = [0], cnt = [0];
  const stack = [];
  for (let y=0;y<MAP;y++) for (let x=0;x<MAP;x++){
    if (tiles[idx(x,y)]===0 || isleId[idx(x,y)]) continue;
    next++;
    sumX[next] = 0; sumY[next] = 0; cnt[next] = 0;
    stack.push([x,y]);
    isleId[idx(x,y)] = next;
    while (stack.length){
      const [px,py] = stack.pop();
      sumX[next] += px; sumY[next] += py; cnt[next]++;
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx = px+dx, ny = py+dy;
        if (inMap(nx,ny) && tiles[idx(nx,ny)]>0 && !isleId[idx(nx,ny)]){
          isleId[idx(nx,ny)] = next;
          stack.push([nx,ny]);
        }
      }
    }
  }
  // Jede Landmasse ihrer Ursprungs-Insel zuordnen (Biom folgt der Insel-Definition)
  isleBiome = ['wiese']; isleParent = [0];
  isleAreaP = ISLES.map(()=>0);                  // Landfläche je Ursprungs-Insel (Wildtier-Caps)
  for (let id=1; id<=next; id++){
    const mx = sumX[id]/cnt[id], my = sumY[id]/cnt[id];
    let bi = 0, bs = -1e9;
    ISLES.forEach((I,i)=>{ const f = 1 - dist(mx,my,I.x,I.y)/I.r; if (f > bs){ bs = f; bi = i; } });
    isleParent[id] = bi;
    isleBiome[id] = ISLES[bi] ? ISLES[bi].biome : 'wiese';
    isleAreaP[bi] += cnt[id];
  }
}
const isleOf = (fx,fy)=>{
  const x = Math.round(fx), y = Math.round(fy);
  return inMap(x,y) ? isleId[idx(x,y)] : 0;
};
const playerIsle = ()=>isleId[idx(SX,SY)];
// --- Insel-Biome: Ressourcen-Boni NUR für Spieler-Gebäude (KI nutzt diese Pfade nicht) ---
const BIOME_MULT = {
  wald:   { holz:1.25 },
  schnee: { stein:1.25, erz:1.25 },
  vulkan: { erz:1.3, oel:1.3 },
  wueste: { gold:1.25, oel:1.2 },
  wiese:  { nahrung:1.15 },
};
const BIOME_BONI_TXT = { wald:'+25% 🪵', schnee:'+25% 🪨/⛏️', vulkan:'+30% ⛏️/🛢️',
  wueste:'+25% 🪙 · +20% 🛢️', wiese:'+15% 🌾' };
const BIOME_CHRON = {
  wald:  '🌲 Erster Vorposten im Waldland – die Äxte singen.',
  schnee:'❄️ Erster Vorposten im Schneeland – Frost über Fels und Erz.',
  vulkan:'🌋 Erster Vorposten im Vulkanland – Glut unter den Füßen.',
  wueste:'🏜️ Erster Vorposten im Wüstenland – Gold glitzert im Sand.',
  wiese: '🌿 Erster Vorposten im Wiesenland einer fremden Insel.',
};
function biomeOfBuilding(bd){
  if (!isleBiome) return 'wiese';
  const [cx0,cy0] = buildingCenter(bd);
  return isleBiome[isleOf(cx0,cy0)] || 'wiese';
}
function biomeBonus(bd, res){
  const m = BIOME_MULT[biomeOfBuilding(bd)];
  return (m && m[res]) || 1;
}
// Nächste Kachel um (x,y), die pred erfüllt (expandierende Ringe)
function nearestTile(x0,y0,pred,maxR){
  x0 = Math.round(x0); y0 = Math.round(y0);
  if (inMap(x0,y0) && pred(x0,y0)) return [x0,y0];
  for (let r=1;r<=(maxR||24);r++)
    for (let dy=-r;dy<=r;dy++) for (let dx=-r;dx<=r;dx++){
      if (Math.max(Math.abs(dx),Math.abs(dy)) !== r) continue;
      const x = x0+dx, y = y0+dy;
      if (inMap(x,y) && pred(x,y)) return [x,y];
    }
  return null;
}
const findCoastWater = (x,y)=>nearestTile(x,y,(px,py)=>tiles[idx(px,py)]===0) || [x,y];
const findLanding = (x,y)=>nearestTile(x,y,(px,py)=>walkable(px,py)) || [x,y];

// ============================== 3D-GRUNDGERÜST ==============================
const cv = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;   // weiche Schattenkanten
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c4eb);
scene.fog = new THREE.Fog(0x87c4eb, 58, 175);   // dezenter Distanz-Nebel (Farbe folgt dem Himmel)

const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 400);
const cam = { tx:0, tz:0, az:Math.PI*0.75, dist:23, pol:0.94 };
function updateCam(){
  camera.position.set(
    cam.tx + cam.dist*Math.sin(cam.pol)*Math.cos(cam.az),
    cam.dist*Math.cos(cam.pol) + 1,
    cam.tz + cam.dist*Math.sin(cam.pol)*Math.sin(cam.az));
  camera.lookAt(cam.tx, 0.6, cam.tz);
}
function resize(){
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w/h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

const hemi = new THREE.HemisphereLight(0xd9ecff, 0x7d8154, 0.9);   // mehr Fülllicht, wärmerer Boden
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -42; sun.shadow.camera.right = 42;
sun.shadow.camera.top = 42; sun.shadow.camera.bottom = -42;
sun.shadow.camera.near = 2; sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);

// Sterne
let stars;
{ const g = new THREE.BufferGeometry(), pos = [];
  const r = mulberry32(1234);
  for (let i=0;i<420;i++){
    const a = r()*Math.PI*2, e = r()*Math.PI*0.46 + 0.06, R = 180;
    pos.push(R*Math.cos(e)*Math.cos(a), R*Math.sin(e), R*Math.cos(e)*Math.sin(a));
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  stars = new THREE.Points(g, new THREE.PointsMaterial({ color:0xeef2ff, size:0.9,
    sizeAttenuation:false, transparent:true, opacity:0, fog:false, depthWrite:false }));
  scene.add(stars);
}
// Wolken
const clouds = [];
{ const r = mulberry32(777);
  const mat = new THREE.MeshStandardMaterial({ color:0xffffff, roughness:1, transparent:true,
    opacity:0.88, flatShading:true });
  for (let i=0;i<9;i++){
    const grp = new THREE.Group();
    const n = 3+Math.floor(r()*3);
    for (let k=0;k<n;k++){
      const s = 2.2+r()*3.4;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s,0), mat);
      m.position.set((r()-0.5)*8, (r()-0.5)*1.2, (r()-0.5)*4);
      m.scale.y = 0.4; grp.add(m);
    }
    grp.position.set((r()-0.5)*300, 26+r()*8, (r()-0.5)*300);
    grp.userData.v = 0.8+r()*0.8;
    scene.add(grp); clouds.push(grp);
  }
}

// ============================== MATERIALIEN ==============================
const std = (c,extra)=>new THREE.MeshStandardMaterial(Object.assign(
  { color:c, roughness:0.95, metalness:0, flatShading:true }, extra||{}));
const M = {
  plaster: std(0xf1e6cb), timber: std(0x5a3a22),
  roofRed: std(0xb5442e,{side:THREE.DoubleSide}), roofBlue: std(0x3a6b9e,{side:THREE.DoubleSide}),
  roofThatch: std(0xc8a24a,{side:THREE.DoubleSide}), roofGreen: std(0x74875c,{side:THREE.DoubleSide}),
  stone: std(0x9b9ba6), stoneDark: std(0x83838e), stoneLight: std(0xb2b2bc),
  wood: std(0x8a5c34), woodDark: std(0x6b482a), woodLight: std(0xc08c50),
  logEnd: std(0xe0b27a), soil: std(0x7a5a34), soilLight: std(0x96703f),
  wheat: std(0xd8b84a), hay: std(0xe3c162),
  door: std(0x5c3a1c),
  window: std(0x40372a,{ emissive:0xffc860, emissiveIntensity:0 }),
  banner: std(0xa8303a), gold: std(0xd8b02f),
  skin: std(0xe8b88a), steel: std(0x9aa2ae),
  fire: std(0xff9d3c,{ emissive:0xff8020, emissiveIntensity:1.4 }),
  trunk: std(0x6b4a2a), leafPine: std(0x2f6132), leafOak: std(0x468a4a),
  rock: std(0x8e8e99),
  enemyBody: std(0x4a3535), soldierBody: std(0x4d6a99),   // klareres Blau: Freund/Feind sofort lesbar
  deer: std(0x8a6742), deerDark: std(0x5f4630), antler: std(0xd9c9a8),
};
const FOLK_MATS = [0xb04a3a,0x3a6ab0,0x4a8a4a,0xa08a3a,0x7a4a9a].map(c=>std(c));
// Geteilte Materialien markieren – disposeGroup lässt sie in Ruhe
// (std() erzeugt sonst pro Aufruf ein eigenes, freigebbares Material)
for (const k in M) M[k].userData.shared = true;
for (const m of FOLK_MATS) m.userData.shared = true;

// ============================== GEOMETRIE-HELFER ==============================
function mesh(geo, mat, cast, recv){
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast!==false; m.receiveShadow = recv!==false;
  return m;
}
function bx(w,h,d,mat,x,y,z){       // Quader, y = Unterkante
  const m = mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x||0,(y||0)+h/2,z||0);
  return m;
}
// Satteldach-Prisma (First entlang X), y = Unterkante
function prismGeo(w,h,d){
  const w2=w/2, d2=d/2;
  const v = [
    // Vorderschräge (+z)
    -w2,0,d2,  w2,0,d2,  w2,h,0,   -w2,0,d2,  w2,h,0,  -w2,h,0,
    // Rückschräge (-z)
    w2,0,-d2, -w2,0,-d2, -w2,h,0,   w2,0,-d2, -w2,h,0,  w2,h,0,
    // Giebel links / rechts
    -w2,0,-d2, -w2,0,d2, -w2,h,0,
    w2,0,d2,  w2,0,-d2,  w2,h,0,
    // Boden
    -w2,0,-d2, w2,0,-d2, w2,0,d2,  -w2,0,-d2, w2,0,d2, -w2,0,d2,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v,3));
  g.computeVertexNormals();
  return g;
}
function prism(w,h,d,mat,x,y,z){
  const m = mesh(prismGeo(w,h,d), mat);
  m.position.set(x||0,y||0,z||0);
  return m;
}
function cyl(rT,rB,h,mat,x,y,z,seg){
  const m = mesh(new THREE.CylinderGeometry(rT,rB,h,seg||8), mat);
  m.position.set(x||0,(y||0)+h/2,z||0);
  return m;
}
// Kleine Deko-Teile (Fenster, Zinnen, Wimpel …) werfen keine Schatten –
// spart Schatten-Draw-Calls, große Teile (Wände, Dächer) bleiben Schattenwerfer
function pruneSmallShadowCasters(g){
  g.traverse(o=>{
    if (!o.isMesh || !o.castShadow || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox;
    const dx = (b.max.x-b.min.x)*Math.abs(o.scale.x),
          dy = (b.max.y-b.min.y)*Math.abs(o.scale.y),
          dz = (b.max.z-b.min.z)*Math.abs(o.scale.z);
    if (Math.max(dx,dy,dz) < 0.55) o.castShadow = false;
  });
  return g;
}
function crenels(grp, hw, hd, y, mat){    // Zinnenkranz um Rechteck ±hw/±hd
  const s = 0.22, hh = 0.22;
  for (let i=-2;i<=2;i++){
    grp.add(bx(s,hh,s,mat, i*hw*0.45, y,  hd));
    grp.add(bx(s,hh,s,mat, i*hw*0.45, y, -hd));
    if (Math.abs(i)<=1){
      grp.add(bx(s,hh,s,mat,  hw, y, i*hd*0.6));
      grp.add(bx(s,hh,s,mat, -hw, y, i*hd*0.6));
    }
  }
}
function windowRow(grp, n, w0, y, z, mat){
  for (let i=0;i<n;i++)
    grp.add(bx(0.26,0.3,0.05, mat, w0 + i*(2*Math.abs(w0)/(Math.max(n-1,1))||0), y, z));
}

// ============================== GEBÄUDE-MODELLE ==============================
function makeDeer(){
  const d = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(0.4,0.22,0.2), M.deer); body.position.y = 0.3; d.add(body);
  const head = mesh(new THREE.BoxGeometry(0.13,0.16,0.13), M.deer); head.position.set(0.24,0.47,0); d.add(head);
  const nose = mesh(new THREE.BoxGeometry(0.06,0.06,0.08), M.deerDark); nose.position.set(0.32,0.43,0); d.add(nose);
  for (const [lx,lz] of [[-0.13,-0.06],[-0.13,0.06],[0.13,-0.06],[0.13,0.06]]){
    const leg = mesh(new THREE.BoxGeometry(0.05,0.2,0.05), M.deerDark);
    leg.position.set(lx,0.1,lz); d.add(leg);
  }
  for (const s of [-1,1]){
    const a1 = mesh(new THREE.BoxGeometry(0.02,0.18,0.02), M.antler);
    a1.position.set(0.21,0.62,s*0.05); a1.rotation.z = -0.35; a1.rotation.x = s*0.55; d.add(a1);
    const a2 = mesh(new THREE.BoxGeometry(0.02,0.1,0.02), M.antler);
    a2.position.set(0.24,0.66,s*0.09); a2.rotation.z = 0.5; a2.rotation.x = s*0.7; d.add(a2);
  }
  d.traverse(o=>{ if (o.isMesh) o.castShadow = true; });
  return d;
}
function makeBuilding(t){
  const g = new THREE.Group();
  if (t==='haus'){
    g.add(bx(1.8,0.22,1.8, M.stone, 0,-0.5,0));   // Fundament (versenkt Hanglagen)
    g.add(bx(1.8,0.5,1.8, M.stone, 0,-0.28,0));
    g.add(bx(1.56,0.95,1.56, M.plaster, 0,0.22,0));
    for (const sx of [-0.72,0.72]) for (const sz of [-0.72,0.72])
      g.add(bx(0.12,0.95,0.12, M.timber, sx,0.22,sz));
    g.add(bx(1.6,0.1,1.6, M.timber, 0,1.12,0));
    g.add(bx(0.28,0.32,0.06, M.window, -0.38,0.55,0.78));
    g.add(bx(0.28,0.32,0.06, M.window, 0.3,0.55,0.78));
    g.add(bx(0.26,0.3,0.06, M.window, 0.78,0.5,-0.3).rotateY(Math.PI/2));
    g.add(bx(0.4,0.62,0.06, M.door, 0.78,0.22,0.3).rotateY(Math.PI/2));
    g.add(prism(2.05,0.85,2.05, M.roofRed, 0,1.2,0));
    g.add(bx(0.22,0.62,0.22, M.stoneDark, -0.5,1.45,0.28));
  }
  else if (t==='rathaus'){
    g.add(bx(3.7,0.3,3.7, M.stone, 0,-0.55,0));
    g.add(bx(3.7,0.55,3.7, M.stone, 0,-0.3,0));
    g.add(bx(3.3,1.5,3.3, M.plaster, 0,0.25,0));
    for (const sx of [-1.56,-0.52,0.52,1.56])
      g.add(bx(0.13,1.5,0.13, M.timber, sx,0.25,1.6));
    for (const sz of [-1.56,-0.52,0.52,1.56])
      g.add(bx(0.13,1.5,0.13, M.timber, 1.6,0.25,sz));
    g.add(bx(3.36,0.12,3.36, M.timber, 0,1.68,0));
    for (const sx of [-1.05,0,1.05])
      g.add(bx(0.32,0.4,0.06, M.window, sx,0.85,1.68));
    for (const sz of [-1.05,1.05])
      g.add(bx(0.32,0.4,0.06, M.window, 1.68,0.85,sz).rotateY(Math.PI/2));
    g.add(bx(0.62,0.85,0.08, M.door, 1.68,0.25,0).rotateY(Math.PI/2));
    g.add(prism(3.9,1.25,3.9, M.roofBlue, 0,1.75,0));
    const tw = new THREE.Group(); tw.position.set(0,2.55,0);
    tw.add(bx(0.85,1.1,0.85, M.plaster));
    tw.add(bx(0.24,0.3,0.05, M.window, 0,0.55,0.44));
    tw.add(prism(1.05,0.6,1.05, M.roofBlue, 0,1.1,0));
    g.add(tw);
    g.add(cyl(0.025,0.025,0.9, M.timber, 0,4.2,0,5));
    const flag = mesh(new THREE.PlaneGeometry(0.62,0.34), std(0xd8b02f,{side:THREE.DoubleSide}));
    flag.position.set(0.33,4.95,0); flag.name = 'flag';
    g.add(flag);
    // 📜 Anschlagtafel (24d): Brett mit 2 Zetteln an 2 Pfosten neben dem Eingang
    const tafel = new THREE.Group(); tafel.name = 'tafel';
    tafel.add(bx(0.06,0.8,0.06, M.woodDark, -0.38,0.15,0));
    tafel.add(bx(0.06,0.8,0.06, M.woodDark, 0.38,0.15,0));
    tafel.add(bx(0.9,0.52,0.05, M.wood, 0,0.42,0));
    tafel.add(bx(0.24,0.32,0.02, M.plaster, -0.19,0.44,0.035));
    tafel.add(bx(0.24,0.28,0.02, M.plaster, 0.2,0.4,0.035));
    tafel.position.set(1.92,-0.18,-0.95); tafel.rotation.y = Math.PI/2;
    tafel.traverse(o=>{ if (o.isMesh) o.castShadow = false; });
    g.add(tafel);
  }
  else if (t==='holzfaeller'){
    g.add(bx(1.6,0.2,1.6, M.stoneDark, 0,-0.45,0));
    g.add(bx(1.6,0.45,1.6, M.stoneDark, 0,-0.28,0));
    for (let i=0;i<4;i++)
      g.add(bx(1.44,0.19,1.44, i%2?M.wood:M.woodDark, 0,0.17+i*0.19,0));
    g.add(bx(0.36,0.55,0.06, M.door, 0.73,0.17,0.2).rotateY(Math.PI/2));
    g.add(bx(0.24,0.24,0.06, M.window, -0.3,0.5,0.73));
    g.add(prism(1.85,0.6,1.85, M.roofGreen, 0,0.95,0));
    // Holzstapel
    const lg = new THREE.CylinderGeometry(0.11,0.11,0.85,7);
    for (const [px,py,pz] of [[-1.05,0.11,0.35],[-1.05,0.11,0.09],[-1.05,0.11,-0.17],[-1.05,0.3,0.22],[-1.05,0.3,-0.04]]){
      const log = mesh(lg, M.woodLight); log.rotation.z = Math.PI/2;
      log.position.set(px,py,pz); g.add(log);
    }
    g.add(cyl(0.16,0.19,0.28, M.woodDark, 0.95,0,-0.65,7));  // Hackstock
  }
  else if (t==='steinbruch'){
    g.add(bx(1.7,0.16,1.7, M.soil, 0,-0.4,0));
    const r1 = mesh(new THREE.IcosahedronGeometry(0.55,0), M.rock); r1.position.set(-0.25,0.3,0.1); r1.scale.y=0.75; g.add(r1);
    const r2 = mesh(new THREE.IcosahedronGeometry(0.4,0), M.stoneLight); r2.position.set(0.42,0.22,-0.32); g.add(r2);
    const r3 = mesh(new THREE.IcosahedronGeometry(0.3,0), M.stoneDark); r3.position.set(0.28,0.16,0.5); g.add(r3);
    g.add(bx(0.1,1.3,0.1, M.woodDark, -0.7,0,0.55));
    g.add(bx(0.1,1.3,0.1, M.woodDark, 0.65,0,0.45));
    g.add(bx(1.55,0.09,0.09, M.woodDark, 0,1.28,0.5));
    g.add(bx(0.05,0.55,0.05, M.timber, 0,0.75,0.5));
    g.add(bx(0.26,0.2,0.26, M.stoneLight, 0,0.55,0.5));
    for (const [px,pz] of [[-0.62,-0.55],[-0.32,-0.62],[-0.5,-0.3]])
      g.add(bx(0.26,0.2,0.26, M.stoneLight, px,0,pz));
  }
  else if (t==='farm'){
    g.add(bx(3.6,0.2,3.6, M.soil, 0,-0.42,0));
    g.add(bx(3.4,0.14,3.4, M.soil, 0,-0.02,0));
    for (let i=-2;i<=2;i++)
      g.add(bx(3.2,0.07,0.22, M.soilLight, 0,0.1,i*0.6));
    // Weizen als zusammengefasste Kegel
    const cones = [], cg = new THREE.ConeGeometry(0.07,0.4,5);
    const rr = mulberry32(7);
    for (let i=0;i<42;i++){
      const gg = cg.clone();
      gg.translate((rr()-0.5)*3, 0.32, (rr()-0.5)*3);
      cones.push(gg);
    }
    g.add(mesh(mergeGeometries(cones), M.wheat));
    // Hütte
    const hut = new THREE.Group(); hut.position.set(-1.05,0,-1.05);
    hut.add(bx(1.15,0.75,1.15, M.plaster, 0,0.12,0));
    hut.add(bx(0.3,0.45,0.05, M.door, 0,0.14,0.59));
    hut.add(prism(1.4,0.5,1.4, M.roofThatch, 0,0.87,0));
    g.add(hut);
    const hb = cyl(0.34,0.34,0.6, M.hay, 1.15,0.12,-1.1,9);
    hb.rotation.z = Math.PI/2; g.add(hb);
    for (let i=0;i<=5;i++) g.add(bx(0.07,0.4,0.07, M.woodDark, -1.65+i*0.66,0.1,1.72));
    g.add(bx(3.4,0.06,0.06, M.woodDark, 0,0.38,1.72));
  }
  else if (t==='kaserne'){
    g.add(bx(3.6,0.3,3.6, M.stoneDark, 0,-0.5,0));
    g.add(bx(3.3,1.15,3.3, M.stone, 0,-0.2,0));
    g.add(bx(3.4,0.14,3.4, M.stoneLight, 0,0.95,0));
    crenels(g, 1.65, 1.65, 1.09, M.stoneLight);
    g.add(bx(0.75,0.8,0.08, M.door, 1.66,-0.2,0).rotateY(Math.PI/2));
    for (const sz of [-0.95,0.95]){
      const b = mesh(new THREE.PlaneGeometry(0.4,0.75), std(0xa8303a,{side:THREE.DoubleSide}));
      b.position.set(-0.6+ (sz>0?1.2:0), 0.5, 1.68); b.castShadow=false; g.add(b);
      const disk = mesh(new THREE.CircleGeometry(0.09,10), std(0xf0dca2,{side:THREE.DoubleSide}));
      disk.position.set(-0.6+(sz>0?1.2:0), 0.55, 1.69); disk.castShadow=false; g.add(disk);
    }
    for (const dx of [-0.16,0,0.16]){
      const sp = cyl(0.02,0.02,1.0, M.steel, 1.15+dx,0.75,-1.15,5);
      sp.rotation.z = 0.2; g.add(sp);
    }
  }
  else if (t==='stahlwerk'){
    g.add(bx(3.6,0.3,3.6, M.stoneDark, 0,-0.5,0));
    g.add(bx(2.6,1.3,1.8, std(0x9a5a48), -0.3,-0.2,0));            // Backstein-Halle
    g.add(prism(2.8,0.6,2.0, M.stoneDark, -0.3,1.1,0));
    g.add(bx(0.9,1.0,1.4, std(0x8a4f3e), 1.2,-0.2,0.6));
    g.add(cyl(0.22,0.26,2.4, M.stoneDark, 1.2,0.3,-0.9,8));        // großer Schornstein
    g.add(cyl(0.24,0.24,0.15, std(0xc23b2a), 1.2,2.7,-0.9,8));
    const glow = mesh(new THREE.BoxGeometry(0.7,0.5,0.08), M.fire);
    glow.position.set(-0.3,0.15,0.95); g.add(glow);                // glühendes Tor
    for (const px of [-1.2,-0.4,0.4])
      g.add(bx(0.3,0.35,0.06, M.window, px,0.5,0.92));
    g.add(bx(0.5,0.4,0.5, M.steel, 1.4,-0.2,1.3));                 // Stahlbarren-Stapel
    g.add(bx(0.4,0.3,0.4, M.stoneLight, -1.5,-0.2,1.3));
  }
  else if (t==='bohrturm'){
    g.add(bx(1.7,0.25,1.7, M.soil, 0,-0.45,0));
    // Derrick (A-Gerüst)
    for (const [sx,sz] of [[-0.5,-0.5],[0.5,-0.5],[0.5,0.5],[-0.5,0.5]]){
      const leg = bx(0.09,2.6,0.09, M.steel, sx*0.8,-0.2,sz*0.8);
      leg.rotation.x = -sz*0.28; leg.rotation.z = sx*0.28;
      leg.position.set(sx*0.55,-0.2+1.3,sz*0.55); g.add(leg);
    }
    g.add(bx(0.5,0.3,0.5, M.steel, 0,2.15,0));
    g.add(bx(0.06,2.2,0.06, M.stoneDark, 0,0,0));                  // Bohrgestänge
    g.add(cyl(0.4,0.4,0.6, std(0x2a2a30), 0.95,-0.2,0.6,10));      // Öltank
    g.add(cyl(0.28,0.28,0.4, std(0x2a2a30), 0.75,-0.2,-0.7,10));
    const pool = mesh(new THREE.CircleGeometry(0.4,12), std(0x14141a,{flatShading:false}), false, false);
    pool.rotation.x = -Math.PI/2; pool.position.set(-0.8,0.06,-0.6); g.add(pool);
  }
  else if (t==='raumhafen'){
    g.add(bx(3.7,0.3,3.7, M.stoneDark, 0,-0.5,0));
    const pad = mesh(new THREE.CircleGeometry(1.5,24), std(0x55555f,{flatShading:false}), false, true);
    pad.rotation.x = -Math.PI/2; pad.position.set(0.3,-0.12,0.3); g.add(pad);
    const ring = mesh(new THREE.RingGeometry(1.1,1.25,24), std(0xd8b02f,{side:THREE.DoubleSide}), false, false);
    ring.rotation.x = -Math.PI/2; ring.position.set(0.3,-0.08,0.3); g.add(ring);
    // Rakete auf der Rampe
    const rk = new THREE.Group(); rk.name = 'rocket'; rk.position.set(0.3,-0.1,0.3);
    rk.add(cyl(0.28,0.32,1.9, std(0xe8eaf0), 0,0,0,10));
    rk.add(cyl(0.02,0.28,0.7, std(0xc23b2a), 0,1.9,0,10));
    for (let i=0;i<3;i++){
      const a = i/3*Math.PI*2;
      const fin = bx(0.08,0.55,0.3, std(0xc23b2a), Math.cos(a)*0.32, -0.05, Math.sin(a)*0.32);
      fin.rotation.y = -a; rk.add(fin);
    }
    rk.add(bx(0.16,0.16,0.05, M.window, 0,1.35,0.29));
    g.add(rk);
    // Kontrollturm + Antenne
    g.add(bx(0.8,1.4,0.8, std(0xbfc6d0), -1.35,-0.2,-1.2));
    g.add(bx(1.0,0.3,1.0, std(0x3d6fb4), -1.35,1.2,-1.2));
    g.add(cyl(0.02,0.02,0.9, M.steel, -1.35,1.5,-1.2,5));
    const dish = mesh(new THREE.SphereGeometry(0.22,8,5,0,Math.PI*2,0,Math.PI/2), M.steel);
    dish.position.set(-1.15,2.1,-1.0); dish.rotation.x = Math.PI*0.8; g.add(dish);
    g.add(bx(0.6,0.5,0.9, std(0x8a8f9a), 1.4,-0.2,-1.3));          // Treibstofftanks
    g.add(cyl(0.18,0.18,0.7, std(0xe8eaf0), 1.25,-0.2,-1.25,8));
    g.add(cyl(0.18,0.18,0.7, std(0xe8eaf0), 1.6,-0.2,-1.35,8));
  }
  else if (t==='hafen'){
    // Bootshaus auf der Landseite; Steg zeigt lokal nach +X –
    // orientHarbor() dreht das Modell zur Wasserkachel und legt den Steg auf Wasserhöhe
    g.add(bx(1.9,0.65,1.9, M.stoneDark, -0.05,-0.6,0));            // Fundament (versenkt Hanglagen)
    g.add(bx(1.5,0.9,1.34, M.wood, -0.3,0.05,0));                  // Bootshaus
    g.add(bx(1.58,0.08,1.42, M.woodDark, -0.3,0.92,0));
    g.add(prism(1.82,0.62,1.58, M.roofRed, -0.3,1.0,0));           // Satteldach, Giebel zum Wasser
    g.add(bx(0.66,0.74,0.07, M.door, 0.46,0.05,0).rotateY(Math.PI/2)); // Tor zur Wasserseite
    g.add(bx(0.26,0.28,0.06, M.window, -0.3,0.45,0.68));
    g.add(cyl(0.14,0.16,0.36, M.woodDark, -0.5,0.05,0.85,8));      // Fass
    g.add(bx(0.3,0.26,0.3, M.woodLight, -1.0,0.05,-0.72));         // Kiste
    // Steg-Gruppe: liegt nach orientHarbor() knapp über der Wasserlinie;
    // bei schmalem Gewässer wird sie dort per scale.x gekürzt (alle Teile unrotiert → kein Scheren)
    const pier = new THREE.Group(); pier.name = 'pier';
    pier.add(bx(3.1,0.12,0.84, M.wood, 2.7,0,0));                  // Steg-Deck (x 1.15…4.25)
    for (const px of [1.4,2.4,3.4,4.1]) for (const pz of [-0.34,0.34]){
      const p = cyl(0.055,0.075,1.15, M.woodDark, px,-1.05,pz,6);  // Pfähle bis unter Wasser
      p.castShadow = false; pier.add(p);
    }
    const poller = cyl(0.055,0.07,0.42, M.woodDark, 4.06,0.12,0.3,6);
    poller.rotation.x = 0.12; pier.add(poller);
    pier.add(cyl(0.035,0.05,1.0, M.woodDark, 4.06,0.12,-0.3,6));   // Laternenpfahl am Stegkopf
    pier.add(bx(0.17,0.2,0.17, M.window, 4.06,1.06,-0.3));         // Laterne (leuchtet nachts)
    pier.add(bx(0.23,0.06,0.23, M.woodDark, 4.06,1.26,-0.3));
    g.add(pier);
    // Landgang: orientHarbor() spannt ihn vom Fundament zum Deck (Drehpunkt am Land-Ende)
    const rampGeo = new THREE.BoxGeometry(1,0.09,0.68); rampGeo.translate(0.5,-0.045,0);
    const ramp = mesh(rampGeo, M.woodLight); ramp.name = 'ramp';
    ramp.position.set(0.52,0.05,0);                                // Icon-Standardlage
    ramp.rotation.z = -0.55; ramp.scale.x = 0.78;
    g.add(ramp);
    // vertäutes Ruderboot neben dem Steg (schaukelt in der loop())
    const boot = new THREE.Group(); boot.name = 'boot';
    boot.position.set(2.6,-0.16,1.05); boot.rotation.y = 0.25;
    boot.add(bx(1.0,0.22,0.46, M.woodLight, 0,0,0));
    const bug = prism(0.46,0.22,0.3, M.woodLight);
    bug.rotation.z = -Math.PI/2; bug.rotation.y = Math.PI/2;
    bug.position.set(0.61,0.11,0); boot.add(bug);
    boot.add(bx(0.78,0.09,0.3, M.wood, -0.06,0.15,0));
    boot.add(bx(0.09,0.05,0.42, M.woodDark, 0.16,0.2,0));
    g.add(boot);
  }
  else if (t==='vorposten' || t==='__vorp'){
    g.add(bx(1.7,0.25,1.7, M.stoneDark, 0,-0.45,0));
    // Palisadenring
    for (let i=0;i<10;i++){
      const a = i/10*Math.PI*2;
      g.add(cyl(0.08,0.1,0.7+((i%2)*0.12), M.woodDark, Math.cos(a)*0.8, -0.1, Math.sin(a)*0.8, 5));
    }
    // Wachhütte mit Aussichtsplattform
    g.add(bx(0.7,0.8,0.7, M.wood, 0,0,0));
    g.add(bx(0.9,0.1,0.9, M.woodDark, 0,0.85,0));
    g.add(prism(1.0,0.45,1.0, M.roofThatch, 0,0.95,0));
    g.add(cyl(0.025,0.025,0.9, M.timber, 0.3,1.2,0.3,5));
    const fl = mesh(new THREE.PlaneGeometry(0.42,0.24), std(0x3d6fb4,{side:THREE.DoubleSide}), false, false);
    fl.position.set(0.52,1.95,0.3); g.add(fl);
    g.add(bx(0.4,0.5,0.06, M.door, 0,-0.1,0.36));
  }
  else if (t==='heldenhalle'){
    g.add(bx(3.6,0.3,3.6, M.stone, 0,-0.5,0));                     // Fundament
    g.add(bx(3.1,0.4,3.1, M.stoneLight, 0.05,-0.3,-0.05));         // Podest
    g.add(bx(2.6,1.35,1.9, M.plaster, 0.1,0.1,-0.45));             // Halle
    for (const px of [-1.1,1.3]) g.add(bx(0.14,1.35,0.14, M.timber, px,0.1,-0.45));
    g.add(bx(0.32,0.42,0.06, M.window, -0.6,0.65,0.51));
    g.add(bx(0.32,0.42,0.06, M.window, 0.8,0.65,0.51));
    g.add(prism(2.95,0.95,2.3, M.roofBlue, 0.1,1.45,-0.45));
    // Säulenportal mit Architrav und Giebel
    for (const px of [-0.85,-0.28,0.5,1.05]) g.add(cyl(0.09,0.11,1.25, M.stoneLight, px,0.1,0.85,7));
    g.add(bx(2.3,0.18,0.55, M.stoneLight, 0.1,1.32,0.85));
    g.add(prism(2.5,0.42,0.75, M.roofBlue, 0.1,1.5,0.85));
    g.add(bx(0.62,0.92,0.07, M.door, 0.1,0.1,0.52));
    g.add(bx(2.2,0.14,0.55, M.stone, 0.1,-0.14,1.3));              // Eingangsstufe
    // Bannerstange mit goldenem Reichsbanner
    g.add(cyl(0.028,0.028,1.7, M.timber, -1.45,0.9,1.2,5));
    const bn = mesh(new THREE.PlaneGeometry(0.42,0.66), std(0xd8b02f,{side:THREE.DoubleSide}), false, false);
    bn.position.set(-1.22,2.2,1.2); bn.name = 'flag'; g.add(bn);
    // Heldenstatue auf Sockel vor der Halle
    g.add(bx(0.44,0.5,0.44, M.stoneDark, 1.35,-0.3,1.25));
    const st2 = new THREE.Group(); st2.position.set(1.35,0.2,1.25); st2.scale.setScalar(0.9);
    st2.add(cyl(0.09,0.13,0.34, M.gold, 0,0,0,7));                 // Rumpf
    const sh = mesh(new THREE.SphereGeometry(0.1,7,6), M.gold); sh.position.y = 0.46; st2.add(sh);
    const sa = cyl(0.03,0.035,0.3, M.gold, 0.12,0.28,0,5);         // erhobener Schwertarm
    sa.rotation.z = -0.85; st2.add(sa);
    const sw2 = bx(0.035,0.34,0.02, M.gold, 0.29,0.45,0);
    sw2.rotation.z = -0.2; st2.add(sw2);
    g.add(st2);
  }
  else if (t==='markt'){
    // Marktplatz mit zwei Ständen
    const plaza = mesh(new THREE.CircleGeometry(1.9,22), std(0xb9a988,{flatShading:false}), false, true);
    plaza.rotation.x = -Math.PI/2; plaza.position.y = 0.05; g.add(plaza);
    const stall = (px,pz,rot,c1,c2)=>{
      const st = new THREE.Group(); st.position.set(px,0,pz); st.rotation.y = rot;
      st.add(bx(1.2,0.5,0.7, M.wood, 0,0.05,0));                       // Tresen
      for (const sx of [-0.5,0.5]) st.add(bx(0.06,1.15,0.06, M.woodDark, sx,0.05,-0.28));
      for (let i=0;i<4;i++){                                            // gestreiftes Dach
        const seg = mesh(new THREE.BoxGeometry(0.33,0.04,0.95), std(i%2?c1:c2), true, false);
        seg.position.set(-0.49+i*0.33, 1.22, 0.05); seg.rotation.x = -0.35; st.add(seg);
      }
      st.add(bx(0.24,0.16,0.24, M.hay, -0.3,0.6,0.05));                 // Waren
      st.add(bx(0.2,0.14,0.2, std(0xc26a3a), 0.1,0.6,0));
      st.add(bx(0.18,0.12,0.18, std(0x8aa04e), 0.38,0.6,0.08));
      g.add(st);
    };
    stall(-0.75,-0.55, 0.15, 0xc23b42, 0xf0e8d8);
    stall(0.75, 0.45, Math.PI+0.3, 0x3d6fb4, 0xf0e8d8);
    g.add(cyl(0.15,0.17,0.4, M.wood, -1.15,0,0.9,8));                   // Fässer & Kisten
    g.add(cyl(0.15,0.17,0.4, M.wood, -0.85,0,1.05,8));
    g.add(bx(0.34,0.3,0.34, M.woodLight, 1.15,0,-0.95));
    g.add(bx(0.3,0.26,0.3, M.woodLight, 0.8,0,-1.15));
    g.add(bx(0.3,0.26,0.3, M.woodLight, 0.97,0.3,-1.05));
  }
  else if (t==='mine'){
    g.add(bx(1.6,0.2,1.6, M.soil, 0,-0.42,0));
    // Erdhügel mit dunklem Stolleneingang
    const mound = mesh(new THREE.SphereGeometry(0.85,8,5,0,Math.PI*2,0,Math.PI/2), M.stoneDark);
    mound.position.set(-0.25,0,-0.25); mound.scale.y = 0.7; g.add(mound);
    const hole = mesh(new THREE.CircleGeometry(0.3,10), std(0x14161c));
    hole.position.set(0.28,0.32,0.28); hole.rotation.y = Math.PI/4; hole.rotation.x = -0.2; g.add(hole);
    // Förderturm (A-Gestell mit Rad)
    g.add(bx(0.08,1.3,0.08, M.woodDark, 0.55,0,0.75).rotateZ(0.18));
    g.add(bx(0.08,1.3,0.08, M.woodDark, 0.95,0,0.35).rotateZ(-0.18));
    const wheel = mesh(new THREE.TorusGeometry(0.22,0.045,6,10), M.timber);
    wheel.position.set(0.72,1.32,0.52); wheel.rotation.y = Math.PI/4; g.add(wheel);
    // Lore mit Erz
    g.add(bx(0.34,0.18,0.22, M.woodDark, -0.55,0,0.75));
    const ore = mesh(new THREE.IcosahedronGeometry(0.09,0), M.stoneLight);
    ore.position.set(-0.55,0.22,0.75); g.add(ore);
    for (const [px,pz] of [[0.1,0.95],[0.35,1.0]]){
      const o2 = mesh(new THREE.IcosahedronGeometry(0.1,0), M.stoneDark);
      o2.position.set(px,0.06,pz); g.add(o2);
    }
  }
  else if (t==='schmiede'){
    g.add(bx(1.55,0.2,1.55, M.stoneDark, 0,-0.42,0));
    g.add(bx(1.3,0.85,1.15, M.stone, -0.05,0,0));
    g.add(bx(0.34,0.55,0.05, M.door, -0.05,0,0.6));
    g.add(prism(1.6,0.55,1.45, M.roofRed, -0.05,0.85,0));
    g.add(bx(0.22,0.85,0.22, M.stoneDark, 0.45,0.8,-0.3));    // Schornstein
    // Esse mit Glut
    g.add(bx(0.45,0.35,0.4, M.stoneDark, 0.62,0,0.45));
    const glow = mesh(new THREE.BoxGeometry(0.3,0.1,0.26), M.fire);
    glow.position.set(0.62,0.38,0.45); g.add(glow);
    // Amboss
    g.add(bx(0.24,0.1,0.1, M.steel, -0.68,0.22,0.55));
    g.add(bx(0.1,0.2,0.08, M.stoneDark, -0.68,0.02,0.55));
  }
  else if (t==='fischer'){
    g.add(bx(1.55,0.2,1.55, M.stoneDark, 0,-0.42,0));
    g.add(bx(1.25,0.75,1.05, M.plaster, -0.08,0.02,0));
    g.add(bx(0.3,0.5,0.05, M.door, -0.08,0.02,0.55));
    g.add(bx(0.24,0.24,0.05, M.window, -0.45,0.35,0.55));
    g.add(prism(1.55,0.55,1.35, M.roofThatch, -0.08,0.79,0));
    const rod = cyl(0.016,0.016,1.15, M.woodDark, 0.62,0.28,0.4,5);
    rod.rotation.z = -0.65; g.add(rod);
    g.add(bx(0.012,0.55,0.012, M.timber, 1.06,0.22,0.4));
    g.add(cyl(0.14,0.16,0.3, M.wood, -0.6,-0.02,-0.62,8));
    const net = mesh(new THREE.PlaneGeometry(0.5,0.35),
      std(0xbac4cc,{transparent:true, opacity:0.55, side:THREE.DoubleSide}), false, false);
    net.position.set(0.55,0.35,-0.55); net.rotation.y = 0.7; g.add(net);
  }
  else if (t==='gehege'){
    const pad = mesh(new THREE.CircleGeometry(1.8,22), std(0x79ab4e,{flatShading:false}), false, true);
    pad.rotation.x = -Math.PI/2; pad.position.y = 0.05; g.add(pad);
    // Zaun
    for (let i=-2;i<=2;i++){
      g.add(bx(0.07,0.55,0.07, M.woodDark, i*0.8, 0, 1.62));
      g.add(bx(0.07,0.55,0.07, M.woodDark, i*0.8, 0, -1.62));
      g.add(bx(0.07,0.55,0.07, M.woodDark, 1.62, 0, i*0.8));
      g.add(bx(0.07,0.55,0.07, M.woodDark, -1.62, 0, i*0.8));
    }
    for (const y2 of [0.22,0.44]){
      g.add(bx(3.3,0.05,0.05, M.wood, 0, y2, 1.62));
      g.add(bx(3.3,0.05,0.05, M.wood, 0, y2, -1.62));
      g.add(bx(0.05,0.05,3.3, M.wood, 1.62, y2, 0));
      g.add(bx(0.05,0.05,3.3, M.wood, -1.62, y2, 0));
    }
    g.add(bx(0.55,0.16,0.24, M.woodDark, 1.05, 0.02, 0.95));   // Futtertrog
    g.add(bx(0.5,0.12,0.5, M.hay, -1.1, 0.02, -1.05));
    for (let i=0;i<4;i++){
      const d = makeDeer(); d.name = 'deer'+i;
      d.position.set(-0.8+i*0.5, 0.05, -0.4+(i%2)*0.8);
      g.add(d);
    }
  }
  else if (t==='akademie'){
    g.add(bx(3.6,0.3,3.6, M.stone, 0,-0.5,0));
    g.add(bx(3.4,0.5,3.4, M.stoneLight, 0,-0.3,0));
    // Lehrsaal mit hohen Fenstern
    g.add(bx(2.6,1.35,1.9, M.plaster, -0.4,0.2,0.5));
    for (const px of [-1.4,-0.75,0.35,0.7])
      g.add(bx(0.3,0.55,0.06, M.window, px, 0.62, 1.43));
    g.add(bx(0.5,0.72,0.07, M.door, -0.2,0.2,1.43));
    g.add(prism(2.95,0.8,2.25, M.roofBlue, -0.4,1.55,0.5));
    // Observatoriums-Turm mit Kuppel und Fernrohr
    g.add(cyl(0.6,0.68,1.7, M.stone, 1.05,-0.2,-0.9,10));
    const dome = mesh(new THREE.SphereGeometry(0.66,10,6,0,Math.PI*2,0,Math.PI/2), std(0x3d6fb4));
    dome.position.set(1.05,1.5,-0.9); g.add(dome);
    const tel = cyl(0.07,0.1,0.85, M.steel, 0,0,0,7);
    tel.rotation.z = -0.7; tel.position.set(1.3,2.0,-0.9); g.add(tel);
    // Armillarsphäre und Bücherstapel am Eingang
    const ring2 = mesh(new THREE.TorusGeometry(0.2,0.03,6,12), M.gold);
    ring2.position.set(-1.45,0.4,-0.95); ring2.rotation.x = 0.6; g.add(ring2);
    g.add(cyl(0.05,0.08,0.35, M.stoneDark, -1.45,-0.1,-0.95,6));
    g.add(bx(0.3,0.08,0.22, std(0xa8303a), 0.65,-0.05,1.35));
    g.add(bx(0.26,0.08,0.2, std(0x3d6fb4), 0.67,0.03,1.33));
  }
  else if (t==='fabrik'){
    g.add(bx(3.6,0.3,3.6, M.stoneDark, 0,-0.5,0));
    // Halle mit Sheddach und großem Hallentor
    g.add(bx(2.9,1.15,2.1, std(0xb8b2a6), -0.25,-0.2,-0.35));
    g.add(prism(1.4,0.5,2.1, std(0x8a94a2), -0.95,0.95,-0.35));
    g.add(prism(1.4,0.5,2.1, std(0x8a94a2), 0.45,0.95,-0.35));
    g.add(bx(1.05,0.85,0.07, std(0x2e3138), -0.25,-0.2,0.72));      // Hallentor
    g.add(bx(1.05,0.09,0.08, std(0xd8a02f), -0.25,0.65,0.72));      // Warnstreifen
    for (const px of [-1.35,0.85])
      g.add(bx(0.3,0.35,0.06, M.window, px,0.35,0.72));
    // Schornstein (raucht)
    g.add(cyl(0.16,0.2,2.0, std(0x9a5a48), -1.4,-0.2,-1.2,8));
    // Hof-Kran mit hängender Kiste
    g.add(bx(0.12,1.9,0.12, std(0xd8a02f), 1.35,-0.2,0.85));
    g.add(bx(1.4,0.1,0.1, std(0xd8a02f), 0.75,1.6,0.85));
    g.add(bx(0.03,0.55,0.03, M.stoneDark, 0.3,1.05,0.85));
    g.add(bx(0.32,0.28,0.26, M.steel, 0.3,0.72,0.85));
    // frisch gebaute Panzerwanne auf dem Hof
    g.add(bx(0.6,0.12,0.4, std(0x2a2a30), 1.25,-0.2,-1.15));
    g.add(bx(0.5,0.16,0.32, std(0x5c6b4e), 1.25,-0.08,-1.15));
  }
  else if (t==='flugfeld'){
    g.add(bx(3.7,0.3,3.7, std(0x6d7a58), 0,-0.45,0));
    g.add(bx(3.5,0.14,3.4, std(0x74815e), 0,-0.08,-0.1));           // Vorfeld (sichtbar über Grund)
    // Landebahn mit weißen Streifen
    g.add(bx(3.6,0.1,1.1, std(0x3a3d42), 0,0.02,0.9));
    for (let i=0;i<5;i++)
      g.add(bx(0.42,0.025,0.1, std(0xe8eaf0), -1.4+i*0.7, 0.12, 0.9));
    // Quonset-Hangar (liegender Zylinder) mit dunklem Tor
    const hang = cyl(0.68,0.68,1.5, std(0x8a94a2), 0,0,0,12);
    hang.rotation.z = Math.PI/2; hang.position.set(-0.8,0.32,-0.9); g.add(hang);
    const tor2 = mesh(new THREE.CircleGeometry(0.52,12), std(0x23262c), false, false);
    tor2.rotation.y = Math.PI/2; tor2.position.set(-0.04,0.3,-0.9); g.add(tor2);
    // Windsack
    g.add(cyl(0.03,0.03,1.5, M.steel, 1.5,0,-1.35,5));
    const sock = mesh(new THREE.ConeGeometry(0.11,0.5,6), std(0xe07020));
    sock.rotation.z = -Math.PI/2; sock.position.set(1.75,1.48,-1.35); g.add(sock);
    // Funkhäuschen + Fässer
    g.add(bx(0.5,0.55,0.5, std(0xbfc6d0), 1.35,0,-0.45));
    g.add(cyl(0.015,0.015,0.7, M.steel, 1.35,0.55,-0.45,5));
    g.add(cyl(0.12,0.12,0.32, std(0xc23b2a), 0.3,0,-1.5,8));
    g.add(cyl(0.12,0.12,0.32, std(0xc23b2a), 0.6,0,-1.42,8));
  }
  else if (t==='speicher'){
    g.add(bx(1.8,0.22,1.8, M.stone, 0,-0.5,0));
    g.add(bx(1.7,0.4,1.7, M.stoneDark, 0,-0.32,0));     // hoher Sockel gegen Feuchte
    g.add(bx(1.5,1.0,1.35, M.wood, 0,0.08,-0.05));
    for (const sxp of [-0.68,0.68])
      g.add(bx(0.13,1.0,0.13, M.woodDark, sxp,0.08,0.58));
    g.add(prism(1.75,0.62,1.7, M.roofThatch, 0,1.08,-0.05));
    g.add(bx(0.55,0.68,0.07, M.door, 0,0.1,0.62));       // breites Ladetor
    g.add(bx(0.7,0.09,0.45, M.woodLight, 0,-0.1,0.95));  // Laderampe
    // Fässer und Kisten am Giebel
    g.add(cyl(0.14,0.14,0.34, M.woodDark, -0.92,-0.12,0.55,8));
    g.add(cyl(0.14,0.14,0.34, M.woodDark, -0.92,-0.12,0.18,8));
    g.add(cyl(0.13,0.13,0.3, M.woodDark, -0.92,0.22,0.37,8));
    g.add(bx(0.34,0.3,0.34, M.woodLight, 0.92,-0.12,0.35));
    g.add(bx(0.28,0.24,0.28, M.woodLight, 0.92,0.18,0.35));
    // Amphore an der Rampe (Namenspatin 🏺)
    g.add(cyl(0.09,0.13,0.28, std(0xc07a4a), 0.55,-0.06,0.95,8));
    g.add(cyl(0.05,0.09,0.1, std(0xc07a4a), 0.55,0.22,0.95,8));
  }
  else if (t==='taverne'){
    g.add(bx(1.8,0.22,1.8, M.stone, 0,-0.5,0));
    g.add(bx(1.7,0.45,1.7, M.stone, 0,-0.3,0));
    g.add(bx(1.55,1.05,1.45, M.plaster, 0,0.15,0));
    for (const sxp of [-0.7,0.7]) for (const szp of [-0.65,0.65])
      g.add(bx(0.12,1.05,0.12, M.timber, sxp,0.15,szp));
    g.add(bx(1.55,0.09,0.1, M.timber, 0,0.74,0.7));      // Fachwerkband
    g.add(prism(1.9,0.75,1.75, M.roofRed, 0,1.2,0));
    g.add(bx(0.44,0.68,0.07, M.door, -0.3,0.15,0.72));
    g.add(bx(0.3,0.32,0.06, M.window, 0.4,0.5,0.72));
    g.add(bx(0.28,0.3,0.06, M.window, 0.74,0.42,-0.2).rotateY(Math.PI/2));
    g.add(bx(0.18,0.55,0.18, M.stoneDark, 0.45,1.55,-0.35));   // Schornstein
    // Wirtshausschild am Ausleger
    g.add(bx(0.5,0.05,0.05, M.woodDark, 0.55,1.24,0.76));
    const schild = mesh(new THREE.CylinderGeometry(0.16,0.16,0.04,10), M.gold);
    schild.rotation.x = Math.PI/2; schild.position.set(0.76,1.06,0.76); g.add(schild);
    // Bierfass + Bank vor der Tür
    const fass = cyl(0.16,0.16,0.4, M.woodDark, 0,0,0,8);
    fass.rotation.z = Math.PI/2; fass.position.set(-0.85,0.16,0.55); g.add(fass);
    g.add(bx(0.6,0.07,0.2, M.woodLight, 0.35,0.2,1.0));
    for (const sxp of [0.12,0.58]) g.add(bx(0.06,0.2,0.14, M.woodDark, sxp,0,1.0));
  }
  else if (t==='leuchtturm'){
    g.add(cyl(0.75,0.85,0.5, M.stoneDark, 0,-0.5,0,10));
    g.add(cyl(0.62,0.7,0.35, M.stoneLight, 0,-0.05,0,10));
    // Turm mit rot-weißen Streifen
    const hell = std(0xe8e4da), rot = std(0xc23b2a);
    for (let i=0;i<5;i++)
      g.add(cyl(0.42-i*0.035, 0.46-i*0.035, 0.53, i%2 ? rot : hell, 0, 0.3+i*0.52, 0, 10));
    // Galerie mit Geländer + Laterne
    g.add(cyl(0.5,0.4,0.14, M.stoneLight, 0,2.9,0,10));
    for (let i=0;i<6;i++){
      const a = i/6*Math.PI*2;
      g.add(bx(0.05,0.3,0.05, M.steel, Math.cos(a)*0.44, 3.04, Math.sin(a)*0.44));
    }
    const lamp = mesh(new THREE.CylinderGeometry(0.2,0.2,0.34,8),
      std(0xffd75a,{ emissive:0xffb830, emissiveIntensity:0.9 }));
    lamp.position.y = 3.32; lamp.name = 'fire'; g.add(lamp);
    g.add(cyl(0.27,0.29,0.08, M.steel, 0,3.5,0,8));
    const kappe = mesh(new THREE.ConeGeometry(0.3,0.3,8), rot);
    kappe.position.y = 3.72; g.add(kappe);
    // Wärterhäuschen
    g.add(bx(0.6,0.5,0.5, M.plaster, 0.62,-0.18,0.5));
    g.add(prism(0.72,0.28,0.6, M.roofRed, 0.62,0.32,0.5));
    g.add(bx(0.2,0.3,0.05, M.door, 0.62,-0.18,0.76));
  }
  else if (t==='lazarett'){
    g.add(bx(1.8,0.22,1.8, M.stone, 0,-0.5,0));
    g.add(bx(1.7,0.4,1.7, M.stoneLight, 0,-0.32,0));
    const weiss = std(0xf4f1e6);
    g.add(bx(1.5,1.0,1.35, weiss, 0.05,0.06,-0.05));
    g.add(prism(1.75,0.55,1.65, M.roofGreen, 0.05,1.06,-0.05));
    g.add(bx(0.46,0.66,0.07, M.door, 0.05,0.06,0.62));
    g.add(bx(0.26,0.3,0.06, M.window, -0.45,0.42,0.62));
    g.add(bx(0.26,0.3,0.06, M.window, 0.55,0.42,0.62));
    // Grünes Kreuz über der Tür
    const kreuzMat = std(0x3fae5c);
    g.add(bx(0.3,0.1,0.05, kreuzMat, 0.05,0.9,0.64));
    g.add(bx(0.1,0.3,0.05, kreuzMat, 0.05,0.8,0.64));
    // Feldzelt-Anbau und Krankenliege
    g.add(prism(0.85,0.5,0.85, std(0xe8e4da,{side:THREE.DoubleSide}), -0.95,-0.12,0.4));
    g.add(bx(0.5,0.14,0.24, M.woodLight, 0.9,-0.12,-0.55));
    g.add(bx(0.5,0.06,0.24, weiss, 0.9,0.02,-0.55));
  }
  else if (t==='hq'){
    g.add(bx(3.6,0.3,3.6, M.stoneDark, 0,-0.5,0));
    // Bunker-Hauptbau mit abgesetztem Flachdach
    g.add(bx(2.6,1.1,2.0, M.stone, -0.3,-0.2,0.3));
    g.add(bx(2.75,0.16,2.15, M.stoneLight, -0.3,0.9,0.3));
    g.add(bx(0.8,0.75,0.08, std(0x3a4a3a), -0.3,-0.2,1.29));   // Stahltor
    g.add(bx(0.84,0.08,0.1, std(0xd8a02f), -0.3,0.58,1.29));   // Warnband
    for (const px of [-1.25,0.65]) g.add(bx(0.34,0.24,0.07, M.window, px,0.35,1.28));
    // Kommandoturm mit Antenne und Radarschüssel
    g.add(bx(1.1,1.0,1.1, M.stoneDark, 1.0,-0.2,-1.0));
    g.add(bx(1.2,0.14,1.2, M.stoneLight, 1.0,0.8,-1.0));
    g.add(cyl(0.02,0.02,1.2, M.steel, 1.3,0.94,-1.3,5));
    const dish = mesh(new THREE.SphereGeometry(0.26,8,6,0,Math.PI*2,0,Math.PI/2), M.steel);
    dish.rotation.x = Math.PI*0.82; dish.position.set(0.75,1.25,-0.8); g.add(dish);
    // Sandsäcke am Eingang
    for (let i=0;i<3;i++){
      g.add(bx(0.34,0.16,0.2, M.hay, -1.15+i*0.38,-0.2,1.45));
      if (i<2) g.add(bx(0.34,0.16,0.2, M.hay, -0.96+i*0.38,-0.04,1.45));
    }
    // Goldenes Emblem über dem Tor + Standarte
    const stern = mesh(new THREE.CylinderGeometry(0.15,0.15,0.04,5), M.gold);
    stern.rotation.x = Math.PI/2; stern.position.set(-0.3,0.8,1.31); g.add(stern);
    g.add(cyl(0.025,0.025,1.25, M.timber, -1.35,0.98,-0.9,5));
    const fl = mesh(new THREE.PlaneGeometry(0.5,0.28), M.banner, false, false);
    fl.position.set(-1.09,2.0,-0.9); fl.name = 'flag'; g.add(fl);
  }
  else if (t==='theater'){
    g.add(bx(3.6,0.3,3.6, M.stone, 0,-0.5,0));
    g.add(bx(3.3,0.35,3.0, M.stoneLight, 0,-0.28,0.1));        // Podium
    g.add(bx(3.0,0.24,0.9, M.stoneLight, 0,-0.22,1.35));       // Freitreppe
    g.add(bx(2.6,0.2,0.7, M.stoneLight, 0,0.0,1.22));
    // Bühnenhaus mit Säulenfront
    g.add(bx(2.9,1.5,1.9, M.plaster, 0,0.05,-0.4));
    const saeule = std(0xf4ead0);
    for (const px of [-1.15,-0.4,0.4,1.15])
      g.add(cyl(0.11,0.13,1.35, saeule, px,0.05,0.72,8));
    g.add(bx(3.1,0.22,2.3, M.stoneLight, 0,1.42,-0.2));        // Architrav
    g.add(prism(3.3,0.85,2.45, M.roofBlue, 0,1.64,-0.2));
    g.add(prism(2.9,0.55,0.12, saeule, 0,1.65,0.92));          // Giebeldreieck
    g.add(bx(0.7,0.95,0.08, std(0x6e1a2e), 0,0.1,0.53));       // Vorhang-Portal
    g.add(bx(0.14,0.95,0.09, M.gold, -0.44,0.1,0.53));
    g.add(bx(0.14,0.95,0.09, M.gold, 0.44,0.1,0.53));
    // Masken-Plaketten (Komödie & Tragödie)
    const mk1 = mesh(new THREE.CylinderGeometry(0.14,0.14,0.05,8), M.gold);
    mk1.rotation.x = Math.PI/2; mk1.position.set(-1.0,1.1,0.56); g.add(mk1);
    const mk2 = mesh(new THREE.CylinderGeometry(0.14,0.14,0.05,8), std(0xb0b6c2));
    mk2.rotation.x = Math.PI/2; mk2.position.set(1.0,1.1,0.56); g.add(mk2);
    // Aushang neben der Treppe
    g.add(bx(0.4,0.55,0.08, M.woodDark, 1.5,-0.1,1.35));
    g.add(bx(0.32,0.4,0.06, std(0xe8dcb8), 1.5,0.0,1.4));
  }
  else if (t==='__see' || t==='__wiese'){
    const disc = mesh(new THREE.CircleGeometry(0.95,24),
      std(t==='__see'?0x2f7fb8:0x6fae4a,{transparent:true, opacity:0.85, side:THREE.DoubleSide}), false, false);
    disc.rotation.x = -Math.PI/2; disc.position.y = 0.16; g.add(disc);
    if (t==='__wiese')
      for (let i=0;i<5;i++){
        const c = mesh(new THREE.ConeGeometry(0.07,0.3,4), std(0x4f8f3a), false, false);
        c.position.set(Math.cos(i*1.26)*0.5, 0.3, Math.sin(i*1.26)*0.5); g.add(c);
      }
    else {
      const w2 = mesh(new THREE.RingGeometry(0.4,0.5,20),
        std(0x9fd4ff,{transparent:true, opacity:0.7, side:THREE.DoubleSide}), false, false);
      w2.rotation.x = -Math.PI/2; w2.position.y = 0.18; g.add(w2);
    }
  }
  else if (t==='mauer'){
    // Mittelpfeiler + 4 Verbindungsarme (Sichtbarkeit je nach Nachbarn)
    g.add(bx(1.3,0.5,1.3, M.stoneDark, 0,-0.45,0));
    g.add(bx(0.95,1.15,0.95, M.stone, 0,0,0));
    g.add(bx(1.08,0.16,1.08, M.stoneLight, 0,1.12,0));
    g.add(bx(0.32,0.3,0.32, M.stoneLight, 0,1.26,0));
    const arm = (name,px,pz,w,d)=>{
      const a = new THREE.Group(); a.name = name;
      a.add(bx(w,1.0,d, M.stone, px,0,pz));
      a.add(bx(w+0.08,0.14,d+0.08, M.stoneLight, px,0.97,pz));
      a.add(bx(0.22,0.24,0.22, M.stoneLight, px,1.1,pz));
      g.add(a);
    };
    arm('aE', 0.75, 0, 1.15, 0.7);
    arm('aW', -0.75, 0, 1.15, 0.7);
    arm('aN', 0, -0.75, 0.7, 1.15);
    arm('aS', 0, 0.75, 0.7, 1.15);
  }
  else if (t==='tor'){
    // Torhaus: zwei Flankentürme, Bogen, offene Torflügel (Durchgang in Z)
    g.add(bx(1.95,0.4,1.15, M.stoneDark, 0,-0.42,0));
    for (const sx of [-0.72,0.72]){
      g.add(bx(0.55,1.6,0.92, M.stone, sx,0,0));
      g.add(bx(0.66,0.16,1.02, M.stoneLight, sx,1.55,0));
      g.add(bx(0.24,0.26,0.24, M.stoneLight, sx,1.68,0));
    }
    g.add(bx(1.0,0.5,0.84, M.stone, 0,1.05,0));
    g.add(bx(1.08,0.14,0.94, M.stoneLight, 0,1.5,0));
    const w1 = bx(0.42,1.0,0.07, M.door, -0.42,0,0.32); w1.rotation.y = -0.85; g.add(w1);
    const w2 = bx(0.42,1.0,0.07, M.door, 0.42,0,0.32); w2.rotation.y = 0.85; g.add(w2);
    g.add(bx(0.5,0.06,0.06, M.gold, 0,1.32,0.46));      // Zierband
  }
  else if (t==='turm'){
    g.add(cyl(0.62,0.72,0.5, M.stoneDark, 0,-0.45,0,9));
    g.add(cyl(0.5,0.58,2.1, M.stone, 0,0,0,9));
    g.add(cyl(0.68,0.6,0.35, M.stoneLight, 0,2.1,0,9));
    for (let i=0;i<6;i++){
      const a = i/6*Math.PI*2;
      g.add(bx(0.2,0.22,0.2, M.stoneLight, Math.cos(a)*0.58, 2.45, Math.sin(a)*0.58));
    }
    g.add(bx(0.14,0.32,0.06, M.window, 0,1.1,0.52));
    g.add(bx(0.14,0.32,0.06, M.window, 0.52,1.5,0).rotateY(Math.PI/2));
    g.add(bx(0.2,0.14,0.2, M.timber, 0,2.45,0));
    const f = mesh(new THREE.ConeGeometry(0.14,0.34,6), M.fire);
    f.position.y = 2.75; f.name = 'fire'; g.add(f);
  }
  g.traverse(o=>{ if (o.isMesh && o.castShadow===undefined) o.castShadow = true; });
  return pruneSmallShadowCasters(g);
}

// ============================== WELT AUFBAUEN ==============================
let terrainMesh = null, waterMesh = null, seabed = null;
let mAt = null, hAt = null;
const worldGroup = new THREE.Group(); scene.add(worldGroup);   // Terrain + Streuobjekte
const bldGroup = new THREE.Group(); scene.add(bldGroup);       // Gebäude
const fxGroup = new THREE.Group(); scene.add(fxGroup);         // Einheiten, Partikel, Marker

// Gibt Geometrien und Materialien eines Teilbaums frei.
// Geteilte Ressourcen (userData.shared) bleiben unangetastet.
function disposeGroup(grp){
  grp.traverse(o=>{
    if (o.isMesh || o.isSprite){
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m && !m.userData.shared) m.dispose();
      if (o.isInstancedMesh) o.dispose();      // Instanz-Puffer freigeben
    }
  });
  while (grp.children.length) grp.remove(grp.children[0]);
}
function buildWorld(){
  disposeGroup(worldGroup);
  const rng = mulberry32(state.seed ^ 0x51ab3f);
  // Rastergrößen an die 128er-Karte angepasst (weniger sichtbare Muster-Wiederholung)
  const nA = noiseGrid(rng, 48), nB = noiseGrid(rng, 96), nC = noiseGrid(rng, 96);
  const land = (x,y)=> inMap(x,y) ? (tiles[idx(x,y)]>0?1:0) : 0;
  const sandT = (x,y)=> inMap(x,y) && tiles[idx(x,y)]===1 ? 1 : 0;
  function bi(f,fx,fy){
    const x0=Math.floor(fx), y0=Math.floor(fy), tx=fx-x0, ty=fy-y0;
    const sx=tx*tx*(3-2*tx), sy=ty*ty*(3-2*ty);
    return lerp(lerp(f(x0,y0),f(x0+1,y0),sx), lerp(f(x0,y0+1),f(x0+1,y0+1),sx), sy);
  }
  mAt = (fx,fy)=> bi(land,fx,fy) + (nB(fx*0.9+3.7, fy*0.9+1.3)-0.5)*0.5;
  hAt = (fx,fy)=>{
    const m = mAt(fx,fy);
    if (m > 0.4) return Math.min((m-0.4)*3.0, 1.0) + nC(fx*1.3,fy*1.3)*0.3;
    return Math.max((m-0.4)*4.5, -1.9);
  };
  // Terrain-Gitter mit Ozeanrand; ab 96er-Karten halbe Auflösung (Vertex-Budget)
  const EXT = 6, step = MAP >= 96 ? 1/2 : 1/3;
  const N = Math.round((MAP+2*EXT)/step)+1;
  const pos = new Float32Array(N*N*3), col = new Float32Array(N*N*3);
  const colObj = new THREE.Color();
  for (let j=0;j<N;j++) for (let i=0;i<N;i++){
    const fx = -EXT + i*step, fy = -EXT + j*step;
    const o = (j*N+i)*3;
    const m = mAt(fx,fy), h = hAt(fx,fy);
    pos[o] = wx(fx); pos[o+1] = h; pos[o+2] = wz(fy);
    // Farben (wie 2D-Version: Grasflecken, Trockenzonen, Sandband, Seegrund)
    let r,g2,b;
    if (m <= 0.40){
      const t = clamp((0.40-m)/0.28,0,1);
      r = lerp(0.72,0.13,t); g2 = lerp(0.66,0.32,t); b = lerp(0.5,0.36,t);   // heller Sandgrund → tiefes Becken
    } else {
      const sandAmt = clamp(Math.max(bi(sandT,fx,fy)*1.15, (0.50-m)/0.10), 0, 1);
      const pat = nA(fx*0.45+9.1, fy*0.45+4.2);
      let R1 = (91+pat*26)/255, G1 = (141+pat*18)/255, B1 = (57+pat*14)/255;
      const dry = clamp((nB(fx*0.5+13.1, fy*0.5+7.7)-0.62)*3, 0, 1);
      R1 = lerp(R1,0.59,dry*0.5); G1 = lerp(G1,0.58,dry*0.35); B1 = lerp(B1,0.28,dry*0.3);
      // Biom-Look: Falloff-Gewichte aller Inseln weich mischen (Wiese = Basisfarbe)
      let wSum=0, wWald=0, wSchnee=0, wVulkan=0, wWueste=0;
      for (const I of ISLES){
        const f = clamp(1 - dist(fx,fy,I.x,I.y)/I.r, 0, 1);
        if (f<=0) continue;
        wSum += f;
        if (I.biome==='wald') wWald += f;
        else if (I.biome==='schnee') wSchnee += f;
        else if (I.biome==='vulkan') wVulkan += f;
        else if (I.biome==='wueste') wWueste += f;
      }
      if (wSum>0){
        const fW=wWald/wSum, fS=wSchnee/wSum, fV=wVulkan/wSum, fD=wWueste/wSum;
        if (fW>0){ R1=lerp(R1,R1*0.55,fW); G1=lerp(G1,G1*0.92,fW); B1=lerp(B1,B1*0.5,fW); }
        if (fS>0){ R1=lerp(R1,0.85+pat*0.06,fS); G1=lerp(G1,0.88+pat*0.05,fS); B1=lerp(B1,0.94+pat*0.04,fS); }
        if (fV>0){
          const vein = clamp((nC(fx*1.9+31.7, fy*1.9+17.3)-0.78)*7, 0, 1);   // rötliche Adern
          R1=lerp(R1,0.14+pat*0.05+vein*0.38,fV); G1=lerp(G1,0.12+pat*0.04+vein*0.07,fV); B1=lerp(B1,0.13+pat*0.04,fV);
        }
        if (fD>0){ R1=lerp(R1,0.82+pat*0.08,fD); G1=lerp(G1,0.69+pat*0.06,fD); B1=lerp(B1,0.40+pat*0.05,fD); }
      }
      r = lerp(R1,0.89,sandAmt); g2 = lerp(G1,0.8,sandAmt); b = lerp(B1,0.58,sandAmt);
      const sp = (nC(fx*2.3,fy*2.3)-0.5)*0.07;
      r += sp; g2 += sp; b += sp*0.6;
    }
    if (Math.abs(m-0.40) < 0.02){          // Schaum-/Uferlinie aufhellen
      const f = 1-Math.abs(m-0.40)/0.02;
      r = lerp(r,0.95,f*0.5); g2 = lerp(g2,0.97,f*0.5); b = lerp(b,0.98,f*0.5);
    }
    colObj.setRGB(clamp(r,0,1), clamp(g2,0,1), clamp(b,0,1));
    colObj.convertSRGBToLinear();
    col[o]=colObj.r; col[o+1]=colObj.g; col[o+2]=colObj.b;
  }
  const indices = [];
  for (let j=0;j<N-1;j++) for (let i=0;i<N-1;i++){
    const a=j*N+i, b2=a+1, c2=a+N, d2=a+N+1;
    indices.push(a,c2,b2, b2,c2,d2);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(pos,3));
  tg.setAttribute('color', new THREE.BufferAttribute(col,3));
  tg.setIndex(indices);
  tg.computeVertexNormals();
  terrainMesh = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({
    vertexColors:true, roughness:1, metalness:0 }));
  terrainMesh.receiveShadow = true;
  worldGroup.add(terrainMesh);
  // Wasser
  const wg = new THREE.PlaneGeometry(MAP*TL*2.6, MAP*TL*2.6, 72, 72);
  const wmat = new THREE.MeshPhongMaterial({ color:0x2f7fb8, transparent:true, opacity:0.78,
    shininess:140, specular:0x9fd4ff });
  wmat.onBeforeCompile = (s)=>{
    s.uniforms.uT = waterTime;
    s.vertexShader = 'uniform float uT;\n' + s.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed.z += (sin(position.x*0.55+uT*1.4)+cos(position.y*0.65+uT*1.9))*0.055;');
  };
  waterMesh = new THREE.Mesh(wg, wmat);
  waterMesh.rotation.x = -Math.PI/2;
  waterMesh.position.y = -0.06;
  waterMesh.receiveShadow = true;
  worldGroup.add(waterMesh);
  seabed = mesh(new THREE.CircleGeometry(280, 32), std(0x1c4a63,{flatShading:false}), false, false);
  seabed.rotation.x = -Math.PI/2; seabed.position.y = -2.1;
  worldGroup.add(seabed);
  buildScatter(rng);
}
const waterTime = { value: 0 };

// Baum-Geometrien global (werden auch für die Fäll-Animation gebraucht)
let pineGeoG = null, oakGeoG = null, trunkGeoG = null, snowGeoG = null, snowTipGeoG = null;
function ensureTreeGeos(){
  if (pineGeoG) return;
  pineGeoG = mergeGeometries([
    new THREE.ConeGeometry(0.55,0.8,7).translate(0,0.95,0),
    new THREE.ConeGeometry(0.44,0.7,7).translate(0,1.4,0),
    new THREE.ConeGeometry(0.3,0.55,7).translate(0,1.85,0)]);
  oakGeoG = mergeGeometries([
    new THREE.IcosahedronGeometry(0.5,0).translate(0,1.15,0),
    new THREE.IcosahedronGeometry(0.4,0).translate(-0.34,0.95,0.1),
    new THREE.IcosahedronGeometry(0.38,0).translate(0.32,1.0,-0.12),
    new THREE.IcosahedronGeometry(0.36,0).translate(0.02,1.5,0.05)]);
  trunkGeoG = new THREE.CylinderGeometry(0.09,0.13,0.9,6).translate(0,0.42,0);
  // Schnee-Nadelbaum: schlanke dunkle Krone + separate weiße Spitzen-Kappen
  snowGeoG = mergeGeometries([
    new THREE.ConeGeometry(0.5,0.85,7).translate(0,0.95,0),
    new THREE.ConeGeometry(0.38,0.7,7).translate(0,1.42,0),
    new THREE.ConeGeometry(0.26,0.55,7).translate(0,1.88,0)]);
  snowTipGeoG = mergeGeometries([
    new THREE.ConeGeometry(0.3,0.42,7).translate(0,1.17,0),
    new THREE.ConeGeometry(0.23,0.36,7).translate(0,1.6,0),
    new THREE.ConeGeometry(0.16,0.3,7).translate(0,2.02,0)]);
  pineGeoG.userData.shared = oakGeoG.userData.shared = trunkGeoG.userData.shared = true;
  snowGeoG.userData.shared = snowTipGeoG.userData.shared = true;
}
// Geteilte Materialien der Schneebäume (weiße Kronenspitzen auf dunklem Grün)
const snowTipMat = std(0xeaf2f7);
snowTipMat.userData.shared = true;
// Geteilte Materialien für die Umfall-Animation (einmalig, statt Klone pro Baum)
const fallTrunkMat = std(0x6b4a2a,{transparent:true});
const fallCrownPine = std(0xffffff,{transparent:true});
fallCrownPine.color.setHSL(0.34, 0.48, 0.28);
const fallCrownOak = std(0xffffff,{transparent:true});
fallCrownOak.color.setHSL(0.27, 0.48, 0.36);
const fallCrownSnow = std(0x39544a,{transparent:true});
for (const m of [fallTrunkMat, fallCrownPine, fallCrownOak, fallCrownSnow]) m.userData.shared = true;
// Laufzeit-Zugriff auf die Baum-Instanzen: Fällen/Nachwachsen ändert nur einzelne
// Matrizen statt alle InstancedMeshes neu zu bauen
let treeIM = null;      // { pine:{im,free}, oak:{im,free}, trunk:{im,free} }
const _tiDummy = new THREE.Object3D();
const _tiColor = new THREE.Color();
function setTreeMatrix(im, i, t, zero){
  const fx = t.x+t.ox, fy = t.y+t.oy;
  _tiDummy.position.set(wx(fx), hAt(fx,fy)-0.06, wz(fy));
  _tiDummy.rotation.set(0, t.ph, 0);
  const s = zero ? 0 : t.s*(t.v===3?0.72:1);
  _tiDummy.scale.set(s,s,s);
  _tiDummy.updateMatrix();
  im.setMatrixAt(i, _tiDummy.matrix);
  im.instanceMatrix.needsUpdate = true;
}
function setTreeColor(im, i, t){
  if (t.sn) _tiColor.setHSL(0.42, 0.18, 0.22 + (t.ph%1)*0.06);                  // dunkles Frostgrün
  else if (t.b==='wueste') _tiColor.setHSL(0.12+(t.ph%1)*0.03, 0.42, 0.3+(t.ph*13%1)*0.06);  // trockene Krone
  else {
    const pine = t.v===1;
    const l = (pine?0.26:0.34) + (t.ph*13%1)*0.09 - (t.b==='wald'?0.05:0);      // Wald: satter/dunkler
    _tiColor.setHSL((pine?0.34:0.27) + (t.ph%1)*0.05, t.b==='wald'?0.56:0.48, Math.max(0.15,l));
  }
  im.setColorAt(i, _tiColor);
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
}
const crownGroupOf = (t)=> t.sn ? treeIM.snow : (t.v===1 ? treeIM.pine : treeIM.oak);
// Gefällten Baum nur ausblenden (Matrix auf Skalierung 0), Slot wird wiederverwendet
function hideTreeInstance(t){
  if (!treeIM || t._ci === undefined || t._ti === undefined){ rebuildScatterOnly(); return; }
  const crown = crownGroupOf(t);
  setTreeMatrix(crown.im, t._ci, t, true); crown.free.push(t._ci);
  if (crown.im2) setTreeMatrix(crown.im2, t._ci, t, true);
  setTreeMatrix(treeIM.trunk.im, t._ti, t, true); treeIM.trunk.free.push(t._ti);
}
// Nachgewachsenen Baum in einen freien Slot schreiben; Failsafe: voll → kompletter Rebuild
function addTreeInstance(t){
  if (!treeIM){ rebuildScatterOnly(); return; }
  const slot = (grp)=>{
    if (grp.free.length) return grp.free.pop();
    if (grp.im.count < grp.im.instanceMatrix.count) return grp.im.count++;
    return -1;
  };
  const crown = crownGroupOf(t);
  const ci = slot(crown), ti = slot(treeIM.trunk);
  if (ci < 0 || ti < 0){ rebuildScatterOnly(); return; }
  t._ci = ci; t._ti = ti;
  setTreeMatrix(crown.im, ci, t);
  setTreeColor(crown.im, ci, t);
  if (crown.im2){ crown.im2.count = crown.im.count; setTreeMatrix(crown.im2, ci, t); }
  setTreeMatrix(treeIM.trunk.im, ti, t);
}
// Bäume/Felsen/Gras als Instanzen
function buildScatter(rng){
  const dummy = new THREE.Object3D();
  const cjit = new THREE.Color();
  ensureTreeGeos();
  const pineGeo = pineGeoG, oakGeo = oakGeoG, trunkGeo = trunkGeoG;
  const pines = treeList.filter(t=>t.v===1 && !t.sn);
  const oaks = treeList.filter(t=>t.v!==1 && !t.sn);
  const snows = treeList.filter(t=>t.sn);
  // Reserve-Kapazität fürs Nachwachsen (regrow deckelt den Bestand bei ~800 Bäumen)
  const cap = Math.max(treeList.length + 24, 840);
  // Basisfarbe weiß, damit die Instanzfarbe die tatsächliche Farbe bestimmt
  const mkInst = (geo, list, mat)=>{
    const im = new THREE.InstancedMesh(geo, mat, cap);
    im.count = list.length;
    im.castShadow = true; im.receiveShadow = true;
    im.frustumCulled = false;    // Bäume verteilen sich über die ganze Karte;
                                 // Bounding-Sphere würde bei Nachwachsen veralten
    worldGroup.add(im);
    return im;
  };
  const pineIM = mkInst(pineGeo, pines, std(0xffffff));
  const oakIM = mkInst(oakGeo, oaks, std(0xffffff));
  const snowIM = mkInst(snowGeoG, snows, std(0xffffff));
  const snowTipIM = mkInst(snowTipGeoG, snows, snowTipMat);   // weiße Spitzen, gleiche Matrizen
  const trunkIM = mkInst(trunkGeo, treeList, M.trunk);
  pines.forEach((t,i)=>{ t._ci = i; setTreeMatrix(pineIM,i,t); setTreeColor(pineIM,i,t); });
  oaks.forEach((t,i)=>{ t._ci = i; setTreeMatrix(oakIM,i,t); setTreeColor(oakIM,i,t); });
  snows.forEach((t,i)=>{ t._ci = i; setTreeMatrix(snowIM,i,t); setTreeColor(snowIM,i,t); setTreeMatrix(snowTipIM,i,t); });
  treeList.forEach((t,i)=>{ t._ti = i; setTreeMatrix(trunkIM,i,t); });
  treeIM = { pine:{im:pineIM,free:[]}, oak:{im:oakIM,free:[]},
    snow:{im:snowIM,im2:snowTipIM,free:[]}, trunk:{im:trunkIM,free:[]} };
  // Felsen
  if (rockList.length){
    const rgeo = new THREE.IcosahedronGeometry(0.55,0);
    const im = new THREE.InstancedMesh(rgeo, M.rock, rockList.length);
    im.castShadow = true; im.receiveShadow = true;
    rockList.forEach((r,i)=>{
      dummy.position.set(wx(r.x), hAt(r.x,r.y)+0.1, wz(r.y));
      dummy.rotation.set((r.ph%1)*0.6, r.ph, 0);
      dummy.scale.set(r.s, r.s*0.62, r.s*0.85);
      dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    worldGroup.add(im);
  }
  // Grasbüschel + Blumen (gedeckelt; Dichte und Farbe je Biom)
  const tuftGeo = new THREE.ConeGeometry(0.05,0.24,4);
  const tufts = [], flowers = [];
  for (let i=0;i<26000 && tufts.length<3800;i++){
    const fx = rng()*MAP, fy = rng()*MAP;
    if (mAt(fx,fy) < 0.55) continue;
    const bio = isleBiome ? (isleBiome[isleOf(fx,fy)]||'wiese') : 'wiese';
    const rr = rng();
    if (bio==='wueste' && rr < 0.7) continue;          // Wüste: Gras stark ausdünnen
    if (bio==='vulkan' && rr < 0.55) continue;
    tufts.push([fx,fy,rng(),bio]);
    if ((bio==='wiese'||bio==='wald') && rng()<0.06 && flowers.length<320) flowers.push([fx,fy,rng()]);
  }
  if (tufts.length){
    const im = new THREE.InstancedMesh(tuftGeo, std(0xffffff), tufts.length);
    im.castShadow = false; im.receiveShadow = true;
    tufts.forEach((t,i)=>{
      dummy.position.set(wx(t[0]), hAt(t[0],t[1])+0.06, wz(t[1]));
      dummy.rotation.set((t[2]-0.5)*0.5,t[2]*7,0);
      const s = 0.55+t[2]*0.6;
      dummy.scale.set(s,s,s); dummy.updateMatrix();
      im.setMatrixAt(i,dummy.matrix);
      if (t[3]==='schnee') cjit.setHSL(0.55, 0.12, 0.7+t[2]*0.12);
      else if (t[3]==='vulkan') cjit.setHSL(0.05, 0.08, 0.15+t[2]*0.08);
      else if (t[3]==='wueste') cjit.setHSL(0.13, 0.5, 0.4+t[2]*0.1);
      else if (t[3]==='wald') cjit.setHSL(0.29+t[2]*0.05, 0.6, 0.24+t[2]*0.1);
      else cjit.setHSL(0.26+t[2]*0.06, 0.55, 0.3+t[2]*0.13);
      im.setColorAt(i,cjit);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    worldGroup.add(im);
  }
  if (flowers.length){
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05,5,4),
      std(0xffffff,{flatShading:true}), flowers.length);
    im.castShadow = false;
    flowers.forEach((f,i)=>{
      dummy.position.set(wx(f[0]), hAt(f[0],f[1])+0.1, wz(f[1]));
      dummy.rotation.set(0,0,0); dummy.scale.setScalar(1); dummy.updateMatrix();
      im.setMatrixAt(i,dummy.matrix);
      cjit.set([0xe8e05a,0xf0f2f6,0xd67ab0][Math.floor(f[2]*3)]);
      im.setColorAt(i,cjit);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    worldGroup.add(im);
  }
}

// ============================== BÄUME: FÄLLEN & NACHWACHSEN ==============================
const fallingTrees = [];
// Entfernt den Baum aus der Welt und spielt eine Umfall-Animation ab
function fellTree(t, dirAngle){
  if (!t || !treeList.includes(t)) return;
  const k = idx(t.x,t.y);
  treeMap[k] = 0;
  if (state.chopped.indexOf(k) < 0) state.chopped.push(k);
  state.regrown = (state.regrown||[]).filter(r=>!(r.x===t.x && r.y===t.y));
  treeList = treeList.filter(q=>q!==t);
  invalidateTreeCache();
  state.buildings.forEach(recalcEff);
  hideTreeInstance(t);
  ensureTreeGeos();
  const s = t.s*(t.v===3?0.72:1);
  const crownMat = t.sn ? fallCrownSnow : (t.v===1 ? fallCrownPine : fallCrownOak);
  const trunkMat = fallTrunkMat;
  crownMat.opacity = trunkMat.opacity = 1;
  const grp = new THREE.Group();
  grp.add(mesh(trunkGeoG, trunkMat));
  grp.add(mesh(t.sn ? snowGeoG : (t.v===1?pineGeoG:oakGeoG), crownMat));
  const fx = t.x+t.ox, fy = t.y+t.oy;
  grp.position.set(wx(fx), hAt(fx,fy)-0.06, wz(fy));
  grp.scale.setScalar(s);
  fxGroup.add(grp);
  const a = dirAngle!==undefined ? dirAngle : Math.random()*Math.PI*2;
  const axis = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)).normalize();
  fallingTrees.push({ grp, mats:[crownMat,trunkMat], t:0, axis,
    px:wx(fx), py:hAt(fx,fy), pz:wz(fy), hit:false });
  snd(160,0.12,'square',0.035);
}
function updateFallingTrees(dt){
  for (let i=fallingTrees.length-1;i>=0;i--){
    const f = fallingTrees[i];
    f.t += dt;
    let ang;
    const MAXA = Math.PI/2*0.9;
    if (f.t < 1.0){ const q = f.t; ang = q*q*MAXA; }
    else ang = MAXA + Math.sin((f.t-1.0)*16)*0.03*Math.max(0,1-(f.t-1.0)*2.5);
    f.grp.setRotationFromAxisAngle(f.axis, ang);
    if (!f.hit && f.t >= 0.97){                     // Aufprall
      f.hit = true;
      spawnBurst(f.px, f.py+0.4, f.pz, 8, 0x6da04c);
      snd(90,0.18,'sawtooth',0.05);
    }
    if (f.t > 1.7){
      const o = clamp(1-(f.t-1.7)/0.9, 0, 1);
      for (const m of f.mats) m.opacity = o;
      f.grp.position.y -= dt*0.5;
    }
    if (f.t > 2.6){ fxGroup.remove(f.grp); disposeGroup(f.grp); fallingTrees.splice(i,1); }
  }
}
// Wald wächst nach – schneller in höheren Zeitaltern (Aufforstung),
// bevorzugt nahe der Holzfäller-Hütten und generell auf Inseln mit Holzfäller
let regrowT = 12;
function regrow(dt){
  regrowT -= dt;
  if (regrowT > 0) return;
  regrowT = 16 / (1 + (rathausLvl()-1)*0.15);      // Stufe 35: ~6x so schnell
  if (treeList.length > 800) return;               // Scatter-Deckel der großen Karte
  const camps = state.buildings.filter(b=>b.t==='holzfaeller');
  for (let tries=0;tries<16;tries++){
    let nx, ny;
    if (camps.length && Math.random() < 0.65){
      const c = camps[Math.floor(Math.random()*camps.length)];
      const r = gatherRadius(c);
      nx = c.x + Math.round((Math.random()-0.5)*2*r);
      ny = c.y + Math.round((Math.random()-0.5)*2*r);
    } else if (treeList.length){
      // Streu-Saat: bevorzugt von Bäumen auf Inseln, die einen Holzfäller haben
      let src = treeList[Math.floor(Math.random()*treeList.length)];
      if (camps.length){
        const isles = new Set(camps.map(c=>{ const cc = buildingCenter(c); return isleOf(cc[0],cc[1]); }));
        const pool = treeList.filter(t=>isles.has(isleOf(t.x,t.y)));
        if (pool.length) src = pool[Math.floor(Math.random()*pool.length)];
      }
      nx = src.x + Math.round((Math.random()-0.5)*4);
      ny = src.y + Math.round((Math.random()-0.5)*4);
    } else {
      nx = Math.floor(Math.random()*MAP); ny = Math.floor(Math.random()*MAP);
    }
    if (!inMap(nx,ny) || tiles[idx(nx,ny)]!==2) continue;
    const k = idx(nx,ny);
    if (treeMap[k] || rockMap[k] || occ[k] || aiOcc[k]) continue;
    const v = 1 + Math.floor(Math.random()*3);
    treeMap[k] = v;
    const ci = state.chopped.indexOf(k); if (ci>=0) state.chopped.splice(ci,1);
    state.regrown.push({x:nx, y:ny, v});
    const bio = isleBiome ? (isleBiome[isleId[k]]||'wiese') : 'wiese';
    const nt = {x:nx, y:ny, v, ph:Math.random()*7, ox:(Math.random()-0.5)*0.7,
      oy:(Math.random()-0.5)*0.7, s:0.6+Math.random()*0.35, b:bio, sn:bio==='schnee'};
    treeList.push(nt);
    invalidateTreeCache();
    state.buildings.forEach(recalcEff);
    addTreeInstance(nt);
    break;
  }
}

// ============================== KAMPF-BEUTE ==============================
let lootBuf = {}, lootDelay = 0;
function addLoot(loot){
  for (const k in loot){
    if (!loot[k]) continue;
    state.res[k] = (state.res[k]||0) + loot[k];
    lootBuf[k] = (lootBuf[k]||0) + loot[k];
  }
}
function killLoot(e){
  const w = state.wave;
  const loot = { gold: 6 + Math.floor(w*0.6),
    holz: 2 + Math.floor(Math.random()*3) + Math.min(25, Math.floor(w/4)),
    nahrung: 1 + Math.floor(Math.random()*3) };
  if (e && e.kind==='ai'){
    loot.gold = 10 + Math.floor(w*0.6);
    loot.eisen = 3 + Math.floor(rathausLvl()/4);
    if (rathausLvl() >= 16) loot.stahl = 1;
  }
  // Glücksamulett: +10 % Gold-Anteil, wenn der Held den Gegner erlegt hat
  if (e && e.heroKill && heroTrinket('gluecksamulett')) loot.gold = Math.round(loot.gold*1.1);
  addLoot(loot);
}
function flushLoot(dt){
  if (!Object.keys(lootBuf).length) return;
  lootDelay += dt;
  if (lootDelay < 2.2) return;
  toast('💰 Beute: ' + Object.entries(lootBuf).map(([k,v])=>COSTICON[k]+v).join(' '), 2800);
  lootBuf = {}; lootDelay = 0;
}

// ============================== ARBEITER (Holzfäller/Steinbruch) ==============================
const CHOPS_PER_TREE = 5;                  // Fuhren, bis ein Baum fällt (24g: 3 → 5)
const noTreeHintT = {};                    // „Insel kahl"-Hinweis: letzter Zeitpunkt je Insel
// Baum-Cache je Insel: Holzfäller suchen inselweit, aber nie pro Frame über alle 800 Bäume
let treeCacheVer = 0, treeByIsle = null, treeCacheBuilt = -1;
function invalidateTreeCache(){ treeCacheVer++; }
function treesOnIsle(isle){
  if (treeCacheBuilt !== treeCacheVer){
    treeByIsle = new Map();
    for (const t of treeList){
      const id = isleId ? isleId[idx(t.x,t.y)] : 0;
      let a = treeByIsle.get(id);
      if (!a) treeByIsle.set(id, a = []);
      a.push(t);
    }
    treeCacheBuilt = treeCacheVer;
  }
  return treeByIsle.get(isle) || [];
}
function releaseClaims(w){
  for (const t of treeList) if (t.claim===w) t.claim = null;
  for (const r of rockList) if (r.claim===w) r.claim = null;
}
function findGatherTarget(bd, w){
  const b = BT[bd.t];
  const [cx0,cy0] = buildingCenter(bd);
  if (bd.t==='fischer'){
    const r = gatherRadius(bd), cands = [];
    for (let dy=-r;dy<=r;dy++) for (let dx=-r;dx<=r;dx++){
      const x = Math.round(cx0+dx), y = Math.round(cy0+dy);
      if (inMap(x,y) && tiles[idx(x,y)]===0 && dist(x,y,cx0,cy0)<=r+0.01) cands.push([x,y]);
    }
    if (!cands.length) return null;
    const c = cands[Math.floor(Math.random()*cands.length)];
    return { x:c[0], y:c[1], fish:true };
  }
  // Holzfäller: ganze Insel als Einzugsgebiet (Laufweg bremst natürlich);
  // Steinbruch bleibt bewusst beim Radius
  const isleWide = b.isleWide;
  const list = bd.t==='holzfaeller' ? (isleWide ? treesOnIsle(isleOf(cx0,cy0)) : treeList) : rockList;
  let best = null, bestD = 1e9;
  for (const o of list){
    if (o.claim && o.claim !== w) continue;
    if (!isleWide && dist(o.x,o.y,cx0,cy0) > gatherRadius(bd)+0.01) continue;
    const dw = dist(o.x,o.y,w.x,w.y);
    if (dw < bestD){ bestD = dw; best = o; }
  }
  if (!best) return null;
  best.claim = w;
  return { x:best.x, y:best.y, obj:best, isTree: bd.t==='holzfaeller' };
}
function syncWorkerCount(bd, n){
  bd.workers = bd.workers || [];
  const [cx0,cy0] = buildingCenter(bd);
  while (bd.workers.length < n){
    const w = { x:cx0+0.9, y:cy0+0.9, dir:0, state:'idle', timer:Math.random(),
      ph:Math.random()*7, moving:false, carry:false, mesh: makePerson('folk', 3) };
    const cm = mesh(new THREE.BoxGeometry(0.13,0.13,0.4),
      bd.t==='holzfaeller' ? M.woodLight : (bd.t==='fischer' ? M.steel : M.stoneLight));
    cm.position.set(0.15,0.57,0); cm.visible = false;   // Traglast auf der Schulter
    w.mesh.add(cm); w.carryMesh = cm;
    bd.workers.push(w);
  }
  while (bd.workers.length > n){
    const w = bd.workers.pop();
    releaseClaims(w); removeUnit(w);
  }
}
function updateWorker(bd, w, dt){
  const b = BT[bd.t];
  const [bcx,bcy] = buildingCenter(bd);
  const targetGone = ()=> w.target && (
    (w.target.isTree && !treeList.includes(w.target.obj)) ||
    (w.target.fish && tiles[idx(w.target.x,w.target.y)]!==0));
  switch (w.state){
    case 'idle':
      w.moving = false;
      // Holzfäller ohne Baum: am Gebäude warten statt in der Pampa zappeln
      if (bd.t==='holzfaeller' && dist(w.x,w.y,bcx,bcy) > 1.8){
        w.moving = true; steer(w, bcx, bcy, 1.15, dt);
      }
      w.timer -= dt;
      if (w.timer <= 0){
        w.timer = 0.9;
        const tgt = findGatherTarget(bd, w);
        if (tgt){ w.target = tgt; w.state = 'go'; }
        else if (bd.t==='holzfaeller'){
          w.timer = 2.5;                       // leer: seltener suchen
          const isle = isleOf(bcx,bcy);        // Hinweis je Insel drosseln (nicht je Gebäude)
          if (state.time - (noTreeHintT[isle]||-1e9) > 45){
            noTreeHintT[isle] = state.time;
            toast('🌳 Kein Baum mehr auf dieser Insel — der Wald wächst nach', 3400);
          }
        }
      }
      break;
    case 'go': {
      if (targetGone()){ w.target = null; w.state = 'idle'; break; }
      w.moving = true;
      const reach = w.target.fish ? 1.4 : 0.7;      // Fischer bleiben am Ufer stehen
      if (dist(w.x,w.y,w.target.x,w.target.y) < reach || steer(w, w.target.x, w.target.y, 1.15, dt)){
        w.state = 'work'; w.timer = 3; w.fxT = 0.4;
        w.dir = Math.atan2(w.target.y-w.y, w.target.x-w.x);
      }
      break; }
    case 'work':
      if (targetGone()){ w.target = null; w.state = 'idle'; break; }
      w.moving = false;
      w.timer -= dt;
      w.fxT -= dt;
      if (w.fxT <= 0){
        w.fxT = 0.75;
        spawnBurst(wx(w.target.x), Math.max(hAt(w.target.x,w.target.y),0)+(w.target.fish?0.15:0.6), wz(w.target.y), 2,
          w.target.fish ? 0x9fd4ff : (w.target.isTree ? 0xc9a86a : 0xd8d8e0));
        if (Math.random()<0.5) snd(w.target.fish?520:(w.target.isTree?200:320), 0.04, 'square', 0.018);
      }
      if (w.timer <= 0){
        if (w.target.isTree){
          const t = w.target.obj;
          t.chops = (t.chops||0)+1;
          if (t.chops >= CHOPS_PER_TREE) fellTree(t, Math.atan2(bcy-t.y, bcx-t.x));
        }
        w.carry = true; w.state = 'home';
      }
      break;
    case 'home':
      w.moving = true;
      if (dist(w.x,w.y,bcx,bcy) < 1.0 || steer(w, bcx, bcy, 1.15, dt)){
        state.res[b.gather.res] += gatherAmount(bd);
        w.carry = false;
        if (w.target && w.target.obj && w.target.obj.claim===w) w.target.obj.claim = null;
        w.target = null;
        w.state = 'idle'; w.timer = 0.4;
      }
      break;
  }
}
function manageWorkers(dt){
  let avail = state.pop;
  for (const bd of state.buildings){
    if (!BT[bd.t].gather || bd.ruin){ if (bd.ruin && bd.workers) syncWorkerCount(bd, 0); continue; }
    const n = clamp(avail, 0, gatherWorkers(bd));
    avail -= n;
    syncWorkerCount(bd, n);
    for (const w of bd.workers) updateWorker(bd, w, dt);
  }
}

// ============================== MARKER & GHOST ==============================
const quadGeo = new THREE.PlaneGeometry(TL*0.96, TL*0.96);
const quadOk = new THREE.MeshBasicMaterial({ color:0x50dc6e, transparent:true, opacity:0.4, depthWrite:false, side:THREE.DoubleSide });
const quadBad = new THREE.MeshBasicMaterial({ color:0xe6463c, transparent:true, opacity:0.45, depthWrite:false, side:THREE.DoubleSide });
const quadSel = new THREE.MeshBasicMaterial({ color:0x8cbeff, transparent:true, opacity:0.35, depthWrite:false, side:THREE.DoubleSide });
const quadSpawn = new THREE.MeshBasicMaterial({ color:0xff5a46, transparent:true, opacity:0.5, depthWrite:false, side:THREE.DoubleSide });
const tileQuads = [];
for (let i=0;i<4;i++){
  const q = new THREE.Mesh(quadGeo, quadOk);
  q.rotation.x = -Math.PI/2; q.visible = false; q.renderOrder = 5;
  fxGroup.add(q); tileQuads.push(q);
}
const spawnQuad = new THREE.Mesh(quadGeo, quadSpawn);
spawnQuad.rotation.x = -Math.PI/2; spawnQuad.visible = false; spawnQuad.renderOrder = 5;
fxGroup.add(spawnQuad);
const rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.94,1,56),
  new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.55, depthWrite:false, side:THREE.DoubleSide }));
rangeRing.rotation.x = -Math.PI/2; rangeRing.visible = false; rangeRing.renderOrder = 6;
fxGroup.add(rangeRing);
// Bauraster
let gridLines;
{ const pts = [];
  for (let i=-5;i<=6;i++){
    pts.push(-5*TL,0,i*TL, 6*TL,0,i*TL);
    pts.push(i*TL,0,-5*TL, i*TL,0,6*TL);
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(pts,3));
  gridLines = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color:0xffffff,
    transparent:true, opacity:0.14, depthWrite:false }));
  gridLines.visible = false; gridLines.renderOrder = 4;
  fxGroup.add(gridLines);
}
let ghost = null;
function makeGhost(t){
  const g = makeBuilding(t);
  g.traverse(o=>{
    if (o.isMesh){
      o.material = o.material.clone();
      o.material.userData.shared = false;    // Klon gehört dem Ghost, darf disposed werden
      o.material.transparent = true; o.material.opacity = 0.55;
      o.material.depthWrite = false;
      o.castShadow = false; o.receiveShadow = false;
    }
  });
  return g;
}

// ============================== SOUND / UI-BASIS ==============================
const $ = (id)=>document.getElementById(id);
let AC = null;
function snd(freq, dur, type, vol){
  if (!state || state.muted) return;
  try{
    AC = AC || new (window.AudioContext||window.webkitAudioContext)();
    if (AC.state==='suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type||'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol||0.04, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime+dur);
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime+dur+0.02);
  }catch(_){}
}
function toast(msg, ms){
  const d = document.createElement('div');
  d.className = 'toast'; d.textContent = msg;
  $('toasts').appendChild(d);
  setTimeout(()=>{ d.style.transition='opacity .5s'; d.style.opacity='0';
    setTimeout(()=>d.remove(), 520); }, ms||2600);
}

// ============================== STADT-CHRONIK ==============================
// Persistente Meilenstein-Liste (state.chronicle) mit kleinen Foto-Thumbnails.
const RN_A = ['Adler','Falken','Löwen','Bären','Greifen','Silber','Gold','Sturm',
  'Sonnen','Morgen','Nebel','Rosen','Eichen','Kron','Hoch','Winter'];
const RN_B = ['burg','stein','feld','tal','heim','wacht','fels','hain','mark','furt','hof','land'];
function genReichName(){
  return RN_A[(Math.random()*RN_A.length)|0] + RN_B[(Math.random()*RN_B.length)|0];
}
// Einmalige „Erste …“-Meilensteine beim Spieler-Bau
const CHRON_FIRSTS = {
  mauer: '🧱 Die erste Mauer umgibt die Siedlung.',
  tor:   '🚪 Das erste Stadttor öffnet seine Flügel.',
  turm:  '🗼 Der erste Wachturm hält Wacht über das Reich.',
  hafen: '⚓ Der erste Hafen verbindet das Reich mit der See.',
  akademie: '🔬 Die Forschungsakademie öffnet – das Wissen des Reiches wächst.',
  fabrik:   '🏭 Die erste Fahrzeugfabrik nimmt die Produktion auf.',
  flugfeld: '🛩️ Das erste Flugfeld – das Reich erobert den Himmel.',
  speicher:   '🏺 Das erste Speicherhaus verkürzt die Wege der Sammler.',
  taverne:    '🍺 Die erste Taverne schenkt aus – das Volk feiert.',
  leuchtturm: '🗼 Der erste Leuchtturm weist den Schiffen den Weg.',
  lazarett:   '⛑️ Das erste Lazarett versorgt die Verwundeten des Reiches.',
  hq:         '🎖️ Das Verteidigungs-HQ übernimmt das Oberkommando.',
  theater:    '🎭 Das erste Theater hebt den Vorhang.',
};
let chronPending = [];        // Einträge, die noch auf ihr Thumbnail warten
let chronCanvas = null;
function chronicleHas(typ){ return !!state && (state.chronicle||[]).some(e=>e.typ===typ); }
function chronicleAdd(typ, text, extra){
  if (!state) return null;
  if (!state.chronicle) state.chronicle = [];    // Alt-Spielstände ohne Feld
  const e = Object.assign({ t: state.time, typ, text, thumb: null }, extra||{});
  state.chronicle.push(e);
  chronPending.push(e);                          // Snapshot folgt nach dem nächsten render()
  // Deckel: max 120 Einträge – älteste Texte fliegen raus, Start/Epochen bleiben
  while (state.chronicle.length > 120){
    const i = state.chronicle.findIndex(x=>x.typ!=='era' && x.typ!=='start');
    state.chronicle.splice(i>=0 ? i : 0, 1);
  }
  return e;
}
// WICHTIG: WebGL-Puffer ist ohne preserveDrawingBuffer nach dem Frame leer –
// deshalb wird das Thumbnail DIREKT nach renderer.render() in loop() gezogen.
function captureChronThumbs(){
  if (!chronPending.length) return;
  try{
    chronCanvas = chronCanvas || document.createElement('canvas');
    chronCanvas.width = 160; chronCanvas.height = 90;
    const g = chronCanvas.getContext('2d');
    g.drawImage(renderer.domElement, 0, 0, 160, 90);
    const url = chronCanvas.toDataURL('image/jpeg', 0.55);
    for (const e of chronPending) e.thumb = url;
  }catch(_){}
  chronPending = [];
  if (!state || !state.chronicle) return;
  // Speicher-Budget: alle Thumbs zusammen max ~1 MB – älteste verlieren nur das Bild
  let sum = 0;
  for (const e of state.chronicle) if (e.thumb) sum += e.thumb.length;
  for (let i=0; sum > 1000000 && i < state.chronicle.length; i++){
    const e = state.chronicle[i];
    if (e.thumb){ sum -= e.thumb.length; e.thumb = null; }
  }
}
// Wellen-Rekord (nur zur Chronik-Auswahl, nicht persistent; nach Laden neu geseedet)
let waveSpawnN = 0, chronWaveRecord = 0;
function waveStrength(w){ return (2+Math.floor(w)) * (1+0.12*(w-1)); }

// --- Kamerafahrt beim Epochenwechsel: eine Orbit-Runde ums Rathaus (~4 s) ---
let eraFlight = null;
function startEraFlight(onDone){
  if (egoMode){ if (onDone) onDone(); return; }  // Ego-Modus: keine Kamerafahrt (Chronik bleibt)
  cancelEraFlight();                             // laufende Fahrt sauber abschließen
  const rat = state && state.buildings.find(b=>b.t==='rathaus');
  if (!rat){ if (onDone) onDone(); return; }
  const [cx,cy] = buildingCenter(rat);
  eraFlight = { t:0, dur:4, onDone,
    prev:{ tx:cam.tx, tz:cam.tz, az:cam.az, dist:cam.dist },
    cx: wx(cx), cz: wz(cy) };
}
// Abbruch/Ende: Kamera exakt auf vorherige Werte zurück (Spieler behält Kontrolle)
function cancelEraFlight(){
  if (!eraFlight) return;
  const f = eraFlight; eraFlight = null;
  cam.tx = f.prev.tx; cam.tz = f.prev.tz; cam.az = f.prev.az; cam.dist = f.prev.dist;
  if (f.onDone) f.onDone();
}
function updateEraFlight(dt){
  if (!eraFlight) return;
  const f = eraFlight;
  f.t += dt;
  const p = Math.min(1, f.t/f.dur);
  // Gewicht: sanft zum Rathaus blenden, am Ende wieder exakt heraus
  const w = clamp(Math.min(p, 1-p)*5, 0, 1);
  const s = w*w*(3-2*w);
  cam.tx = lerp(f.prev.tx, f.cx, s);
  cam.tz = lerp(f.prev.tz, f.cz, s);
  cam.az = f.prev.az + p*Math.PI*2;              // volle Runde → endet beim Startwinkel
  cam.dist = f.prev.dist * (1 - 0.3*s);
  if (p >= 1) cancelEraFlight();
}

// ============================== GEBÄUDE-VERWALTUNG ==============================
function canAfford(cost){ for (const k in cost) if (state.res[k] < cost[k]) return false; return true; }
function pay(cost){ for (const k in cost) state.res[k] -= cost[k]; }
function countNear(map,x,y,w,h,r){
  let n = 0;
  const cx=x+(w-1)/2, cy=y+(h-1)/2;
  for (let j=-r;j<=r;j++) for (let i=-r;i<=r;i++){
    const px=Math.round(cx+i), py=Math.round(cy+j);
    if (inMap(px,py) && map[idx(px,py)] && dist(px,py,cx,cy)<=r+0.01) n++;
  }
  return n;
}
// Baugebiet: im Umkreis von Rathaus oder Vorposten
function inSettlement(x,y){
  for (const bd of state.buildings){
    if (bd.t!=='rathaus' && bd.t!=='vorposten') continue;
    const [cx,cy] = buildingCenter(bd);
    const r = bd.t==='rathaus' ? 11+2*(lvlOf(bd)-1) : 8+2*(lvlOf(bd)-1);
    if (dist(x,y,cx,cy) <= r) return true;
  }
  return false;
}
function canPlace(t,x,y){
  const b = BT[t];
  if (b.terra){
    if (!inMap(x,y)) return false;
    if (dngPortals.some(p=>Math.abs(x-p.x)<=1 && Math.abs(y-p.y)<=1)) return false;   // Portal schützen
    const k = idx(x,y);
    if (b.terra==='see') return tiles[k]===2 && !occ[k] && !aiOcc[k] && !treeMap[k] && !rockMap[k];
    // Aufschütten: Wasser mit mindestens einem Landnachbarn
    if (tiles[k]!==0) return false;
    return [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>
      inMap(x+dx,y+dy) && tiles[idx(x+dx,y+dy)]>0);
  }
  // Verteidigungs-HQ: nur ein Exemplar im Reich (auch als Ruine belegt es den Posten)
  if (b.hq && state.buildings.some(x=>x.t==='hq')) return false;
  for (let j=0;j<b.h;j++) for (let i=0;i<b.w;i++){
    const px=x+i, py=y+j;
    if (!inMap(px,py)) return false;
    const k = idx(px,py);
    if (tiles[k]!==2 || occ[k] || aiOcc[k] || treeMap[k] || rockMap[k]) return false;
    // Dungeon-Portale (24c) sind unantastbar – 1 Kachel Abstand
    if (dngPortals.some(p=>Math.abs(px-p.x)<=1 && Math.abs(py-p.y)<=1)) return false;
    // normale Gebäude nur im Siedlungsgebiet (Expeditionen gründen neue).
    // 26a §8.2: Turm/Mauer/Tor dürfen zusätzlich als Belagerungs-Bau auf einer
    // Fürsten-Insel entstehen – nur nicht direkt am Feindlager.
    if (!b.vorp && !inSettlement(px,py) && !siegeAllowed(t,px,py)) return false;
  }
  // Hafen und Leuchtturm brauchen direkten Wasserzugang
  if (b.harbor || b.coast)
    return [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>
      inMap(x+dx,y+dy) && tiles[idx(x+dx,y+dy)]===0);
  return true;
}
// Terrain dauerhaft verändern (See ausheben / Land aufschütten)
function applyTerraform(kind, x, y){
  const k = idx(x,y);
  if (kind==='see'){
    tiles[k] = 0; treeMap[k] = 0; rockMap[k] = 0;
    treeList = treeList.filter(t=>!(t.x===x && t.y===y));
    rockList = rockList.filter(r=>!(r.x===x && r.y===y));
    state.regrown = (state.regrown||[]).filter(r=>!(r.x===x && r.y===y));
  } else {
    tiles[k] = 2;
  }
  state.terra.push({ x, y, w: kind==='see' ? 0 : 2 });
  computeIsles();                    // Landbrücken/Seen ändern die Insel-Zugehörigkeit
  invalidateTreeCache();             // Insel-IDs haben sich verschoben
  buildWorld();
  // Gebäude auf neue Geländehöhe setzen
  for (const bd of state.buildings){
    if (!bd.mesh) continue;
    const [cx,cy] = buildingCenter(bd);
    bd.mesh.position.y = Math.max(hAt(cx,cy), 0.02);
    orientHarbor(bd);        // neues Ufer: Steg-Richtung/-Höhe nachführen
  }
  for (const bd of aiFlat){
    if (!bd.mesh) continue;
    const [cx,cy] = aiBuildingCenter(bd);
    bd.mesh.position.y = Math.max(hAt(cx,cy), 0.02);
  }
  state.buildings.forEach(recalcEff);
  initMineSpots();           // Ufer haben sich geändert: Spots prüfen + Optik neu setzen
  initDungeonPortals();      // Portale auf neue Geländehöhe/Küstenlinie nachführen
  spawnBurst(wx(x), Math.max(hAt(x,y),0)+0.4, wz(y), 10, kind==='see' ? 0x9fd4ff : 0xc9b28a);
  toast(kind==='see' ? '🌊 See ausgehoben!' : '🌱 Neues Land aufgeschüttet!');
  save();
}
function buildingCenter(bd){ const b = BT[bd.t]; return [bd.x+(b.w-1)/2, bd.y+(b.h-1)/2]; }
function countWater(bd){
  const r = gatherRadius(bd), [cx0,cy0] = buildingCenter(bd);
  let n = 0;
  for (let dy=-r;dy<=r;dy++) for (let dx=-r;dx<=r;dx++){
    const x = Math.round(cx0+dx), y = Math.round(cy0+dy);
    if (inMap(x,y) && tiles[idx(x,y)]===0 && dist(x,y,cx0,cy0)<=r+0.01) n++;
  }
  return n;
}
function recalcEff(bd){
  const b = BT[bd.t];
  if (b.needs==='tree') bd.eff = clamp(countNear(treeMap,bd.x,bd.y,b.w,b.h,gatherRadius(bd))/5, 0.15, 1);
  else if (b.needs==='rock') bd.eff = clamp(countNear(rockMap,bd.x,bd.y,b.w,b.h,gatherRadius(bd))/3, 0.15, 1);
  else bd.eff = 1;
}
// Animierte Kind-Objekte einmalig suchen statt getObjectByName pro Frame;
// muss nach jedem Mesh-Tausch (Ruine/Reparatur) neu aufgebaut werden
function cacheAnimParts(bd){
  bd.animParts = !bd.mesh ? { flag:null, fire:null, deers:null, boot:null } : {
    flag: bd.mesh.getObjectByName('flag'),
    fire: bd.mesh.getObjectByName('fire'),
    boot: bd.t==='hafen' ? bd.mesh.getObjectByName('boot') : null,
    deers: bd.t==='gehege'
      ? [0,1,2,3].map(i=>bd.mesh.getObjectByName('deer'+i)) : null,
  };
  return bd.animParts;
}
function addBuilding(t,x,y,hp,noAnim){
  const b = BT[t];
  const bd = { t, x, y, hp: hp!==undefined?hp:b.hp, cd:0, eff:1 };
  state.buildings.push(bd);
  const bi = state.buildings.length;
  for (let j=0;j<b.h;j++) for (let i=0;i<b.w;i++) occ[idx(x+i,y+j)] = bi;
  recalcEff(bd);
  const [cx,cy] = buildingCenter(bd);
  const g = makeBuilding(t);
  g.position.set(wx(cx), Math.max(hAt(cx,cy),0.02), wz(cy));
  bldGroup.add(g);
  bd.mesh = g;
  cacheAnimParts(bd);
  if (!noAnim){ bd.anim = 0; g.scale.setScalar(0.5); }
  updateWalls();
  orientHarbor(bd);          // Hafen/Leuchtturm zum Wasser drehen (auch beim Laden von Alt-Saves)
  return bd;
}
// Stufen-Visualisierung: leicht größer + Wimpel je Ausbaustufe
const PENNANT_Y = { haus:2.6, holzfaeller:2.0, steinbruch:1.8, farm:1.8, turm:3.4, kaserne:1.8,
  rathaus:5.4, fischer:2.0, gehege:1.4, mine:1.9, schmiede:2.1, markt:1.6, hafen:1.8, vorposten:2.3,
  mauer:1.5, tor:2.0, akademie:2.6, fabrik:2.3, flugfeld:1.9,
  speicher:2.0, taverne:2.2, leuchtturm:3.9, lazarett:1.9, theater:2.8, hq:1.4, heldenhalle:2.8 };
const PENNANT_COL = [0xd8b02f, 0x3fae5c, 0x3d6fb4, 0xb0463c];
function applyLevelVisual(bd){
  const l = lvlOf(bd);
  bd.baseScale = 1 + Math.min(0.35, 0.06*(l-1));    // visuell gedeckelt
  if (bd.anim === undefined && bd.mesh) bd.mesh.scale.setScalar(bd.baseScale);
  if (!bd.mesh) return;
  const old = bd.mesh.getObjectByName('lvlmark');
  if (old){ bd.mesh.remove(old); disposeGroup(old); }
  if (l >= 2){
    const nf = Math.min(4, l-1);
    const mk = new THREE.Group(); mk.name = 'lvlmark';
    const y = PENNANT_Y[bd.t] || 2.2;
    const poleLen = 0.32 + nf*0.24;
    mk.add(cyl(0.022,0.022,poleLen, M.timber, 0.5, y-poleLen, 0.5, 5));
    for (let i=0;i<nf;i++){
      const f = mesh(new THREE.PlaneGeometry(0.36,0.19),
        std(PENNANT_COL[i%PENNANT_COL.length],{side:THREE.DoubleSide}), false, false);
      f.position.set(0.5+0.19, y-0.12-i*0.24, 0.5);
      mk.add(f);
    }
    bd.mesh.add(mk);
  }
  orientHarbor(bd);          // Steg-Höhe folgt der neuen Gebäudegröße (baseScale)
}
// Ausbau durchführen (mit Prüfungen); gibt true bei Erfolg zurück
function tryUpgrade(bd){
  const uc = upgradeCost(bd);
  if (!uc){ toast('Maximale Stufe erreicht.'); return false; }
  if (bd.t==='rathaus'){
    const need = rathausPopNeed(lvlOf(bd));
    const z = satisfaction().total;
    if (state.pop < need){ toast('🏛️ Braucht '+need+' Bevölkerung (aktuell '+state.pop+').'); return false; }
    if (z < 0.7){ toast('🏛️ Zufriedenheit muss mind. 70% sein (aktuell '+Math.round(z*100)+'%) – 😊 antippen für Details.'); return false; }
  } else if (lvlOf(bd) >= rathausLvl()){
    toast('⬆️ Baue zuerst das Rathaus auf Stufe '+(lvlOf(bd)+1)+' aus.'); return false;
  }
  if (!canAfford(uc)){ toast('Nicht genug Rohstoffe für den Ausbau.'); return false; }
  pay(uc);
  const wasEra = bd.t==='rathaus' ? eraOf(lvlOf(bd)) : null;
  bd.lvl = lvlOf(bd)+1;
  bd.hp = maxHp(bd);
  bd.anim = 0;
  applyLevelVisual(bd); recalcEff(bd);
  spawnBurst(bd.mesh.position.x, bd.mesh.position.y+1.2, bd.mesh.position.z, 10, 0xffe9a0);
  toast('⬆️ '+BT[bd.t].name+' ist jetzt Stufe '+bd.lvl+'!');
  if (bd.t==='rathaus'){
    chronicleAdd('rathaus', '🏛️ Das Rathaus erreicht Stufe '+bd.lvl+'.');
    const fresh = BUILDABLE.filter(t=>BT[t].req===bd.lvl);
    if (fresh.length){
      toast('🔨 Neu verfügbar: '+fresh.map(t=>BT[t].name).join(', '), 5500);
      updateBuildBadge();
    }
  }
  if (wasEra){
    const nowEra = eraOf(bd.lvl);
    if (nowEra !== wasEra){
      chronicleAdd('era', '🎇 Neues Zeitalter: '+nowEra.icon+' '+nowEra.name+' (Rathaus Stufe '+bd.lvl+').');
      if (state.hero && hero) refreshHeroLook(true);   // 25b: Rüstungs-Look folgt der Epoche
      // Kultur wird ab jetzt zum 4. Bedürfnis – einmaliger Hinweis (Etappe 21b)
      if (nowEra.name==='Renaissance' && !state.kulturHint){
        state.kulturHint = 1;
        toast('🎭 Dein Volk wünscht sich Unterhaltung – baue eine Taverne! (😊 antippen für Details)', 6500);
      }
      // Orbit-Fahrt ums Rathaus; die Großmeldung erscheint erst danach
      // (jede Eingabe bricht die Fahrt ab und zeigt die Meldung sofort)
      startEraFlight(()=>toast('🎇 NEUES ZEITALTER: ' + nowEra.icon + ' ' + nowEra.name + '! Neue Gebäude und Einheiten warten.', 6500));
      snd(392,0.2,'triangle',0.06); snd(523,0.2,'triangle',0.06); snd(784,0.35,'triangle',0.06);
    }
  }
  snd(392,0.1,'triangle',0.05); snd(523,0.12,'triangle',0.05); snd(659,0.16,'triangle',0.05);
  save();
  return true;
}
// Mauersegmente an Nachbar-Mauern ausrichten
function isWallTile(x,y){
  if (!inMap(x,y)) return false;
  const o = occ[idx(x,y)];
  return o>0 && !!BT[state.buildings[o-1].t].wall && !state.buildings[o-1].ruin;
}
// Mauer-Verbindungspartner: Mauern, Tore und Türme (keine Ruinen)
function isWallLink(x,y){
  if (!inMap(x,y)) return false;
  const o = occ[idx(x,y)];
  if (!(o>0)) return false;
  const bd = state.buildings[o-1];
  if (bd.ruin) return false;
  return !!BT[bd.t].wall || bd.t==='turm';
}
function updateWalls(){
  for (const bd of state.buildings){
    if (!BT[bd.t].wall || !bd.mesh || bd.ruin) continue;
    const n = isWallLink(bd.x,bd.y-1), s2 = isWallLink(bd.x,bd.y+1),
          e2 = isWallLink(bd.x+1,bd.y), w2 = isWallLink(bd.x-1,bd.y);
    if (bd.t==='mauer'){
      const any = n||s2||e2||w2;
      const setV = (nm,v)=>{ const o2 = bd.mesh.getObjectByName(nm); if (o2) o2.visible = v; };
      setV('aN', n); setV('aS', s2);
      setV('aE', e2 || !any); setV('aW', w2 || !any);   // frei stehend: kurzes Segment
      bd.mesh.rotation.y = 0;
    } else {
      // Tor: an der Mauerlinie ausrichten
      bd.mesh.rotation.y = ((n||s2) && !(e2||w2)) ? Math.PI/2 : 0;
    }
  }
}
// Hafen/Leuchtturm zur nächsten Wasser-Nachbarkachel drehen (rein visuell).
// Hafen: Steg-Gruppe zusätzlich auf Wasserhöhe legen und den Landgang ans Fundament anschließen.
// Läuft nach addBuilding (deckt auch load()/Alt-Saves ab), nach applyLevelVisual und Terraforming.
function orientHarbor(bd){
  if ((bd.t!=='hafen' && bd.t!=='leuchtturm') || !bd.mesh || bd.ruin) return;
  const DIRS = [[1,0,0],[0,1,-Math.PI/2],[-1,0,Math.PI],[0,-1,Math.PI/2]];
  let rot = null, best = -1, dir = null;
  const isWater = (px,py)=>!inMap(px,py) || tiles[idx(px,py)]===0;   // Kartenrand = offenes Meer
  for (const [dx,dy,r] of DIRS){
    if (!inMap(bd.x+dx,bd.y+dy) || tiles[idx(bd.x+dx,bd.y+dy)]!==0) continue;
    let n = 0;                                   // offenstes Wasser gewinnt (3 Kacheln voraus)
    for (let s=1;s<=3;s++) if (isWater(bd.x+dx*s, bd.y+dy*s)) n++;
    if (n > best){ best = n; rot = r; dir = [dx,dy]; }
  }
  if (rot === null) return;                      // kein Wasser angrenzend (canPlace verhindert das)
  // Leuchtturm-Modell: Tür/Wärterhäuschen liegen auf +Z → um 90° versetzt zum Wasser drehen
  bd.mesh.rotation.y = bd.t==='leuchtturm' ? rot + Math.PI/2 : rot;
  const pier = bd.mesh.getObjectByName('pier');
  if (!pier) return;
  const s = bd.baseScale || 1;
  // Schmale Bucht (nur 1 Wasserkachel voraus): Steg kürzen, sonst volle Länge
  pier.scale.x = isWater(bd.x+dir[0]*2, bd.y+dir[1]*2) ? 1 : 0.68;
  pier.position.y = (0.02 - bd.mesh.position.y)/s;      // Deck knapp über Wasserlinie (~-0.06)
  const boot = bd.mesh.getObjectByName('boot');
  if (boot){
    boot.position.x = 2.6*pier.scale.x;
    boot.userData.baseY = pier.position.y - 0.14;       // Schwimmlage fürs Schaukeln in loop()
    boot.position.y = boot.userData.baseY;
  }
  const ramp = bd.mesh.getObjectByName('ramp');
  if (ramp){
    const x0 = 0.52, y0 = 0.05;                         // Fundament-Oberkante (Land-Ende)
    const x1 = 1.15*pier.scale.x, y1 = pier.position.y + 0.10;   // Deck-Anfang
    ramp.position.set(x0, y0, 0);
    ramp.rotation.z = Math.atan2(y1-y0, x1-x0);
    ramp.scale.x = Math.hypot(x1-x0, y1-y0);
  }
}
function rebuildOcc(){
  occ.fill(0);
  state.buildings.forEach((bd,n)=>{
    const b = BT[bd.t];
    for (let j=0;j<b.h;j++) for (let i=0;i<b.w;i++) occ[idx(bd.x+i,bd.y+j)] = n+1;
  });
  state.buildings.forEach(recalcEff);
}
function removeBuilding(bd){
  const i = state.buildings.indexOf(bd);
  if (i<0) return;
  state.buildings.splice(i,1);
  if (bd.mesh){ bldGroup.remove(bd.mesh); disposeGroup(bd.mesh); }
  if (bd.workers){ for (const w of bd.workers){ releaseClaims(w); removeUnit(w); } bd.workers = null; }
  rebuildOcc();
  updateWalls();
  const [cx,cy] = buildingCenter(bd);
  spawnBurst(wx(cx), hAt(cx,cy)+0.5, wz(cy), 10, 0xc9b28a);
}

// ============================== EINHEITEN ==============================
let folk = [], soldiers = [], enemies = [], arrows = [];
function landAt(fx,fy){
  const x = Math.round(fx), y = Math.round(fy);
  return inMap(x,y) && tiles[idx(x,y)] > 0;
}
// begehbar = Land und keine (intakte) Mauer; Tore lassen eigene Einheiten durch,
// Türme schließen die Mauerlinie ebenfalls gegen Feinde
function walkable(fx,fy,hostile){
  const x = Math.round(fx), y = Math.round(fy);
  if (!inMap(x,y) || tiles[idx(x,y)]===0) return false;
  const o = occ[idx(x,y)];
  if (!(o>0)) return true;
  const bd = state.buildings[o-1];
  if (bd.ruin) return true;
  const b = BT[bd.t];
  if (b.wall) return b.gate ? !hostile : false;
  if (b.tower) return !hostile;
  return true;
}
function steer(u, tx, ty, sp, dt){
  const dx = tx-u.x, dy = ty-u.y, d = Math.hypot(dx,dy);
  if (d < 0.05) return true;
  const base = Math.atan2(dy,dx);
  for (const off of [0, 0.55, -0.55, 1.1, -1.1, 1.7, -1.7, 2.4, -2.4]){
    const a = base+off;
    const nx = u.x + Math.cos(a)*sp*dt, ny = u.y + Math.sin(a)*sp*dt;
    if (walkable(u.x + Math.cos(a)*0.45, u.y + Math.sin(a)*0.45, u.hostile) && walkable(nx,ny,u.hostile)){
      u.x = nx; u.y = ny; u.dir = a; return false;
    }
  }
  return false;
}
// Fahrzeuge der späten Epochen
function makeVehicle(kind){
  const g = new THREE.Group();
  if (kind==='panzer'){
    g.add(bx(0.9,0.16,0.55, std(0x2a2a30), 0,0,0));                // Ketten
    g.add(bx(0.8,0.22,0.44, std(0x5c6b4e), 0,0.16,0));             // Wanne
    g.add(bx(0.42,0.2,0.36, std(0x67784f), -0.05,0.38,0));         // Turm
    const rohr = cyl(0.035,0.035,0.7, std(0x3a4030), 0.35,0.44,0,6);
    rohr.rotation.z = Math.PI/2; rohr.position.set(0.4,0.5,0); g.add(rohr);
  } else if (kind==='flieger'){
    const fus = cyl(0.1,0.16,1.0, std(0xd8dde5), 0,0,0,8);
    fus.rotation.z = Math.PI/2; fus.position.y = 0.35; g.add(fus);
    g.add(bx(0.28,0.04,1.5, std(0xc23b2a), -0.05,0.35,0));         // Tragflächen
    g.add(bx(0.2,0.04,0.5, std(0xc23b2a), -0.48,0.42,0));          // Heck
    g.add(bx(0.04,0.25,0.2, std(0xc23b2a), -0.48,0.5,0));
    const prop = mesh(new THREE.BoxGeometry(0.03,0.5,0.06), std(0x3a3a40));
    prop.name = 'prop'; prop.position.set(0.55,0.35,0); g.add(prop);
    g.add(bx(0.14,0.1,0.05, M.window, 0.12,0.46,0));
  }
  // HP-Balken
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color:0x101418, depthTest:false }));
  bg.scale.set(0.6,0.08,1); bg.position.y = 1.0; bg.visible = false; g.add(bg);
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color:0x5ad06a, depthTest:false }));
  fg.scale.set(0.58,0.06,1); fg.position.y = 1.0; fg.visible = false; g.add(fg);
  g.userData.hp = [bg,fg];
  g.traverse(o=>{ if (o.isMesh) o.castShadow = true; });
  pruneSmallShadowCasters(g);
  fxGroup.add(g);
  return g;
}
// Figuren-Bauteile: alle Geometrien geteilt (eine Instanz für alle Figuren)
// Leicht konischer Rumpf mit eingebackenen Schultern (1 Mesh statt 2)
const torsoGeo = mergeGeometries([
  new THREE.CylinderGeometry(0.10,0.14,0.32,7),
  new THREE.SphereGeometry(0.105,7,5).applyMatrix4(
    new THREE.Matrix4().makeScale(1.18,0.55,0.92).setPosition(0,0.145,0)),
]);
const beltGeo = new THREE.CylinderGeometry(0.125,0.132,0.05,7);       // Gürtel
const armGeo = new THREE.CylinderGeometry(0.032,0.038,0.26,6).translate(0,-0.13,0);  // Drehpunkt Schulter
const legGeo = new THREE.CylinderGeometry(0.04,0.048,0.24,6).translate(0,-0.11,0);   // Drehpunkt Hüfte
const headGeo = new THREE.SphereGeometry(0.11,7,6);
const helmGeo = new THREE.SphereGeometry(0.12,6,4,0,Math.PI*2,0,Math.PI/2);
const hoodGeo = new THREE.SphereGeometry(0.128,7,5,0,Math.PI*2,0,Math.PI*0.58);      // Kapuze
const spearGeo = new THREE.CylinderGeometry(0.016,0.016,0.95,5);
const tipGeo = new THREE.ConeGeometry(0.04,0.12,5);
const shieldGeo = new THREE.CircleGeometry(0.13,10);
const ringGeo = new THREE.RingGeometry(0.3,0.42,20);
for (const geo of [torsoGeo, beltGeo, armGeo, legGeo,
  headGeo, helmGeo, hoodGeo, spearGeo, tipGeo, shieldGeo, ringGeo]) geo.userData.shared = true;
// Geteilte Figuren-Materialien (Hauttöne, Uniformen, Ausrüstung)
const SKIN_MATS = [0xe8b88a, 0xdca878, 0xc08a58, 0x8d5f3d].map(c=>std(c));
const PM = {
  aiBody: std(0x8a2f2f), laserBody: std(0x3a4048), laserDark: std(0x30323c),
  visor: std(0x22ffcc,{ emissive:0x18e0b0, emissiveIntensity:1.6 }),
  laserTip: std(0xff3050,{ emissive:0xff2040, emissiveIntensity:1.8 }),
  glowStripe: std(0x35e0ff,{ emissive:0x25b8e0, emissiveIntensity:1.1 }),
  pants: std(0x53483a), pantsDark: std(0x3a332c),
  shieldRed: std(0xa8303a,{side:THREE.DoubleSide}),
  hoodDark: std(0x33291f),
  enemyRing: new THREE.MeshBasicMaterial({ color:0xff4a3c, transparent:true, opacity:0.55,
    side:THREE.DoubleSide, depthWrite:false }),
  heldBody: std(0x4a3f7d),
  heldRing: new THREE.MeshBasicMaterial({ color:0xffd75a, transparent:true, opacity:0.55,
    side:THREE.DoubleSide, depthWrite:false }),
};
for (const k in PM) PM[k].userData.shared = true;
for (const m of SKIN_MATS) m.userData.shared = true;

// ============================== HELD 2.0 (Etappe 25b) ==============================
// Der Held trägt vier Rüstungs-Looks über die sieben Epochen (nur Optik, kein Save-Feld):
// 0 Ritterharnisch (Mittelalter/Renaissance), 1 Platten-Gurtzeug (Industrie/Moderne),
// 2 Leucht-Anzug (Digital/Raumfahrt), 3 heller Tech-Anzug (Zukunft).
function heroLookTier(){
  if (!state || !state.buildings) return 0;
  const l = rathausLvl();
  return l>=31 ? 3 : l>=21 ? 2 : l>=11 ? 1 : 0;
}
// Metallische Rüstungs-Materialien (geteilt; Palette-Muster wie M/PM)
// Hinweis: metalness niedrig halten – ohne Environment-Map werden Metalle sonst schwarz
const HP = {
  chain:  std(0x9aa2ad,{ metalness:0.25, roughness:0.7  }),  // Kettenhemd
  plate:  std(0xd6dde6,{ metalness:0.35, roughness:0.4  }),  // polierter Harnisch
  goldM:  std(0xe0b33c,{ metalness:0.4,  roughness:0.35 }),  // Zierränder
  pantsA: std(0x565c76),                                     // Beinlinge Mittelalter
  indus:  std(0x87919c,{ metalness:0.3,  roughness:0.5  }),  // Industrie-Platte
  indusD: std(0x59626e,{ metalness:0.25, roughness:0.6  }),
  strap:  std(0x6b5138),                                     // Leder-Gurtzeug
  suit:   std(0x5a6b8c,{ metalness:0.25, roughness:0.45 }),  // glatter Digital-Anzug
  suitD:  std(0x44506b,{ metalness:0.3,  roughness:0.4  }),
  futur:  std(0xe8edf4,{ metalness:0.3,  roughness:0.3  }),  // heller Tech-Anzug
  futurD: std(0xb9c4d4,{ metalness:0.35, roughness:0.35 }),
  glow:   std(0x49c8ff,{ emissive:0x2f9fe0, emissiveIntensity:2.2 }),
  glowHi: std(0x8ce4ff,{ emissive:0x55ccff, emissiveIntensity:2.8 }),
  plume:  std(0xc23a4a),                                     // Federbusch
};
for (const k in HP) HP[k].userData.shared = true;
// Stil je Look: Rumpf/Ärmel, Beine, Platten, dunkler Kontrast, Zierde, Leuchtakzent
const HERO_LOOKS = [
  { body:HP.chain,  legs:HP.pantsA,    plate:HP.plate,  dark:HP.goldM,  glow:null },
  { body:HP.indusD, legs:PM.pantsDark, plate:HP.indus,  dark:HP.strap,  glow:null },
  { body:HP.suit,   legs:HP.suitD,     plate:HP.suitD,  dark:HP.suitD,  glow:HP.glow },
  { body:HP.futur,  legs:HP.futurD,    plate:HP.futurD, dark:HP.futurD, glow:HP.glowHi },
];
// Geteilte Rüstungs-Geometrien (eine Instanz für alle Neuaufbauten)
const HGEO = {
  chest: new THREE.BoxGeometry(0.19,0.22,0.05),                       // Brustplatte
  ridge: new THREE.BoxGeometry(0.026,0.2,0.026),                      // Mittelgrat (45° gedreht)
  pld:   new THREE.SphereGeometry(0.06,7,4,0,Math.PI*2,0,Math.PI*0.55), // Schulterschale
  rim:   new THREE.TorusGeometry(0.052,0.011,5,10),                   // Goldrand der Schulter
  brace: new THREE.CylinderGeometry(0.04,0.047,0.095,6),              // Armschiene
  knee:  new THREE.SphereGeometry(0.05,6,4,0,Math.PI*2,0,Math.PI*0.6),// Knieschiene
  helmB: new THREE.CylinderGeometry(0.117,0.124,0.13,7,1,true,0.7,Math.PI*2-1.4), // Topfhelm, Front offen
  nasal: new THREE.BoxGeometry(0.024,0.08,0.02),                      // Nasal über dem Visier
  brim:  new THREE.BoxGeometry(0.16,0.022,0.06),                      // moderner Helmschirm
  plumeG:new THREE.BoxGeometry(0.034,0.15,0.034),                     // Federbusch
  dome:  new THREE.SphereGeometry(0.128,7,5,0,Math.PI*2,0,Math.PI*0.55),
  visor: new THREE.BoxGeometry(0.17,0.055,0.035),                     // Leucht-Visier
  crest: new THREE.BoxGeometry(0.02,0.09,0.16),                       // Helmfinne (Zukunft)
  stripe:new THREE.BoxGeometry(0.045,0.19,0.014),                     // Brust-Leuchtstreifen
  stripeA:new THREE.BoxGeometry(0.016,0.16,0.012),                    // Arm-Leuchtstreifen
  edge:  new THREE.BoxGeometry(0.1,0.014,0.024),                      // Energie-Schulterkante
  strapG:new THREE.BoxGeometry(0.2,0.032,0.02),                       // Umhang-Spange (gold)
};
for (const k in HGEO) HGEO[k].userData.shared = true;
// Umhang-Textur (einmalig per Canvas erzeugt): dunkelblauer Stoff, Goldsaum,
// goldener heraldischer Löwe (rampant) mit Krone – das Wappen des Helden.
let _capeMat = null;
function capeMat(){
  if (_capeMat) return _capeMat;
  const cv2 = document.createElement('canvas'); cv2.width = 128; cv2.height = 256;
  const c2 = cv2.getContext('2d');
  const gr = c2.createLinearGradient(0,0,0,256);
  gr.addColorStop(0,'#233559'); gr.addColorStop(1,'#131f3a');
  c2.fillStyle = gr; c2.fillRect(0,0,128,256);
  c2.fillStyle = 'rgba(255,255,255,0.045)';                 // dezente Falten-Streifen
  for (let i=0;i<5;i++) c2.fillRect(10+i*26, 0, 7, 256);
  c2.strokeStyle = '#d9a92f'; c2.lineWidth = 8; c2.strokeRect(4,4,120,248);   // Goldsaum
  c2.strokeStyle = '#8a6a1a'; c2.lineWidth = 2; c2.strokeRect(10,10,108,236);
  const G = '#e6b83c';
  c2.fillStyle = G; c2.strokeStyle = G; c2.lineCap = 'round'; c2.lineJoin = 'round';
  c2.lineWidth = 21;                                        // Rumpf: Diagonale Hüfte→Schulter
  c2.beginPath(); c2.moveTo(82,152); c2.lineTo(62,102); c2.stroke();
  c2.beginPath(); c2.arc(58,86,17,0,7); c2.fill();          // Mähne
  c2.beginPath(); c2.arc(48,78,10,0,7); c2.fill();          // Kopf
  c2.beginPath(); c2.moveTo(48,70); c2.lineTo(28,74); c2.lineTo(44,82);   // offenes Maul
  c2.lineTo(30,90); c2.lineTo(48,92); c2.closePath(); c2.fill();
  c2.lineWidth = 9;                                         // erhobene Vorderpranken
  c2.beginPath(); c2.moveTo(60,100); c2.lineTo(30,96); c2.stroke();
  c2.beginPath(); c2.moveTo(66,114); c2.lineTo(34,116); c2.stroke();
  c2.beginPath(); c2.arc(27,95,6,0,7); c2.fill();
  c2.beginPath(); c2.arc(31,117,6,0,7); c2.fill();
  c2.lineWidth = 10;                                        // Hinterbeine
  c2.beginPath(); c2.moveTo(80,150); c2.lineTo(64,180); c2.stroke();
  c2.beginPath(); c2.moveTo(88,152); c2.lineTo(88,184); c2.stroke();
  c2.beginPath(); c2.arc(60,183,6,0,7); c2.fill();
  c2.beginPath(); c2.arc(90,187,6,0,7); c2.fill();
  c2.lineWidth = 5;                                         // Schwanz mit Quaste
  c2.beginPath(); c2.moveTo(88,146); c2.quadraticCurveTo(112,132,104,106);
  c2.quadraticCurveTo(100,94,108,88); c2.stroke();
  c2.beginPath(); c2.arc(109,84,6,0,7); c2.fill();
  c2.beginPath();                                           // Krone auf dem Kopf
  c2.moveTo(46,68); c2.lineTo(46,56); c2.lineTo(52,62); c2.lineTo(58,52);
  c2.lineTo(64,62); c2.lineTo(70,56); c2.lineTo(70,68); c2.closePath(); c2.fill();
  c2.fillStyle = '#131f3a';                                 // Auge
  c2.beginPath(); c2.arc(50,76,2.2,0,7); c2.fill();
  const tex = new THREE.CanvasTexture(cv2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  _capeMat = new THREE.MeshStandardMaterial({ map:tex, side:THREE.DoubleSide,
    roughness:0.85, metalness:0 });
  _capeMat.userData.shared = true;
  return _capeMat;
}
// Umhang: leicht um den Rücken gewölbte, segmentierte Fläche (4×6) – die
// Ausgangslage liegt in userData.base, animHeroCape() wellt sie im Wind.
function makeHeroCape(){
  const geo = new THREE.PlaneGeometry(0.34,0.5,4,6);
  geo.translate(0,-0.25,0);                                 // Aufhängung an der Oberkante
  const pos = geo.attributes.position;
  for (let i=0;i<pos.count;i++){
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, -x*x*1.3 + y*0.16);                         // Wölbung + Saum schwingt nach hinten
  }
  geo.computeVertexNormals();
  geo.userData.base = Float32Array.from(pos.array);
  const m = mesh(geo, capeMat());
  m.name = 'cape';
  m.position.set(0, 0.585, -0.115);
  return m;
}
// Wind-Wellen: Sinus über die Ausgangslage, Amplitude wächst zum Saum;
// beim Laufen (hero.wb) weht der Umhang zusätzlich nach hinten.
function animHeroCape(t){
  if (!hero || !hero.mesh) return;
  const cape = hero.mesh.userData.cape;
  if (!cape) return;
  const pos = cape.geometry.attributes.position, base = cape.geometry.userData.base;
  const wb = hero.wb || 0;
  for (let i=0;i<pos.count;i++){
    const bx3 = base[i*3], by3 = base[i*3+1], bz3 = base[i*3+2];
    const w = -by3/0.5;                                     // 0 Schulter … 1 Saum
    pos.setZ(i, bz3 - (Math.sin(t*2.3 + by3*4.5 + bx3*2.5)*0.5+0.5)*0.05*w*w - wb*0.16*w);
    pos.setX(i, bx3 + Math.sin(t*1.7 + by3*3.0)*0.012*w);
  }
  pos.needsUpdate = true;
  cape.geometry.computeVertexNormals();
}
// Baut die Epochen-Rüstung auf den Basiskörper (P: body/head/armL/armR/legL/legR).
// Anker wpn/armor/trk setzt makePerson danach – sie sitzen auf allen vier Looks.
function buildHeldLook(g, P){
  const tier = heroLookTier();
  const L = HERO_LOOKS[tier];
  g.userData.lookTier = tier;
  const add = (geo, mat, x, y, z, parent)=>{
    const m2 = mesh(geo, mat, false, false);
    m2.position.set(x,y,z); (parent||g).add(m2); return m2;
  };
  // Brustplatte mit Mittelgrat (Grat entfällt bei den glatten Anzügen)
  add(HGEO.chest, L.plate, 0, 0.455, 0.095);
  if (tier<=1){ const r = add(HGEO.ridge, L.plate, 0, 0.455, 0.108); r.rotation.y = Math.PI/4; }
  // Schulterplatten mit Rand – applyHeroEquipVisual blendet sie aus, sobald eine
  // Rüstung mit eigenen Schulterstücken (Tier ≥ 2) angelegt wird.
  for (const s of [-1,1]){
    const p = add(HGEO.pld, L.plate, s*0.15, 0.522, 0);
    p.scale.y = 0.85; p.name = s<0?'pldL':'pldR';
    if (tier===0){
      const r = add(HGEO.rim, HP.goldM, s*0.15, 0.532, 0);
      r.rotation.x = Math.PI/2; r.name = s<0?'rimL':'rimR';
    } else if (tier===3){
      const e = add(HGEO.edge, HP.glowHi, s*0.15, 0.565, 0);
      e.name = s<0?'rimL':'rimR';
    }
  }
  // Arm- und Knieschienen an den Gliedern (schwingen im Gang mit)
  add(HGEO.brace, L.plate, 0, -0.19, 0, P.armL);
  add(HGEO.brace, L.plate, 0, -0.19, 0, P.armR);
  for (const lg of [P.legL, P.legR]){
    const k = add(HGEO.knee, L.plate, 0, -0.1, 0.014, lg);
    k.rotation.x = 0.35;
  }
  // Umhang mit Löwen-Emblem + goldene Spange (bleibt über alle Epochen)
  const cape = makeHeroCape(); g.add(cape);
  g.userData.cape = cape;
  add(HGEO.strapG, HP.goldM, 0, 0.562, 0.105);
  // Helm + Epochen-Akzente
  if (tier===0){                                            // offener Ritterhelm mit Federbusch
    add(HGEO.helmB, L.plate, 0, 0.645, 0);                  // Front offen → Gesicht sichtbar
    add(HGEO.dome, L.plate, 0, 0.70, 0);                    // Kalotte oben auf dem Helmring
    add(HGEO.nasal, L.plate, 0, 0.665, 0.112);
    const pl = add(HGEO.plumeG, HP.plume, 0, 0.82, -0.02);
    pl.rotation.x = -0.18; pl.name = 'plume';
  } else if (tier===1){                                     // moderner Helm + Leder-Gurtzeug
    add(HGEO.dome, HP.indus, 0, 0.685, 0);                  // sitzt hoch: Gesicht bleibt frei
    add(HGEO.brim, HP.indusD, 0, 0.705, 0.1);
    for (const s of [-1,1]){
      const st = add(HGEO.strapG, HP.strap, 0, 0.46, 0.122);
      st.rotation.z = s*0.6;
    }
  } else {                                                  // Digital/Raumfahrt/Zukunft: Visier-Helm
    add(HGEO.dome, L.plate, 0, 0.652, 0);
    add(HGEO.visor, L.glow, 0, 0.652, 0.115);
    add(HGEO.stripe, L.glow, 0, 0.46, 0.115);               // Brust-Leuchtstreifen
    add(HGEO.stripeA, L.glow, 0, -0.14, 0.033, P.armL);
    add(HGEO.stripeA, L.glow, 0, -0.14, 0.033, P.armR);
    if (tier===3){ const c = add(HGEO.crest, HP.glowHi, 0, 0.77, -0.02); c.rotation.x = -0.1; }
  }
}
// Ego-Hände folgen der Epoche: Handschuh-Material + Leuchtstreifen ab Digital
function updateEgoHandLook(){
  const tier = heroLookTier();
  const glove = [HP.plate, HP.indusD, HP.suitD, HP.futurD][tier];
  for (const nm of ['handL','handR']){
    const o = egoHands.getObjectByName(nm);
    if (o) o.material = glove;
  }
  for (const nm of ['glowE_L','glowE_R']){
    const o = egoHands.getObjectByName(nm);
    if (o){ o.visible = tier>=2; o.material = tier===3 ? HP.glowHi : HP.glow; }
  }
}
function makePerson(kind, matIdx){
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';              // erst Blickrichtung, dann Vorlehnen beim Laufen
  const bodyMat = kind==='soldier' ? M.soldierBody :
    (kind==='aisoldier' ? PM.aiBody :
    (kind==='laser' ? PM.laserBody :
    (kind==='ritter' ? M.steel :
    (kind==='held' ? HERO_LOOKS[heroLookTier()].body :          // 25b: Epochen-Look
      (kind==='enemy' ? M.enemyBody : FOLK_MATS[matIdx%FOLK_MATS.length])))));
  // Hauttöne bunt gemischt – nur der Held behält sein festes, markantes Gesicht
  const skin = kind==='held' ? SKIN_MATS[0] : SKIN_MATS[(Math.random()*SKIN_MATS.length)|0];
  const legMat = kind==='ritter' ? M.steel :
    (kind==='laser' ? PM.laserDark :
    (kind==='held' ? HERO_LOOKS[heroLookTier()].legs :
      (kind==='enemy'||kind==='aisoldier' ? PM.pantsDark : PM.pants)));
  // Rumpf (konisch, Schultern eingebacken) + Gürtel
  const body = mesh(torsoGeo, bodyMat); body.position.y = 0.38; g.add(body);
  const belt = mesh(beltGeo, kind==='held' ? M.gold : M.timber, false); belt.position.y = 0.27; g.add(belt);
  // Kopf (heller Hautton = Kontrast auf Distanz)
  const head = mesh(headGeo, skin); head.position.y = 0.645; head.scale.setScalar(1.04); g.add(head);
  // Benannte Glieder mit Drehpunkt an Schulter/Hüfte (für den Gang-Zyklus)
  const limb = (name, geo, mat, x, y, cast)=>{
    const p = new THREE.Group(); p.name = name; p.position.set(x,y,0);
    p.add(mesh(geo, mat, cast!==false)); g.add(p); return p;
  };
  const armL = limb('armL', armGeo, bodyMat, -0.147, 0.505, false);
  const armR = limb('armR', armGeo, bodyMat,  0.147, 0.505, false);
  armL.rotation.z = 0.1; armR.rotation.z = -0.1;
  const legL = limb('legL', legGeo, legMat, -0.062, 0.235);
  const legR = limb('legR', legGeo, legMat,  0.062, 0.235);
  g.userData.limbs = { armL, armR, legL, legR };
  if (kind==='soldier' || kind==='aisoldier'){
    const h = mesh(helmGeo, M.steel, false); h.position.y = 0.655; h.scale.setScalar(1.05); g.add(h);
    const sp = mesh(spearGeo, M.woodDark, false); sp.position.set(0.02,0.03,0.02); armR.add(sp);
    const tp = mesh(tipGeo, M.steel, false); tp.position.set(0.02,0.56,0.02); armR.add(tp);
    const shd = mesh(shieldGeo, kind==='aisoldier' ? PM.shieldRed : M.woodDark, false, false);
    shd.position.set(-0.04,-0.12,0.02); shd.rotation.y = Math.PI/2; armL.add(shd);
    if (kind==='aisoldier'){
      const ring = mesh(ringGeo, PM.enemyRing, false, false);
      ring.rotation.x = -Math.PI/2; ring.position.y = 0.06;
      g.add(ring);
    }
  } else if (kind==='laser'){
    const visor = mesh(new THREE.BoxGeometry(0.24,0.08,0.05,1,1,1), PM.visor, false);
    visor.position.set(0,0.65,0.09); g.add(visor);
    const helm = mesh(helmGeo, PM.laserDark, false); helm.position.y = 0.66; g.add(helm);
    const stripe = mesh(new THREE.BoxGeometry(0.16,0.04,0.03), PM.glowStripe, false);
    stripe.position.set(0,0.42,0.115); g.add(stripe);
    const rifle = mesh(new THREE.BoxGeometry(0.5,0.06,0.06), PM.laserDark, false);
    rifle.position.set(0.06,-0.06,0.02); armR.add(rifle);
    const tip = mesh(new THREE.BoxGeometry(0.06,0.05,0.05), PM.laserTip, false);
    tip.position.set(0.32,-0.06,0.02); armR.add(tip);
  } else if (kind==='ritter'){
    const h = mesh(new THREE.CylinderGeometry(0.115,0.12,0.16,7), M.steel, false);
    h.position.y = 0.67; g.add(h);
    const plume = mesh(new THREE.BoxGeometry(0.04,0.12,0.04), M.banner, false);
    plume.position.y = 0.8; g.add(plume);
    const sw = mesh(new THREE.BoxGeometry(0.045,0.5,0.02), M.steel, false);
    sw.position.set(0.025,0.09,0.02); armR.add(sw);
    const guard = mesh(new THREE.BoxGeometry(0.12,0.03,0.03), M.gold, false);
    guard.position.set(0.025,-0.11,0.02); armR.add(guard);
    const shield = mesh(new THREE.CircleGeometry(0.14,10), PM.shieldRed, false, false);
    shield.position.set(-0.03,-0.11,0.02); shield.rotation.y = Math.PI/2; armL.add(shield);
    const boss = mesh(new THREE.CircleGeometry(0.05,8), M.gold, false, false);
    boss.position.set(-0.036,-0.11,0.02); boss.rotation.y = Math.PI/2; armL.add(boss);
  } else if (kind==='held'){
    // 25b: Epochen-Rüstung + Umhang mit Löwen-Emblem (buildHeldLook)
    buildHeldLook(g, { body, head, armL, armR, legL, legR });
    // Ausrüstungs-Anker: 'wpn' (Waffe an armR), 'armor' (Brust/Schultern), 'trk' (Amulett).
    // Inhalt setzt applyHeroEquipVisual() – hier bleiben die Gruppen leer.
    const wpn = new THREE.Group(); wpn.name = 'wpn'; armR.add(wpn);
    const armor = new THREE.Group(); armor.name = 'armor'; g.add(armor);
    const trk = new THREE.Group(); trk.name = 'trk'; trk.position.set(0,0.555,0.115); g.add(trk);
    // Goldener Bodenring statt HP-Dauerbalken
    const ring = mesh(ringGeo, PM.heldRing, false, false);
    ring.rotation.x = -Math.PI/2; ring.position.y = 0.06; g.add(ring);
  } else if (kind==='enemy'){
    const hood = mesh(hoodGeo, PM.hoodDark, false); hood.position.y = 0.665;
    hood.rotation.x = 0.12; g.add(hood);
    const kn = mesh(new THREE.BoxGeometry(0.04,0.3,0.08), M.steel, false);
    kn.position.set(0.02,-0.1,0.03); kn.rotation.z = 0.4; armR.add(kn);
    // roter Markierungsring am Boden, damit Angreifer sofort auffallen
    const ring = mesh(ringGeo, PM.enemyRing, false, false);
    ring.rotation.x = -Math.PI/2; ring.position.y = 0.06;
    g.add(ring);
  } else {
    // Arbeiter/Volk: Kapuze im Gewandton
    const hood = mesh(hoodGeo, bodyMat, false); hood.position.y = 0.665;
    hood.rotation.x = 0.1; g.add(hood);
  }
  // HP-Balken (Sprites)
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color:0x101418, depthTest:false }));
  bg.scale.set(0.5,0.07,1); bg.position.y = 0.98; bg.visible = false; g.add(bg);
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: kind==='enemy'?0xe05a4a:0x5ad06a, depthTest:false }));
  fg.scale.set(0.48,0.05,1); fg.position.y = 0.98; fg.visible = false; g.add(fg);
  g.userData.hp = [bg,fg];
  fxGroup.add(g);
  return g;
}
function syncUnit(u, moving, t, dt){
  // Einheit ist an Bord eines Schiffs; beim Ausstieg (25d: sail.leave) animiert sie normal
  if (u.sail && !u.sail.leave) return;
  const g = u.mesh;
  dt = dt||0.016;
  // Gang weich ein-/ausblenden statt hart zu schalten
  u.wb = u.wb===undefined ? (moving?1:0) : u.wb + ((moving?1:0)-u.wb)*Math.min(1, dt*6);
  const wb = u.wb;
  const freq = 4.2 + (u.speed||1.1)*3.4;                 // Schrittfrequenz an Tempo gekoppelt
  const vehicle = u.kind==='panzer' || u.kind==='flieger';
  const alt = u.fly ? 3.0 + Math.sin(t*2+u.ph)*0.25
    : (vehicle ? 0
      : Math.abs(Math.sin(t*freq+u.ph))*0.045*wb        // Lauf-Hopser
        + (1-wb)*(0.011+Math.sin(t*1.7+u.ph)*0.011));   // dezentes Atmen im Stand
  g.position.set(wx(u.x), Math.max(hAt(u.x,u.y),0) + alt, wz(u.y));
  // Weiches Eindrehen zur Laufrichtung (kürzester Weg, ~10 rad/s)
  if (u.vdir===undefined) u.vdir = u.dir||0;
  const dd = (u.dir||0) - u.vdir;
  u.vdir += Math.atan2(Math.sin(dd), Math.cos(dd)) * Math.min(1, dt*10);
  g.rotation.y = -u.vdir + (vehicle ? 0 : Math.PI/2);
  if (!vehicle && !u.fly) g.rotation.x = wb*0.085;      // leichtes Vorlehnen beim Laufen
  // Gang-Zyklus: Arme und Beine gegenphasig schwingen
  const lb = g.userData.limbs;
  if (lb){
    const swing = Math.sin(t*freq + u.ph);
    const idle = (1-wb)*Math.sin(t*1.7+u.ph)*0.045;
    lb.armL.rotation.x =  swing*0.62*wb + idle;
    lb.armR.rotation.x = -swing*0.62*wb + idle;
    lb.legL.rotation.x = -swing*0.55*wb;
    lb.legR.rotation.x =  swing*0.55*wb;
  }
  if (u.kind==='flieger'){
    const prop = g.children.find(c=>c.name==='prop');
    if (prop) prop.rotation.x = t*30;
  }
  const [bg,fg] = g.userData.hp;
  if (u.maxhp && u.hp < u.maxhp){
    bg.visible = fg.visible = true;
    fg.scale.x = 0.48*clamp(u.hp/u.maxhp,0,1);
  } else bg.visible = fg.visible = false;
}
function removeUnit(u){ if (u.mesh){ fxGroup.remove(u.mesh); disposeGroup(u.mesh); } }

function randomBuildingSpot(){
  if (!state.buildings.length) return null;
  const bd = state.buildings[Math.floor(Math.random()*state.buildings.length)];
  const b = BT[bd.t];
  return [bd.x + Math.random()*b.w + (Math.random()<0.5?-1:1)*0.9,
          bd.y + Math.random()*b.h + (Math.random()<0.5?-1:1)*0.9];
}
function updateFolk(dt){
  const want = clamp(Math.floor(state.pop/2), 2, 14);
  while (folk.length < want){
    const s = randomBuildingSpot(); if (!s) break;
    folk.push({ x:s[0], y:s[1], tx:s[0], ty:s[1], wait:Math.random()*2, ph:Math.random()*7,
      mi:Math.floor(Math.random()*5), dir:Math.random()*6, moving:false,
      mesh: makePerson('folk', Math.floor(Math.random()*5)) });
  }
  while (folk.length > want){
    // Questgeber (Pin-Flag, 24d) überleben den Abbau – sonst despawnt der ❗-Bürger
    let i = folk.length-1;
    while (i >= 0 && folk[i].pin) i--;
    if (i < 0) break;
    removeUnit(folk[i]);
    folk.splice(i,1);
  }
  for (const f of folk){
    if (f.wait > 0){ f.wait -= dt; f.moving = false; continue; }
    f.moving = true;
    if (steer(f, f.tx, f.ty, 0.9, dt) || Math.random()<0.001){
      f.wait = 1 + Math.random()*3;
      const s = randomBuildingSpot();
      if (s && landAt(s[0],s[1])){ f.tx = clamp(s[0],1,MAP-2); f.ty = clamp(s[1],1,MAP-2); }
    }
  }
}
const UNIT_STATS = {
  soldier:{ hp:70,  dmg:11, speed:1.7 },
  ritter: { hp:140, dmg:22, speed:1.7 },
  panzer: { hp:420, dmg:48, speed:1.1 },
  flieger:{ hp:250, dmg:40, speed:3.2, fly:true },
  laser:  { hp:300, dmg:80, speed:1.9 },
};

// ============================== FORSCHUNG (Akademie) ==============================
// 3 Zweige × 3 Stufen je Einheit; wirkt global und retroaktiv auf lebende Einheiten
const RESEARCH_UNITS = ['soldier','ritter','panzer','flieger','laser'];
const RESEARCH_BASE = {
  soldier:{ w:{holz:40,eisen:10,gold:20}, p:{holz:30,eisen:15,gold:15}, a:{nahrung:40,gold:20} },
  ritter: { w:{eisen:30,gold:40},         p:{eisen:40,gold:30},         a:{nahrung:60,eisen:15,gold:30} },
  panzer: { w:{stahl:50,gold:120},        p:{stahl:60,oel:20,gold:100}, a:{stahl:30,oel:40,gold:80} },
  flieger:{ w:{stahl:60,oel:30,gold:140}, p:{stahl:50,oel:25,gold:120}, a:{oel:50,gold:100} },
  laser:  { w:{lithium:25,stahl:40,gold:200}, p:{lithium:20,stahl:50,gold:180}, a:{lithium:15,oel:30,gold:150} },
};
const RESEARCH_TIME = [15,25,40];                       // Basiszeit Stufe I/II/III in s
const RESEARCH_EFF  = { w:0.10, p:0.12, a:0.08 };       // Effekt je Stufe
const RESEARCH_ICON = { w:'⚔️', p:'🛡️', a:'🥾' };
const RESEARCH_NAME = { w:'Waffen', p:'Panzerung', a:'Antrieb' };
const RESEARCH_WORD = { w:'Schaden', p:'Trefferpunkte', a:'Tempo' };
const UNIT_NAME = { soldier:'⚔️ Soldat', ritter:'🛡️ Ritter', panzer:'🛡️ Panzer',
  flieger:'✈️ Flugzeug', laser:'⚡ Laser-Trooper' };
const ROMAN3 = ['I','II','III'];
function researchLvl(unit, br){
  const r = state && state.research && state.research[unit];
  return r ? (r[br]||0) : 0;
}
function researchMult(unit, br){ return 1 + RESEARCH_EFF[br]*researchLvl(unit, br); }
function researchCost(unit, br){
  const next = researchLvl(unit, br) + 1;
  if (next > 3) return null;
  // Stufe II ×1,8 · Stufe III ×3,2; Mil-Doktrin −20 %; auf 5er gerundet
  const f = (next===1 ? 1 : next===2 ? 1.8 : 3.2) * (isMil() ? 0.8 : 1);
  const base = RESEARCH_BASE[unit][br], c = {};
  for (const k in base) c[k] = Math.max(5, Math.round(base[k]*f/5)*5);
  return c;
}
function bestAcademyLvl(){
  let l = 0;
  for (const bd of state.buildings) if (bd.t==='akademie' && !bd.ruin) l = Math.max(l, lvlOf(bd));
  return l;
}
function researchTime(next){
  // Akademie-Stufe senkt die Zeit: −4 % je Stufe ab 2, min. 60 % der Basis
  const l = bestAcademyLvl();
  return RESEARCH_TIME[next-1] * Math.max(0.6, 1 - 0.04*Math.max(0, l-1));
}
// Freigeschaltete Einheiten (Panel zeigt nur diese – konsistent mit dem Baumenü)
function unitUnlocked(kind){
  const bestK = state.buildings.reduce((m,b)=>b.t==='kaserne' && !b.ruin ? Math.max(m,lvlOf(b)) : m, 0);
  if (kind==='soldier') return true;
  if (kind==='ritter')  return bestK >= 3;
  if (kind==='panzer')  return state.buildings.some(b=>b.t==='fabrik');
  if (kind==='flieger') return state.buildings.some(b=>b.t==='flugfeld');
  return bestK >= 31;                                   // laser
}
function startResearch(unit, br){
  if (state.researchJob){ toast('🔬 Die Akademie forscht bereits.'); return false; }
  if (!state.buildings.some(b=>b.t==='akademie' && !b.ruin)){ toast('🔬 Keine intakte Akademie.'); return false; }
  const next = researchLvl(unit, br) + 1;
  if (next > 3){ toast('Bereits voll erforscht.'); return false; }
  const c = researchCost(unit, br);
  if (!canAfford(c)){ toast('Nicht genug Rohstoffe für die Forschung.'); return false; }
  pay(c);
  const dur = researchTime(next);
  state.researchJob = { unit, branch:br, rest:dur, dur };
  toast('🔬 Forschung gestartet: '+UNIT_NAME[unit]+' – '+RESEARCH_NAME[br]+' '+ROMAN3[next-1]+
    ' ('+Math.round(dur)+' s)');
  snd(520,0.1,'triangle',0.05);
  if (selected && selected.kind==='building' && BT[selected.bd.t].academy) showBuildingInfo(selected.bd);
  save();
  return true;
}
// Effekt rückwirkend auf alle LEBENDEN Einheiten des Typs (HP: Füllstand bleibt)
function applyResearchToUnits(unit, br){
  const lvl = researchLvl(unit, br);
  const factor = (1 + RESEARCH_EFF[br]*lvl) / (1 + RESEARCH_EFF[br]*(lvl-1));
  for (const s of soldiers){
    if ((s.kind||'soldier') !== unit) continue;
    if (br==='p'){
      const ratio = s.maxhp > 0 ? s.hp/s.maxhp : 1;
      s.maxhp = Math.round(s.maxhp*factor);
      s.hp = s.maxhp*ratio;
      applyArmorVisual(s);
    } else if (br==='w') s.dmg = Math.round(s.dmg*factor);
    else s.speed = s.speed*factor;
  }
}
function finishResearchJob(){
  const j = state.researchJob;
  if (!j) return;
  state.researchJob = null;
  if (!state.research) state.research = {};
  const r = state.research[j.unit] || (state.research[j.unit] = {w:0,p:0,a:0});
  r[j.branch] = Math.min(3, (r[j.branch]||0)+1);
  applyResearchToUnits(j.unit, j.branch);
  const lbl = UNIT_NAME[j.unit]+' – '+RESEARCH_ICON[j.branch]+' '+RESEARCH_NAME[j.branch]+' '+ROMAN3[r[j.branch]-1];
  toast('🔬 Forschung abgeschlossen: '+lbl+' (+'+Math.round(RESEARCH_EFF[j.branch]*100)+' % '+
    RESEARCH_WORD[j.branch]+')', 4500);
  if (!chronicleHas('forschung'))
    chronicleAdd('forschung', '🔬 Erste Forschung abgeschlossen: '+lbl+'.');
  snd(523,0.12,'triangle',0.05); snd(659,0.14,'triangle',0.05); snd(784,0.2,'triangle',0.05);
  if (selected && selected.kind==='building' && BT[selected.bd.t] &&
      BT[selected.bd.t].academy && !selected.bd.ruin) showBuildingInfo(selected.bd);
  save();
}
function updateResearch(dt){
  const j = state.researchJob;
  if (!j) return;
  // Akademie Ruine/abgerissen → Job friert ein, Wissen bleibt (läuft nach Reparatur weiter)
  if (!state.buildings.some(b=>b.t==='akademie' && !b.ruin)) return;
  j.rest -= dt;
  if (j.rest <= 0) finishResearchJob();
}
// Effektive Kampfwerte: Basis × Doktrin × Gebäude-Stufe (+6 %/Stufe) × Forschung
function effUnitStats(kind, bd){
  const st = UNIT_STATS[kind] || UNIT_STATS.soldier;
  const f = (isMil() ? 1.25 : 1) * (1 + 0.06*((bd ? lvlOf(bd) : 1) - 1));
  return { hp:  Math.round(st.hp *f*researchMult(kind,'p')),
           dmg: Math.round(st.dmg*f*researchMult(kind,'w')) };
}
// Flieger-Tempo: +0,2 je Stufe des besten intakten Flugfelds
function fliegerSpeedBonus(){
  let l = 0;
  for (const bd of state.buildings) if (bd.t==='flugfeld' && !bd.ruin) l = Math.max(l, lvlOf(bd));
  return l*0.2;
}
// Ausbildungskosten: Mil-Doktrin −20 %; Fahrzeuge im Vulkanland −10 % (Erz/Öl vor der Tür)
function trainCostOf(bd, kind, cost){
  let f = isMil() ? 0.8 : 1;
  if ((kind==='panzer' || kind==='flieger') && bd && biomeOfBuilding(bd)==='vulkan') f *= 0.9;
  return scaleCost(cost, f);
}
// Sichtbarer Forschungs-Aufsatz Panzerung I: Brustplatte (Infanterie) / Seitenschürzen (Fahrzeuge)
const armorMat = std(0xb8c2cc);
armorMat.userData.shared = true;
function applyArmorVisual(u){
  if (!u.mesh || u.mesh.getObjectByName('armor1')) return;
  if (researchLvl(u.kind||'soldier', 'p') < 1) return;
  const grp = new THREE.Group(); grp.name = 'armor1';
  if (u.kind==='panzer'){
    grp.add(bx(0.8,0.14,0.04, armorMat, 0, 0.05,  0.30));
    grp.add(bx(0.8,0.14,0.04, armorMat, 0, 0.05, -0.30));
  } else if (u.kind==='flieger'){
    grp.add(bx(0.4,0.05,0.03, armorMat, 0.05, 0.30,  0.15));
    grp.add(bx(0.4,0.05,0.03, armorMat, 0.05, 0.30, -0.15));
  } else {
    grp.add(bx(0.2,0.18,0.05, armorMat, 0, 0.33, 0.105));   // Brustplatte
  }
  u.mesh.add(grp);
  pruneSmallShadowCasters(grp);
}

function spawnSoldier(bd, kind){
  kind = kind || 'soldier';
  const b = bd ? BT[bd.t] : null;
  const x = bd ? bd.x + (b.w-1)/2 + 1.6 : SX, y = bd ? bd.y + (b.h-1)/2 + 1.6 : SY;
  const st = UNIT_STATS[kind] || UNIT_STATS.soldier;
  // Gebäude-Ausbau (Kaserne bzw. Fabrik/Flugfeld) und Forschung stärken die Truppen mit
  const es = effUnitStats(kind, bd);
  let spd = st.speed * researchMult(kind, 'a');
  if (kind==='flieger') spd += fliegerSpeedBonus();
  const mesh2 = (kind==='panzer' || kind==='flieger')
    ? makeVehicle(kind) : makePerson(kind==='soldier'||kind==='ritter'||kind==='laser'?kind:'soldier');
  const u = { x, y, hx:x, hy:y, kind, hp:es.hp, maxhp:es.hp,
    dmg:es.dmg, speed:spd, fly:!!st.fly, cd:0,
    ph:Math.random()*7, dir:0, moving:false, mesh: mesh2 };
  soldiers.push(u);
  applyArmorVisual(u);
}
// Flug-Einheiten bewegen sich frei (ignorieren Wasser und Mauern)
function moveUnit(u, tx, ty, sp, dt){
  if (!u.fly) return steer(u, tx, ty, sp, dt);
  const d = dist(u.x,u.y,tx,ty);
  if (d < 0.1) return true;
  const a = Math.atan2(ty-u.y, tx-u.x);
  u.dir = a;
  u.x += Math.cos(a)*sp*dt; u.y += Math.sin(a)*sp*dt;
  return false;
}
function updateSoldiers(dt){
  if (attackOrder && (!attackOrder.ai || attackOrder.ai.defeated ||
      !attackOrder.ai.buildings.includes(attackOrder)))
    attackOrder = null;
  for (const s of soldiers){
    if (s.sail) continue;                            // an Bord
    s.cd = Math.max(0, s.cd-dt);
    // Ziel: Räuber/KI-Angreifer; bei Angriffsbefehl auch feindliche Wachen
    let best = null, bd2 = 1e9;
    for (const e of enemies){ if (e.sail) continue;
      const d = dist(s.x,s.y,e.x,e.y); if (d<bd2){bd2=d;best=e;} }
    for (const g of aiGuards){
      const d = dist(s.x,s.y,g.x,g.y);
      if ((attackOrder || d < 5) && d < bd2){ bd2 = d; best = g; }
    }
    if (best && !s.fly && isleOf(best.x,best.y) !== isleOf(s.x,s.y)) best = null;  // andere Insel: erst übersetzen
    if (best){
      const reach = s.fly ? 1.6 : 0.75;
      if (bd2 > reach){ s.moving = true; moveUnit(s, best.x, best.y, s.speed||1.7, dt); }
      else { s.moving = false;
        if (s.cd<=0){ s.cd = 0.85; best.hp -= (s.dmg||11);
          spawnBurst(wx(best.x), hAt(best.x,best.y)+0.5, wz(best.y), 3,
            s.kind==='laser' ? 0xff2050 : 0xffd27a);
          snd(s.kind==='laser'?900:180+Math.random()*60,0.05,'square',0.025); } }
    } else if (attackOrder){
      const tc = aiBuildingCenter(attackOrder);
      if (!s.fly && isleOf(tc[0],tc[1]) !== isleOf(s.x,s.y)){
        // Ziel liegt auf anderer Insel: zum Hafen und einschiffen
        let haf = null, hd = 1e9;
        for (const bd of state.buildings){
          if (bd.t!=='hafen') continue;
          const c = buildingCenter(bd);
          if (isleOf(c[0],c[1]) !== isleOf(s.x,s.y)) continue;
          const d = dist(s.x,s.y,c[0],c[1]);
          if (d<hd){ hd=d; haf=bd; }
        }
        if (!haf){
          attackOrder = null;
          toast('⚓ Deine Armee braucht einen Hafen, um überzusetzen!');
          continue;
        }
        const hc = buildingCenter(haf);
        if (dist(s.x,s.y,hc[0],hc[1]) > 1.8){ s.moving = true; moveUnit(s, hc[0], hc[1], s.speed||1.7, dt); }
        else startSail(s, tc[0], tc[1]);
        continue;
      }
      const reach = (BT[attackOrder.t].w-1)*0.7 + (s.fly ? 1.8 : 0.95);
      if (dist(s.x,s.y,tc[0],tc[1]) > reach){ s.moving = true; moveUnit(s, tc[0], tc[1], s.speed||1.7, dt); }
      else { s.moving = false;
        if (s.cd<=0){ s.cd = 0.85; attackOrder.hp -= (s.dmg||11);
          spawnBurst(wx(tc[0]), hAt(tc[0],tc[1])+0.7, wz(tc[1]), 3,
            s.kind==='laser' ? 0xff2050 : 0xffd27a);
          if (attackOrder.hp <= 0) destroyAiBuilding(attackOrder); } }
    } else if (isleOf(s.x,s.y) !== isleOf(s.hx,s.hy)){
      if (s.fly){ s.moving = true; moveUnit(s, s.hx, s.hy, s.speed, dt); }
      else startSail(s, s.hx, s.hy);                  // Heimreise per Ruderboot
    } else if (dist(s.x,s.y,s.hx,s.hy) > 1.2){ s.moving = true; moveUnit(s, s.hx, s.hy, s.fly?s.speed:1.3, dt); }
    else s.moving = false;
  }
  soldiers = soldiers.filter(s=>{
    if (s.hp<=0){ state.soldiersOwned--; toast('☠️ Ein Soldat ist gefallen!');
      spawnBurst(wx(s.x), hAt(s.x,s.y)+0.4, wz(s.y), 6, 0xff8a5a);
      removeUnit(s); return false; }
    return true;
  });
}

// ============================== SCHIFFFAHRT ==============================
function makeBoat(){
  const g = new THREE.Group();
  g.add(bx(1.1,0.22,0.44, M.wood, 0,0,0));
  const bow = prism(0.44,0.22,0.3, M.wood, 0.55,0,0);
  bow.rotation.z = -Math.PI/2; bow.rotation.y = Math.PI/2;
  bow.position.set(0.66,0.11,0);
  g.add(bow);
  g.add(bx(0.9,0.1,0.3, M.woodDark, 0,0.2,0));
  g.add(cyl(0.03,0.03,1.0, M.timber, -0.05,0.25,0,5));
  const sail = mesh(new THREE.PlaneGeometry(0.55,0.6), std(0xf0ead8,{side:THREE.DoubleSide}), true, false);
  sail.position.set(0.12,0.85,0); g.add(sail);
  g.traverse(o=>{ if (o.isMesh && o.castShadow===undefined) o.castShadow = true; });
  return g;
}
// Einheit per Schiff zu einem Ziel schicken (übers Wasser, mit sichtbarem Boot)
function startSail(u, destX, destY){
  const w0 = findCoastWater(u.x, u.y), w1 = findCoastWater(destX, destY);
  const boat = makeBoat();
  fxGroup.add(boat);
  // Leuchtturm beschleunigt nur Spieler-Schiffe; laufende Fahrten behalten ihr Tempo
  const spf = u.hostile ? 1 : shipSpeedFactor();
  u.sail = { x0:w0[0], y0:w0[1], x1:w1[0], y1:w1[1], t:0, ph:Math.random()*7,
    dur: clamp(dist(w0[0],w0[1],w1[0],w1[1])/3.2, 3, 24)/spf, destX, destY, boat };
  u.mesh.visible = false;
  const [bg,fg] = u.mesh.userData.hp || [];
  if (bg){ bg.visible = false; fg.visible = false; }
}
// 25d: Angelegte Boote bleiben kurz liegen und versinken dann (rein kosmetisch)
const sinkingBoats = [];
function sinkBoat(boat){ if (boat) sinkingBoats.push({ boat, t:0, ph:Math.random()*7 }); }
// Fahrt hart abbrechen (Tod/Teleport/Neustart) – Boot kann in der Ausstiegsphase fehlen
function cancelSail(u){
  if (!u || !u.sail) return;
  if (u.sail.boat){ fxGroup.remove(u.sail.boat); disposeGroup(u.sail.boat); }
  u.sail = null;
}
function updateSinkingBoats(dt){
  for (let i=sinkingBoats.length-1;i>=0;i--){
    const b = sinkingBoats[i];
    b.t += dt;
    b.boat.rotation.z = Math.sin(state.time*1.8+b.ph)*0.04;
    if (b.t > 1.0){ b.boat.position.y -= dt*0.5; b.boat.rotation.z += (b.t-1.0)*0.3; }
    if (b.t >= 2.6){ fxGroup.remove(b.boat); disposeGroup(b.boat); sinkingBoats.splice(i,1); }
  }
}
function updateSail(u, dt){
  const s = u.sail;
  if (s.leave){
    // Ausstieg: sichtbar von der Ankerstelle zur Landekachel laufen (syncUnit animiert)
    s.leave.t += dt;
    const q = Math.min(1, s.leave.t/s.leave.dur);
    u.x = lerp(s.leave.x0, s.leave.x1, q);
    u.y = lerp(s.leave.y0, s.leave.y1, q);
    u.dir = Math.atan2(s.leave.y1-s.leave.y0, s.leave.x1-s.leave.x0);
    u.moving = true;
    if (q >= 1){ u.moving = false; u.sail = null; }
    return;
  }
  s.t += dt/s.dur;
  const p = Math.min(s.t, 1);
  const bx2 = lerp(s.x0,s.x1,p), by2 = lerp(s.y0,s.y1,p);
  s.boat.position.set(wx(bx2), -0.02+Math.sin(state.time*2.2+s.ph)*0.06, wz(by2));
  s.boat.rotation.y = -Math.atan2(s.y1-s.y0, s.x1-s.x0);
  s.boat.rotation.z = Math.sin(state.time*1.8+s.ph)*0.04;
  if (s.t < 1){
    if (Math.random() < dt*2) spawnBurst(wx(bx2)-Math.cos(s.boat.rotation.y)*0.6, 0.05, wz(by2), 1, 0xdff2ff);
    return;
  }
  // Angelegt: Boot stoppt auf der letzten Wasserkachel (s.x1/s.y1 = findCoastWater),
  // kurze Anlege-Pause, dann steigt die Einheit aus und das Boot versinkt.
  // Rein timer-gesteuert – kann nie hängen bleiben (Failsafe).
  if (s.dock === undefined) s.dock = 0.5;
  s.dock -= dt;
  if (s.dock > 0) return;
  const land = findLanding(s.destX, s.destY);          // Fallback: liefert notfalls dest selbst
  u.x = s.x1; u.y = s.y1;
  u.mesh.visible = true;
  s.leave = { x0:s.x1, y0:s.y1, x1:land[0], y1:land[1], t:0,
    dur: clamp(dist(s.x1,s.y1,land[0],land[1])/2.0, 0.3, 2.2) };
  sinkBoat(s.boat);
  s.boat = null;
}
function updateAllSails(dt){
  for (const s of soldiers) if (s.sail) updateSail(s, dt);
  for (const e of enemies) if (e.sail) updateSail(e, dt);
  if (hero && hero.sail) updateSail(hero, dt);
  updateSinkingBoats(dt);
}
// Siedler-Expeditionen (gründen Vorposten)
let expeditions = [];
function startExpedition(fromBd, x, y, paid){
  const [hx,hy] = buildingCenter(fromBd);
  const w0 = findCoastWater(hx,hy), w1 = findCoastWater(x,y);
  const boat = makeBoat();
  boat.scale.setScalar(1.25);
  fxGroup.add(boat);
  expeditions.push({ x0:w0[0], y0:w0[1], x1:w1[0], y1:w1[1], t:0, ph:Math.random()*7,
    dur: clamp(dist(w0[0],w0[1],w1[0],w1[1])/2.8, 4, 28)/shipSpeedFactor(),
    destX:x, destY:y, boat, paid: paid||BT.__vorp.cost });
  toast('🚢 Siedlerschiff ist ausgelaufen!', 3000);
  snd(300,0.2,'triangle',0.05);
}
function updateExpeditions(dt){
  for (let i=expeditions.length-1;i>=0;i--){
    const s = expeditions[i];
    s.t += dt/s.dur;
    const p = Math.min(s.t,1);
    s.boat.position.set(wx(lerp(s.x0,s.x1,p)), -0.02+Math.sin(state.time*2+s.ph)*0.06, wz(lerp(s.y0,s.y1,p)));
    s.boat.rotation.y = -Math.atan2(s.y1-s.y0, s.x1-s.x0);
    if (s.t >= 1){
      // 25d: Anlege-Pause an der letzten Wasserkachel, dann versinkt das Boot
      if (s.dock === undefined) s.dock = 0.5;
      s.dock -= dt;
      if (s.dock > 0) continue;
      sinkBoat(s.boat);
      expeditions.splice(i,1);
      // Vorposten am Ziel errichten (bei Blockade Nachbarplatz suchen)
      let spot = null;
      const free = (px,py)=>inMap(px,py) && tiles[idx(px,py)]===2 &&
        !occ[idx(px,py)] && !aiOcc[idx(px,py)] && !treeMap[idx(px,py)] && !rockMap[idx(px,py)];
      spot = free(s.destX,s.destY) ? [s.destX,s.destY] : nearestTile(s.destX,s.destY,free,4);
      if (spot){
        const nb = addBuilding('vorposten', spot[0], spot[1]);
        const bio = biomeOfBuilding(nb);
        if (!chronicleHas('vorposten'))
          chronicleAdd('vorposten', '🏴 Erster Vorposten auf einer fremden Insel – das Reich expandiert.');
        if (!chronicleHas('biom_'+bio)) chronicleAdd('biom_'+bio, BIOME_CHRON[bio] || BIOME_CHRON.wiese);
        toast('🏴 Neue Siedlung im '+BIOME_NAME[bio]+' gegründet – Biom-Bonus: '+BIOME_BONI_TXT[bio]+'!', 5200);
        snd(392,0.15,'triangle',0.05); snd(523,0.2,'triangle',0.05);
      } else {
        const back = s.paid || BT.__vorp.cost;       // erstattet exakt das Bezahlte
        for (const k in back) state.res[k] += back[k];
        toast('⚓ Landung unmöglich – Expedition kehrt um (Kosten erstattet).');
      }
      save();
    }
  }
}

// ============================== HELD & EGO-MODUS (Etappe 24a) ==============================
// state.hero = persistente Daten (Save v3, Default null); `hero` = Laufzeit-Einheit.
let hero = null;
let egoMode = false, egoBlend = 0, egoYaw = 0, egoPitch = 0, egoBobT = 0, handSwingT = 0;
const egoStick = { x:0, y:0 };            // virtueller Joystick (-1..1, y = vorwärts)
// Third-Person (Etappe 24e): Standard-Sicht beim Steuern; 'ego' nur auf Wunsch (👁️-Knopf)
const heroView = ()=> (state && state.hero && state.hero.view === 'ego') ? 'ego' : 'tp';
let tpSnap = true;                        // Kamera beim nächsten Frame hart setzen (Raumwechsel)
const _tpPos = new THREE.Vector3();       // weich nachgezogene Third-Person-Kameraposition
let viewFov = 60;                         // weicher FOV-Übergang Ego (70) ↔ Third-Person (60)
const HERO_A = ['Björn','Erik','Sigrid','Astrid','Leif','Runa','Torben','Freya','Halvar','Ylva','Sten','Ingrid'];
const HERO_B = ['Eisenfaust','Sturmklinge','Bärenherz','Adlerauge','Nachtwind','Silberhand','Drachenmut','Steinschild','Wolfsblut','Morgenstern'];
let pendingHeroName = null;
function rollHeroName(){
  pendingHeroName = HERO_A[(Math.random()*HERO_A.length)|0] + ' ' + HERO_B[(Math.random()*HERO_B.length)|0];
  return pendingHeroName;
}
function reichName(){
  const s = (state.chronicle||[]).find(e=>e.typ==='start');
  const m = s && /Chronik von (.+) beginnt/.exec(s.text||'');
  return m ? m[1] : 'deinem Reich';
}
const heroLevel = ()=> state.hero
  ? state.hero.skills.k + state.hero.skills.h + state.hero.skills.s + state.hero.skills.c : 0;
function heroArmorHp(){
  const a = state.hero && state.hero.equip.a && HERO_ITEMS[state.hero.equip.a];
  return a ? a.hp : 0;
}
function heroMaxHp(){ return 100 + 12*(heroLevel()-4) + heroArmorHp(); }
function heroWeaponDmg(){
  const w = state.hero && state.hero.equip.w && HERO_ITEMS[state.hero.equip.w];
  return w ? w.dmg : 5;                              // unbewaffnet: 5
}
function heroTrinket(id){ return !!(state.hero && state.hero.equip.t === id); }
function heroDmg(){
  return heroWeaponDmg() * (1 + 0.08*((state.hero ? state.hero.skills.k : 1)-1)) * (isMil()?1.1:1);
}
// 24f: flotterer Schlag (0,65 s) für leichte Waffen; die schweren Endgame-Klingen
// (Stahl/Energie, Tier ≥ 3) behalten 0,8 s, damit der End-DPS-Anker (~120) hält.
function heroAtkCd(){
  const w = state.hero && state.hero.equip.w && HERO_ITEMS[state.hero.equip.w];
  return w && w.tier >= 3 ? 0.8 : 0.65;
}
// 24f: Treffer-Feedback – 0,4 s Stagger (kein Angriff/keine Bewegung, CD friert)
// plus 0,3 Kacheln Rückstoß. Bosse sind ausgenommen.
function applyStagger(t2){
  if (!t2 || t2.boss) return;
  t2.staggerT = 0.4;
  const a = Math.atan2(t2.y-hero.y, t2.x-hero.x);
  const nx = t2.x + Math.cos(a)*0.3, ny = t2.y + Math.sin(a)*0.3;
  if (t2.dng ? dWalkable(nx,ny) : walkable(nx,ny,!!(t2.hostile||t2.camp))){ t2.x = nx; t2.y = ny; }
}
function heroSkillCap(){ return Math.min(10, 3 + Math.floor(rathausLvl()/5)); }
// EXP-Vergabe (24b nutzt sie; Kurve 60·n, Deckel an Rathausstufe gekoppelt)
function giveHeroExp(skill, n){
  const h = state.hero;
  if (!h || h.skills[skill] === undefined) return;
  h.exp[skill] = (h.exp[skill]||0) + n;
  while (h.skills[skill] < heroSkillCap() && h.exp[skill] >= 60*h.skills[skill]){
    h.exp[skill] -= 60*h.skills[skill];
    h.skills[skill]++;
    toast('✨ ' + h.name + ': Fertigkeit gestiegen (Heldenstufe ' + heroLevel() + ')!', 3200);
  }
  if (hero) hero.maxhp = heroMaxHp();
}
const heroAlive = ()=> !!(hero && state.hero && !(state.hero.respawn>0));
function heroHome(){
  const hall = state.buildings.find(b=>b.t==='heldenhalle' && !b.ruin);
  const src = hall || state.buildings.find(b=>b.t==='rathaus');
  if (!src) return [SX, SY];
  const c = buildingCenter(src);
  return findLanding(Math.round(c[0]), Math.round(c[1])+2);
}
function spawnHeroUnit(){
  if (hero) removeUnit(hero);
  const h = state.hero;
  const l = findLanding(Math.round(h.x), Math.round(h.y));
  hero = { x:l[0], y:l[1], hp: clamp(h.hp!==undefined?h.hp:heroMaxHp(), 0, heroMaxHp()),
    maxhp: heroMaxHp(), cd:0, aggroT:0, lastHit:-1e9, ph:Math.random()*7, dir:0,
    moving:false, speed:2.2, mesh: makePerson('held') };
  hero.prevHp = hero.hp;
  if (h.respawn > 0) hero.mesh.visible = false;
  applyHeroEquipVisual();                // Waffe/Rüstung/Amulett ans Modell + an die Ego-Hände
  return hero;
}
// 25b: Modell-Neuaufbau, wenn die Epoche einen anderen Rüstungs-Look verlangt.
// Der Look leitet sich allein aus der Rathausstufe ab (kein Save-Feld) –
// alle Referenzen (hero.mesh, userData.limbs/cape, Anker) werden sauber erneuert.
function refreshHeroLook(fx){
  updateEgoHandLook();
  if (!hero || !hero.mesh) return false;
  if (hero.mesh.userData.lookTier === heroLookTier()) return false;
  const old = hero.mesh;
  hero.mesh = makePerson('held');
  hero.mesh.visible = old.visible;
  hero.mesh.scale.copy(old.scale);
  hero.mesh.rotation.copy(old.rotation);
  hero.mesh.position.copy(old.position);
  fxGroup.remove(old); disposeGroup(old);
  applyHeroEquipVisual();
  if (fx && heroAlive()){                // kurzer Glitzer + Hinweis beim Epochenaufstieg
    const gy = Math.max(hAt(hero.x,hero.y),0);
    spawnBurst(wx(hero.x), gy+0.8, wz(hero.y), 10, 0x8fe0ff);
    spawnBurst(wx(hero.x), gy+0.4, wz(hero.y), 8, 0xffd75a);
    toast('🛡️ Deine Rüstung wurde der neuen Epoche angepasst.', 4200);
  }
  return true;
}
function recruitHero(){
  if (state.hero){ toast('Du hast bereits einen Helden.'); return false; }
  const hall = state.buildings.find(b=>b.t==='heldenhalle' && !b.ruin);
  if (!hall){ toast('🏛️ Baue zuerst eine Heldenhalle.'); return false; }
  const name = pendingHeroName || rollHeroName();
  pendingHeroName = null;
  const c = buildingCenter(hall);
  const l = findLanding(Math.round(c[0]), Math.round(c[1])+2);
  state.hero = { name, x:l[0], y:l[1], hp:100, skills:{k:1,h:1,s:1,c:1}, exp:{k:0,h:0,s:0,c:0},
    equip:{w:'holzknueppel',a:null,t:null}, bag:[], auto:1, respawn:0, view:'tp' };
  state.hero.hp = heroMaxHp();
  spawnHeroUnit();
  chronicleAdd('held1', '⚔️ ' + name + ' trat in den Dienst von ' + reichName() + '.');
  toast('⚔️ ' + name + ' ist bereit – tippe den Helden an, um ihn zu steuern!', 5200);
  snd(392,0.12,'triangle',0.05); snd(523,0.18,'triangle',0.05);
  save();
  return true;
}
function heroDie(){
  if (ADMIN.god) return;                 // Gottmodus (Admin-Konsole): Held fällt nie
  if (!state.hero || state.hero.respawn > 0 || !hero) return;
  // Tod im Dungeon (24c): kein Countdown – Erwachen am Eingang (Oberwelt) mit 30 % HP.
  // Beute/EXP bleiben (Sofort-Gutschrift), nur der Bossraum resettet.
  if (dungeon){
    dungeon.run.rooms[dungeon.run.rooms.length-1].cleared = false;
    exitEgo();                                             // schließt auch den Dungeon
    hero.hp = Math.max(1, Math.round(heroMaxHp()*0.30));
    hero.prevHp = hero.hp; hero.lastHit = -1e9; hero.moving = false;
    state.hero.hp = hero.hp;
    toast('💀 '+state.hero.name+' erwacht benommen am Dungeon-Eingang – Beute und Erfahrung bleiben.', 5200);
    snd(120,0.3,'sawtooth',0.05);
    save();
    return;
  }
  state.hero.respawn = 20;
  if (egoMode) exitEgo();
  cancelSail(hero);
  hero.hp = 0; hero.fallT = 0; hero.moving = false; hero.patrol = null;
  spawnBurst(wx(hero.x), Math.max(hAt(hero.x,hero.y),0)+0.4, wz(hero.y), 8, 0xffd75a);
  if (!chronicleHas('heldFall'))
    chronicleAdd('heldFall', '🛡️ ' + state.hero.name + ' ging zu Boden – doch Helden stehen wieder auf.');
  toast('🛡️ ' + state.hero.name + ' ist gefallen – kehrt in 20 s an der Heldenhalle zurück.', 4200);
  snd(120,0.3,'sawtooth',0.05);
}
function heroRespawn(){
  const h = state.hero;
  const p = heroHome();
  hero.x = p[0]; hero.y = p[1];
  hero.maxhp = heroMaxHp();
  hero.hp = Math.round(hero.maxhp*0.5);
  hero.prevHp = hero.hp; hero.lastHit = -1e9; hero.fallT = 0; hero.moving = false;
  hero.mesh.visible = true; hero.mesh.rotation.x = 0;
  h.respawn = 0;
  spawnBurst(wx(hero.x), Math.max(hAt(hero.x,hero.y),0)+0.5, wz(hero.y), 8, 0xffe9a0);
  toast('⚔️ ' + h.name + ' ist zurück im Dienst!', 3000);
}
// --- Auto-Modus: Verteidigen → Angriffsbefehl-Mitmarsch → Patrouille ---
function updateHeroAuto(dt){
  // Priorität 1: Verteidigung (Soldaten-Logik-Muster)
  let best = null, bd2 = 1e9;
  for (const e of enemies){ if (e.sail) continue;
    const d = dist(hero.x,hero.y,e.x,e.y); if (d<bd2){ bd2=d; best=e; } }
  for (const g of aiGuards){
    const d = dist(hero.x,hero.y,g.x,g.y);
    if ((attackOrder || d < 5) && d < bd2){ bd2 = d; best = g; }
  }
  if (best && isleOf(best.x,best.y) !== isleOf(hero.x,hero.y)) best = null;
  if (best){
    hero.patrol = null;
    if (mining) mining = null;                       // Schürfen bricht bei Gegnern sofort ab
    if (bd2 > 0.85){ hero.moving = true; steer(hero, best.x, best.y, 2.2, dt); }
    else {
      hero.moving = false;
      if (hero.cd<=0){
        hero.cd = heroAtkCd(); hero.aggroT = 5;
        hero.dir = Math.atan2(best.y-hero.y, best.x-hero.x);
        best.hp -= heroDmg();
        applyStagger(best);                // 24f: Treffer-Feedback auch im Auto-Modus
        if (best.hp <= 0){                           // Auto-Kill: halbe Kampf-EXP
          best.heroKill = 1;
          giveHeroExp('k', Math.round((10 + 2*state.wave)*0.5));
        }
        spawnBurst(wx(best.x), hAt(best.x,best.y)+0.5, wz(best.y), 3, 0xffd27a);
        snd(200,0.05,'square',0.03);
      }
    }
    return;
  }
  // Priorität 2: Angriffsbefehl – der Held marschiert mit (inkl. Boot)
  if (attackOrder){
    hero.patrol = null;
    const tc = aiBuildingCenter(attackOrder);
    if (isleOf(tc[0],tc[1]) !== isleOf(hero.x,hero.y)){
      let haf = null, hd = 1e9;
      for (const bd of state.buildings){
        if (bd.t!=='hafen') continue;
        const c = buildingCenter(bd);
        if (isleOf(c[0],c[1]) !== isleOf(hero.x,hero.y)) continue;
        const d = dist(hero.x,hero.y,c[0],c[1]);
        if (d<hd){ hd=d; haf=bd; }
      }
      if (!haf){ hero.moving = false; return; }        // Soldaten-Failsafe meldet den fehlenden Hafen
      const hc = buildingCenter(haf);
      if (dist(hero.x,hero.y,hc[0],hc[1]) > 1.8){ hero.moving = true; steer(hero, hc[0], hc[1], 2.2, dt); }
      else startSail(hero, tc[0], tc[1]);
      return;
    }
    const reach = (BT[attackOrder.t].w-1)*0.7 + 0.95;
    if (dist(hero.x,hero.y,tc[0],tc[1]) > reach){ hero.moving = true; steer(hero, tc[0], tc[1], 2.2, dt); }
    else {
      hero.moving = false;
      if (hero.cd<=0){
        hero.cd = 0.8;
        attackOrder.hp -= heroDmg()*0.5;               // Leitplanke: Gebäudeschaden ×0,5
        spawnBurst(wx(tc[0]), hAt(tc[0],tc[1])+0.7, wz(tc[1]), 3, 0xffd27a);
        if (attackOrder.hp <= 0) destroyAiBuilding(attackOrder);
      }
    }
    return;
  }
  // Heimweg von fremder Insel (nach Angriffen)
  if (isleOf(hero.x,hero.y) !== isleOf(SX,SY) && !hero.sail){
    const p = heroHome();
    startSail(hero, p[0], p[1]);
    return;
  }
  // Priorität 2: Auto-Schürfen (30 % Rate) – braucht Goldpfanne; voller Beutel wird abgeliefert
  if (state.hero.pfanne){
    if (bagCount() >= heroCapacity() && bagCount() > 0){
      let tgt = null, td = 1e9;
      for (const bd of state.buildings){
        if (bd.ruin || (bd.t!=='markt' && bd.t!=='rathaus' && bd.t!=='heldenhalle')) continue;
        const c = buildingCenter(bd);
        if (isleOf(c[0],c[1]) !== isleOf(hero.x,hero.y)) continue;
        const d = dist(hero.x,hero.y,c[0],c[1]);
        if (d < td){ td = d; tgt = bd; }
      }
      if (tgt){
        hero.patrol = null; mining = null;
        const c = buildingCenter(tgt);
        if (td > 2.2){ hero.moving = true; steer(hero, c[0], c[1], 2.2, dt); }
        else { hero.moving = false; emptyBag(); }
        return;
      }
    } else {
      let sp = null, sd = 1e9;
      for (const s of (state.mineSpots||[])){
        if (s.left <= 0 || (s.skip||0) > state.time) continue;
        if (isleOf(s.x,s.y) !== isleOf(hero.x,hero.y)) continue;
        const d = dist(hero.x,hero.y,s.x,s.y);
        if (d < sd){ sd = d; sp = s; }
      }
      if (sp){
        hero.patrol = null;
        if (sd > 1.4){
          mining = null;
          hero.moving = true;
          const px = hero.x, py = hero.y;
          steer(hero, sp.x, sp.y, 2.2, dt);
          // Anti-Festhäng: kommt er nicht voran, Spot 30 s überspringen
          if (dist(hero.x,hero.y,px,py) < 2.2*dt*0.3) hero.mineNo = (hero.mineNo||0) + dt;
          else hero.mineNo = 0;
          if (hero.mineNo > 6){ sp.skip = state.time + 30; hero.mineNo = 0; }
        } else {
          hero.moving = false;
          hero.dir = Math.atan2(sp.y-hero.y, sp.x-hero.x);
          if (!mining || mining.spot !== sp)
            mining = { spot:sp, t:0, dur:mineDur(true), auto:true };
        }
        return;
      }
    }
  }
  // Priorität 3: Patrouille zwischen Toren, Türmen und Heldenhalle
  hero.wait = Math.max(0, (hero.wait||0) - dt);
  if (hero.wait > 0){ hero.moving = false; return; }
  if (!hero.patrol){
    const pts = state.buildings.filter(b=>!b.ruin &&
      (b.t==='tor' || b.t==='turm' || b.t==='heldenhalle'));
    const onIsle = pts.filter(b=>{ const c = buildingCenter(b); return isleOf(c[0],c[1])===isleOf(hero.x,hero.y); });
    const src = onIsle.length ? onIsle[(Math.random()*onIsle.length)|0]
      : state.buildings.find(b=>b.t==='rathaus');
    if (src){
      const c = buildingCenter(src);
      const a = Math.random()*Math.PI*2;
      hero.patrol = findLanding(Math.round(c[0]+Math.cos(a)*1.8), Math.round(c[1]+Math.sin(a)*1.8));
      hero.patNo = 0;
    }
  }
  if (hero.patrol){
    hero.moving = true;
    const px = hero.x, py = hero.y;
    const done = steer(hero, hero.patrol[0], hero.patrol[1], 1.4, dt);
    // Anti-Festhäng: ohne Fortschritt neuen Patrouillenpunkt wählen
    if (dist(hero.x,hero.y,px,py) < 1.4*dt*0.3) hero.patNo = (hero.patNo||0) + dt; else hero.patNo = 0;
    if (done || dist(hero.x,hero.y,hero.patrol[0],hero.patrol[1]) < 0.9 || hero.patNo > 6){
      hero.patrol = null;
      hero.wait = 2 + Math.random()*4;
      hero.moving = false;
    }
  } else hero.moving = false;
}
// 25d: Manuelle Steuerung (Ego/Third-Person) – Gebäudekacheln blocken den Helden,
// eigene Tore und Ruinen bleiben passierbar. NUR für den manuell gesteuerten Helden:
// Auto-Held und alle anderen Einheiten laufen weiter durch Gebäude, denn ohne
// Pathfinding würden sie sich sonst zwischen Bauten festlaufen.
function heroManualWalkable(fx,fy){
  if (!walkable(fx,fy,false)) return false;
  const o = occ[idx(Math.round(fx),Math.round(fy))];
  if (!(o>0)) return true;
  const bd = state.buildings[o-1];
  return !!bd.ruin || !!BT[bd.t].gate;
}
// --- Ego-Steuerung: Joystick-Bewegung mit walkable-Parität und Substeps ---
function updateHeroEgo(dt){
  const len = Math.min(1, Math.hypot(egoStick.x, egoStick.y));
  if (len > 0.06){
    const sp = len > 0.85 ? 3.2 : 2.2*len;             // Vollausschlag = Sprint
    const fx = Math.cos(egoYaw), fz = Math.sin(egoYaw);
    let vx = fx*egoStick.y - fz*egoStick.x, vy = fz*egoStick.y + fx*egoStick.x;
    const vl = Math.hypot(vx,vy)||1; vx/=vl; vy/=vl;
    const stepAll = sp*dt, n = Math.max(1, Math.ceil(stepAll/0.3));
    let movedAny = false;
    // Im Dungeon gilt das 24×24-Raster (dOcc); in der Oberwelt blocken zusätzlich
    // Gebäude (25d, heroManualWalkable) – Tore/Ruinen bleiben offen
    const wk = (x,y)=> dungeon ? dWalkable(x,y) : heroManualWalkable(x,y);
    const tryMove = (dx,dy)=>{
      const l2 = Math.hypot(dx,dy);
      if (l2 < 1e-6) return false;
      // Look-ahead 0,45 wie steer(): Wasser/Mauern blocken, Tore lassen durch
      if (!wk(hero.x + dx/l2*0.45, hero.y + dy/l2*0.45)) return false;
      if (!wk(hero.x + dx, hero.y + dy)) return false;
      hero.x += dx; hero.y += dy;
      return true;
    };
    for (let i=0;i<n;i++){
      const s1 = stepAll/n;
      if (tryMove(vx*s1, vy*s1) || tryMove(vx*s1, 0) || tryMove(0, vy*s1)) movedAny = true;
      else break;
    }
    hero.moving = movedAny;
    if (movedAny){ hero.dir = Math.atan2(vy,vx); egoBobT += dt*(3.2+sp*2.4); }
  } else {
    hero.moving = false;
    if (heroView() !== 'ego') hero.dir = egoYaw;   // Third-Person: Figur folgt dem Blick
  }
}
function updateHero(dt){
  const h = state.hero;
  if (!h || !hero) return;
  hero.cd = Math.max(0, hero.cd - dt);
  hero.aggroT = Math.max(0, (hero.aggroT||0) - dt);
  if (hero.hp < hero.prevHp) hero.lastHit = state.time;   // Treffer erkannt (Gegner schreiben hp direkt)
  if (h.respawn > 0){
    // Umfall-Animation, dann 20-s-Countdown bis zum Respawn
    h.respawn -= dt;
    if (hero.mesh.visible){
      hero.fallT = (hero.fallT||0) + dt;
      hero.mesh.rotation.x = -Math.min(1, hero.fallT/0.4)*Math.PI/2;
      if (hero.fallT >= 0.8){ hero.mesh.visible = false; hero.mesh.rotation.x = 0; }
    }
    if (h.respawn <= 0) heroRespawn();
    hero.prevHp = hero.hp;
    h.x = hero.x; h.y = hero.y; h.hp = hero.hp;
    return;
  }
  // Dungeon (24c): Bewegung auf dem Unterwelt-Raster, Save-Position bleibt der Eingang
  if (dungeon){
    hero.maxhp = heroMaxHp();
    if (hero.hp <= 0){ heroDie(); return; }
    if (hero.hp < hero.maxhp && state.time - hero.lastHit > 5)
      hero.hp = Math.min(hero.maxhp, hero.hp + 2*dt);
    updateHeroEgo(dt);
    hero.prevHp = hero.hp;
    h.hp = hero.hp;
    h.x = dungeon.entry[0]; h.y = dungeon.entry[1];        // Reload → Held am Eingang
    return;
  }
  // Failsafe: Kachel unbegehbar geworden (Terraforming/Neubau) → nächste freie Kachel
  if (!hero.sail && !walkable(hero.x, hero.y, false)){
    const l = findLanding(Math.round(hero.x), Math.round(hero.y));
    hero.x = l[0]; hero.y = l[1];
  }
  // 25d-Failsafe: manuell gesteuert IN einem Gebäude (Umschalten/Neubau auf der
  // Helden-Kachel) → auf die nächste für ihn begehbare Kachel heraussetzen
  if (!hero.sail && egoMode && !h.auto && !dungeon && !heroManualWalkable(hero.x, hero.y)){
    const l = nearestTile(Math.round(hero.x), Math.round(hero.y), heroManualWalkable)
      || findLanding(Math.round(hero.x), Math.round(hero.y));
    hero.x = l[0]; hero.y = l[1];
  }
  hero.maxhp = heroMaxHp();
  if (hero.hp <= 0){ heroDie(); return; }
  // Regeneration: 2 HP/s nach 5 s ohne Treffer (Lazarett-Aura wirkt zusätzlich)
  if (hero.hp < hero.maxhp && state.time - hero.lastHit > 5)
    hero.hp = Math.min(hero.maxhp, hero.hp + 2*dt);
  // Schürf-Spots entdecken (≤ 6 Kacheln) → Minimap-Marker
  hero.spotT = (hero.spotT||0) - dt;
  if (hero.spotT <= 0){
    hero.spotT = 0.7;
    for (const s of (state.mineSpots||[])){
      if (!s.found && s.left > 0 && dist(hero.x,hero.y,s.x,s.y) <= 6){
        s.found = 1;
        toast('⛏️ Schürf-Spot entdeckt – glitzernde Kiesbank auf der Karte markiert!', 3000);
      }
      // 24f: erstes Annähern ohne Goldpfanne → einmaliger Hinweis (persistiert im Save)
      if (!h.pfanne && !h.pfanneHint && s.left > 0 && dist(hero.x,hero.y,s.x,s.y) <= 2.5){
        h.pfanneHint = 1;
        toast(PFANNE_HINT, 5600);
      }
    }
  }
  if (hero.sail){ /* Überfahrt läuft in updateAllSails */ }
  else if (egoMode && !h.auto) updateHeroEgo(dt);
  else updateHeroAuto(dt);
  hero.prevHp = hero.hp;
  h.x = hero.x; h.y = hero.y; h.hp = hero.hp;
}
// --- Kegel-Zielhilfe: nächster Gegner ≤2,5 Kacheln und ±35° zur Blickrichtung ---
function egoTargetEnemy(){
  if (!heroAlive()) return null;
  let best = null, bd2 = 2.51;
  const scan = (e)=>{
    const d = dist(hero.x,hero.y,e.x,e.y);
    if (d >= bd2) return;
    const a = Math.atan2(e.y-hero.y, e.x-hero.x);
    const da = Math.atan2(Math.sin(a-egoYaw), Math.cos(a-egoYaw));
    if (Math.abs(da) > 35*Math.PI/180) return;
    bd2 = d; best = e;
  };
  if (dungeon){                          // Unterwelt: NUR die Dungeon-Liste zählt
    for (const e of dungeonEnemies) scan(e);
    return best;
  }
  for (const e of enemies) if (!e.sail) scan(e);
  for (const g of aiGuards) scan(g);
  for (const e of campEnemies) scan(e);  // Quest-Lager (24d): nur der Held kämpft mit ihnen
  return best;
}
// Nahkampfschlag (Ego): Gegner haben Vorrang, danach Wildtiere im Kegel
function heroAttack(){
  if (!egoMode || !heroAlive() || hero.cd > 0) return false;
  let wild = null, t2 = egoTargetEnemy();
  if (!t2 && !dungeon){ wild = egoTargetWild(); t2 = wild; }
  if (!t2) return false;
  hero.cd = heroAtkCd();
  const a = Math.atan2(t2.y-hero.y, t2.x-hero.x);
  hero.dir = a;
  egoYaw += Math.atan2(Math.sin(a-egoYaw), Math.cos(a-egoYaw))*0.5;   // weiches Eindrehen zum Ziel
  t2.hp -= heroDmg();
  applyStagger(t2);                        // 24f: 0,4 s Stagger + Rückstoß (nicht bei Bossen)
  if (wild){
    wild.aggro = true;                     // Wehr-Arten schlagen zurück, Flucht-Arten fliehen ohnehin
    wild.heroHit = 1;                      // 24d: nur manuelle Helden-Kills zählen für Jagd-Quests
  } else if (t2.dng){
    t2.aggro = true;                       // Dungeon: EXP/Beute vergibt killDungeonEnemy
  } else {
    hero.aggroT = 5;
    if (t2.hp <= 0){                       // Kampf-EXP nur für echte Gegner (manuell: voll)
      t2.heroKill = 1;
      giveHeroExp('k', 10 + 2*state.wave);
    }
  }
  handSwingT = 0.25;
  if (t2.dng) spawnBurst(dlx(t2.x), DNG_Y+0.5, dlz(t2.y), 4, 0xffd27a);
  else spawnBurst(wx(t2.x), hAt(t2.x,t2.y)+0.5, wz(t2.y), 4, 0xffd27a);
  snd(190,0.06,'square',0.04);
  return true;
}
// --- Ego-Hände: kameragebundene Low-Poly-Gruppe (Minecraft-Gefühl mit 3 Meshes) ---
scene.add(camera);                       // nötig, damit Kamera-Kinder gerendert werden
const egoHands = new THREE.Group();
egoHands.visible = false;
let egoHandR = null;
{
  // Hände eng am Bildrand: Portrait-Frustum ist schmal (Aspect < 0,5)
  const handGeo = new THREE.BoxGeometry(0.075,0.075,0.15);
  // 25b: Leuchtstreifen auf dem Handrücken (sichtbar ab Digital-Epoche)
  const handGlow = (nm)=>{
    const s = mesh(new THREE.BoxGeometry(0.05,0.014,0.13), HP.glow, false, false);
    s.name = nm; s.position.set(0,0.046,-0.025); s.visible = false; return s;
  };
  const hl = mesh(handGeo, M.skin, false, false);
  hl.name = 'handL';
  hl.position.set(-0.105,-0.2,-0.42); hl.rotation.set(0.3,0.15,0);
  hl.add(handGlow('glowE_L'));
  egoHands.add(hl);
  // Rüstungs-Stulpen (Inhalt setzt applyHeroEquipVisual je nach Rüstung)
  const armL = new THREE.Group(); armL.name = 'armE_L';
  armL.position.copy(hl.position); armL.rotation.copy(hl.rotation);
  egoHands.add(armL);
  egoHandR = new THREE.Group();
  egoHandR.position.set(0.105,-0.2,-0.42);
  const hr = mesh(handGeo, M.skin, false, false);
  hr.name = 'handR';
  hr.rotation.set(0.3,-0.15,0);
  hr.add(handGlow('glowE_R'));
  egoHandR.add(hr);
  const armR = new THREE.Group(); armR.name = 'armE_R';
  armR.rotation.copy(hr.rotation);
  egoHandR.add(armR);
  const wpnE = new THREE.Group(); wpnE.name = 'wpnE';   // Waffe (Inhalt: applyHeroEquipVisual)
  egoHandR.add(wpnE);
  egoHands.add(egoHandR);
  camera.add(egoHands);
}
// --- Ego-HUD sichtbar schalten; Stadt-UI ausblenden (Baumenü/Minimap/Speed & Co.) ---
function setEgoUI(on){
  for (const id of ['btnBuild','btnMap','btnSpeed','btnChron','btnMenu','btnSound'])
    $(id).style.display = on ? 'none' : '';
  $('topbar').style.display = on ? 'none' : '';
  ui.wavebar.style.display = on ? 'none' : '';
  if (on) ui.hint.style.display = 'none';
  for (const id of ['egoExit','egoView','egoHp','egoRes','egoAct2']) $(id).style.display = on ? 'flex' : 'none';
  $('egoCross').style.display = on ? 'block' : 'none';
  if (!on)
    for (const id of ['egoAct','egoAct2','egoBanner','egoStick','egoRing']) $(id).style.display = 'none';
}
function enterEgo(){
  if (egoMode) return true;
  if (!gameStarted || gameOver || !state || !state.hero || !hero ||
      state.hero.respawn > 0 || hero.sail) return false;
  egoMode = true;
  state.hero.auto = 0;
  mining = null; sailPick = null;
  egoYaw = hero.dir||0; egoPitch = 0; egoBobT = 0; handSwingT = 0;
  egoStick.x = 0; egoStick.y = 0;
  cancelEraFlight(); cancelPlacing(); hideInfo(); selected = null; hideSelQuads(); closeBuildSheet();
  if (speed > 1){ speed = 1; $('btnSpeed').textContent = '▶'; }   // Simulation fest auf 1×
  tpSnap = true;
  viewFov = heroView()==='ego' ? 70 : 60;
  applyEgoViewVis();
  setEgoUI(true);
  snd(420,0.08,'sine',0.03);
  return true;
}
// Sichtbarkeiten je Sicht: Ego = Hände statt Figur, Third-Person = Figur statt Hände
function applyEgoViewVis(){
  const ego = heroView()==='ego';
  egoHands.visible = egoMode && ego;
  if (hero && egoMode) hero.mesh.visible = !ego && !(state.hero && state.hero.respawn > 0);
}
function exitEgo(){
  if (!egoMode) return false;
  egoMode = false;
  if (dungeon) exitDungeon();            // Stadtansicht gibt es nur in der Oberwelt
  if (state.hero) state.hero.auto = 1;   // Held macht alleine weiter
  mining = null; sailPick = null;
  hideInfo();                            // offene Ego-Sheets (Beutel/Crafting/Handel) schließen
  egoStick.x = 0; egoStick.y = 0;
  egoPtr.clear();
  if (hero) hero.mesh.visible = !(state.hero && state.hero.respawn > 0);
  setEgoUI(false);
  return true;
}
// --- Ego-Touch: dynamischer Joystick links, Blick-Drag rechts, Tap = Kontextaktion ---
const egoPtr = new Map();
function egoPointerDown(e){
  if (hero && hero.sail) return;           // Überfahrt: Steuerung gesperrt (nur Exit-Button)
  cv.setPointerCapture(e.pointerId);
  const W = window.innerWidth, H = window.innerHeight;
  const stickTaken = [...egoPtr.values()].some(p=>p.role==='stick');
  const role = (!stickTaken && e.clientX < W*0.45 && e.clientY > H*0.35) ? 'stick' : 'look';
  egoPtr.set(e.pointerId, { role, sx:e.clientX, sy:e.clientY, x:e.clientX, y:e.clientY,
    t:performance.now(), moved:false });
  if (role==='stick'){
    const st = $('egoStick');
    st.style.display = 'block';
    st.style.left = e.clientX+'px'; st.style.top = e.clientY+'px';
    $('egoKnob').style.transform = 'translate(-50%,-50%)';
  }
}
function egoPointerMove(e){
  const p = egoPtr.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX-p.x, dy = e.clientY-p.y;
  if (Math.abs(e.clientX-p.sx)+Math.abs(e.clientY-p.sy) > 9) p.moved = true;
  p.x = e.clientX; p.y = e.clientY;
  if (p.role==='stick'){
    let jx = (e.clientX-p.sx)/48, jy = (e.clientY-p.sy)/48;   // Knopfradius 48 px = Vollausschlag
    const l = Math.hypot(jx,jy);
    if (l > 1){ jx/=l; jy/=l; }
    egoStick.x = jx; egoStick.y = -jy;                        // Bildschirm-hoch = vorwärts
    $('egoKnob').style.transform = 'translate(-50%,-50%) translate('+(jx*48)+'px,'+(jy*48)+'px)';
  } else {
    egoYaw += dx*0.22*Math.PI/180;                            // 0,22°/px Yaw
    egoPitch = clamp(egoPitch - dy*0.18*Math.PI/180, -Math.PI/3, Math.PI/3);   // ±60°
  }
}
function egoPointerUp(e){
  const p = egoPtr.get(e.pointerId);
  egoPtr.delete(e.pointerId);
  if (!p) return;
  if (p.role==='stick'){
    egoStick.x = 0; egoStick.y = 0;
    $('egoStick').style.display = 'none';
  } else if (!p.moved && performance.now()-p.t < 200){
    // 25d: offenes Sheet (Beutel/Crafting/Handel) → Tap in die Welt schließt es nur
    if (ui.info.style.display === 'block') hideInfo();
    else egoAction();                    // Tap = Kontext-Interaktion aufs Fadenkreuz-Ziel
  }
}
$('egoExit').addEventListener('click', ()=>exitEgo());
$('egoView').addEventListener('click', ()=>{
  // 👁️: Third-Person ↔ Ego; Präferenz wandert mit in den Save (state.hero.view)
  if (!egoMode || !state || !state.hero) return;
  state.hero.view = heroView()==='ego' ? 'tp' : 'ego';
  if (state.hero.view === 'tp') _tpPos.copy(camera.position);  // weiches Herausziehen ab Ist-Position
  tpSnap = false;
  applyEgoViewVis();
  snd(500,0.06,'triangle',0.03);
  save();
});
$('egoAct').addEventListener('click', ()=>egoAction());
$('egoAct2').addEventListener('click', ()=>{
  // 25d: 🎒 togglet – offener Beutel wird wieder geschlossen
  if (ui.info.style.display === 'block' && $('ipName').textContent.startsWith('🎒')) hideInfo();
  else showBagSheet();
});
$('egoBanner').addEventListener('click', ()=>{
  // Zur Stadt: Orbit-Kamera zentriert auf den nächsten Angreifer, Held → Auto-Modus.
  // Im Dungeon zählt die Oberwelt-Position (Eingang) – exitEgo verlässt auch die Unterwelt.
  let best = null, bd2 = 1e9;
  const hx = state.hero ? state.hero.x : SX, hy = state.hero ? state.hero.y : SY;
  for (const e of enemies){ if (e.sail) continue;
    const d = dist(e.x,e.y,hx,hy); if (d<bd2){ bd2=d; best=e; } }
  exitEgo();
  if (best){ cam.tx = wx(best.x); cam.tz = wz(best.y); clampCam(); }
});
// --- Kamera: Orbit ↔ Ego/Third-Person mit 0,6-s-Blende ---
// Ego: FOV 70 / Near 0,08. Third-Person (Standard): FOV 60 / Near 0,3, Folgekamera
// schräg hinter dem Helden – Kollision kürzt den Abstand, damit sie NIE in Wänden steckt.
const _egoCam = new THREE.PerspectiveCamera();
const _fromPos = new THREE.Vector3(), _fromQ = new THREE.Quaternion();
const _tpDir = new THREE.Vector3();
// Wunschabstand vom Kopf aus abtasten: Dungeon-Wände (dOcc) bzw. Gebäudekacheln (occ)
// blocken – dann schrittweise verkürzen (min. 1,2 Welteinheiten)
function tpCamDist(n, dist0){
  for (let s = 0.45; s <= dist0; s += 0.25){
    const gx = hero.x + n.x*s/TL, gy = hero.y + n.z*s/TL;
    if (dungeon){
      if (!dWalkable(gx, gy)) return Math.max(1.2, s - 0.35);
    } else {
      const cx = Math.round(gx), cy = Math.round(gy);
      if (inMap(cx,cy)){
        const o = occ[idx(cx,cy)];
        if (o > 0 && !state.buildings[o-1].ruin) return Math.max(1.2, s - 0.35);
      }
    }
  }
  return dist0;
}
function egoView(dt){
  if (hero.sail && hero.sail.boat){
    // ⛵ Verfolger-Kamera: hinter dem Boot her, Blick aufs Boot (Ausstieg: normale Sicht)
    const s = hero.sail, bp = s.boat.position;
    const dxn = s.x1-s.x0, dyn = s.y1-s.y0, l = Math.hypot(dxn,dyn)||1;
    _egoCam.position.set(bp.x - dxn/l*7, 3.4, bp.z - dyn/l*7);
    _egoCam.lookAt(bp.x, 0.5, bp.z);
    return;
  }
  const ego = heroView()==='ego';
  const bob = ego && hero.moving ? Math.sin(egoBobT)*0.02 : 0;    // Kopf-Bobbing nur im Ego
  // Kopfpunkt (Oberwelt: Terrainhöhe; Unterwelt: ebener Boden bei y=−60)
  let ax, ay, az;
  if (dungeon){ ax = dlx(hero.x); ay = DNG_Y + 0.62 + bob; az = dlz(hero.y); }
  else { ax = wx(hero.x); ay = Math.max(hAt(hero.x,hero.y),0) + 0.62 + bob; az = wz(hero.y); }
  const cp = Math.cos(egoPitch);
  const fx = Math.cos(egoYaw)*cp, fy = Math.sin(egoPitch), fz = Math.sin(egoYaw)*cp;
  if (ego){
    _egoCam.position.set(ax,ay,az);
    _egoCam.lookAt(ax+fx, ay+fy, az+fz);
    return;
  }
  // Third-Person: Kopf − Blickrichtung·Abstand + Hub (Oberwelt 5/≈2, Dungeon 3,5/≈1,6)
  const dist0 = dungeon ? 3.5 : 5.0, lift = dungeon ? 0.46 : 0.4;
  _tpDir.set(-fx, -fy + lift, -fz).normalize();
  const d = tpCamDist(_tpDir, dist0);
  let cxw = ax + _tpDir.x*d, cyw = ay + _tpDir.y*d, czw = az + _tpDir.z*d;
  if (dungeon){
    cyw = clamp(cyw, DNG_Y + 0.35, DNG_Y + 2.6);                  // unter der Raumdecke bleiben
  } else {
    // Terrain-Klemme: Kamera nie unter Bodenhöhe + 0,3 (auch am Wegmittelpunkt prüfen)
    const gx = hero.x + _tpDir.x*d/TL, gy = hero.y + _tpDir.z*d/TL;
    cyw = Math.max(cyw, hAt(gx,gy)+0.3, hAt((hero.x+gx)/2,(hero.y+gy)/2)+0.3);
  }
  if (tpSnap){ _tpPos.set(cxw,cyw,czw); tpSnap = false; }
  else _tpPos.lerp(_tpDir.set(cxw,cyw,czw), Math.min(1, (dt||0.016)*8));   // weiches Nachziehen
  _egoCam.position.copy(_tpPos);
  _egoCam.lookAt(ax + fx*2, ay + 0.2 + fy*2, az + fz*2);          // Blick folgt Yaw/Pitch
}
function updateCamCombined(dt){
  if (!egoMode && egoBlend <= 0){
    if (camera.near !== 0.5){
      camera.near = 0.5; camera.fov = 46; camera.updateProjectionMatrix();
      egoHands.visible = false;
    }
    updateCam();
    return;
  }
  egoBlend = clamp(egoBlend + (egoMode?1:-1)*dt/0.6, 0, 1);
  updateCam();                             // Orbit-Sicht als Blend-Basis
  _fromPos.copy(camera.position); _fromQ.copy(camera.quaternion);
  if (hero) egoView(dt);
  const s = egoBlend*egoBlend*(3-2*egoBlend);
  const egoLike = heroView()==='ego' || (hero && hero.sail && hero.sail.boat);   // Boot-Kamera wie bisher
  viewFov += ((egoLike ? 70 : 60) - viewFov)*Math.min(1, dt*6);
  camera.position.lerpVectors(_fromPos, _egoCam.position, s);
  camera.quaternion.slerpQuaternions(_fromQ, _egoCam.quaternion, s);
  camera.fov = lerp(46, viewFov, s);
  camera.near = egoLike ? 0.08 : 0.3;
  camera.updateProjectionMatrix();
  // Ego-Hände: dezentes Mitwippen + Schwung-Animation (0,25 s) bei Aktion
  egoHands.position.y = hero && hero.moving ? Math.sin(egoBobT*0.9)*0.012 : 0;
  if (handSwingT > 0){
    handSwingT = Math.max(0, handSwingT - dt);
    const p = 1 - handSwingT/0.25;
    egoHandR.position.z = -0.42 - Math.sin(p*Math.PI)*0.2;
    egoHandR.rotation.x = -Math.sin(p*Math.PI)*0.9;
  } else { egoHandR.position.z = -0.42; egoHandR.rotation.x = 0; }
  if (!egoMode && egoBlend <= 0){
    camera.near = 0.5; camera.fov = 46; camera.updateProjectionMatrix();
    egoHands.visible = false;
  }
}
// --- Helden-Panel (Tap auf den Helden in der Stadtansicht) ---
function showHeroInfo(){
  const h = state.hero;
  if (!h) return;
  $('ipName').textContent = '⚔️ ' + h.name + ' · Heldenstufe ' + heroLevel();
  $('ipDesc').textContent = 'Dein Held – steuere ihn aus der Ego-Perspektive oder lass ihn selbstständig patrouillieren und verteidigen.';
  $('ipStats').textContent = '❤️ ' + Math.ceil(hero?hero.hp:h.hp) + '/' + heroMaxHp() +
    ' · 💥 ' + Math.round(heroDmg()) + ' · 🥾 2,2' +
    ' · ⚔️' + h.skills.k + ' 🤝' + h.skills.h + ' ⛏️' + h.skills.s + ' 🔨' + h.skills.c +
    ' · ' + equipLabel('w') + ' · ' + equipLabel('a') + ' · ' + equipLabel('t') +
    (h.pfanne ? ' · 🥄' : '') +
    ' · 🎒 ' + bagCount() + '/' + heroCapacity();
  const btns = $('ipBtns'); btns.innerHTML = '';
  const sb = document.createElement('button');
  sb.className = 'btn-green'; sb.textContent = '🎮 Steuern (Ego-Modus)';
  sb.addEventListener('click', ()=>{ hideInfo(); selected = null; hideSelQuads(); enterEgo(); });
  btns.appendChild(sb);
  if (questsUnlocked()){
    ensureOffers();
    const qb = document.createElement('button');
    qb.className = 'btn-blue';
    qb.textContent = '📜 Aufträge (' + state.quests.offers.length + ')';
    qb.addEventListener('click', ()=>openQuestSheet());
    btns.appendChild(qb);
  }
  const hb = document.createElement('button');
  hb.className = 'btn-blue'; hb.textContent = '🏛️ Zur Heldenhalle';
  hb.addEventListener('click', ()=>{
    const hall = state.buildings.find(b=>b.t==='heldenhalle');
    if (!hall){ toast('Keine Heldenhalle vorhanden.'); return; }
    const c = buildingCenter(hall);
    cam.tx = wx(c[0]); cam.tz = wz(c[1]); clampCam();
    hideInfo(); selected = null; hideSelQuads();
  });
  btns.appendChild(hb);
  ui.info.style.display = 'block';
}

// ============================== HELDEN-AKTIONEN (Etappe 24b) ==============================
// Schürfen, Crafting/Ausrüstung, Helden-Handel, Hafen-Übersetzen, Beutel, Wildtiere.

// --- Ausrüstungs-Katalog (Crafting-Tabelle 5.2) ---
const HERO_ITEMS = {
  holzknueppel:   { name:'🪵 Holzknüppel',    slot:'w', dmg:14, tier:0 },   // gratis beim Rekrutieren
  pfanne:         { name:'🥄 Goldpfanne',     slot:'tool', tier:1, cost:{holz:15,gold:20},
                    fx:'schaltet Schürfen frei' },
  eisenschwert:   { name:'🪓 Eisenschwert',   slot:'w', dmg:22, tier:1, cost:{eisen:20,holz:10,gold:30}, skill:1 },
  lederwams:      { name:'🦺 Lederwams',      slot:'a', hp:40,  tier:1, cost:{nahrung:20,gold:15}, skill:1 },
  ritterklinge:   { name:'⚔️ Ritterklinge',   slot:'w', dmg:30, tier:2, cost:{eisen:45,gold:60},  skill:3, req:6 },
  eisenharnisch:  { name:'🛡️ Eisenharnisch',  slot:'a', hp:90,  tier:2, cost:{eisen:50,gold:50},  skill:3, req:6 },
  stahlklinge:    { name:'🗡️ Stahlklinge',    slot:'w', dmg:38, tier:3, cost:{stahl:35,gold:90},  skill:5, req:11 },
  stahlpanzer:    { name:'🛡️ Stahlpanzer',    slot:'a', hp:160, tier:3, cost:{stahl:45,gold:110}, skill:5, req:11 },
  energieklinge:  { name:'⚡ Energieklinge',   slot:'w', dmg:55, tier:4, cost:{lithium:15,stahl:40,gold:220}, skill:7, req:21 },
  schildgenerator:{ name:'🔰 Schildgenerator', slot:'a', hp:260, tier:4, cost:{lithium:20,stahl:30,gold:260}, skill:7, req:21 },
  // Amulette: Rathaus-Gates 8/12/16 (24c ergänzt Dungeon-Rezeptfunde)
  gluecksamulett:   { name:'🧿 Glücksamulett',     slot:'t', tier:1, cost:{gold:80,eisen:10}, req:8,  fx:'+10 % Gold-Beute' },
  bergmannstalisman:{ name:'🧿 Bergmannstalisman', slot:'t', tier:2, cost:{gold:120,stahl:8}, req:12, fx:'−20 % Schürfdauer' },
  haendlersiegel:   { name:'🧿 Händlersiegel',     slot:'t', tier:3, cost:{gold:160,oel:10},  req:16, fx:'+2 % Kurse' },
};
// 24f: einheitlicher Hinweis, wenn ein Schürf-Spot ohne Goldpfanne angeboten wird
const PFANNE_HINT = 'Du brauchst eine 🥄 Goldpfanne — schmiede sie an der Schmiede (15 🪵 + 20 🪙)';
const CRAFT_ORDER = ['pfanne','eisenschwert','lederwams','ritterklinge','eisenharnisch',
  'stahlklinge','stahlpanzer','energieklinge','schildgenerator',
  'gluecksamulett','bergmannstalisman','haendlersiegel'];
// Beutel-Items (generisch, {t,n}-Stapel – Felle & Co. stecken im selben System wie Nuggets)
const BAG_ITEMS = {
  nugget: { name:'Nugget',        icon:'✨', gold:3 },
  wnugget:{ name:'Wüsten-Nugget', icon:'✨', gold:3.75 },   // Wüsten-Spot: +25 % Wert
  gem:    { name:'Edelstein',     icon:'💎', gold:40 },
  fell:   { name:'Fell',          icon:'🟫', gold:5 },
  chitin: { name:'Chitinpanzer',  icon:'🪲', gold:6 },
  glut:   { name:'Glutschuppe',   icon:'🔥', gold:8 },
};
// Gold-Gegenwerte fürs Verkaufen ersetzter Ausrüstung („Marktwert“ = 50 % der Materialkosten)
const GOLD_VAL = { holz:0.3, stein:0.4, nahrung:0.35, erz:0.8, eisen:2.0, stahl:5, oel:4, lithium:8, gold:1 };
function itemValue(id){
  const it = HERO_ITEMS[id];
  if (!it || !it.cost) return 0;
  let v = 0;
  for (const k in it.cost) v += it.cost[k]*(GOLD_VAL[k]||1);
  return Math.round(v*0.5);
}
function equipLabel(slot){
  const id = state && state.hero && state.hero.equip[slot];
  if (id && HERO_ITEMS[id]) return HERO_ITEMS[id].name;
  return slot==='w' ? '✊ unbewaffnet' : (slot==='a' ? '🛡️ –' : '🧿 –');
}

// --- Beutel (Tragkraft 10 + 2·Schürfen) ---
function heroCapacity(){ return state.hero ? 10 + 2*state.hero.skills.s : 0; }
function bagCount(){ return state.hero ? state.hero.bag.reduce((n,s)=>n+s.n, 0) : 0; }
function bagAdd(t, n){
  if (!state.hero || !BAG_ITEMS[t]) return 0;
  const add = Math.min(n, Math.max(0, heroCapacity() - bagCount()));
  if (add > 0){
    const st = state.hero.bag.find(s=>s.t===t);
    if (st) st.n += add; else state.hero.bag.push({ t, n:add });
  }
  return add;
}
function bagValue(){
  return state.hero ? state.hero.bag.reduce((v,s)=>v + s.n*(BAG_ITEMS[s.t]?BAG_ITEMS[s.t].gold:0), 0) : 0;
}
function bagNuggetValue(){
  return state.hero ? state.hero.bag.reduce((v,s)=>
    v + ((s.t==='nugget'||s.t==='wnugget') ? s.n*BAG_ITEMS[s.t].gold : 0), 0) : 0;
}
function emptyBag(){
  const h = state.hero;
  if (!h || !h.bag.length) return 0;
  const v = Math.round(bagValue());
  const txt = h.bag.map(s=>BAG_ITEMS[s.t].icon+'×'+s.n).join(' ');
  h.bag = [];
  state.res.gold += v;
  toast('🎒 Beutel geleert: '+txt+' → +'+v+' 🪙', 3400);
  snd(700,0.1,'triangle',0.05);
  save();
  return v;
}
// Abgabepunkt in Reichweite des Helden (Markt/Rathaus/Heldenhalle, ≤ 3 Kacheln)
function nearDeliverBuilding(){
  if (!heroAlive()) return null;
  for (const bd of state.buildings){
    if (bd.ruin || (bd.t!=='markt' && bd.t!=='rathaus' && bd.t!=='heldenhalle')) continue;
    const c = buildingCenter(bd);
    if (dist(hero.x,hero.y,c[0],c[1]) - (BT[bd.t].w-1)*0.7 <= 3.01) return bd;
  }
  return null;
}

// --- Ausrüstungs-Optik: Waffe (wpn/wpnE), Rüstung (armor + Ego-Stulpen), Amulett (trk) ---
const HM = {
  leather: std(0x7a4f2c), leatherD: std(0x5d3b20),
  energy: std(0x35e0ff,{ emissive:0x22c8e8, emissiveIntensity:1.5 }),
  glowGold: std(0xffd75a,{ emissive:0xdfa520, emissiveIntensity:1.2 }),
  glowOrange: std(0xffa04a,{ emissive:0xff7020, emissiveIntensity:1.2 }),
  glowBlue: std(0x6aa8ff,{ emissive:0x3a78e8, emissiveIntensity:1.2 }),
  shield: std(0x9fe8ff,{ emissive:0x50b8e0, emissiveIntensity:0.9 }),
};
for (const k in HM) HM[k].userData.shared = true;
function makeHeroWeaponMesh(id){
  const g = new THREE.Group();
  const blade = (h2, mat, w2)=>{
    g.add(bx(w2||0.045, h2, 0.02, mat, 0, 0));                      // Klinge (+Y)
    g.add(bx(0.12,0.03,0.03, M.gold, 0, -0.02));                    // Parierstange
    g.add(cyl(0.018,0.02,0.1, HM.leatherD, 0, -0.13, 0, 6));        // Griff
  };
  if (id==='holzknueppel') g.add(cyl(0.045,0.028,0.32, M.woodDark, 0, -0.1, 0, 6));
  else if (id==='eisenschwert') blade(0.4, M.steel);
  else if (id==='ritterklinge'){ blade(0.5, M.steel, 0.05); g.add(bx(0.04,0.04,0.04, M.banner, 0, -0.2)); }
  else if (id==='stahlklinge'){ blade(0.56, M.stoneLight, 0.045); }
  else if (id==='energieklinge'){
    g.add(bx(0.05,0.5,0.025, HM.energy, 0, 0));
    g.add(bx(0.1,0.04,0.04, PM.laserDark, 0, -0.03));
    g.add(cyl(0.02,0.022,0.12, PM.laserDark, 0, -0.15, 0, 6));
  }
  for (const c of g.children) c.castShadow = false;
  return g;
}
function makeHeroArmorMesh(id){
  const g = new THREE.Group();
  const tier = HERO_ITEMS[id] ? HERO_ITEMS[id].tier : 1;
  const mat = id==='lederwams' ? HM.leather : (tier===2 ? M.steel : (tier===3 ? armorMat : HM.shield));
  g.add(bx(0.22,0.2,0.05, mat, 0, 0.33, 0.105));                    // Brustplatte
  if (tier >= 2) for (const sx of [-1,1]){                          // Schulterplatten
    const sh = mesh(new THREE.SphereGeometry(0.055,6,5), mat, false);
    sh.position.set(sx*0.15, 0.53, 0); sh.scale.y = 0.7; g.add(sh);
  }
  if (tier >= 3) g.add(bx(0.2,0.16,0.04, mat, 0, 0.35, -0.1));      // Rückenplatte
  if (id==='schildgenerator'){                                      // leuchtender Emitter
    const ring = mesh(new THREE.TorusGeometry(0.17,0.02,6,14), HM.shield, false);
    ring.position.y = 0.42; ring.rotation.x = Math.PI/2; g.add(ring);
  }
  for (const c of g.children) c.castShadow = false;
  return g;
}
function makeHeroTrinketMesh(id){
  const mat = id==='gluecksamulett' ? HM.glowGold : (id==='bergmannstalisman' ? HM.glowOrange : HM.glowBlue);
  const m = mesh(new THREE.SphereGeometry(0.032,6,5), mat, false);
  return m;
}
function clearAnchor(a){
  if (!a) return;
  for (let i=a.children.length-1;i>=0;i--){
    const c = a.children[i];
    a.remove(c);
    disposeGroup(c);
    if (c.isMesh && c.geometry && !c.geometry.userData.shared) c.geometry.dispose();
  }
}
function applyHeroEquipVisual(){
  const h = state.hero;
  if (!h) return;
  if (hero && hero.mesh){
    const wpn = hero.mesh.getObjectByName('wpn');
    clearAnchor(wpn);
    if (wpn && h.equip.w){
      const m = makeHeroWeaponMesh(h.equip.w);
      m.position.set(0.02, 0.04, 0.03);
      wpn.add(m);
    }
    const armor = hero.mesh.getObjectByName('armor');
    clearAnchor(armor);
    if (armor && h.equip.a) armor.add(makeHeroArmorMesh(h.equip.a));
    const trk = hero.mesh.getObjectByName('trk');
    clearAnchor(trk);
    if (trk && h.equip.t) trk.add(makeHeroTrinketMesh(h.equip.t));
    // 25b: eingebaute Schulterplatten weichen Rüstungen mit eigenen Schulterstücken
    const hidePld = !!(h.equip.a && HERO_ITEMS[h.equip.a] && HERO_ITEMS[h.equip.a].tier>=2);
    for (const nm of ['pldL','pldR','rimL','rimR']){
      const o = hero.mesh.getObjectByName(nm);
      if (o) o.visible = !hidePld;
    }
  }
  updateEgoHandLook();                   // 25b: Handschuh-Look folgt der Epoche
  // Ego-Hände: Waffe in der Rechten, Rüstungs-Stulpen an beiden Händen
  const wpnE = egoHands.getObjectByName('wpnE');
  clearAnchor(wpnE);
  if (h.equip.w){
    const m = makeHeroWeaponMesh(h.equip.w);
    m.scale.setScalar(0.5);                           // Nähe zur Kamera: klein halten
    m.position.set(0.012, 0.045, -0.07);
    m.rotation.x = -0.95;                             // Klinge zeigt nach vorn-oben
    m.rotation.z = 0.22;                              // leicht zur Bildmitte geneigt
    wpnE.add(m);
  }
  for (const nm of ['armE_L','armE_R']){
    const g2 = egoHands.getObjectByName(nm);
    clearAnchor(g2);
    if (g2 && h.equip.a){
      const it = HERO_ITEMS[h.equip.a];
      const mat = it.tier<=1 ? HM.leather : (it.tier===2 ? M.steel : (it.tier===3 ? armorMat : HM.shield));
      const cuff = mesh(new THREE.BoxGeometry(0.082,0.032,0.06), mat, false, false);
      cuff.position.set(0, 0.036, 0.05);              // schmale Stulpe oben auf der Hand
      g2.add(cuff);
    }
  }
}
function equipHero(slot, id){
  const h = state.hero;
  if (!h || !HERO_ITEMS[id] || HERO_ITEMS[id].slot !== slot) return false;
  const old = h.equip[slot];
  if (old === id) return true;
  if (old && HERO_ITEMS[old]){
    const v = itemValue(old);            // Ersetzen verkauft das alte Stück zum Marktwert
    if (v > 0){
      state.res.gold += v;
      toast('💰 '+HERO_ITEMS[old].name+' zum Marktwert verkauft: +'+v+' 🪙');
    }
  }
  h.equip[slot] = id;
  if (hero){
    const ratio = hero.maxhp > 0 ? clamp(hero.hp/hero.maxhp, 0, 1) : 1;
    hero.maxhp = heroMaxHp();
    hero.hp = Math.min(hero.maxhp, Math.max(hero.hp, Math.round(hero.maxhp*Math.min(ratio,1))));
    applyHeroEquipVisual();
  }
  save();
  return true;
}

// --- Crafting an der Schmiede (sofort; Rabatt über Schmiedekunst; Nuggets zahlen mit) ---
function bestSmithLvl(tier){
  let l = 0;
  for (const bd of state.buildings){
    if (bd.ruin) continue;
    if (bd.t==='schmiede' || (bd.t==='stahlwerk' && tier>=3)) l = Math.max(l, lvlOf(bd));
  }
  return l;
}
function craftDiscount(){
  return state.hero ? Math.min(0.30, 0.04*(state.hero.skills.c-1)) : 0;
}
// 25d: Effektive Freischalt-Stufe = max(Schmiedekunst, Gebäudestufe/3) – eine hohe
// Schmiede kompensiert niedrigen Skill. Der Kosten-RABATT bleibt an der echten
// Schmiedekunst (craftDiscount), damit sich das Schmieden weiter lohnt.
function craftUnlockLvl(tier){
  return Math.max(state.hero ? state.hero.skills.c : 0, Math.floor(bestSmithLvl(tier)/3));
}
function craftCost(id){
  return scaleCost(HERO_ITEMS[id].cost||{}, 1 - craftDiscount());
}
// Gate-Prüfung: null = craftbar, sonst Begründung (Skill/Rathaus/Gebäudestufe)
function craftGate(id){
  const it = HERO_ITEMS[id];
  if (!state.hero) return 'Kein Held rekrutiert';
  if (id==='pfanne' && state.hero.pfanne) return '✔ im Besitz';
  if (it.slot!=='tool' && state.hero.equip[it.slot]===id) return '✔ angelegt';
  if (it.skill && craftUnlockLvl(it.tier) < it.skill)
    return '🔒 Schmiedekunst '+it.skill+' – steigt durchs Schmieden – oder '+
      (it.tier>=3 ? 'Schmiede/Stahlwerk' : 'Schmiede')+'-Stufe '+(it.skill*3);
  // Amulette: Dungeon-Rezeptfund (24c) schaltet vor dem Rathaus-Gate frei
  if (it.req && rathausLvl() < it.req &&
      !(it.slot==='t' && state.hero.rezepte && state.hero.rezepte[id]))
    return '🔒 Rathaus '+it.req;
  // Gebäudestufe ≥ Tier·3 (Goldpfanne: jede intakte Schmiede reicht – Tutorial-Craft)
  const need = id==='pfanne' ? 1 : it.tier*3;
  if (bestSmithLvl(it.tier) < need)
    return '🔒 '+(it.tier>=3 ? 'Schmiede/Stahlwerk' : 'Schmiede')+' Stufe '+need;
  return null;
}
function canPayCraft(c){
  for (const k in c) if (k!=='gold' && state.res[k] < c[k]) return false;
  return state.res.gold + bagNuggetValue() >= (c.gold||0);
}
function payCraft(c){
  for (const k in c) if (k!=='gold') state.res[k] -= c[k];
  let g = c.gold||0;
  // Nuggets zuerst als Zahlungsmittel (1:1 zum Goldwert), Rest in Gold
  for (const s of state.hero.bag){
    if (g <= 0 || (s.t!=='nugget' && s.t!=='wnugget')) continue;
    const val = BAG_ITEMS[s.t].gold;
    let use = Math.min(s.n, Math.floor(g/val));
    if (use*val < g && g - use*val > state.res.gold && use < s.n) use++;   // Restgold fehlt → 1 Nugget drauf
    if (use > 0){ s.n -= use; g = Math.max(0, g - use*val); }
  }
  state.hero.bag = state.hero.bag.filter(s=>s.n>0);
  state.res.gold -= g;
}
function craftHero(id){
  const it = HERO_ITEMS[id];
  if (!it || !it.cost) return false;
  const why = craftGate(id);
  if (why){ toast('🔨 '+it.name+': '+why); return false; }
  const c = craftCost(id);
  if (!canPayCraft(c)){ toast('Nicht genug Rohstoffe für '+it.name+'.'); return false; }
  payCraft(c);
  giveHeroExp('c', 25*it.tier);
  if (id==='pfanne'){
    state.hero.pfanne = 1;
    toast('🥄 Goldpfanne geschmiedet – halte am Ufer nach glitzernden Kiesbänken Ausschau!', 5200);
  } else {
    equipHero(it.slot, id);
    toast('🔨 '+it.name+' geschmiedet und angelegt!');
  }
  snd(340,0.1,'square',0.04); snd(520,0.14,'triangle',0.05);
  save();
  return true;
}
function openCraftSheet(bd){
  const h = state.hero;
  if (!h) return;
  // 25d: Der Kopf nennt beide Freischalt-Wege – Schmiedekunst UND Gebäudestufe
  $('ipName').textContent = '🔨 '+BT[bd.t].name+' · Crafting (Schmiedekunst '+h.skills.c+
    ' · Werkstatt-Stufe '+lvlOf(bd)+')';
  $('ipDesc').textContent = 'Freigeschaltet wird über Schmiedekunst ODER Werkstatt-Stufe '+
    '(je 3 Stufen = 1 Schmiedekunst) – es zählt der höhere Wert. Rabatt '+
    Math.round(craftDiscount()*100)+' % kommt allein von der Schmiedekunst, die mit jedem '+
    'geschmiedeten Stück steigt. Nuggets im Beutel zahlen mit (Gegenwert in Gold).';
  $('ipStats').textContent = equipLabel('w')+' · '+equipLabel('a')+' · '+equipLabel('t')+
    (h.pfanne ? ' · 🥄 Goldpfanne' : '');
  const btns = $('ipBtns'); btns.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'max-height:36vh;overflow-y:auto;margin-top:4px;padding-right:2px';
  for (const id of CRAFT_ORDER){
    const it = HERO_ITEMS[id];
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:5px;'+
      'padding-top:5px;border-top:1px solid rgba(255,255,255,.1)';
    const lab = document.createElement('div');
    lab.style.cssText = 'flex:1;font-size:12.5px;color:#cfe0f0';
    const eff = it.dmg ? '💥 '+it.dmg : (it.hp ? '+'+it.hp+' ❤️' : (it.fx||''));
    lab.textContent = it.name+' · '+eff;
    row.appendChild(lab);
    const why = craftGate(id);
    if (why){
      const st2 = document.createElement('div');
      // 25d: Gate-Texte nennen beide Wege (Skill ODER Gebäudestufe) → dürfen umbrechen
      st2.style.cssText = 'font-size:11.5px;color:'+(why[0]==='✔' ? '#9fd8a8' : '#9aa7bb')+
        ';flex-shrink:0;max-width:56%;text-align:right';
      st2.textContent = why;
      row.appendChild(st2);
    } else {
      const c = craftCost(id);
      const b2 = document.createElement('button');
      b2.className = 'btn-green';
      b2.style.cssText = 'margin:0;flex-shrink:0;font-size:12px;padding:8px 10px';
      b2.textContent = Object.entries(c).map(([k,v])=>COSTICON[k]+v).join(' ');
      if (!canPayCraft(c)){ b2.disabled = true; b2.style.opacity = '0.45'; }
      else b2.addEventListener('click', ()=>{ if (craftHero(id)) openCraftSheet(bd); });
      row.appendChild(b2);
    }
    wrap.appendChild(row);
  }
  btns.appendChild(wrap);
  ui.info.style.display = 'block';
}

// --- Helden-Handel am Markt (±1,5 %/Stufe + Händlersiegel; Klemme buy ≥ sell·1,05) ---
function heroTradeBonus(){
  const h = state.hero ? state.hero.skills.h : 1;
  return Math.min(0.135, 0.015*(h-1)) + (heroTrinket('haendlersiegel') ? 0.02 : 0);
}
function heroSellRate(bd,k){ return sellRate(bd,k)*(1 + heroTradeBonus()); }
function heroBuyRate(bd,k){
  const b = buyRate(bd,k)*(1 - heroTradeBonus());
  return Math.max(b, heroSellRate(bd,k)*1.05);       // HARTE Invariante: kein Perpetuum mobile
}
function openHeroTrade(bd){
  const h = state.hero;
  if (!h) return;
  $('ipName').textContent = '🤝 Markt · Heldenhandel (Handel '+h.skills.h+')';
  $('ipDesc').textContent = 'Kurs-Bonus ±'+(heroTradeBonus()*100).toFixed(1)+
    ' % durch Handels-Geschick'+(heroTrinket('haendlersiegel') ? ' und Händlersiegel' : '')+
    ' – jede Transaktion schult den Handel (1 EXP je 25 🪙 Umsatz).';
  $('ipStats').textContent = '🪙 '+fmt(state.res.gold)+' · 🎒 '+bagCount()+'/'+heroCapacity();
  const btns = $('ipBtns'); btns.innerHTML = '';
  buildMarketTabs(btns, ()=>openHeroTrade(bd));
  if (marktTab === 'gear'){
    buildGearShop(btns, ()=>openHeroTrade(bd));
  } else {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-top:6px';
  for (const k of ['holz','stein','nahrung','erz','eisen']){
    const s = document.createElement('button');
    s.className = 'btn-blue';
    s.style.cssText = 'padding:6px 8px;font-size:12px;margin:0';
    s.textContent = COSTICON[k]+'50 → 🪙'+Math.round(50*heroSellRate(bd,k));
    s.addEventListener('click', ()=>{
      if (state.res[k] < 50){ toast('Nicht genug '+COSTICON[k]+' zum Verkaufen.'); return; }
      const v = Math.round(50*heroSellRate(bd,k));
      state.res[k] -= 50; state.res.gold += v;
      giveHeroExp('h', v/25);
      questNotify('umsatz', v);          // 24d: Handels-Umsatz-Quest zählt nur Helden-Handel
      snd(600,0.08,'triangle',0.04); openHeroTrade(bd); save();
    });
    const bb = document.createElement('button');
    bb.className = 'btn-green';
    bb.style.cssText = 'padding:6px 8px;font-size:12px;margin:0';
    bb.textContent = '🪙'+Math.ceil(50*heroBuyRate(bd,k))+' → '+COSTICON[k]+'50';
    bb.addEventListener('click', ()=>{
      const cost = Math.ceil(50*heroBuyRate(bd,k));
      if (state.res.gold < cost){ toast('Nicht genug Gold zum Einkaufen.'); return; }
      state.res.gold -= cost; state.res[k] += 50;
      giveHeroExp('h', cost/25);
      questNotify('umsatz', cost);
      snd(700,0.08,'triangle',0.04); openHeroTrade(bd); save();
    });
    wrap.appendChild(s); wrap.appendChild(bb);
  }
  btns.appendChild(wrap);
  }
  if (bagCount() > 0){
    const eb = document.createElement('button');
    eb.className = 'btn-blue';
    eb.textContent = '🎒 Beutel leeren (+'+Math.round(bagValue())+' 🪙)';
    eb.addEventListener('click', ()=>{ emptyBag(); openHeroTrade(bd); });
    btns.appendChild(eb);
  }
  ui.info.style.display = 'block';
}

// --- Ausrüstungs-Händler am Markt (Etappe 25a): Kaufen statt Craften ---
// Bequemer, aber teurer als Schmieden: Ressourcen zum Markt-EINKAUFSWERT (TRADE_VAL·1,5)
// plus Händler-Aufschlag – der Schmiedekunst-Weg bleibt dadurch immer der günstigere.
function heroShopMarkup(){
  const h = state.hero ? state.hero.skills.h : 1;
  return Math.max(0.15, 0.25 - 0.01*(h-1));    // 25 % Aufschlag, −1 pp je Handels-Stufe
}
// Gate wie beim Craften (Rathaus-Stufe, Amulett-Rezepte), aber OHNE Schmiede-Anforderung.
// null = kaufbar · '✔ …' = schon im Besitz (sichtbar) · '🔒 …' = verborgen (Baumenü-Prinzip)
function heroShopGate(id){
  const it = HERO_ITEMS[id];
  if (!it || !it.cost) return '🔒 nicht handelbar';
  if (!state.hero) return '🔒 Kein Held rekrutiert';
  if (it.req && rathausLvl() < it.req &&
      !(it.slot==='t' && state.hero.rezepte && state.hero.rezepte[id]))
    return '🔒 Rathaus '+it.req;
  if (id==='pfanne' && state.hero.pfanne) return '✔ im Besitz';
  if (it.slot!=='tool' && state.hero.equip[it.slot]===id) return '✔ angelegt';
  return null;
}
function heroShopList(){
  return CRAFT_ORDER.filter(id=>{ const w = heroShopGate(id); return !w || w[0]==='✔'; });
}
function heroShopPrice(id){
  const it = HERO_ITEMS[id];
  if (!it || !it.cost) return 0;
  let v = 0;
  for (const k in it.cost)
    v += k==='gold' ? it.cost[k]
       : it.cost[k]*(TRADE_VAL[k]!==undefined ? TRADE_VAL[k] : (GOLD_VAL[k]||1))*1.5;
  return Math.max(5, Math.round(v*(1+heroShopMarkup())/5)*5);   // auf 5 🪙 gerundet
}
function buyHeroItem(id){
  const it = HERO_ITEMS[id];
  if (!it || !it.cost) return false;
  const why = heroShopGate(id);
  if (why){ toast('⚔️ '+it.name+': '+why.replace('🔒 ','noch nicht im Angebot – ')); return false; }
  const p = heroShopPrice(id);
  if (state.res.gold < p){ toast('Nicht genug Gold für '+it.name+' ('+p+' 🪙).'); return false; }
  state.res.gold -= p;
  giveHeroExp('h', p/25);                  // Kauf ist Helden-Handel: 1 EXP je 25 🪙 Umsatz
  questNotify('umsatz', p);
  if (id==='pfanne'){
    state.hero.pfanne = 1;
    toast('🥄 Goldpfanne gekauft – halte am Ufer nach glitzernden Kiesbänken Ausschau!', 5200);
  } else {
    equipHero(it.slot, id);                // sofort angelegt; Alt-Teil geht zum Marktwert in Zahlung
    toast('⚔️ '+it.name+' gekauft und angelegt! (−'+p+' 🪙)');
  }
  snd(700,0.08,'triangle',0.04); snd(920,0.1,'triangle',0.04);
  save();
  return true;
}
// Zwei Markt-Tabs (Waren | Ausrüstung) – gemerkt, damit ein Re-Render nach Kauf im Tab bleibt
let marktTab = 'waren';
function buildMarketTabs(btns, rerender){
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;margin-top:6px';
  for (const [key,label] of [['waren','🧺 Waren'],['gear','⚔️ Ausrüstung']]){
    const tb = document.createElement('button');
    tb.className = 'bmtab'+(marktTab===key ? ' sel' : '');
    tb.style.cssText = 'flex:1;margin:0;padding:8px 10px';
    tb.dataset.mtab = key;
    tb.textContent = label;
    tb.addEventListener('click', ()=>{ if (marktTab !== key){ marktTab = key; rerender(); } });
    row.appendChild(tb);
  }
  btns.appendChild(row);
}
function buildGearShop(btns, rerender){
  if (!state.hero){
    const note = document.createElement('div');
    note.style.cssText = 'font-size:12.5px;color:#9aa7bb;margin-top:8px';
    note.textContent = '⚔️ Der Händler wartet auf Kundschaft – rekrutiere zuerst einen Helden in der Heldenhalle.';
    btns.appendChild(note);
    return;
  }
  const wrap = document.createElement('div');
  // Im Ego lassen die schwebenden Aktions-Knöpfe (🎒/⛏️) rechts sonst keine Tap-Fläche
  wrap.style.cssText = 'max-height:34vh;overflow-y:auto;margin-top:2px;padding-right:'+
    (egoMode ? '72px' : '2px');
  const note = document.createElement('div');
  note.style.cssText = 'font-size:11.5px;color:#9aa7bb;margin-top:4px';
  note.textContent = 'Sofort kaufen & anlegen – ohne Schmiede, dafür +'+
    Math.round(heroShopMarkup()*100)+' % Aufschlag (Handels-Geschick senkt ihn). '+
    'Selber schmieden bleibt günstiger.';
  wrap.appendChild(note);
  for (const id of heroShopList()){
    const it = HERO_ITEMS[id];
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:5px;'+
      'padding-top:5px;border-top:1px solid rgba(255,255,255,.1)';
    const lab = document.createElement('div');
    lab.style.cssText = 'flex:1;font-size:12.5px;color:#cfe0f0';
    const eff = it.dmg ? '💥 '+it.dmg : (it.hp ? '+'+it.hp+' ❤️' : (it.fx||''));
    lab.textContent = it.name+' · '+eff;
    row.appendChild(lab);
    const why = heroShopGate(id);
    if (why){
      const st2 = document.createElement('div');
      st2.style.cssText = 'font-size:11.5px;color:#9fd8a8;flex-shrink:0';
      st2.textContent = why;
      row.appendChild(st2);
    } else {
      const p = heroShopPrice(id);
      const b2 = document.createElement('button');
      b2.className = 'btn-green';
      b2.dataset.buy = id;
      b2.style.cssText = 'margin:0;flex-shrink:0;font-size:12.5px;padding:8px 12px;min-height:44px';
      b2.textContent = '💰 '+p+' 🪙';
      if (state.res.gold < p){ b2.disabled = true; b2.style.opacity = '0.45'; }
      else b2.addEventListener('click', ()=>{ if (buyHeroItem(id)) rerender(); });
      row.appendChild(b2);
    }
    wrap.appendChild(row);
  }
  btns.appendChild(wrap);
}

// --- Beutel-Sheet (🎒-Button im Ego) ---
function showBagSheet(){
  const h = state.hero;
  if (!h) return;
  $('ipName').textContent = '🎒 Beutel ('+bagCount()+'/'+heroCapacity()+')';
  $('ipDesc').textContent = 'Nuggets, Edelsteine und Felle. Leeren am Markt, Rathaus oder in der '+
    'Heldenhalle wandelt alles zu Gold – Nuggets zahlen auch direkt an der Schmiede.';
  $('ipStats').textContent = h.bag.length
    ? h.bag.map(s=>BAG_ITEMS[s.t].icon+' '+BAG_ITEMS[s.t].name+' ×'+s.n).join(' · ')+
      ' · Wert '+Math.round(bagValue())+' 🪙'
    : 'Der Beutel ist leer.'+(h.pfanne ? '' : ' Schmiede zuerst eine 🥄 Goldpfanne.');
  const btns = $('ipBtns'); btns.innerHTML = '';
  const inf = document.createElement('div');
  inf.style.cssText = 'font-size:12px;color:#cfe0f0;margin-top:4px';
  inf.textContent = equipLabel('w')+' · '+equipLabel('a')+' · '+equipLabel('t')+(h.pfanne?' · 🥄':'');
  btns.appendChild(inf);
  if (h.bag.length){
    const near = nearDeliverBuilding();
    if (near){
      const eb = document.createElement('button');
      eb.className = 'btn-green';
      eb.textContent = '🎒 Beutel leeren (+'+Math.round(bagValue())+' 🪙)';
      eb.addEventListener('click', ()=>{ emptyBag(); showBagSheet(); });
      btns.appendChild(eb);
    } else {
      const note = document.createElement('div');
      note.style.cssText = 'font-size:12px;color:#9aa7bb;margin-top:5px';
      note.textContent = 'Zum Leeren: Markt, Rathaus oder Heldenhalle aufsuchen.';
      btns.appendChild(note);
    }
  }
  ui.info.style.display = 'block';
}

// --- Schürf-Spots: seed-deterministisch, Kiesbank-Optik, Erschöpfung + Sofort-Ersatz ---
const mineGroup = new THREE.Group(); scene.add(mineGroup);
let mineGlitter = [];
let mining = null;                       // { spot, t, dur, auto }
function findMineSpotTile(isleIdx, ctr){
  const I = ISLES[isleIdx];
  if (!I) return null;
  const rng = mulberry32((state.seed ^ 0x9d2c17) + isleIdx*131071 + ctr*8191);
  for (let tries=0;tries<400;tries++){
    const a = rng()*Math.PI*2, r = rng()*I.r*1.15;
    const x = Math.round(I.x + Math.cos(a)*r), y = Math.round(I.y + Math.sin(a)*r);
    if (!inMap(x,y) || tiles[idx(x,y)]!==1) continue;               // Sand-/Uferkachel
    const k = idx(x,y);
    if (occ[k] || aiOcc[k] || treeMap[k] || rockMap[k]) continue;
    if (isleParent[isleId[k]] !== isleIdx) continue;                // richtige Ursprungs-Insel
    if (!walkable(x,y,false)) continue;
    if (![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>
      inMap(x+dx,y+dy) && tiles[idx(x+dx,y+dy)]===0)) continue;     // direkt am Wasser
    if ((state.mineSpots||[]).some(s=>dist(s.x,s.y,x,y) < 3)) continue;
    return [x,y];
  }
  return null;
}
function genMineSpots(){
  state.mineSpots = [];
  state.mineCtr = {};
  for (let i=0;i<ISLES.length;i++){
    const rng = mulberry32((state.seed ^ 0x51ab77) + i*7919);
    const n = i===0 ? 3 : 2 + Math.floor(rng()*3);                  // Heimatinsel 3, sonst 2–4
    let placed = 0, c = 0;
    for (; c < n*8 && placed < n; c++){
      const t2 = findMineSpotTile(i, c);
      if (t2){ state.mineSpots.push({ x:t2[0], y:t2[1], isle:i, left:40, found:0 }); placed++; }
    }
    state.mineCtr[i] = c + 100;          // Fortsetzungszähler für deterministische Ersatz-Spots
  }
}
function rebuildMineMeshes(){
  disposeGroup(mineGroup);
  mineGlitter = [];
  for (const s of (state.mineSpots||[])){
    if (s.left <= 0) continue;
    const g = new THREE.Group();
    const rng = mulberry32(s.x*73 + s.y*151);
    for (let i=0;i<5;i++){                                          // helle Kiesel
      const p = mesh(new THREE.IcosahedronGeometry(0.08+rng()*0.05,0), M.stoneLight, false, true);
      p.position.set((rng()-0.5)*1.1, 0.02, (rng()-0.5)*1.1);
      p.scale.y = 0.5; g.add(p);
    }
    const nug = mesh(new THREE.IcosahedronGeometry(0.07,0), M.gold, false, false);
    nug.position.set((rng()-0.5)*0.6, 0.05, (rng()-0.5)*0.6);
    g.add(nug);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map:puffTex, color:0xffd736,
      transparent:true, opacity:0.8, depthWrite:false }));
    gl.position.y = 0.32; gl.scale.setScalar(0.5);
    g.add(gl);
    g.position.set(wx(s.x), Math.max(hAt(s.x,s.y),0)+0.02, wz(s.y));
    mineGroup.add(g);
    mineGlitter.push({ spr:gl, ph:(s.x*3+s.y)%7 });
  }
}
// Nach genMap/buildWorld und Terraforming: Spots validieren + Optik neu aufbauen
function initMineSpots(){
  if (!state) return;
  if (!Array.isArray(state.mineSpots)) genMineSpots();
  if (!state.mineCtr) state.mineCtr = {};
  for (let i=state.mineSpots.length-1;i>=0;i--){                    // Kachel geflutet → Ersatz
    const s = state.mineSpots[i];
    if (inMap(s.x,s.y) && tiles[idx(s.x,s.y)] !== 0) continue;
    state.mineSpots.splice(i,1);
    state.mineCtr[s.isle] = (state.mineCtr[s.isle]||0) + 1;
    const t2 = findMineSpotTile(s.isle, state.mineCtr[s.isle]);
    if (t2) state.mineSpots.push({ x:t2[0], y:t2[1], isle:s.isle, left:s.left, found:0 });
  }
  rebuildMineMeshes();
}
function exhaustSpot(s){
  const i = state.mineSpots.indexOf(s);
  if (i >= 0) state.mineSpots.splice(i,1);
  if (mining && mining.spot === s) mining = null;
  state.mineCtr[s.isle] = (state.mineCtr[s.isle]||0) + 1;
  const t2 = findMineSpotTile(s.isle, state.mineCtr[s.isle]);       // Sofort-Ersatz, gleiche Insel
  if (t2) state.mineSpots.push({ x:t2[0], y:t2[1], isle:s.isle, left:40, found:0 });
  rebuildMineMeshes();
  toast('⛏️ Die Kiesbank ist erschöpft – anderswo am Ufer glitzert es neu!', 3400);
  save();
}
function mineDur(auto){
  let d = Math.max(1.8, 4*(1 - 0.07*(state.hero.skills.s - 1)));
  if (heroTrinket('bergmannstalisman')) d *= 0.8;
  return auto ? d/0.3 : d;               // Auto-Modus: 30 % der manuellen Rate
}
// Eine Schürfrunde gutschreiben (auch DBG.mineOnce); false = Beutel voll
function mineRound(spot, auto){
  const h = state.hero;
  if (!h || !spot || spot.left <= 0) return false;
  const gem = h.skills.s >= 5 && Math.random() < 0.10;
  const wueste = (isleBiome[isleOf(spot.x,spot.y)]||'wiese') === 'wueste';
  const t2 = gem ? 'gem' : (wueste ? 'wnugget' : 'nugget');
  if (!bagAdd(t2, 1)) return false;
  giveHeroExp('s', auto ? 2.5 : 5);      // Nugget = 5 EXP, Auto 50 %
  if (!auto) questNotify('mine', 1);     // 24d: nur frisch (manuell) Geschürftes zählt
  spawnBurst(wx(spot.x), Math.max(hAt(spot.x,spot.y),0)+0.4, wz(spot.y), 4, gem ? 0x9fd4ff : 0xffd736);
  snd(gem ? 880 : 640, 0.07, 'triangle', 0.03);
  spot.left--;
  if (spot.left <= 0) exhaustSpot(spot);
  return t2;
}
function updateMining(dt){
  const ring = $('egoRing');
  if (!mining || !heroAlive()){
    if (mining && !heroAlive()) mining = null;
    ring.style.display = 'none';
    return;
  }
  const s = mining.spot;
  // Failsafes: Spot weg/erschöpft, Held segelt/entfernt sich, manuelle Bewegung bricht ab
  if (!(state.mineSpots||[]).includes(s) || s.left <= 0 || hero.sail ||
      dist(hero.x,hero.y,s.x,s.y) > 2.6 || (!mining.auto && hero.moving)){
    mining = null; ring.style.display = 'none';
    return;
  }
  if (bagCount() >= heroCapacity()){
    if (!mining.auto) toast('🎒 Beutel voll – leere ihn am Markt, Rathaus oder in der Heldenhalle!', 3600);
    mining = null; ring.style.display = 'none';
    return;
  }
  mining.t += dt;
  if (Math.random() < dt*1.6)
    spawnBurst(wx(s.x), Math.max(hAt(s.x,s.y),0)+0.25, wz(s.y), 1, 0xffe08a);
  if (mining.t >= mining.dur){
    mining.t = 0;
    mineRound(s, mining.auto);
    if (mining) mining.dur = mineDur(mining.auto);      // Skill kann gestiegen sein
  }
  // Fortschrittsring um den Primär-Button (nur manuell im Ego)
  if (egoMode && mining && !mining.auto){
    ring.style.display = 'block';
    ring.style.background = 'conic-gradient(#ffd736 ' +
      Math.round(clamp(mining.t/mining.dur,0,1)*360) + 'deg, rgba(255,255,255,.16) 0deg)';
  } else ring.style.display = 'none';
}

// --- Kegel-Zielsuche auf Wildtiere + Kontextlogik des Primär-Buttons ---
function egoTargetWild(){
  if (!heroAlive()) return null;
  let best = null, bd2 = 2.51;
  for (const a of wildlife){
    const d = dist(hero.x,hero.y,a.x,a.y);
    if (d >= bd2) continue;
    const an = Math.atan2(a.y-hero.y, a.x-hero.x);
    const da = Math.atan2(Math.sin(an-egoYaw), Math.cos(an-egoYaw));
    if (Math.abs(da) > 35*Math.PI/180) continue;
    bd2 = d; best = a;
  }
  return best;
}
function egoMineTarget(){
  // 24f: reine Distanzprüfung statt Blick-Kegel – eine Kiesbank ist eine Bodenstelle,
  // die in Third-Person leicht außerhalb des ±35°-Yaw-Kegels liegt (Pitch zählt ohnehin nie)
  let best = null, bd2 = 2.51;
  for (const s of (state.mineSpots||[])){
    if (s.left <= 0) continue;
    const d = dist(hero.x,hero.y,s.x,s.y);
    if (d >= bd2) continue;
    bd2 = d; best = s;
  }
  return best;
}
function nearestInteractBuilding(types){
  let best = null, bd2 = 1e9;
  for (const bd of state.buildings){
    if (bd.ruin || !types.includes(bd.t)) continue;
    const c = buildingCenter(bd);
    const d = dist(hero.x,hero.y,c[0],c[1]) - (BT[bd.t].w-1)*0.7;
    if (d > 2.5 || d >= bd2) continue;
    const an = Math.atan2(c[1]-hero.y, c[0]-hero.x);
    const da = Math.atan2(Math.sin(an-egoYaw), Math.cos(an-egoYaw));
    if (Math.abs(da) > 35*Math.PI/180 && d > 0.9) continue;
    bd2 = d; best = bd;
  }
  return best;
}
// Priorität: Gegner > Dungeon > Wildtier > Schürf-Spot > Schmiede/Markt/Hafen
function egoContext(){
  if (!heroAlive() || hero.sail) return null;
  if (dungeon) return dungeonContext();  // Unterwelt hat eigene Ziele (Gegner/Truhe/Hebel/Portal)
  const e = egoTargetEnemy();
  if (e) return { act:'attack', icon:'⚔️', target:e };
  const dp = egoPortalTarget();
  if (dp) return { act:'dungeon', icon:'🕳️', target:dp };
  // 24d: 📜 Tafel/❗ Bürger zwischen Dungeon und Markt/Schmiede/Spot
  const cz = egoTargetCitizen();
  if (cz) return { act:'citizen', icon:'💬', target:cz };
  if (questsUnlocked()){
    const th = nearestInteractBuilding(['rathaus']);
    if (th) return { act:'tafel', icon:'📜', target:th };
  }
  const w = egoTargetWild();
  if (w) return { act:'hunt', icon:'⚔️', target:w };
  // 24f: Spot in Reichweite IMMER anbieten – ohne Pfanne ausgegraut (Tap erklärt, was fehlt)
  const s = egoMineTarget();
  if (s) return state.hero.pfanne
    ? { act:'mine', icon:'⛏️', target:s }
    : { act:'mineNo', icon:'⛏️', target:s, disabled:1 };
  const sm = nearestInteractBuilding(['schmiede','stahlwerk']);
  if (sm) return { act:'smith', icon:'🔨', target:sm };
  const mk = nearestInteractBuilding(['markt']);
  if (mk) return { act:'trade', icon:'🤝', target:mk };
  const hf = nearestInteractBuilding(['hafen']);
  if (hf) return { act:'sail', icon:'⛵', target:hf };
  return null;
}
// Primär-Aktion: führt die Kontextaktion des Fadenkreuz-Ziels aus
function egoAction(){
  if (!egoMode || !heroAlive() || hero.sail) return false;
  const c = egoContext();
  if (!c) return false;
  if (c.act==='attack' || c.act==='hunt') return heroAttack();
  if (c.act==='dungeon') return enterDungeon(c.target.isle);
  if (c.act==='chest') return openDungeonChest();
  if (c.act==='lever') return pullLever();
  if (c.act==='dexit') return exitDungeon();
  if (c.act==='mineNo'){                   // 24f: Spot ohne Pfanne angetippt → erklären statt schweigen
    toast(PFANNE_HINT, 4600);
    snd(240,0.08,'triangle',0.03);
    return true;
  }
  if (c.act==='mine'){
    if (mining){ mining = null; toast('⛏️ Schürfen abgebrochen.'); return true; }
    mining = { spot:c.target, t:0, dur:mineDur(false), auto:false };
    hero.dir = Math.atan2(c.target.y-hero.y, c.target.x-hero.x);
    snd(500,0.06,'square',0.03);
    return true;
  }
  if (c.act==='smith'){ openCraftSheet(c.target); return true; }
  if (c.act==='trade'){ openHeroTrade(c.target); return true; }
  if (c.act==='sail'){ openSailPick(); return true; }
  if (c.act==='citizen'){ openCitizenDialog(c.target); return true; }
  if (c.act==='tafel'){ openQuestSheet(); return true; }
  return false;
}

// --- Hafen-Übersetzen im Ego: Ziel-Insel auf der Minimap wählen, startSail-Mechanik ---
let sailPick = null;
function openSailPick(){
  sailPick = 1;
  openMap();
  toast('⛵ Tippe die ZIEL-Insel auf der Karte an!', 4200);
}
function egoSailTo(tx,ty){
  if (!heroAlive() || hero.sail) return false;
  const land = findLanding(Math.round(tx), Math.round(ty));
  const ti = isleOf(land[0], land[1]);
  if (!ti || ti === isleOf(hero.x,hero.y)){
    toast('⛵ Wähle eine ANDERE Insel als Ziel.');
    return false;
  }
  mining = null;
  startSail(hero, land[0], land[1]);
  toast('⛵ Ablegen! Der Held setzt über – die Kamera folgt dem Boot.', 3600);
  snd(300,0.2,'triangle',0.05);
  return true;
}

// ============================== WILDTIERE (Etappe 24b, Quest-Anhang 12.2-B) ==============================
// Neutrale eigene Liste: 2 Arten je Biom (Flucht/Wehr), sparsame Spawns fern der Stadt.
// Nicht gespeichert – der Spawner füllt die Caps nach dem Laden wieder auf.
const WILD_ARTS = {
  hase:        { name:'🐰 Hase',         biome:'wiese',  flee:1, hp:12, dmg:0,  sp:2.6, loot:{nahrung:4} },
  wildschwein: { name:'🐗 Wildschwein',  biome:'wiese',  flee:0, hp:55, dmg:7,  sp:1.6, loot:{nahrung:10, fell:1} },
  hirsch:      { name:'🦌 Hirsch',       biome:'wald',   flee:1, hp:30, dmg:0,  sp:2.8, loot:{nahrung:8, fell:1} },
  wolf:        { name:'🐺 Wolf',         biome:'wald',   flee:0, hp:45, dmg:9,  sp:2.2, loot:{nahrung:2, fell:1} },
  schneehase:  { name:'🐇 Schneehase',   biome:'schnee', flee:1, hp:12, dmg:0,  sp:2.6, loot:{nahrung:4} },
  schneewolf:  { name:'🐺 Schneewolf',   biome:'schnee', flee:0, hp:60, dmg:11, sp:2.2, loot:{fell:2} },
  wuestenfuchs:{ name:'🦊 Wüstenfuchs',  biome:'wueste', flee:1, hp:20, dmg:0,  sp:2.7, loot:{nahrung:3, fell:1} },
  skorpion:    { name:'🦂 Skorpion',     biome:'wueste', flee:0, hp:50, dmg:12, sp:1.4, loot:{chitin:1} },
  aschekaefer: { name:'🪲 Aschekäfer',   biome:'vulkan', flee:1, hp:25, dmg:0,  sp:1.8, loot:{erz:3} },
  glutechse:   { name:'🦎 Glutechse',    biome:'vulkan', flee:0, hp:70, dmg:14, sp:1.8, loot:{glut:1} },
};
const WILD_CAP_GLOBAL = 28;
let wildlife = [];
let wildSpawnT = 10;                     // erster Schub kurz nach Start, danach 45-s-Takt
const WM = {
  wolf: std(0x9aa0a8), wolfD: std(0x6e747d), white: std(0xe9eef4),
  hase: std(0xb99a76), fox: std(0xc8763a), boar: std(0x54402c), boarD: std(0x3a2d1e),
  scorp: std(0xa07840), beetle: std(0x3c3c46), lizard: std(0xb85038),
};
for (const k in WM) WM[k].userData.shared = true;
// Billige Vierbeiner (Varianten des Rentier-Prinzips); castShadow aus (Budget!)
function quadruped(bodyMat, legMat, s, o){
  o = o||{};
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(0.42,0.22,0.2), bodyMat, false);
  body.position.y = 0.3; g.add(body);
  const head = mesh(new THREE.BoxGeometry(0.14,0.15,0.13), bodyMat, false);
  head.position.set(0.26,0.44,0); g.add(head);
  if (o.snout){
    const sn = mesh(new THREE.BoxGeometry(0.09,0.07,0.08), legMat, false);
    sn.position.set(0.34,0.4,0); g.add(sn);
  }
  for (const [lx,lz] of [[-0.14,-0.06],[-0.14,0.06],[0.14,-0.06],[0.14,0.06]]){
    const leg = mesh(new THREE.BoxGeometry(0.05,0.2,0.05), legMat, false);
    leg.position.set(lx,0.1,lz); g.add(leg);
  }
  if (o.ears) for (const sz of [-1,1]){
    const e = mesh(new THREE.BoxGeometry(0.03,o.ears,0.045), bodyMat, false);
    e.position.set(0.24,0.55,sz*0.045); g.add(e);
  }
  if (o.tail){
    const t2 = mesh(new THREE.BoxGeometry(o.tail,0.05,0.05), bodyMat, false);
    t2.position.set(-0.25,0.35,0); t2.rotation.z = 0.45; g.add(t2);
  }
  if (o.antler) for (const sz of [-1,1]){
    const a1 = mesh(new THREE.BoxGeometry(0.02,0.16,0.02), M.antler, false);
    a1.position.set(0.23,0.58,sz*0.05); a1.rotation.z = -0.3; a1.rotation.x = sz*0.5; g.add(a1);
  }
  g.scale.setScalar(s);
  return g;
}
function makeWild(art){
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const inner = new THREE.Group();
  inner.rotation.y = -Math.PI/2;         // Modelle zeigen +X → syncUnit erwartet +Z
  g.add(inner);
  let m = null;
  if (art==='hase')             m = quadruped(WM.hase, WM.hase, 0.5, { ears:0.12, tail:0.06 });
  else if (art==='schneehase')  m = quadruped(WM.white, WM.white, 0.5, { ears:0.12, tail:0.06 });
  else if (art==='hirsch')      m = quadruped(M.deer, M.deerDark, 1.1, { snout:1, antler:1, tail:0.08 });
  else if (art==='wolf')        m = quadruped(WM.wolf, WM.wolfD, 0.92, { ears:0.06, snout:1, tail:0.16 });
  else if (art==='schneewolf')  m = quadruped(WM.white, WM.wolfD, 1.02, { ears:0.06, snout:1, tail:0.16 });
  else if (art==='wildschwein') m = quadruped(WM.boar, WM.boarD, 0.95, { snout:1 });
  else if (art==='wuestenfuchs')m = quadruped(WM.fox, WM.fox, 0.68, { ears:0.1, snout:1, tail:0.2 });
  else if (art==='skorpion'){
    m = new THREE.Group();
    m.add(bx(0.4,0.12,0.26, WM.scorp, 0, 0.06));
    for (const sz of [-1,1]) m.add(bx(0.14,0.08,0.09, WM.scorp, 0.26, 0.08, sz*0.14));  // Scheren
    const tail = bx(0.26,0.07,0.07, WM.scorp, -0.28, 0.2);
    tail.rotation.z = -0.7; m.add(tail);
    m.add(bx(0.07,0.09,0.07, WM.boarD, -0.4, 0.3));                                     // Stachel
  }
  else if (art==='aschekaefer'){
    m = new THREE.Group();
    const dome = mesh(new THREE.SphereGeometry(0.2,7,5,0,Math.PI*2,0,Math.PI/2), WM.beetle, false);
    dome.scale.set(1.25,0.8,1); dome.position.y = 0.05; m.add(dome);
    m.add(bx(0.1,0.08,0.14, WM.boarD, 0.24, 0.02));
  }
  else { // glutechse
    m = new THREE.Group();
    m.add(bx(0.5,0.11,0.18, WM.lizard, 0, 0.03));
    m.add(bx(0.14,0.09,0.12, WM.lizard, 0.3, 0.04));
    const tail = bx(0.3,0.06,0.08, WM.lizard, -0.36, 0.04);
    tail.rotation.y = 0.3; m.add(tail);
    m.add(bx(0.16,0.03,0.1, M.fire, 0, 0.14));                     // Glut-Rücken
  }
  inner.add(m);
  m.traverse(o=>{ if (o.isMesh) o.castShadow = false; });
  // HP-Balken nur bei Schaden (wie Einheiten)
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color:0x101418, depthTest:false }));
  bg.scale.set(0.5,0.07,1); bg.position.y = 0.85; bg.visible = false; g.add(bg);
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color:0xe0a54a, depthTest:false }));
  fg.scale.set(0.48,0.05,1); fg.position.y = 0.85; fg.visible = false; g.add(fg);
  g.userData.hp = [bg,fg];
  fxGroup.add(g);
  return g;
}
function farFromBuildings(x,y,r){
  for (const bd of state.buildings){
    const c = buildingCenter(bd);
    if (dist(x,y,c[0],c[1]) < r) return false;
  }
  for (const bd of aiFlat){
    const c = aiBuildingCenter(bd);
    if (dist(x,y,c[0],c[1]) < r) return false;
  }
  return true;
}
function wildCapOf(p){ return 3 + Math.floor(((isleAreaP && isleAreaP[p])||0)/300); }
function wildCountOf(p){ let n = 0; for (const a of wildlife) if (a.parent===p) n++; return n; }
// 24f: Kandidaten mit gegebenem Stadt-Abstand sammeln (bis zu 2 – „Spawnzonen“-Prüfung)
function findWildTilesAt(p, minD, want){
  const I = ISLES[p];
  const found = [];
  if (!I) return found;
  for (let tries=0;tries<70 && found.length<(want||2);tries++){
    const a = Math.random()*Math.PI*2, r = Math.random()*I.r;
    const x = Math.round(I.x + Math.cos(a)*r), y = Math.round(I.y + Math.sin(a)*r);
    if (!inMap(x,y) || !walkable(x,y,false)) continue;
    if (isleParent[isleId[idx(x,y)]] !== p) continue;
    if (!farFromBuildings(x,y,minD)) continue;
    if (found.some(f=>f[0]===x && f[1]===y)) continue;
    found.push([x,y]);
  }
  return found;
}
// 24f: Mindestabstand 8 statt 10; findet sich keine 2. Spawnzone, wird lokal gelockert (6, 4)
function findWildTile(p){
  let single = null;
  for (const minD of [8,6,4]){
    const f = findWildTilesAt(p, minD, 2);
    if (f.length >= 2) return f[(Math.random()*f.length)|0];
    if (f.length && !single) single = f[0];
  }
  return single;                           // Notnagel: eine Zone ist besser als keine
}
// 24f: Quest-Spawns dürfen NIE leerlaufen – 6 → 4 Kacheln Abstand, notfalls Inselrand
function findQuestWildTile(p){
  for (const minD of [6,4]){
    const f = findWildTilesAt(p, minD, 1);
    if (f.length) return f[0];
  }
  const I = ISLES[p];
  if (!I) return null;
  for (let tries=0;tries<160;tries++){     // Inselrand, Stadt-Abstand egal
    const a = Math.random()*Math.PI*2, r = I.r*(0.7+Math.random()*0.5);
    const x = Math.round(I.x + Math.cos(a)*r), y = Math.round(I.y + Math.sin(a)*r);
    if (!inMap(x,y) || !walkable(x,y,false)) continue;
    if (isleParent[isleId[idx(x,y)]] !== p) continue;
    return [x,y];
  }
  return null;
}
// 24f: Garantie-Spawns für eine Jagd-Quest – hält 2–3 Tiere der Art (max. Restbedarf)
// auf der Quest-Insel am Leben; läuft bei Annahme, nach dem Laden und im Spawner-Takt.
function ensureQuestWild(q){
  if (!q || q.typ!=='jagd' || q.phase==='abgeben' || q.have >= q.need) return 0;
  const p = q.param.isle;
  const alive = wildlife.reduce((n,a)=>n + (a.art===q.param.art && a.parent===p ? 1 : 0), 0);
  const want = Math.min(3, Math.max(2, q.need - q.have)) - alive;
  let n = 0;
  for (let i=0;i<want;i++){
    const t2 = findQuestWildTile(p);
    if (!t2) break;
    if (spawnWild(q.param.art, t2[0], t2[1])) n++;
  }
  return n;
}
function spawnWild(art, x, y){
  const W = WILD_ARTS[art];
  if (!W || !inMap(Math.round(x),Math.round(y))) return null;
  const a = { art, x, y, sx:x, sy:y, hp:W.hp, maxhp:W.hp, cd:0, wait:Math.random()*3,
    ph:Math.random()*7, dir:Math.random()*6, moving:false, speed:W.sp, fleeT:0,
    aggro:false, parent: isleParent[isleOf(x,y)]||0, mesh: makeWild(art) };
  wildlife.push(a);
  return a;
}
function killWild(a){
  const W = WILD_ARTS[a.art];
  const city = {}, bagged = [];
  for (const k in W.loot){
    if (BAG_ITEMS[k]){                   // Felle & Co. in den Beutel (Tragkraft!)
      const add = state.hero ? bagAdd(k, W.loot[k]) : 0;
      const rest = W.loot[k] - add;
      if (add) bagged.push(BAG_ITEMS[k].icon+'×'+add);
      if (rest > 0) city.gold = (city.gold||0) + Math.round(rest*BAG_ITEMS[k].gold);   // Beutel voll → Gegenwert
    } else city[k] = (city[k]||0) + W.loot[k];   // Nahrung/Erz sofort der Stadt
  }
  if (Object.keys(city).length) addLoot(city);
  if (bagged.length) toast('🏹 Jagdbeute '+W.name+': '+bagged.join(' ')+' im Beutel', 3000);
  spawnBurst(wx(a.x), Math.max(hAt(a.x,a.y),0)+0.3, wz(a.y), 6, 0xd8a05a);
  snd(220,0.1,'square',0.03);
  removeUnit(a);
  const i = wildlife.indexOf(a);
  if (i >= 0) wildlife.splice(i,1);
  if (a.heroHit) questNotify('jagd', a);   // 24d: Jagd-Quest-Fortschritt (nur Helden-Kills)
}
function updateWildlife(dt){
  // Spawner: alle 45 s je Insel höchstens 1 Tier bis zum Cap (global 28)
  wildSpawnT -= dt;
  if (wildSpawnT <= 0){
    wildSpawnT = 45;
    for (let p=0;p<ISLES.length;p++){
      if (wildlife.length >= WILD_CAP_GLOBAL) break;
      if (wildCountOf(p) >= wildCapOf(p)) continue;
      const t2 = findWildTile(p);
      if (!t2) continue;
      const bio = ISLES[p].biome||'wiese';
      const arts = Object.keys(WILD_ARTS).filter(k=>WILD_ARTS[k].biome===bio);
      // Jagd-Quest-Fallback (24d): geforderte Art bevorzugen, bis die Quest erfüllbar ist
      const pref = questPreferredArt(p);
      if (pref && arts.includes(pref)) spawnWild(pref, t2[0], t2[1]);
      else if (arts.length) spawnWild(arts[(Math.random()*arts.length)|0], t2[0], t2[1]);
    }
    // 24f: aktive Jagd-Quests nachfüllen (an Caps vorbei – die Quest darf nie leerlaufen)
    if (state.quests) for (const q of state.quests.active) ensureQuestWild(q);
  }
  // Verhaltens-Schritt deckeln: große dt-Sprünge (Vorspulen/Ruckler) dürfen Tiere
  // nicht über ihre Leine hinaus teleportieren
  const bdt = Math.min(dt, 0.1);
  for (const a of wildlife){
    const W = WILD_ARTS[a.art];
    if (a.staggerT > 0){ a.staggerT -= bdt; a.moving = false; continue; }  // 24f: Stagger
    a.cd = Math.max(0, a.cd - bdt);
    // Wehr-Art: greift NUR ihren Angreifer (den Helden) an; Leine 8 Kacheln → Rückzug + Heilung
    if (a.aggro && !W.flee){
      if (!heroAlive() || hero.sail || dungeon || dist(a.x,a.y,a.sx,a.sy) > 8){
        a.aggro = false; a.ret = 1;
      } else {
        const d = dist(a.x,a.y,hero.x,hero.y);
        if (d > 0.85){ a.moving = true; steer(a, hero.x, hero.y, a.speed, bdt); }
        else {
          a.moving = false;
          a.dir = Math.atan2(hero.y-a.y, hero.x-a.x);
          if (a.cd <= 0){
            a.cd = 1.2;
            hero.hp -= W.dmg;
            spawnBurst(wx(hero.x), Math.max(hAt(hero.x,hero.y),0)+0.5, wz(hero.y), 3, 0xff8a5a);
            snd(150,0.06,'square',0.03);
          }
        }
        continue;
      }
    }
    if (a.ret){                          // Rückzug zum Spawn-Ort, dann Voll-Heilung
      a.moving = true;
      if (steer(a, a.sx, a.sy, a.speed, bdt) || dist(a.x,a.y,a.sx,a.sy) < 0.8){
        a.ret = 0; a.hp = a.maxhp; a.wait = 1 + Math.random()*3; a.moving = false;
      }
      continue;
    }
    if (W.flee){
      // Flucht: Held oder Einheit < 4 Kacheln → 8 s vom Bedroher weg
      let th = null;
      if (heroAlive() && !hero.sail && !dungeon && dist(a.x,a.y,hero.x,hero.y) < 4) th = hero;
      if (!th) for (const s2 of soldiers)
        if (!s2.sail && dist(a.x,a.y,s2.x,s2.y) < 4){ th = s2; break; }
      if (th){ a.fleeT = 8; a.fa = Math.atan2(a.y-th.y, a.x-th.x); }
      if (a.fleeT > 0){
        a.fleeT -= bdt;
        a.moving = true;
        steer(a, a.x + Math.cos(a.fa)*3, a.y + Math.sin(a.fa)*3, a.speed, bdt);
        continue;
      }
    }
    // Wandern um den Spawn-Ort (Leine 6 Kacheln, Warte-Phasen wie die Bewohner)
    if (a.wait > 0){ a.wait -= bdt; a.moving = false; continue; }
    if (a.tx === undefined || dist(a.x,a.y,a.tx,a.ty) < 0.5){
      const an = Math.random()*Math.PI*2, r = Math.random()*6;
      a.tx = a.sx + Math.cos(an)*r; a.ty = a.sy + Math.sin(an)*r;
      if (!walkable(a.tx,a.ty,false)){ a.tx = a.sx; a.ty = a.sy; }
    }
    a.moving = true;
    if (steer(a, a.tx, a.ty, a.speed*0.45, bdt) || Math.random() < 0.002){
      a.tx = undefined; a.wait = 1.5 + Math.random()*4; a.moving = false;
    }
  }
  // Erlegte Tiere: Beute gutschreiben (nur der Held jagt)
  for (let i=wildlife.length-1;i>=0;i--)
    if (wildlife[i].hp <= 0) killWild(wildlife[i]);
}

// ============================== DUNGEONS (Etappe 24c) ==============================
// Unterwelt in derselben Szene bei y=−60: eigenes 24×24-Raster (dOcc), dichter Fog,
// max. 2 mitwandernde PointLights. Ein Raum ist zugleich aktiv; Türen wechseln Räume.
// Der Run wird NICHT gespeichert – nur state.dungeons.cleared (Abschlusszähler je Insel).
const DNG_Y = -60;
const DNG_TIER_OF_BIOME = { wiese:1, wald:1, schnee:2, wueste:3, vulkan:4 };
const DNG_LOOK = [null, 'Wurzelhöhle', 'Eisgrotte', 'Grabkammer', 'Lavastollen'];
const DNG_FOG_COL = [null, 0x0b0806, 0x0a141c, 0x141006, 0x180806];
const DNG_LIGHT_COL = [null, 0xffb469, 0x9fd4ff, 0xffd28a, 0xff8a4a];
const DNG_TRASH = [null,
  { name:'Grottenräuber', hp:60,  dmg:8  },
  { name:'Eisgeist',      hp:110, dmg:14 },
  { name:'Grabwächter',   hp:190, dmg:22 },
  { name:'Lavaschrecken', hp:300, dmg:34 }];
const DNG_BOSS = [null,
  { name:'Räuberhauptmann', hp:260,  dmg:16, gimmick:'adds' },
  { name:'Frostalter',      hp:520,  dmg:24, gimmick:'felder' },
  { name:'Skarabäus-Koloss',hp:950,  dmg:36, gimmick:'ansturm' },
  { name:'Magmafürst',      hp:1600, dmg:52, gimmick:'puls' }];
const DNG_COUNT = [null, [6,9], [7,10], [8,11], [8,12]];        // Trash je Run (Tabelle 7.3)
const DNG_MAT = [null, {eisen:5}, {eisen:8}, {stahl:8}, {stahl:10,lithium:2}];
// Geteilte Dungeon-Materialien je Tier (Umfärbung der enemy-Figur + Raum-Look)
const DM = {
  wall:  [null, std(0x4a3323), std(0x7fa8c2), std(0x8a744e), std(0x35262b)],
  floor: [null, std(0x5d4530), std(0xa8c8da), std(0xa08a5c), std(0x40292a)],
  glow:  [null, std(0x7ec86a,{emissive:0x4fae40,emissiveIntensity:1.2}),
                std(0x9fe4ff,{emissive:0x58b8e8,emissiveIntensity:1.3}),
                std(0xffd75a,{emissive:0xdfa520,emissiveIntensity:1.1}),
                std(0xff6a2a,{emissive:0xff4a10,emissiveIntensity:1.6})],
  body:  [null, std(0x55603a), std(0x7fa8c8), std(0x8a7a52), std(0x5a3230)],
  dark:  [null, std(0x3a4028), std(0x54788f), std(0x615536), std(0x3a2020)],
  gate: std(0x77828c), chest: std(0x6b482a), chestLid: std(0x8a5c34),
  tele: new THREE.MeshBasicMaterial({ color:0xff3b30, transparent:true, opacity:0.4,
    side:THREE.DoubleSide, depthWrite:false }),
};
for (const k of ['wall','floor','glow','body','dark'])
  for (const m of DM[k]) if (m) m.userData.shared = true;
DM.gate.userData.shared = true; DM.chest.userData.shared = true;
DM.chestLid.userData.shared = true; DM.tele.userData.shared = true;
const dngCircleGeo = new THREE.CircleGeometry(1, 24);           // Telegraph (geteilt!)
dngCircleGeo.userData.shared = true;
// 5 handgemachte Raum-Templates: 24×24. # Wand · . Boden · T Fackel · D Deko ·
// E Gegner-Spawn · C Truhe · L Hebel · G Gitter · B Boss. Türen: Spalten 11/12.
const DNG_TPL = {
  kampf: [
    '###########..###########','###########..###########','####...T........T...####',
    '###..................###','##.....E........E.....##','##....................##',
    '##.......######.......##','##..D....######....D..##','##.......######.......##',
    '##....................##','##..E..............E..##','##....................##',
    '##....................##','##.......######.......##','##..T....######....T..##',
    '##.......######.......##','##....................##','##.....E........E.....##',
    '###..................###','####................####','#####..............#####',
    '######....T..T....######','###########..###########','###########..###########'],
  kampf2: [
    '###########..###########','###########..###########','######............######',
    '###....T........T....###','###..................###','###..##..........##..###',
    '###..##....E.....##..###','###..................###','###.......##.........###',
    '###..E....##.....E...###','###.......##.........###','###..................###',
    '###..................###','###.......##.........###','###..D....##....D....###',
    '###.......##.........###','###..................###','###..##....E.....##..###',
    '###..##..........##..###','###..................###','###....T........T....###',
    '######............######','###########..###########','###########..###########'],
  schatz: [
    '###########..###########','###########..###########','#####..............#####',
    '####..T........T....####','####................####','####..####....####..####',
    '####..####.C..####..####','####..####....####..####','####....E...........####',
    '####................####','#####..............#####','######............######',
    '######....D..D....######','######............######','#####..............#####',
    '####................####','####..T........T....####','####................####',
    '####................####','#####..............#####','######............######',
    '#######..........#######','###########..###########','###########..###########'],
  hebel: [
    '###########..###########','###########..###########','##########GGGG##########',
    '#####..............#####','####....T......T....####','####................####',
    '####..E..........E..####','####................####','####......####......####',
    '####......####......####','#####..............#####','########........########',
    '########...D....########','########........########','#####..............#####',
    '####.....T....T.....####','####................####','##...L..............####',
    '##..................####','####................####','#####..............#####',
    '######............######','###########..###########','###########..###########'],
  boss: [
    '########################','########################','####..T..........T..####',
    '###..................###','##.........B..........##','##....................##',
    '##..D..............D..##','##....................##','##....................##',
    '##....................##','##T..................T##','##....................##',
    '##....................##','##....................##','##....................##',
    '##..D..............D..##','##....................##','###..................###',
    '####................####','#####..............#####','######....T..T....######',
    '########........########','###########..###########','###########..###########'],
};
// --- Laufzeitzustand ---
const dngGroup = new THREE.Group(); dngGroup.position.y = DNG_Y; scene.add(dngGroup);
let dungeon = null;                      // { isle, tier, run, room, roomGrp, dOcc, entry, … }
let dungeonEnemies = [];                 // NUR Dungeon-Gegner – kein Kontakt zu Wellen/KI
let dngTele = [];                        // Boss-Telegraphen (roter Bodenkreis, 1 s Vorlauf)
let dngLights = [];                      // die beiden mitwandernden PointLights
const dungeonRuns = {};                  // offener Run je Insel (Laufzeit-Cache, unsaved)
let dngPortals = [];                     // Oberwelt-Eingänge [{isle,x,y,tier}]
const portalGroup = new THREE.Group(); scene.add(portalGroup);
const dlx = (x)=>(x-11.5)*TL, dlz = (y)=>(y-11.5)*TL;    // Dungeon-Kachel → Weltkoord. (x/z)
const dngRoom = ()=> dungeon ? dungeon.run.rooms[dungeon.room] : null;
// Begehbarkeit im Dungeon-Raster (Gitter zählt als Wand, solange geschlossen)
function dWalkable(fx,fy){
  if (!dungeon) return false;
  const x = Math.round(fx), y = Math.round(fy);
  if (x<0 || y<0 || x>23 || y>23) return false;
  return dungeon.dOcc[y*24+x] === 0;
}
function dSteer(u, tx, ty, sp, dt){      // steer()-Prinzip auf dem Dungeon-Raster
  const dx = tx-u.x, dy = ty-u.y, d = Math.hypot(dx,dy);
  if (d < 0.05) return true;
  const base = Math.atan2(dy,dx);
  for (const off of [0, 0.55, -0.55, 1.1, -1.1, 1.7, -1.7]){
    const a = base+off;
    const nx = u.x + Math.cos(a)*sp*dt, ny = u.y + Math.sin(a)*sp*dt;
    if (dWalkable(u.x + Math.cos(a)*0.45, u.y + Math.sin(a)*0.45) && dWalkable(nx,ny)){
      u.x = nx; u.y = ny; u.dir = a; return false;
    }
  }
  return false;
}
// --- Oberwelt-Portale: 1 je Insel, seed-deterministisch ---
function findDungeonTile(isleIdx){
  const I = ISLES[isleIdx];
  if (!I) return null;
  const rng = mulberry32((state.seed ^ 0x7e11a5) + isleIdx*524287);
  for (let tries=0;tries<500;tries++){
    const a = rng()*Math.PI*2, r = rng()*I.r*0.8;
    const x = Math.round(I.x + Math.cos(a)*r), y = Math.round(I.y + Math.sin(a)*r);
    if (!inMap(x,y) || tiles[idx(x,y)]!==2) continue;
    const k = idx(x,y);
    if (occ[k] || aiOcc[k] || treeMap[k] || rockMap[k]) continue;
    if (isleParent[isleId[k]] !== isleIdx) continue;
    if (dist(x,y,SX,SY) < 8) continue;                     // nicht mitten im Startgebiet
    if (!walkable(x,y,false) || !findLanding(x,y+1)) continue;
    if ((state.mineSpots||[]).some(s=>dist(s.x,s.y,x,y) < 2)) continue;
    return [x,y];
  }
  return null;
}
function makeDungeonPortal(tier){
  const g = new THREE.Group();
  const rng = mulberry32(tier*7919);
  for (let i=0;i<5;i++){                                   // Felsbogen
    const m = mesh(new THREE.IcosahedronGeometry(0.34+rng()*0.22,0), DM.wall[tier], false, true);
    const a = Math.PI*(0.15 + 0.7*i/4);
    m.position.set(Math.cos(a)*0.85, 0.15+Math.sin(a)*0.9, 0);
    m.scale.y = 0.8+rng()*0.5;
    g.add(m);
  }
  const hole = mesh(new THREE.PlaneGeometry(1.0,1.1), std(0x0a0810), false, false);
  hole.position.set(0, 0.62, 0.02); g.add(hole);           // dunkler Eingang
  for (const sx of [-1,1]){                                // 2 Fackeln
    g.add(cyl(0.035,0.045,0.6, M.woodDark, sx*0.95, 0, 0.25, 5));
    const f = bx(0.11,0.15,0.11, M.fire, sx*0.95, 0.58, 0.25);
    f.castShadow = false; g.add(f);
  }
  const gl = mesh(new THREE.IcosahedronGeometry(0.09,0), DM.glow[tier], false, false);
  gl.position.set(0, 1.28, 0.1); g.add(gl);                // Tier-Kristall am Scheitel
  g.traverse(o=>{ if (o.isMesh) o.castShadow = false; });
  return g;
}
function initDungeonPortals(){
  if (!state || !ISLES) return;
  disposeGroup(portalGroup);
  dngPortals = [];
  for (let i=0;i<ISLES.length;i++){
    const t2 = findDungeonTile(i);
    if (!t2) continue;
    const tier = DNG_TIER_OF_BIOME[ISLES[i].biome] || 1;
    dngPortals.push({ isle:i, x:t2[0], y:t2[1], tier });
    const g = makeDungeonPortal(tier);
    g.position.set(wx(t2[0]), Math.max(hAt(t2[0],t2[1]),0.02), wz(t2[1]));
    g.rotation.y = Math.atan2(SX-t2[0], SY-t2[1]);         // Eingang grob Richtung Start
    portalGroup.add(g);
  }
}
// --- Run-Aufbau: Seed = Kartenseed ⊕ DungeonId ⊕ Abschlusszähler ---
function dungeonSeed(isle, ctr){ return (state.seed ^ Math.imul(isle+1,0x9e3779b9) ^ Math.imul(ctr+1,0x85ebca6b))|0; }
function rollDungeonRooms(isle, ctr){
  const rng = mulberry32(dungeonSeed(isle, ctr));
  const n = 3 + Math.floor(rng()*3);                       // 3–5 Räume
  const mids = ['schatz'];                                 // 1–2 Truhen je Run garantiert
  const pool = ['hebel','kampf2','kampf','schatz'];
  while (mids.length < n-2){
    let pick = pool[Math.floor(rng()*pool.length)];
    if (pick==='schatz' && mids.filter(m=>m==='schatz').length >= 2) pick = 'kampf2';
    mids.push(pick);
  }
  for (let i=mids.length-1;i>0;i--){                       // deterministisch mischen
    const j = Math.floor(rng()*(i+1)); const t2 = mids[i]; mids[i] = mids[j]; mids[j] = t2;
  }
  return ['kampf', ...mids, 'boss'];                       // Bossraum immer zuletzt
}
function buildRun(isle, ctr){
  const p = dngPortals.find(q=>q.isle===isle);
  const tier = p ? p.tier : 1;
  const rng = mulberry32(dungeonSeed(isle, ctr) ^ 0x2c9f);
  const rooms = rollDungeonRooms(isle, ctr).map(tp=>({ tpl:tp, cleared:false, open:false, chestOpen:false, nE:0 }));
  // Trash-Gesamtzahl je Tier-Range auf die Räume verteilen (Tabelle 7.3)
  const [lo,hi] = DNG_COUNT[tier];
  let total = lo + Math.floor(rng()*(hi-lo+1));
  for (const r of rooms){
    if (r.tpl==='schatz'){ r.nE = 1; total -= 1; }         // Truhe + 1 Wache
    if (r.tpl==='hebel'){ r.nE = 2; total -= 2; }
  }
  const fights = rooms.filter(r=>r.tpl==='kampf' || r.tpl==='kampf2');
  for (const r of fights) r.nE = clamp(Math.round(total/fights.length), 2, 5);
  return { isle, ctr, tier, seed:dungeonSeed(isle,ctr), rooms };
}
// --- Gegner: makePerson('enemy') + Tier-Umfärbung + 1 Silhouetten-Variante je Tier ---
function makeDungeonEnemy(tier, boss){
  const g = makePerson('enemy');
  fxGroup.remove(g);                                       // wandert in die Raum-Gruppe
  g.traverse(o=>{
    if (!o.isMesh) return;
    o.castShadow = false; o.receiveShadow = false;         // Sonnen-Schatten im Dungeon aus
    if (o.material === M.enemyBody) o.material = DM.body[tier];
    else if (o.material === PM.hoodDark) o.material = DM.dark[tier];
    else if (o.material === PM.pantsDark) o.material = DM.dark[tier];
    else if (SKIN_MATS.includes(o.material) && (tier===2 || tier===4))
      o.material = DM.body[tier];                          // Eisgeist/Lavaschrecken: kein Hautton
  });
  if (tier===1){                                           // Wurzelhörner
    for (const sx of [-1,1]){
      const h = bx(0.035,0.16,0.035, M.woodDark, sx*0.07, 0.7, -0.02);
      h.rotation.z = -sx*0.5; h.castShadow = false; g.add(h);
    }
  } else if (tier===2){                                    // Eiszacken auf den Schultern
    for (const sx of [-1,1]){
      const s = mesh(new THREE.ConeGeometry(0.05,0.17,5), DM.glow[2], false, false);
      s.position.set(sx*0.16, 0.6, 0); s.rotation.z = -sx*0.4; g.add(s);
    }
  } else if (tier===3){                                    // Pharaonen-Kopfschmuck
    const h = bx(0.26,0.07,0.2, M.gold, 0, 0.72, 0); h.castShadow = false; g.add(h);
  } else {                                                 // glühender Rückenkamm
    const r = bx(0.05,0.3,0.04, M.fire, 0, 0.35, -0.13); r.castShadow = false; g.add(r);
  }
  if (boss){
    g.scale.setScalar(1.3 + tier*0.06);
    const c = cyl(0.09,0.11,0.09, M.gold, 0, 0.755, 0, 6); c.castShadow = false; g.add(c);
  }
  return g;
}
function spawnDungeonEnemy(x, y, tier, boss){
  const B = boss ? DNG_BOSS[tier] : DNG_TRASH[tier];
  const e = { x, y, sx:x, sy:y, hp:B.hp, maxhp:B.hp, dmg:B.dmg, cd:0, gt:3,
    ph:Math.random()*7, dir:Math.PI/2, moving:false, speed: boss?1.1:1.5,
    dng:true, boss:!!boss, tier, aggro:false, mesh: makeDungeonEnemy(tier, boss) };
  dungeon.roomGrp.add(e.mesh);
  dungeonEnemies.push(e);
  return e;
}
// Position/Gang der Dungeon-Einheiten (lokal zur Gruppe bei y=−60)
function syncDngUnit(u, t, dt){
  const g = u.mesh;
  u.wb = u.wb===undefined ? 0 : u.wb + ((u.moving?1:0)-u.wb)*Math.min(1, dt*6);
  const freq = 4.2 + (u.speed||1.1)*3.4;
  const alt = Math.abs(Math.sin(t*freq+u.ph))*0.045*u.wb + (1-u.wb)*(0.011+Math.sin(t*1.7+u.ph)*0.011);
  g.position.set(dlx(u.x), alt, dlz(u.y));
  if (u.vdir===undefined) u.vdir = u.dir||0;
  const dd = (u.dir||0) - u.vdir;
  u.vdir += Math.atan2(Math.sin(dd), Math.cos(dd)) * Math.min(1, dt*10);
  g.rotation.y = -u.vdir + Math.PI/2;
  g.rotation.x = u.wb*0.085;
  const lb = g.userData.limbs;
  if (lb){
    const swing = Math.sin(t*freq + u.ph), idle = (1-u.wb)*Math.sin(t*1.7+u.ph)*0.045;
    lb.armL.rotation.x =  swing*0.62*u.wb + idle;
    lb.armR.rotation.x = -swing*0.62*u.wb + idle;
    lb.legL.rotation.x = -swing*0.55*u.wb;
    lb.legR.rotation.x =  swing*0.55*u.wb;
  }
  const [bg,fg] = g.userData.hp;
  if (u.hp < u.maxhp){ bg.visible = fg.visible = true; fg.scale.x = 0.48*clamp(u.hp/u.maxhp,0,1); }
  else bg.visible = fg.visible = false;
}
// --- Raum aufbauen (alter Raum wird komplett disposed – Etappe-16-Lehre) ---
function loadRoom(i, from){
  const d = dungeon, r = d.run.rooms[i];
  if (d.roomGrp){ dngGroup.remove(d.roomGrp); disposeGroup(d.roomGrp); }
  dungeonEnemies = []; dngTele = [];
  d.room = i;
  const grp = new THREE.Group(); d.roomGrp = grp; dngGroup.add(grp);
  const tier = d.tier, tpl = DNG_TPL[r.tpl];
  d.dOcc = new Uint8Array(24*24);
  d.pts = { E:[], chest:null, lever:null, B:null };
  const walls = [];
  for (let y=0;y<24;y++) for (let x=0;x<24;x++){
    const c = tpl[y][x];
    if (c==='#'){ d.dOcc[y*24+x] = 1; walls.push([x,y]); continue; }
    if (c==='G'){ if (!r.open) d.dOcc[y*24+x] = 2; continue; }
    if (c==='E') d.pts.E.push([x,y]);
    else if (c==='C') d.pts.chest = [x,y];
    else if (c==='L') d.pts.lever = [x,y];
    else if (c==='B') d.pts.B = [x,y];
  }
  // Boden + Decke (je 1 Mesh), Wände als EINE gemergte Geometrie (Draw-Call-Budget)
  const floor = mesh(new THREE.BoxGeometry(24*TL, 0.1, 24*TL), DM.floor[tier], false, false);
  floor.position.y = -0.05; grp.add(floor);
  const ceil = mesh(new THREE.BoxGeometry(24*TL, 0.1, 24*TL), DM.wall[tier], false, false);
  ceil.position.y = 3.0; grp.add(ceil);
  const wallGeos = walls.map(([x,y])=>
    new THREE.BoxGeometry(TL, 3.0, TL).translate(dlx(x), 1.5, dlz(y)));
  if (wallGeos.length){
    const wm = mesh(mergeGeometries(wallGeos), DM.wall[tier], false, false);
    grp.add(wm);
    for (const gg of wallGeos) gg.dispose();               // Quellen sofort freigeben
  }
  // Requisiten: Fackeln (Emissive – KEINE Lichter) und Tier-Deko
  for (let y=0;y<24;y++) for (let x=0;x<24;x++){
    const c = tpl[y][x];
    if (c==='T'){
      const p = cyl(0.04,0.05,0.75, M.woodDark, dlx(x), 0, dlz(y), 5);
      p.castShadow = false; p.receiveShadow = false; grp.add(p);
      const f = bx(0.13,0.17,0.13, M.fire, dlx(x), 0.72, dlz(y));
      f.castShadow = false; f.receiveShadow = false; grp.add(f);
    } else if (c==='D'){
      let m2;
      if (tier===1) m2 = cyl(0.14,0.24,1.4, M.trunk, dlx(x), 0, dlz(y), 6);           // Wurzelsäule
      else if (tier===2){ m2 = mesh(new THREE.ConeGeometry(0.3,1.3,6), DM.glow[2], false, false);
        m2.position.set(dlx(x), 0.65, dlz(y)); }                                       // Eiskristall
      else if (tier===3) m2 = bx(0.5,1.2,0.5, DM.floor[3], dlx(x), 0, dlz(y));         // Sarkophag
      else { m2 = mesh(new THREE.IcosahedronGeometry(0.4,0), DM.glow[4], false, false);
        m2.position.set(dlx(x), 0.25, dlz(y)); }                                       // Lavabrocken
      m2.castShadow = false; m2.receiveShadow = false; grp.add(m2);
    }
  }
  // Truhe / Hebel / Gitter / Ausgangs-Portal
  if (d.pts.chest){
    const [cx2,cy2] = d.pts.chest;
    const ch = new THREE.Group();
    ch.add(bx(0.62,0.34,0.44, DM.chest, 0, 0, 0));
    const lid = bx(0.62,0.16,0.44, DM.chestLid, 0, 0.34, 0);
    lid.name = 'lid'; ch.add(lid);
    ch.add(bx(0.66,0.07,0.1, M.gold, 0, 0.2, 0.18));
    if (r.chestOpen) lid.rotation.x = -1.1;
    ch.position.set(dlx(cx2), 0, dlz(cy2));
    ch.traverse(o=>{ if (o.isMesh){ o.castShadow = false; o.receiveShadow = false; } });
    ch.name = 'chest'; grp.add(ch);
  }
  if (d.pts.lever){
    const [lx2,ly2] = d.pts.lever;
    const lv = new THREE.Group();
    lv.add(bx(0.3,0.25,0.3, M.stoneDark, 0, 0, 0));
    const st2 = cyl(0.03,0.03,0.5, M.steel, 0, 0.2, 0, 5);
    st2.name = 'stick'; st2.rotation.z = r.open ? -0.7 : 0.7; lv.add(st2);
    lv.position.set(dlx(lx2), 0, dlz(ly2));
    lv.traverse(o=>{ if (o.isMesh){ o.castShadow = false; o.receiveShadow = false; } });
    lv.name = 'lever'; grp.add(lv);
  }
  if (r.tpl==='hebel' && !r.open){
    const bars = new THREE.Group(); bars.name = 'gate';
    for (let x=0;x<24;x++) for (let y=0;y<24;y++)
      if (tpl[y][x]==='G')
        for (let b2=0;b2<3;b2++){
          const bar = cyl(0.045,0.045,2.6, DM.gate, dlx(x)+(b2-1)*0.6, 0, dlz(y), 5);
          bar.castShadow = false; bar.receiveShadow = false; bars.add(bar);
        }
    grp.add(bars);
  }
  if (i===0){                                              // Ausgangs-Portal im Startraum
    const po = new THREE.Group(); po.name = 'exitPortal';
    po.add(bx(0.3,2.2,0.3, DM.wall[tier], -0.9, 0, 0));
    po.add(bx(0.3,2.2,0.3, DM.wall[tier],  0.9, 0, 0));
    po.add(bx(2.1,0.3,0.3, DM.wall[tier], 0, 2.2, 0));
    const sw = mesh(new THREE.PlaneGeometry(1.5,2.0), DM.glow[tier], false, false);
    sw.position.y = 1.0; po.add(sw);
    po.position.set(dlx(11.5), 0, dlz(22.6));
    po.traverse(o=>{ if (o.isMesh){ o.castShadow = false; o.receiveShadow = false; } });
    grp.add(po);
  }
  // Gegner (nur wenn der Raum in diesem Run noch nicht geleert wurde)
  if (!r.cleared){
    if (r.tpl==='boss' && d.pts.B){
      spawnDungeonEnemy(d.pts.B[0], d.pts.B[1], tier, true);
    } else if (r.nE > 0){
      const rng = mulberry32(d.run.seed ^ Math.imul(i+1, 0x45d9f3b));
      const spots = d.pts.E.slice();
      for (let k2=spots.length-1;k2>0;k2--){ const j = Math.floor(rng()*(k2+1));
        const t2 = spots[k2]; spots[k2] = spots[j]; spots[j] = t2; }
      for (const [ex2,ey2] of spots.slice(0, Math.min(r.nE, spots.length)))
        spawnDungeonEnemy(ex2, ey2, tier, false);
    }
  }
  r.spawnedN = dungeonEnemies.length;
  // Held an der passenden Tür platzieren
  if (from==='top'){ hero.x = 11.5; hero.y = 2.6; egoYaw = Math.PI/2; }
  else if (from==='enter'){ hero.x = 11.5; hero.y = 20.6; egoYaw = -Math.PI/2; }
  else { hero.x = 11.5; hero.y = 21.4; egoYaw = -Math.PI/2; }
  hero.moving = false; egoPitch = 0;
  hero.dir = egoYaw; hero.vdir = egoYaw;
  tpSnap = true;                           // Folgekamera hart auf den neuen Raum setzen
}
// --- Blende (0,2 s zu Schwarz, 0,2 s auf – rein kosmetisch, blockiert nichts) ---
function dngFadeFx(){
  const el = $('dngFade');
  el.style.opacity = '1';
  setTimeout(()=>{ el.style.opacity = '0'; }, 200);
}
// --- Betreten / Verlassen ---
function enterDungeon(isleIdx){
  if (dungeon || !state || !gameStarted || gameOver) return false;
  const p = dngPortals.find(q=>q.isle===isleIdx);
  if (!p) return false;
  if (!state.buildings.some(b=>b.t==='heldenhalle')){
    toast('🕳️ Nur Helden wagen den Abstieg – errichte zuerst eine Heldenhalle!');
    return false;
  }
  if (!heroAlive() || hero.sail) return false;
  const sperre = siegeLordOn(isleIdx);
  if (sperre){
    toast('🛡️ '+lordCfg(sperre).name+'s Wachen versperren diesen Abstieg – besiege erst den Fürsten!');
    return false;
  }
  if (!egoMode && !enterEgo()) return false;
  mining = null; sailPick = null; hideInfo();
  if (!state.dungeons) state.dungeons = { cleared:{} };
  const ctr = state.dungeons.cleared[isleIdx] || 0;
  let run = dungeonRuns[isleIdx];
  if (!run || run.ctr !== ctr){ run = buildRun(isleIdx, ctr); dungeonRuns[isleIdx] = run; }
  else run.rooms[run.rooms.length-1].cleared = false;      // nur der Bossraum resettet
  const entry = findLanding(p.x, p.y+1);
  dungeon = { isle:isleIdx, tier:p.tier, run, room:0, roomGrp:null, dOcc:null,
    entry, fogNear:scene.fog.near, fogFar:scene.fog.far };
  // Licht-Budget: genau 2 PointLights, wandern mit dem Helden mit (Rest: Emissive)
  const l1 = new THREE.PointLight(0xffb469, 2.4, 12, 1.4);
  const l2 = new THREE.PointLight(DNG_LIGHT_COL[p.tier], 1.4, 9, 1.4);
  dngLights = [l1,l2];
  dngGroup.add(l1); dngGroup.add(l2);
  scene.fog.near = 2; scene.fog.far = 22;                  // dichter Unterwelt-Fog (24e: 18→22 für Third-Person)
  state.hero.view = 'tp';                                  // Spieler-Wunsch: Dungeon IMMER in Third-Person starten
  applyEgoViewVis();
  loadRoom(0, 'enter');
  state.hero.x = entry[0]; state.hero.y = entry[1];        // Save zeigt immer den Eingang
  dngFadeFx();
  toast('🕳️ '+DNG_LOOK[p.tier]+' (Tier '+p.tier+') – der Boss wartet in der Tiefe!', 4200);
  snd(160,0.25,'triangle',0.05);
  save();
  return true;
}
function exitDungeon(){
  if (!dungeon) return false;
  const d = dungeon; dungeon = null;
  disposeGroup(dngGroup);                 // Räume, Gegner, Lichter, Telegraphen – alles weg
  dungeonEnemies = []; dngTele = []; dngLights = [];
  scene.fog.near = d.fogNear; scene.fog.far = d.fogFar;    // Oberwelt-Fog EXAKT zurück
  if (hero){
    const l = findLanding(d.entry[0], d.entry[1]);
    hero.x = l[0]; hero.y = l[1];
    hero.moving = false; hero.patrol = null;
    if (state.hero){ state.hero.x = hero.x; state.hero.y = hero.y; }
  }
  tpSnap = true;                           // Oberwelt: Folgekamera hart an den Eingang
  dngFadeFx();
  return true;
}
// --- Interaktionen im Dungeon (Kontext des Primär-Buttons) ---
function dngNear(pt, r){ return pt && hero && dist(hero.x,hero.y,pt[0],pt[1]) <= r; }
function dungeonContext(){
  const e = egoTargetEnemy();                              // scannt im Dungeon die Dungeon-Liste
  if (e) return { act:'attack', icon:'⚔️', target:e };
  const r = dngRoom();
  if (r && r.tpl==='schatz' && !r.chestOpen && dngNear(dungeon.pts.chest, 2.0))
    return { act:'chest', icon:'🧰', target:dungeon.pts.chest };
  if (r && r.tpl==='hebel' && !r.open && dngNear(dungeon.pts.lever, 2.0))
    return { act:'lever', icon:'⚙️', target:dungeon.pts.lever };
  if (dungeon.room===0 && dngNear([11.5,22.6], 2.5))
    return { act:'dexit', icon:'🚪', target:null };
  return null;
}
function pullLever(){
  const r = dngRoom();
  if (!r || r.tpl!=='hebel' || r.open) return false;
  r.open = true;
  const tpl = DNG_TPL.hebel;
  for (let y=0;y<24;y++) for (let x=0;x<24;x++)
    if (tpl[y][x]==='G') dungeon.dOcc[y*24+x] = 0;
  const bars = dungeon.roomGrp.getObjectByName('gate');
  if (bars){ dungeon.roomGrp.remove(bars); disposeGroup(bars); }
  const lv = dungeon.roomGrp.getObjectByName('lever');
  const st2 = lv && lv.getObjectByName('stick');
  if (st2) st2.rotation.z = -0.7;
  toast('⚙️ Der Hebel knirscht – das Gitter hebt sich!', 3000);
  snd(140,0.2,'square',0.05); snd(320,0.15,'triangle',0.04);
  return true;
}
// Ausrüstungs-Drop: bessere Teile werden angelegt, schlechtere zum Marktwert verkauft
function grantEquipDrop(tier){
  tier = clamp(tier, 1, 4);
  const ids = Object.keys(HERO_ITEMS).filter(id=>{
    const it = HERO_ITEMS[id];
    return (it.slot==='w' || it.slot==='a') && it.tier === tier;
  });
  if (!ids.length) return null;
  const id = ids[(Math.random()*ids.length)|0];
  const it = HERO_ITEMS[id];
  const cur = state.hero.equip[it.slot];
  if (cur && HERO_ITEMS[cur] && HERO_ITEMS[cur].tier >= it.tier){
    const v = Math.max(1, itemValue(id));
    state.res.gold += v;
    toast('🎁 '+it.name+' gefunden – bereits besser ausgerüstet, verkauft für +'+v+' 🪙', 3600);
  } else {
    equipHero(it.slot, id);
    toast('🎁 Beute: '+it.name+' angelegt!', 3600);
  }
  return id;
}
function openDungeonChest(){
  const r = dngRoom();
  if (!r || r.tpl!=='schatz' || r.chestOpen) return false;
  r.chestOpen = true;
  const tier = dungeon.tier;
  const ch = dungeon.roomGrp.getObjectByName('chest');
  const lid = ch && ch.getObjectByName('lid');
  if (lid) lid.rotation.x = -1.1;
  addLoot({ gold: 20*tier });                              // Sofort-Gutschrift (Tabelle 7.5)
  const roll = Math.random();
  if (roll < 0.60){                                        // 60 % Material-Paket
    addLoot(scaleCost(DNG_MAT[tier], 3));
  } else if (roll < 0.85){                                 // 25 % Ausrüstung Tier-passend
    grantEquipDrop(tier);
  } else if (roll < 0.95){                                 // 10 % Edelstein
    if (!bagAdd('gem',1)) addLoot({ gold: 40 });           // Beutel voll → Gegenwert
    else toast('💎 Ein Edelstein glitzert in der Truhe!', 3200);
  } else {                                                 // 5 % Amulett-Rezept
    const h = state.hero;
    h.rezepte = h.rezepte || {};
    const free = ['gluecksamulett','bergmannstalisman','haendlersiegel'].filter(a=>!h.rezepte[a]);
    if (free.length){
      const a = free[(Math.random()*free.length)|0];
      h.rezepte[a] = 1;
      toast('📜 Amulett-Rezept gefunden: '+HERO_ITEMS[a].name+' – ab sofort schmiedbar!', 4600);
    } else addLoot(scaleCost(DNG_MAT[tier], 3));
  }
  if (dngPos()) spawnBurst(dngPos().x, dngPos().y+0.5, dngPos().z, 8, 0xffd736);
  snd(600,0.12,'triangle',0.05); snd(820,0.15,'triangle',0.05);
  save();
  return true;
}
function dngPos(){ return hero ? { x:dlx(hero.x), y:DNG_Y+0.2, z:dlz(hero.y) } : null; }
// --- Beute & Boss-Abschluss ---
function killDungeonEnemy(e){
  const i = dungeonEnemies.indexOf(e);
  if (i >= 0) dungeonEnemies.splice(i,1);
  if (e.mesh){ dungeon.roomGrp.remove(e.mesh); disposeGroup(e.mesh); }
  spawnBurst(dlx(e.x), DNG_Y+0.4, dlz(e.y), 6, 0xff8a5a);
  snd(180,0.08,'square',0.04);
  const tier = e.tier;
  if (e.boss){
    const isle = dungeon.isle;
    const ctr = state.dungeons.cleared[isle] || 0;
    const first = ctr === 0;
    let gold = first ? 60*tier : Math.round(60*tier*0.6);  // Wiederholung: 60 % Gold
    if (heroTrinket('gluecksamulett')) gold = Math.round(gold*1.1);
    addLoot({ gold });
    giveHeroExp('k', 60*tier);                             // volle EXP, auch wiederholt
    if (first){
      grantEquipDrop(tier + ((Math.random()<0.5)?1:0));    // garantiert Tier+0/+1
      chronicleAdd('dungeon'+isle, '🏆 Dungeon bezwungen: '+DNG_LOOK[tier]+' (Tier '+tier+') – '+
        DNG_BOSS[tier].name+' fiel vor '+state.hero.name+'.');
    } else if (Math.random() < 0.30) grantEquipDrop(tier);
    state.dungeons.cleared[isle] = ctr + 1;
    questNotify('dungeon', isle);                          // 24d: Boss-Kill NACH Annahme erfüllt
    delete dungeonRuns[isle];                              // nächster Run: neue Raumfolge
    for (const r of dungeon.run.rooms) r.cleared = true;   // Rest des Besuchs bleibt friedlich
    toast('🏆 '+DNG_BOSS[tier].name+' besiegt! Der Rückweg zum Portal ist frei.', 5200);
    snd(392,0.14,'triangle',0.06); snd(523,0.2,'triangle',0.06);
    save();
  } else {
    let gold = (2 + Math.floor(Math.random()*5)) * tier;   // 2–6·Tier
    if (heroTrinket('gluecksamulett')) gold = Math.round(gold*1.1);
    const loot = { gold };
    if (Math.random() < 0.25) Object.assign(loot, DNG_MAT[tier]);   // 25 % Material-Häppchen
    addLoot(loot);
    giveHeroExp('k', 8*tier);
  }
  const r = dngRoom();
  if (r && !dungeonEnemies.length) r.cleared = true;       // Raum bleibt in diesem Run leer
}
// Telegraph: roter Bodenkreis 1 s vorher, Schaden nur bei Treffen (alle Boss-Gimmicks)
function addTele(x, y, r, dmg, kind, src){
  const m = mesh(dngCircleGeo, DM.tele, false, false);
  m.rotation.x = -Math.PI/2;
  m.position.set(dlx(x), 0.06, dlz(y));
  m.scale.setScalar(r*TL);
  dungeon.roomGrp.add(m);
  dngTele.push({ mesh:m, x, y, r, dmg, kind, src, t:1 });
}
function bossGimmick(e, dt){
  const B = DNG_BOSS[e.tier];
  if (B.gimmick==='adds'){                                 // T1: ruft 2 Adds bei 50 %
    if (!e.addsDone && e.hp <= e.maxhp*0.5){
      e.addsDone = 1;
      for (const off of [[-1.5,0],[1.5,0]]){
        const ax = clamp(e.x+off[0],1,22), ay = clamp(e.y+off[1],1,22);
        if (dWalkable(ax,ay)) spawnDungeonEnemy(ax, ay, e.tier, false);
      }
      toast('⚔️ Der Räuberhauptmann ruft Verstärkung!', 2600);
    }
    return;
  }
  e.gt -= dt;
  if (e.gt > 0) return;
  e.gt = 8;                                                // Takt 8 s (T4-Vorgabe, T2/T3 gleich)
  if (B.gimmick==='felder') addTele(hero.x, hero.y, 1.6, B.dmg, 'feld');
  else if (B.gimmick==='ansturm') addTele(hero.x, hero.y, 1.4, B.dmg, 'ansturm', e);
  else if (B.gimmick==='puls') addTele(e.x, e.y, 3.0, B.dmg, 'puls');
  snd(110,0.2,'sawtooth',0.04);
}
// --- Haupt-Update: Türen, Gegner-KI, Telegraphen, Failsafes ---
function updateDungeon(dt){
  if (!dungeon) return;
  if (!egoMode || !heroAlive()){                           // Failsafe: nie ohne Ego/Held drin
    if (dungeon && !egoMode) exitDungeon();
    return;
  }
  // Türwechsel: oben → nächster Raum, unten → voriger Raum / Ausgangs-Portal
  if (hero.x > 10.4 && hero.x < 13.6){
    if (hero.y < 1.35 && dungeon.room < dungeon.run.rooms.length-1){
      loadRoom(dungeon.room+1, 'bottom'); dngFadeFx(); return;
    }
    if (hero.y > 22.65){
      if (dungeon.room > 0){ loadRoom(dungeon.room-1, 'top'); dngFadeFx(); return; }
      exitDungeon(); return;                               // Startraum: Portal = Ausgang
    }
  }
  // Beide Lichter wandern mit dem Helden (das gesamte Lichtbudget des Dungeons)
  if (dngLights.length===2){
    dngLights[0].position.set(dlx(hero.x), 1.6, dlz(hero.y));
    dngLights[1].position.set(dlx(hero.x + Math.cos(egoYaw)*2), 1.2, dlz(hero.y + Math.sin(egoYaw)*2));
  }
  for (const e of dungeonEnemies){
    // 24f: Stagger friert Trash kurz ein; Bosse bekommen nie staggerT (applyStagger)
    if (e.staggerT > 0){ e.staggerT -= dt; e.moving = false; continue; }
    e.cd = Math.max(0, e.cd - dt);
    const d = dist(e.x,e.y,hero.x,hero.y);
    if (!e.aggro && (d < 5.5 || e.hp < e.maxhp)) e.aggro = true;
    if (e.boss && e.aggro) bossGimmick(e, dt);
    if (e.aggro){
      if (d > 0.85){ e.moving = true; dSteer(e, hero.x, hero.y, e.speed, dt); }
      else {
        e.moving = false;
        e.dir = Math.atan2(hero.y-e.y, hero.x-e.x);
        if (e.cd <= 0){
          e.cd = 1.2;
          hero.hp -= e.dmg;
          spawnBurst(dlx(hero.x), DNG_Y+0.5, dlz(hero.y), 3, 0xff8a5a);
          snd(150,0.06,'square',0.03);
        }
      }
    } else e.moving = false;
  }
  for (let i=dungeonEnemies.length-1;i>=0;i--)
    if (dungeonEnemies[i].hp <= 0) killDungeonEnemy(dungeonEnemies[i]);
  for (let i=dngTele.length-1;i>=0;i--){
    const tg = dngTele[i];
    tg.t -= dt;
    tg.mesh.scale.setScalar(tg.r*TL*(0.88 + 0.12*Math.abs(Math.sin(state.time*10))));
    if (tg.t <= 0){
      if (tg.kind==='ansturm' && tg.src && tg.src.hp > 0 && dWalkable(tg.x,tg.y)){
        tg.src.x = tg.x; tg.src.y = tg.y;                  // Boss stürmt zur Marke
        spawnBurst(dlx(tg.x), DNG_Y+0.3, dlz(tg.y), 6, 0xffd27a);
      }
      if (heroAlive() && dist(hero.x,hero.y,tg.x,tg.y) <= tg.r){
        hero.hp -= tg.dmg;
        spawnBurst(dlx(hero.x), DNG_Y+0.5, dlz(hero.y), 5, 0xff5a3a);
        snd(120,0.12,'sawtooth',0.05);
      }
      if (dungeon.roomGrp) dungeon.roomGrp.remove(tg.mesh);   // Geometrie/Material geteilt
      dngTele.splice(i,1);
    }
  }
}
// Kegel-Zielsuche auf Dungeon-Portale (Oberwelt, Priorität nach Gegnern)
function egoPortalTarget(){
  if (!heroAlive() || dungeon) return null;
  let best = null, bd2 = 2.51;
  for (const p of dngPortals){
    const d = dist(hero.x,hero.y,p.x,p.y);
    if (d >= bd2) continue;
    const an = Math.atan2(p.y-hero.y, p.x-hero.x);
    const da = Math.atan2(Math.sin(an-egoYaw), Math.cos(an-egoYaw));
    if (Math.abs(da) > 35*Math.PI/180 && d > 0.9) continue;
    bd2 = d; best = p;
  }
  return best;
}

// ============================== QUESTS (Etappe 24d, Anhang 12) ==============================
// Zwei Questgeber (📜 Anschlagtafel am Rathaus, ❗-Bürger), ein Log: 1 verfolgte + 2 wartende
// Quests. Angebote sind seed-deterministisch (Kartenseed ⊕ seedCtr) und werden MITgespeichert.
// Der Auto-Held macht keine Quests; alle Fortschritts-Hooks sind manuelle Ego-Pfade.
const questsUnlocked = ()=> !!(state && state.hero &&
  state.buildings.some(b=>b.t==='heldenhalle'));
function tafelOk(){
  const r = state.buildings.find(b=>b.t==='rathaus');
  return !!(r && !r.ruin);               // Rathaus-Ruine sperrt die Tafel bis zur Reparatur
}
function questRng(){
  state.quests.seedCtr++;
  return mulberry32((state.seed ^ Math.imul(state.quests.seedCtr, 0x9e3779b9))|0);
}
// Erreichbare Inseln = Ursprungs-Inseln mit eigenen Gebäuden (Heimat immer dabei)
function questIsles(){
  const set = new Set([isleParent[playerIsle()]||0]);
  for (const bd of state.buildings){
    if (bd.ruin) continue;
    const c = buildingCenter(bd);
    set.add(isleParent[isleOf(Math.round(c[0]), Math.round(c[1]))]||0);
  }
  return [...set];
}
function questDropTier(){
  const R = rathausLvl();
  return R>=21 ? 4 : (R>=11 ? 3 : (R>=6 ? 2 : 1));
}
function packMat(R){ return R>=21 ? {stahl:10,lithium:2} : (R>=11 ? {stahl:6} : {eisen:10}); }
function bestMarket(){
  let best = null, l = 0;
  for (const bd of state.buildings)
    if (bd.t==='markt' && !bd.ruin && lvlOf(bd) > l){ l = lvlOf(bd); best = bd; }
  return best;
}
// Auszahlungs-Klemme Lieferung: min(1,6·Verkaufswert, 0,95·Einkaufspreis) – zur MARKTLAGE
// bei Abgabe, mit allen Helden-Boni. So ist „am Markt kaufen und abliefern“ immer ein Verlust.
function lieferPayout(q){
  const k = q.param.res, n = q.need;
  const bd = bestMarket();
  let sell, buy;
  if (bd && TRADE_VAL[k] !== undefined){ sell = n*heroSellRate(bd,k); buy = n*heroBuyRate(bd,k); }
  else { const v = GOLD_VAL[k]||1; sell = n*v*0.7; buy = n*v*1.5; }   // ohne Markt: Basiskurse
  return Math.max(1, Math.floor(Math.min(sell*1.6, buy*0.95)));
}
// --- Angebots-Generator: zustandsbasiert, Gewichte laut Anhang 12.2 ---
function rollQuestOffer(giver){
  giver = giver || 'tafel';
  if (!state || !state.quests) return null;
  const rng = questRng();
  const R = rathausLvl();
  const isles = questIsles();
  const famOf = t=>(t==='schuerfen'||t==='lieferung'||t==='umsatz') ? 'sammlung' : t;
  const dungeonOk = R >= 6 && dngPortals.some(p=>isles.includes(p.isle));
  const campOk = !state.quests.active.some(q=>q.typ==='camp') &&
    !state.quests.offers.some(o=>o.typ==='camp') && !campGroup;   // max. 1 Lager
  let pool = giver==='buerger'
    ? [['jagd',40],['lieferung',40],['camp',20]]                  // Bürger: keine Dungeons
    : [['jagd',30],['camp',25],['sammlung',25],['dungeon',20]];
  const taken = giver==='buerger' ? [] : state.quests.offers.map(o=>famOf(o.typ));
  pool = pool.filter(([t])=>{
    if (taken.includes(famOf(t))) return false;                   // nie zwei identische Typen
    if (t==='dungeon' && !dungeonOk) return false;
    if (t==='camp' && !campOk) return false;
    return true;
  });
  if (!pool.length) pool = [['jagd',1]];
  let sum = 0; for (const [,w] of pool) sum += w;
  let roll = rng()*sum, typ = pool[0][0];
  for (const [t,w] of pool){ roll -= w; if (roll <= 0){ typ = t; break; } }
  if (typ==='sammlung'){
    const sub = ['schuerfen','lieferung','umsatz'];
    typ = sub[Math.floor(rng()*3)];
    if (typ==='umsatz' && !bestMarket()) typ = 'lieferung';       // Umsatz braucht einen Markt
    if (typ==='schuerfen' && !(state.hero && state.hero.pfanne)) typ = 'lieferung';
  }
  const b6 = giver==='buerger' ? 0.6 : 1;                         // Bürger: 60 % der Tafel-Werte
  const mk = (o)=>Object.assign({ id:'q'+state.quests.seedCtr+'x'+Math.floor(rng()*1e6),
    giver, buerger: giver==='buerger' ? 1 : 0, have:0, tracked:0, phase:'' }, o);
  if (typ==='jagd'){
    let isle = isles[Math.floor(rng()*isles.length)];
    let bio = (ISLES[isle] && ISLES[isle].biome) || 'wiese';
    let arts = Object.keys(WILD_ARTS).filter(k=>WILD_ARTS[k].biome===bio);
    if (!arts.length){                     // 24f: Failsafe – nie eine insel-fremde Art fordern
      isle = isleParent[playerIsle()]||0;
      bio = (ISLES[isle] && ISLES[isle].biome) || 'wiese';
      arts = Object.keys(WILD_ARTS).filter(k=>WILD_ARTS[k].biome===bio);
    }
    const art = arts[Math.floor(rng()*arts.length)] || 'hase';
    const n = 3 + Math.floor(rng()*3);
    const W = WILD_ARTS[art];
    const nm = W.name.split(' ').slice(1).join(' ');
    const txts = giver==='buerger'
      ? ['„'+W.name+' reißen unsere Vorräte! Erlege '+n+' von ihnen, ich bitte dich."',
         '„Ich traue mich kaum noch vor die Tür – '+n+' '+nm+' weniger wären ein Segen!"']
      : [W.name+' machen das '+(BIOME_NAME[bio]||'Umland')+' unsicher. Erlege '+n+' von ihnen!',
         'Die Jäger klagen über '+nm+'. Bring '+n+' zur Strecke – die Stadt zahlt Prämie.'];
    return mk({ typ:'jagd', param:{art, isle}, need:n,
      icon: W.name.split(' ')[0], title:'Jagd: '+n+'× '+nm,
      txt: txts[Math.floor(rng()*txts.length)],
      reward:{ gold: Math.round((20+5*R)*b6), expSkill:'k', expN: Math.round((20+5*R)*b6) } });
  }
  if (typ==='camp'){
    const n = 3 + Math.floor(rng()*3);
    const after = lords().length > 0 && lords().every(a=>a.defeated);
    const txts = after
      ? ['Versprengte Räuber aus Ragnars alter Bande haben ein Lager aufgeschlagen. Vertreibe sie!']
      : (giver==='buerger'
        ? ['„Am Inselrand lagern Räuber – '+n+' Halunken! Bitte vertreibe sie, edler Held."']
        : ['Räuber haben sich am Inselrand verschanzt. Vertreibe sie, ehe sie frech werden!',
           'Ein Räuberlager wurde gesichtet – '+n+' Halunken. Nur der Held räumt damit auf!']);
    return mk({ typ:'camp', param:{}, need:n, icon:'⚔️', title:'Vertreibe '+n+' Räuber',
      txt: txts[Math.floor(rng()*txts.length)],
      reward:{ gold: Math.round((35+8*R)*b6), expSkill:'k', expN: Math.round((30+6*R)*b6) } });
  }
  if (typ==='dungeon'){
    const cands = dngPortals.filter(p=>isles.includes(p.isle));
    let pick = cands[0];
    if (rng() < 0.6){                                             // 60 % nächstgelegener Dungeon
      let bd2 = 1e9;
      for (const p of cands){ const d = dist(p.x,p.y,SX,SY); if (d<bd2){ bd2=d; pick=p; } }
    } else pick = cands[Math.floor(rng()*cands.length)];
    const cleared = (state.dungeons.cleared[pick.isle]||0) > 0;    // Wiederhol-Run ist gültig
    const bossName = DNG_BOSS[pick.tier].name, dName = DNG_LOOK[pick.tier];
    const variant = rng() < 0.5;
    const txt = cleared
      ? bossName+' regt sich erneut in der '+dName+' – schlag ihn zurück!'
      : (variant ? 'Säubere die '+dName+' (Tier '+pick.tier+') – der Boss wartet in der Tiefe.'
                 : 'Besiege den '+bossName+' in der '+dName+', damit die Gegend aufatmet.');
    return mk({ typ:'dungeon', param:{isle:pick.isle, tier:pick.tier}, need:1, icon:'🕳️',
      title:(variant && !cleared ? 'Säubere die '+dName : 'Besiege den '+bossName),
      txt, reward:{ gold: 40+10*R, mat: packMat(R) } });          // EXP zahlt der Dungeon selbst
  }
  if (typ==='schuerfen'){
    const n = 8 + Math.floor(rng()*8);
    return mk({ typ:'schuerfen', param:{}, need:n, icon:'⛏️', title:'Schürfe '+n+' Nuggets',
      txt:'Die Stadtkasse braucht Glanz: Schürfe '+n+' Nuggets an den Kiesbänken. '+
        'Der Lohn kommt sofort nach dem letzten Fund.',
      reward:{ gold: Math.round((15+4*R)*b6), expSkill:'s', expN: Math.round((15+4*R)*b6) } });
  }
  if (typ==='umsatz'){
    const n = 100 + Math.floor(rng()*101);
    return mk({ typ:'umsatz', param:{}, need:n, icon:'🤝', title:'Setze '+n+' 🪙 am Markt um',
      txt:'Die Händler wollen Bewegung: Setze als Held '+n+' Gold am Markt um – '+
        'Kaufen wie Verkaufen zählt, der Lohn kommt sofort.',
      reward:{ gold: Math.round((10+3*R)*b6) } });
  }
  // Lieferung: Ressource aus dem Epochen-Fenster, Menge ≈ 30–60 Gold Verkaufswert
  const res = ['holz','stein','nahrung','eisen'];
  if (R >= 11) res.push('stahl');
  if (R >= 16) res.push('oel');
  const k = res[Math.floor(rng()*res.length)];
  const unit = (TRADE_VAL[k] !== undefined ? TRADE_VAL[k] : (GOLD_VAL[k]||1))*0.7;
  const n = Math.max(5, Math.round((30+rng()*30)/unit/5)*5);
  const q = mk({ typ:'lieferung', param:{res:k}, need:n, icon:'📦',
    title:'Liefere '+n+' '+COSTICON[k],
    txt: giver==='buerger'
      ? '„Mir fehlen '+n+' '+COSTICON[k]+' – kannst du aushelfen? Ich lege etwas Gold dazu."'
      : 'Das Lager meldet Bedarf: Bringe '+n+' '+COSTICON[k]+' zur Tafel. Auszahlung nach Marktlage.',
    reward:{ gold: 0, expSkill:'h', expN: 0 } });
  q.reward.gold = Math.max(1, Math.round(lieferPayout(q)*b6));    // Vorschau; final bei Abgabe
  return q;
}
// Tafel hält immer genau 2 Angebote (kein Nachschub-Timer)
function ensureOffers(){
  if (!questsUnlocked()) return;
  let guard = 8;
  while (state.quests.offers.length < 2 && guard-- > 0){
    const o = rollQuestOffer('tafel');
    if (o) state.quests.offers.push(o); else break;
  }
}
function declineOffer(o){
  const i = state.quests.offers.indexOf(o);
  if (i < 0) return false;
  state.quests.offers.splice(i,1);       // strafffrei – die Tafel würfelt sofort nach
  ensureOffers();
  save();
  return true;
}
function questReady(q){
  if (q.typ==='lieferung') return (state.res[q.param.res]||0) >= q.need;
  return q.have >= q.need;
}
function trackQuest(id){
  let hit = false;
  for (const q of state.quests.active){
    q.tracked = (q.id===id || q===id) ? 1 : 0;
    if (q.tracked) hit = true;
  }
  if (hit) save();
  return hit;
}
function acceptQuest(o){
  const Q = state.quests;
  if (typeof o === 'number') o = Q.offers[o];
  if (!o || Q.active.includes(o)) return false;
  if (Q.active.length >= 3){
    toast('📜 Auftrags-Log voll (max. 3) – erst abgeben oder aufgeben.');
    return false;
  }
  if (o.typ==='camp' && (Q.active.some(q=>q.typ==='camp') || campGroup)){
    toast('⚔️ Es gibt bereits ein Räuberlager auf der Karte.');
    return false;
  }
  const i = Q.offers.indexOf(o);
  if (i >= 0) Q.offers.splice(i,1);
  o.have = 0; o.phase = '';
  if (!Q.active.some(q=>q.tracked)) o.tracked = 1;
  Q.active.push(o);
  if (o.typ==='camp') spawnIntruderCamp();                        // Lager spawnt BEI Annahme
  if (o.typ==='jagd') ensureQuestWild(o);  // 24f: 2–3 Tiere der Art sofort garantieren
  ensureOffers();
  toast('📜 Auftrag angenommen: '+o.icon+' '+o.title, 3400);
  snd(520,0.08,'triangle',0.04);
  save();
  return o;
}
function abandonQuest(id){
  const Q = state.quests;
  const i = Q.active.findIndex(q=>q.id===id || q===id);
  if (i < 0) return false;
  const q = Q.active[i];
  Q.active.splice(i,1);                  // keine Strafe, kein Cooldown, kein Ruf-Verlust
  if (q.tracked && Q.active.length) Q.active[0].tracked = 1;
  unmarkCitizenFor(q.id);
  toast('🗑️ Auftrag aufgegeben – ohne Strafe.', 2600);
  save();
  return true;                           // verwaistes Lager despawnt über den 60-s-Timer
}
function completeQuest(q, force){
  const Q = state.quests;
  if (typeof q !== 'object') q = Q.active.find(a=>a.id===q);
  if (!q || !Q.active.includes(q)) return false;
  if (!force && !(questReady(q) || q.phase==='abgeben')){
    toast('📜 '+q.title+': noch nicht erfüllt ('+q.have+'/'+q.need+').');
    return false;
  }
  let gold = q.reward.gold||0, expN = q.reward.expN||0;
  if (q.typ==='lieferung'){
    if (!force && (state.res[q.param.res]||0) < q.need){
      toast('Nicht genug '+COSTICON[q.param.res]+' für die Lieferung.');
      return false;
    }
    state.res[q.param.res] = Math.max(0, (state.res[q.param.res]||0) - q.need);
    gold = lieferPayout(q);                                       // Klemme zur Marktlage jetzt
    if (q.buerger) gold = Math.max(1, Math.round(gold*0.6));
    expN = Math.round(gold/25);                                   // 1 Handel-EXP je 25 🪙
  }
  state.res.gold += gold;
  if (q.reward.mat) addLoot(q.reward.mat);
  if (expN && q.reward.expSkill) giveHeroExp(q.reward.expSkill, expN);
  let extra = '';
  if (q.typ==='camp' && Math.random() < 0.10){                    // 10 % Ausrüstungs-Drop
    if (grantEquipDrop(questDropTier())) extra = ' · 🎁';
  }
  if (q.typ==='dungeon' && Math.random() < 0.10 && state.hero){   // 10 % Amulett-Rezept
    const h = state.hero;
    h.rezepte = h.rezepte || {};
    const free = ['gluecksamulett','bergmannstalisman','haendlersiegel'].filter(a=>!h.rezepte[a]);
    if (free.length){
      const a = free[(Math.random()*free.length)|0];
      h.rezepte[a] = 1;
      toast('📜 Amulett-Rezept als Dank: '+HERO_ITEMS[a].name+' – ab sofort schmiedbar!', 4600);
      extra = ' · 📜';
    }
  }
  Q.active.splice(Q.active.indexOf(q), 1);
  if (q.tracked && Q.active.length) Q.active[0].tracked = 1;
  unmarkCitizenFor(q.id);
  Q.done++;
  if (Q.done===1 && !chronicleHas('quest1'))
    chronicleAdd('quest1', '📜 Der erste Auftrag ist erfüllt – '+reichName()+' spricht davon.');
  if (Q.done===10 && !chronicleHas('quest10'))
    chronicleAdd('quest10', '📜 Zehn Aufträge erledigt – der Held hat einen Ruf.');
  if (Q.done===50 && !chronicleHas('quest50'))
    chronicleAdd('quest50', '📜 Fünfzig Aufträge – Balladen besingen den Helden.');
  if (q.buerger){
    Q.gratitude = 120;                   // kein Stapeln – neue Abgabe setzt nur den Timer zurück
    toast('😊 Die Bürger von '+reichName()+' sind dankbar! (+5 pp Zufriedenheit für 120 s)', 4600);
  }
  toast('✅ '+q.icon+' '+q.title+' erfüllt: +'+gold+' 🪙'+
    (expN && q.reward.expSkill ? ' · ✨'+expN+' EXP' : '')+extra, 4600);
  snd(600,0.1,'triangle',0.05); snd(840,0.16,'triangle',0.05);
  ensureOffers();
  save();
  return true;
}
// Fortschritts-Hooks (killWild/mineRound/Heldenhandel/Boss-Kill/Lager-Kills rufen hier an)
function questNotify(kind, val){
  if (!state || !state.quests) return;
  for (const q of state.quests.active.slice()){
    if (q.phase==='abgeben' || q.have >= q.need) continue;
    if (kind==='jagd' && q.typ==='jagd'){
      if (val.art !== q.param.art) continue;
      if ((isleParent[isleOf(val.x,val.y)]||0) !== q.param.isle) continue;
      q.have++;
    }
    else if (kind==='mine' && q.typ==='schuerfen') q.have += val;
    else if (kind==='umsatz' && q.typ==='umsatz') q.have += val;
    else if (kind==='camp' && q.typ==='camp') q.have += val;
    else if (kind==='dungeon' && q.typ==='dungeon' && q.param.isle===val) q.have = q.need;
    else continue;
    if (q.have >= q.need){
      q.have = q.need;
      if (q.typ==='schuerfen' || q.typ==='umsatz'){
        completeQuest(q, true);          // Auto-Abschluss – ein Rückweg wäre Leerlauf
      } else {
        q.phase = 'abgeben';
        toast('📜 '+q.title+': erledigt – Abgabe beim Auftraggeber!', 3800);
        snd(660,0.1,'triangle',0.04);
      }
    }
  }
}
// Jagd-Fallback: Spawner bevorzugt die geforderte Art, bis die Quest erfüllbar ist
function questPreferredArt(p){
  if (!state || !state.quests) return null;
  for (const q of state.quests.active){
    if (q.typ!=='jagd' || q.phase==='abgeben' || q.param.isle!==p) continue;
    const alive = wildlife.reduce((n,a)=>n + (a.art===q.param.art && a.parent===p ? 1 : 0), 0);
    if (alive < q.need - q.have) return q.param.art;
  }
  return null;
}
// --- ⚔️ Eindringlings-Lager: eigene Liste campEnemies, komplett getrennt von Wellen/KI ---
let campEnemies = [], campGroup = null, campOrphanT = 0, campRetryT = 0;
function campQuest(){ return state && state.quests && state.quests.active.find(q=>q.typ==='camp'); }
function makeCampProps(){
  const g = new THREE.Group();
  const tent = (px,pz,ry,s)=>{
    const t2 = new THREE.Group();
    t2.add(prism(1.15*s, 0.75*s, 1.0*s, PM.hoodDark, 0, 0.02, 0));
    t2.add(bx(0.06,0.7*s,0.06, M.woodDark, 0.45*s, 0, 0));
    t2.position.set(px, 0, pz); t2.rotation.y = ry;
    g.add(t2);
  };
  tent(-0.95, 0.4, 0.5, 1);
  tent(1.0, -0.55, -1.1, 0.85);
  for (let i=0;i<5;i++){                                          // Feuerstelle
    const st2 = mesh(new THREE.IcosahedronGeometry(0.09,0), M.stoneDark, false, false);
    const a = Math.PI*2*i/5;
    st2.position.set(Math.cos(a)*0.32, 0.05, Math.sin(a)*0.32);
    g.add(st2);
  }
  g.add(bx(0.2,0.24,0.2, M.fire, 0, 0.12, 0));
  g.traverse(o=>{ if (o.isMesh){ o.castShadow = false; o.receiveShadow = false; } });
  return g;
}
// Ort: 70 % Rand der Spieler-Insel, 30 % Ecke einer fremden, unbesiedelten Insel (Hafen nötig)
function findCampSpot(){
  const home = isleParent[playerIsle()]||0;
  let p = home;
  if (Math.random() < 0.3 && state.buildings.some(b=>b.t==='hafen' && !b.ruin)){
    const used = questIsles();
    const f = [];
    for (let i=0;i<ISLES.length;i++){
      if (i===home || used.includes(i)) continue;
      if (siegeLordOn(i)) continue;
      f.push(i);
    }
    if (f.length) p = f[(Math.random()*f.length)|0];
  }
  const I = ISLES[p];
  for (const minD of [12, 8, 5]){        // Failsafe: Mindestabstand lockern statt nie zu spawnen
    for (let tries=0;tries<220;tries++){
      const a = Math.random()*Math.PI*2, r = I.r*(0.65+Math.random()*0.45);
      const x = Math.round(I.x+Math.cos(a)*r), y = Math.round(I.y+Math.sin(a)*r);
      if (!inMap(x,y) || !walkable(x,y,true)) continue;
      if ((isleParent[isleOf(x,y)]||0) !== p) continue;
      if (!farFromBuildings(x,y,minD)) continue;
      return [x,y];
    }
  }
  return null;
}
function spawnIntruderCamp(x, y){
  if (campGroup || !state || !state.quests) return false;         // max. 1 Lager gleichzeitig
  const q = campQuest();
  const n = (state.quests.camp && state.quests.camp.left > 0)
    ? state.quests.camp.left : (q ? q.need : 4);
  if (n <= 0) return false;
  if (x===undefined){
    const spot = findCampSpot();
    if (!spot) return false;
    x = spot[0]; y = spot[1];
  }
  const l = findLanding(Math.round(x), Math.round(y));
  x = l[0]; y = l[1];
  state.quests.camp = { x, y, left:n };
  campGroup = makeCampProps();
  campGroup.position.set(wx(x), Math.max(hAt(x,y),0), wz(y));
  fxGroup.add(campGroup);
  // Räuber-Werte: Wellen-Formel ×0,8 – der Held schafft das Lager solo in 1–3 Minuten
  const hp = 42*(1+0.12*(state.wave-1))*0.8;
  for (let i=0;i<n;i++){
    const a = Math.PI*2*i/n, d = 1.2 + Math.random();
    const p2 = findLanding(Math.round(x+Math.cos(a)*d), Math.round(y+Math.sin(a)*d));
    campEnemies.push({ x:p2[0], y:p2[1], hp, maxhp:hp, dmg:5+0.7*state.wave, cd:0,
      wait:Math.random()*2, ph:Math.random()*7, dir:Math.random()*6, moving:false,
      speed:1.1, camp:1, mesh: makePerson('enemy') });
  }
  campOrphanT = 0;
  return true;
}
function removeCamp(){
  for (const e of campEnemies) removeUnit(e);
  campEnemies = [];
  if (campGroup){ fxGroup.remove(campGroup); disposeGroup(campGroup); campGroup = null; }
  if (state && state.quests) state.quests.camp = null;
}
function updateCamp(dt){
  const q = campQuest();
  // Failsafe/Reload: Quest läuft, aber kein Lager auf der Karte → (wieder) aufbauen
  if (q && q.phase!=='abgeben' && !campGroup){
    campRetryT -= dt;
    if (campRetryT <= 0){
      campRetryT = 5;
      if (state.quests.camp && state.quests.camp.left > 0)
        spawnIntruderCamp(state.quests.camp.x, state.quests.camp.y);
      else if (!state.quests.camp) spawnIntruderCamp();
    }
  }
  if (!campGroup && !campEnemies.length) return;
  const c = state.quests.camp || { x:0, y:0 };
  // Bewegungs-Schritt deckeln (wie Wildtiere): große dt-Sprünge dürfen die Räuber
  // nicht über die 3-Kachel-Leine hinaus teleportieren
  const bdt = Math.min(dt, 0.1);
  for (const e of campEnemies){
    if (e.staggerT > 0){ e.staggerT -= bdt; e.moving = false; continue; }  // 24f: Stagger
    e.cd = Math.max(0, e.cd - bdt);
    // Angriff nur auf den Helden < 5 Kacheln; Leine 3 Kacheln ums Lager, nie Marsch zur Stadt
    const dh = heroAlive() && !hero.sail && !dungeon ? dist(e.x,e.y,hero.x,hero.y) : 1e9;
    if (dh < 5){
      if (dh > 0.85){
        if (dist(c.x,c.y,e.x,e.y) < 3){ e.moving = true; steer(e, hero.x, hero.y, e.speed, bdt); }
        else { e.moving = true; steer(e, c.x, c.y, e.speed, bdt); }  // zurück an die Leine
      } else {
        e.moving = false;
        e.dir = Math.atan2(hero.y-e.y, hero.x-e.x);
        if (e.cd <= 0){
          e.cd = 1.2;
          hero.hp -= e.dmg;
          spawnBurst(wx(hero.x), Math.max(hAt(hero.x,hero.y),0)+0.5, wz(hero.y), 3, 0xff8a5a);
          snd(150,0.06,'square',0.03);
        }
      }
      continue;
    }
    // lagern/patrouillieren im 3-Kachel-Radius
    if (e.wait > 0){ e.wait -= bdt; e.moving = false; continue; }
    if (e.tx === undefined || dist(e.x,e.y,e.tx,e.ty) < 0.5){
      const a = Math.random()*Math.PI*2, r = 0.8 + Math.random()*2.0;
      e.tx = c.x + Math.cos(a)*r; e.ty = c.y + Math.sin(a)*r;
      if (!walkable(e.tx,e.ty,true)){ e.tx = c.x; e.ty = c.y; }
    }
    e.moving = true;
    if (steer(e, e.tx, e.ty, e.speed*0.5, bdt) || Math.random() < 0.002){
      e.tx = undefined; e.wait = 1.5 + Math.random()*3; e.moving = false;
    }
  }
  // Kills verarbeiten – nur der Held kann Lager-Räuber verletzen (killLoot gilt je Räuber)
  for (let i=campEnemies.length-1;i>=0;i--){
    const e = campEnemies[i];
    if (e.hp > 0) continue;
    killLoot(e);
    spawnBurst(wx(e.x), Math.max(hAt(e.x,e.y),0)+0.4, wz(e.y), 7, 0xff8a5a);
    removeUnit(e);
    campEnemies.splice(i,1);
    if (state.quests.camp) state.quests.camp.left = campEnemies.length;
    questNotify('camp', 1);
  }
  if (!campEnemies.length && campGroup){
    // Zelte kollabieren; Plünder-Bonus nur bei laufender Quest
    const q2 = campQuest();
    if (q2){
      const bonus = 10 + 2*rathausLvl();
      addLoot({ gold: bonus });
      toast('⚔️ Lager zerschlagen! Plünder-Bonus +'+bonus+' 🪙', 4200);
    }
    spawnBurst(campGroup.position.x, campGroup.position.y+0.5, campGroup.position.z, 10, 0xd8a05a);
    removeCamp();
    save();
    return;
  }
  // verwaistes Lager (Quest aufgegeben): despawnt nach 60 s
  if (campGroup && !q){
    campOrphanT += dt;
    if (campOrphanT >= 60){
      spawnBurst(campGroup.position.x, campGroup.position.y+0.5, campGroup.position.z, 8, 0x9aa7bb);
      removeCamp();
    }
  } else campOrphanT = 0;
}
// --- ❗-Bürger als Questgeber (Laufzeit; folk wird nicht gespeichert) ---
let citizenT = 300;                      // 240–360 s bis zur nächsten Markierung
let qMarkTexA = null, qMarkTexB = null;
function questMarkTex(ok){
  const make = (sym, col)=>{
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g2 = c.getContext('2d');
    g2.font = 'bold 52px sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.lineWidth = 7; g2.strokeStyle = 'rgba(20,16,4,0.9)';
    g2.strokeText(sym, 32, 34);
    g2.fillStyle = col;
    g2.fillText(sym, 32, 34);
    const tx = new THREE.CanvasTexture(c);
    tx.userData.shared = true;
    return tx;
  };
  if (ok) return qMarkTexB = qMarkTexB || make('✓', '#4ade6a');
  return qMarkTexA = qMarkTexA || make('!', '#ffd736');
}
function makeQMarkSprite(ok){
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: questMarkTex(ok),
    depthTest:false, transparent:true }));
  spr.scale.set(0.4,0.4,1);
  spr.position.y = 1.15;                 // 0,5 Einheiten über dem Kopf
  return spr;
}
function setCitizenMark(f, ok){
  if (f.qspr){ f.mesh.remove(f.qspr); f.qspr.material.dispose(); f.qspr = null; }
  if (ok===null){ f.qsprOk = 0; return; }
  f.qspr = makeQMarkSprite(ok);
  f.qsprOk = ok ? 1 : 0;
  f.mesh.add(f.qspr);
}
function markCitizen(){
  if (!questsUnlocked()) return null;
  if (folk.some(f=>f.qmark)) return null;                         // höchstens 1 ❗ gleichzeitig
  const cands = folk.filter(f=>!f.pin);
  if (!cands.length) return null;
  const o = rollQuestOffer('buerger');
  if (!o) return null;
  const f = cands[(Math.random()*cands.length)|0];
  f.pin = 1; f.qmark = 1; f.qoffer = o;
  setCitizenMark(f, false);
  return f;
}
function unmarkCitizen(f){
  setCitizenMark(f, null);
  f.qmark = 0; f.qoffer = null; f.questId = null; f.pin = 0;
}
function unmarkCitizenFor(qid){
  for (const f of folk) if (f.questId===qid) unmarkCitizen(f);
}
function openCitizenDialog(f){
  if (!f) return;
  const q = f.questId ? state.quests.active.find(a=>a.id===f.questId) : null;
  if (q){
    // Abgabe beim Bürger, sobald die Quest bereit ist – sonst freundlicher Zwischenstand
    if (q.phase==='abgeben' || questReady(q)){
      if (completeQuest(q)) hideInfo();
      return;
    }
    $('ipName').textContent = '💬 Bürger von '+reichName();
    $('ipDesc').textContent = '„Wie steht es um meinen Auftrag? Ich zähle auf dich!"';
    $('ipStats').textContent = q.icon+' '+q.title+' · '+q.have+'/'+q.need;
    $('ipBtns').innerHTML = '';
    ui.info.style.display = 'block';
    return;
  }
  const o = f.qoffer;
  if (!o) return;
  $('ipName').textContent = '❗ Ein Bürger bittet um Hilfe';
  $('ipDesc').textContent = o.txt;
  $('ipStats').textContent = 'Belohnung: '+rewardTxt(o);
  const btns = $('ipBtns'); btns.innerHTML = '';
  const ok = document.createElement('button');
  ok.className = 'btn-green'; ok.textContent = '✅ Annehmen';
  ok.addEventListener('click', ()=>{
    const q2 = acceptQuest(o);
    if (q2){
      f.qmark = 0; f.qoffer = null; f.questId = q2.id;            // Pin bleibt bis zur Abgabe
      setCitizenMark(f, null);
    }
    hideInfo();
  });
  btns.appendChild(ok);
  const no = document.createElement('button');
  no.className = 'btn-red'; no.textContent = '✖️ Ablehnen';
  no.addEventListener('click', ()=>{ unmarkCitizen(f); hideInfo(); });   // strafffrei
  btns.appendChild(no);
  ui.info.style.display = 'block';
}
// Kegel-Zielsuche auf markierte Bürger (❗-Angebot oder ✅-Abgabe)
function egoTargetCitizen(){
  if (!heroAlive()) return null;
  let best = null, bd2 = 2.51;
  for (const f of folk){
    if (!f.qmark && !f.questId) continue;
    const d = dist(hero.x,hero.y,f.x,f.y);
    if (d >= bd2) continue;
    const an = Math.atan2(f.y-hero.y, f.x-hero.x);
    const da = Math.atan2(Math.sin(an-egoYaw), Math.cos(an-egoYaw));
    if (Math.abs(da) > 35*Math.PI/180 && d > 0.9) continue;
    bd2 = d; best = f;
  }
  return best;
}
// --- Auftrags-Sheet (Tafel/Rathaus-Panel/Heldenhalle/HUD-Zeile) ---
function rewardTxt(q){
  const p = [];
  if (q.reward.gold) p.push((q.typ==='lieferung' ? '🪙 ~' : '🪙 ')+q.reward.gold);
  if (q.reward.mat) p.push(Object.entries(q.reward.mat).map(([k,v])=>COSTICON[k]+v).join(' '));
  if (q.reward.expN && q.reward.expSkill)
    p.push('✨ '+q.reward.expN+' '+({k:'⚔️',s:'⛏️',h:'🤝'}[q.reward.expSkill]||'')+'-EXP');
  if (q.typ==='camp') p.push('🎁 10 % Ausrüstung');
  if (q.typ==='dungeon') p.push('📜 10 % Rezept');
  return p.join(' · ');
}
function openQuestSheet(){
  const Q = state.quests;
  if (!Q) return;
  ensureOffers();
  const ok = tafelOk();
  $('ipName').textContent = '📜 Aufträge der Anschlagtafel';
  $('ipDesc').textContent = ok
    ? 'Bis zu 3 Aufträge gleichzeitig (1 verfolgt + 2 wartend). Ablehnen und Aufgeben sind jederzeit strafffrei.'
    : '🔥 Das Rathaus liegt in Trümmern – die Tafel ist erst nach der Reparatur nutzbar.';
  $('ipStats').textContent = '✅ Erledigt: '+Q.done;
  const btns = $('ipBtns'); btns.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'max-height:38vh;overflow-y:auto;margin-top:4px;padding-right:2px';
  const head = (txt)=>{
    const h = document.createElement('div');
    h.style.cssText = 'margin-top:7px;font-size:12px;font-weight:700;color:#9fb4d8';
    h.textContent = txt; wrap.appendChild(h);
  };
  const row = ()=>{
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;align-items:center;gap:7px;margin-top:5px;'+
      'padding-top:5px;border-top:1px solid rgba(255,255,255,.1)';
    wrap.appendChild(r); return r;
  };
  const lab = (r, main, sub)=>{
    const l = document.createElement('div');
    l.style.cssText = 'flex:1;font-size:12.5px;color:#cfe0f0;line-height:1.35';
    const a = document.createElement('div'); a.textContent = main; l.appendChild(a);
    if (sub){
      const b2 = document.createElement('div');
      b2.style.cssText = 'font-size:11px;color:#9aa7bb'; b2.textContent = sub;
      l.appendChild(b2);
    }
    r.appendChild(l);
  };
  const btn = (r, txt, cls, fn, dis)=>{
    const b2 = document.createElement('button');
    b2.className = cls;
    b2.style.cssText = 'margin:0;flex-shrink:0;font-size:14px;padding:8px 11px;min-width:44px';
    b2.textContent = txt;
    if (dis){ b2.disabled = true; b2.style.opacity = '.45'; }
    else b2.addEventListener('click', fn);
    r.appendChild(b2);
  };
  head('Angenommen ('+Q.active.length+'/3)');
  if (!Q.active.length){
    const d2 = document.createElement('div');
    d2.style.cssText = 'font-size:11.5px;color:#9aa7bb;margin-top:4px';
    d2.textContent = 'Noch kein Auftrag angenommen.';
    wrap.appendChild(d2);
  }
  for (const q of Q.active){
    const r = row();
    const prog = q.typ==='lieferung'
      ? Math.min(q.need, Math.floor(state.res[q.param.res]||0))+'/'+q.need
      : q.have+'/'+q.need;
    lab(r, (q.tracked?'🎯 ':'')+q.icon+' '+q.title+' · '+prog,
      rewardTxt(q)+(q.giver==='buerger' ? ' · Abgabe beim Bürger' : ''));
    if (!q.tracked) btn(r, '🎯', 'btn-blue', ()=>{ trackQuest(q.id); openQuestSheet(); });
    if (questReady(q) || q.phase==='abgeben')
      btn(r, '✔️', 'btn-green', ()=>{ if (completeQuest(q)) openQuestSheet(); },
        q.giver!=='tafel' || !ok);
    btn(r, '🗑️', 'btn-red', ()=>{ abandonQuest(q.id); openQuestSheet(); });
  }
  head('Angebote ('+Q.offers.length+')');
  for (const o of Q.offers){
    const r = row();
    lab(r, o.icon+' '+o.title, o.txt+' · '+rewardTxt(o));
    btn(r, '✅', 'btn-green', ()=>{ if (acceptQuest(o)) openQuestSheet(); },
      !ok || Q.active.length >= 3);
    btn(r, '✖️', 'btn-red', ()=>{ declineOffer(o); openQuestSheet(); }, !ok);
  }
  btns.appendChild(wrap);
  ui.info.style.display = 'block';
}
// --- Ziel der verfolgten Quest (Minimap-Marker + HUD-Zeile) ---
function questTargetPos(q){
  if (!q) return null;
  if (q.phase==='abgeben' || q.typ==='lieferung'){
    if (q.giver==='buerger'){
      const f = folk.find(f2=>f2.questId===q.id);
      if (f) return [f.x, f.y];
    }
    const r = state.buildings.find(b=>b.t==='rathaus');
    return r ? buildingCenter(r) : null;
  }
  if (q.typ==='camp') return state.quests.camp ? [state.quests.camp.x, state.quests.camp.y] : null;
  if (q.typ==='dungeon'){
    const p = dngPortals.find(p2=>p2.isle===q.param.isle);
    return p ? [p.x, p.y] : null;
  }
  if (q.typ==='jagd'){
    // 24f: nächstes lebendes Quest-Tier als Marker (Minimap/Tracking), sonst Inselmitte
    let best = null, bd2 = 1e9;
    const hx = hero ? hero.x : SX, hy = hero ? hero.y : SY;
    for (const a of wildlife){
      if (a.art !== q.param.art || a.parent !== q.param.isle) continue;
      const d = dist(a.x,a.y,hx,hy);
      if (d < bd2){ bd2 = d; best = a; }
    }
    if (best) return [best.x, best.y];
    const I = ISLES[q.param.isle];
    return I ? [Math.round(I.x), Math.round(I.y)] : null;
  }
  if (q.typ==='schuerfen'){
    let sp = null, bd2 = 1e9;
    const hx = hero ? hero.x : SX, hy = hero ? hero.y : SY;
    for (const s of (state.mineSpots||[])){
      if (s.left <= 0) continue;
      const d = dist(s.x,s.y,hx,hy);
      if (d < bd2){ bd2 = d; sp = s; }
    }
    return sp ? [sp.x, sp.y] : null;
  }
  if (q.typ==='umsatz'){
    const m = bestMarket();
    return m ? buildingCenter(m) : null;
  }
  return null;
}
let questTrackMin = false;
$('questTrack').addEventListener('click', ()=>{
  if (egoMode) openQuestSheet();
  else questTrackMin = !questTrackMin;   // Orbit: Zeile abblendbar per Tipp
});
function updateQuestTrack(){
  const el = $('questTrack');
  const trk = state && state.quests && state.quests.active.find(q=>q.tracked);
  if (!trk || !gameStarted || gameOver || dungeon || (hero && hero.sail)){
    el.style.display = 'none';
    return;
  }
  el.classList.toggle('orbit', !egoMode);
  if (!egoMode && questTrackMin){ el.textContent = '📜'; el.style.display = 'block'; return; }
  const ready = questReady(trk) || trk.phase==='abgeben';
  const prog = trk.typ==='lieferung'
    ? Math.min(trk.need, Math.floor(state.res[trk.param.res]||0))+'/'+trk.need
    : trk.have+'/'+trk.need;
  let line = trk.icon+' '+trk.title+' · '+(ready ? 'Abgeben!' : prog);
  const tgt = questTargetPos(trk);
  if (egoMode && hero && tgt){
    const d = Math.round(dist(hero.x,hero.y,tgt[0],tgt[1])*2);    // Kachel ≈ 2 m
    const a = Math.atan2(tgt[1]-hero.y, tgt[0]-hero.x);
    const da = Math.atan2(Math.sin(a-egoYaw), Math.cos(a-egoYaw));
    const dirs = ['↑','↗','→','↘','↓','↙','←','↖'];
    line += ' · '+d+' m '+dirs[((Math.round(da/(Math.PI/4)))%8+8)%8];
    if ((isleParent[isleOf(tgt[0],tgt[1])]||0) !== (isleParent[isleOf(hero.x,hero.y)]||0))
      line += ' ⛵';                     // Ziel auf anderer Insel: Hafenroute nötig
  }
  el.textContent = line;
  el.style.display = 'block';
}
// --- Haupt-Update: Angebote, ❗-Bürger, Bürger-Fallback, Lager, Dankbarkeits-Timer ---
function updateQuests(dt){
  const Q = state.quests;
  if (!Q) return;
  if (Q.gratitude > 0) Q.gratitude = Math.max(0, Q.gratitude - dt);
  if (!questsUnlocked()){ updateCamp(dt); return; }               // Lager-Reste trotzdem pflegen
  ensureOffers();
  // ❗-Bürger: alle 240–360 s, wenn kein Bürger-Angebot offen ist
  if (!folk.some(f=>f.qmark)){
    citizenT -= dt;
    if (citizenT <= 0){
      markCitizen();
      citizenT = 240 + Math.random()*120;
    }
  }
  // Marker-Bobbing + Questgeber-Fallback (Bürger flüchtig → Abgabe an der Tafel)
  for (const f of folk)
    if (f.qspr) f.qspr.position.y = 1.15 + Math.sin(state.time*2.5 + (f.ph||0))*0.06;
  for (const q of Q.active){
    if (q.giver !== 'buerger') continue;
    const f = folk.find(f2=>f2.questId===q.id);
    if (!f){
      q.giver = 'tafel';                 // buerger-Flag bleibt – die Stadt dankt, nicht die Person
      toast('📜 '+q.title+': Melde dich am Rathaus.', 4200);
    } else if (q.phase==='abgeben' && (!f.qspr || !f.qsprOk)){
      setCitizenMark(f, true);           // ✅ über dem Kopf: bereit zur Abgabe
    }
  }
  updateCamp(dt);
}

// ============================== RAUMFAHRT: PLANETEN-KOLONIEN ==============================
let spaceMissions = [];
const planetsGroup = new THREE.Group(); scene.add(planetsGroup);
function spaceCost(){
  const f = Math.pow(1.35, (state.planets||[]).length);
  return { stahl:Math.round(200*f), oel:Math.round(150*f), gold:Math.round(300*f) };
}
function genPlanet(){
  const syl = ['Xor','Vel','Tau','Ker','Nov','Zet','Alu','Bra','Cyg','Dra','Eri','Lyr'];
  const end = ['a','os','ion','ar','ix','un'];
  const name = syl[Math.floor(Math.random()*syl.length)] +
    end[Math.floor(Math.random()*end.length)] + '-' + (1+Math.floor(Math.random()*98));
  const typs = [
    { typ:'Kristallwelt', res:'lithium', col:0x9fd4ff, w:3 },
    { typ:'Eisplanet',    res:'lithium', col:0xcfe8ff, w:2 },
    { typ:'Vulkanplanet', res:'eisen',   col:0xff7040, w:2 },
    { typ:'Wüstenplanet', res:'erz',     col:0xe0b060, w:2 },
    { typ:'Goldmond',     res:'gold',    col:0xffd75a, w:1 },
  ];
  const pool = [];
  typs.forEach(t=>{ for (let i=0;i<t.w;i++) pool.push(t); });
  const t = pool[Math.floor(Math.random()*pool.length)];
  return { name, typ:t.typ, res:t.res, col:t.col, rate: +(0.25+Math.random()*0.45).toFixed(2) };
}
// Kolonisierte Planeten als Himmelskörper sichtbar machen
function refreshPlanetSky(){
  disposeGroup(planetsGroup);
  (state.planets||[]).forEach((p,i)=>{
    const m = mesh(new THREE.SphereGeometry(2.0+(i%3)*0.6, 10, 8),
      new THREE.MeshBasicMaterial({ color:p.col, fog:false }), false, false);
    const a = 0.7 + i*0.95, e = 0.42 + (i%4)*0.13;
    m.position.set(Math.cos(a)*150*Math.cos(e), 100*Math.sin(e)+35, Math.sin(a)*150*Math.cos(e));
    planetsGroup.add(m);
  });
}
function launchSpace(bd){
  const c = spaceCost();
  if (!canAfford(c)){ toast('Nicht genug Ressourcen für ein Raumschiff.'); return; }
  pay(c);
  spaceMissions.push({ bd, t:0, dur:9 });
  toast('🚀 Raumschiff gestartet – Kurs auf unbekannte Welten!', 3500);
  snd(90,0.7,'sawtooth',0.06); snd(140,0.5,'sawtooth',0.05);
  hideInfo(); selected = null; hideSelQuads();
  save();
}
function updateSpace(dt){
  for (let i=spaceMissions.length-1;i>=0;i--){
    const m = spaceMissions[i];
    m.t += dt;
    const rk = m.bd.mesh && m.bd.mesh.getObjectByName('rocket');
    if (rk){
      if (m.t < 3){
        rk.visible = true;
        rk.position.y = -0.1 + Math.pow(m.t,2)*4.5;
        if (Math.random() < dt*22)
          spawnBurst(m.bd.mesh.position.x+0.3, m.bd.mesh.position.y+0.3+Math.pow(m.t,2)*4, m.bd.mesh.position.z+0.3, 2, 0xffb060);
      } else rk.visible = false;
    }
    if (m.t >= m.dur){
      spaceMissions.splice(i,1);
      if (rk){ rk.visible = true; rk.position.y = -0.1; }
      const p = genPlanet();
      state.planets.push(p);
      chronicleAdd('planet', (state.planets.length===1
        ? '🪐 Erste Kolonie im All: ' : '🪐 Neue Kolonie: ') + p.name + ' (' + p.typ + ').');
      refreshPlanetSky();
      toast('🪐 Kolonie gegründet: ' + p.name + ' (' + p.typ + ') – liefert ' +
        COSTICON[p.res] + ' +' + p.rate.toFixed(2) + '/s!', 6000);
      snd(523,0.15,'triangle',0.05); snd(659,0.15,'triangle',0.05); snd(880,0.25,'triangle',0.06);
      save();
    }
  }
}

// ============================== KI-GEGNER: DIE DREI FÜRSTEN ==============================
// Etappe 26a: aus einem Gegner werden drei. Jeder Fürst hat eigene Basis, eigenen
// Bau-Takt, eigene Wachen und eine eigene Fortschrittsanzeige. Besiegt ist ein Fürst
// erst, wenn KEIN Gebäude von ihm mehr steht (Rathaus-Fall ist nur der Wendepunkt).
const LORDS = [
  { id:'ragnar', name:'Fürst Ragnar',  icon:'⚔️', col:0xc22a2a, css:'#e05a4a',
    bt:[24,10], maxB:16, armyBase:4, armyPer:4, raidAge:380, rt:[210,60], raidN:4, guardBase:2,
    order:['haus','holzfaeller','farm','haus','kaserne','turm','haus','farm','turm','haus','kaserne','haus','turm','farm','haus'] },
  { id:'yara',   name:'Königin Yara',  icon:'👑', col:0x8a4fd6, css:'#b083ee',
    bt:[19,8],  maxB:20, armyBase:3, armyPer:3, raidAge:540, rt:[300,60], raidN:6, guardBase:2,
    order:['haus','farm','holzfaeller','haus','farm','haus','kaserne','farm','haus','turm','haus','farm','kaserne','haus','turm'] },
  { id:'vex',    name:'Baron Vex',     icon:'🛡️', col:0x1fa38c, css:'#3fd0b4',
    bt:[28,10], maxB:14, armyBase:5, armyPer:4, raidAge:720, rt:[260,60], raidN:5, guardBase:4,
    order:['turm','haus','turm','kaserne','farm','turm','haus','turm','kaserne','holzfaeller','turm','haus','farm','turm'] },
];
const AI_NAME = LORDS[0].name;          // Alt-Texte (Quests) sprechen weiter von Ragnar
const lordCfg = (ai)=> LORDS.find(l=>l.id===ai.id) || LORDS[0];
const lords = ()=> (state && state.ais) || [];
const liveLords = ()=> lords().filter(a=>!a.defeated);
// Alle KI-Gebäude flach (aiOcc zeigt in diese Liste – ein Raster für alle Fürsten)
let aiFlat = [];
const aiGroup = new THREE.Group(); scene.add(aiGroup);
let aiGuards = [];
let attackOrder = null;                 // KI-Gebäude, das die Spieler-Armee angreifen soll
let rivalT = 90;                        // Takt für die Fürsten-Rivalität (nur Flavor)

function rebuildAiOcc(){
  aiOcc.fill(0);
  aiFlat = [];
  for (const ai of lords()) for (const bd of ai.buildings){ bd.ai = ai; aiFlat.push(bd); }
  aiFlat.forEach((bd,n)=>{
    const b = BT[bd.t];
    for (let j=0;j<b.h;j++) for (let i=0;i<b.w;i++)
      if (inMap(bd.x+i,bd.y+j)) aiOcc[idx(bd.x+i,bd.y+j)] = n+1;
  });
  refreshSiegeFlags();
}
// Fortschritt eines Fürsten (auch für Tests/UI): Reste, Rekord, Rathaus noch da?
function lordProgress(i){
  const ai = lords()[i];
  if (!ai) return null;
  return { id:ai.id, alive:ai.buildings.length, peak:ai.peak||ai.buildings.length,
    hq: ai.buildings.some(b=>b.t==='rathaus'), defeated:!!ai.defeated };
}
// Insel eines Fürsten (für Dungeon-/Quest-Sperren und die Belagerungszone)
const lordIsle = (ai)=> isleParent[isleOf(ai.x, ai.y)] || 0;
// Belagerungszone: Insel mit Gebäuden eines noch unbesiegten Fürsten (26a §8.2)
function siegeLordOn(isleIdx){
  for (const ai of lords())
    if (!ai.defeated && ai.buildings.length && lordIsle(ai) === isleIdx) return ai;
  return null;
}
// Turm/Mauer/Tor dürfen im Feindgebiet gebaut werden – aber nicht direkt ans
// Lager heran (2 Kacheln Sicherheitsabstand, sonst könnte man das Rathaus zumauern)
const SIEGE_MIN_D = 2;
function siegeAllowed(t,x,y){
  const b = BT[t];
  if (!b || !(b.wall || b.tower)) return false;
  if (!siegeLordOn(isleParent[isleOf(x,y)]||0)) return false;
  for (const bd of aiFlat){
    const bb = BT[bd.t];
    for (let j=0;j<bb.h;j++) for (let i=0;i<bb.w;i++)
      if (Math.abs(bd.x+i-x) <= SIEGE_MIN_D && Math.abs(bd.y+j-y) <= SIEGE_MIN_D) return false;
  }
  return true;
}
const isSiegeBuilding = (bd)=> !!bd.siege && !!(BT[bd.t].wall || BT[bd.t].tower);
// Belagerungs-Markierung nachziehen (nach jeder Änderung an den Fürsten-Basen)
function refreshSiegeFlags(){
  if (!state || !state.buildings) return;
  for (const bd of state.buildings){
    const b = BT[bd.t];
    if (!(b.wall || b.tower)){ delete bd.siege; continue; }
    const on = siegeLordOn(isleParent[isleOf(bd.x, bd.y)]||0);
    if (on && !inSettlement(bd.x, bd.y)) bd.siege = 1; else delete bd.siege;
  }
}
function canPlaceAi(t,x,y){
  const b = BT[t];
  for (let j=0;j<b.h;j++) for (let i=0;i<b.w;i++){
    const px=x+i, py=y+j;
    if (!inMap(px,py)) return false;
    const k = idx(px,py);
    if (tiles[k]!==2 || occ[k] || aiOcc[k] || treeMap[k] || rockMap[k]) return false;
  }
  return true;
}
function addAiBuilding(ai,t,x,y,hp,noAnim){
  const bd = { t, x, y, hp: hp!==undefined?hp:BT[t].hp, ai };
  ai.buildings.push(bd);
  ai.peak = Math.max(ai.peak||0, ai.buildings.length);
  rebuildAiOcc();
  const b = BT[t];
  const [cx,cy] = [x+(b.w-1)/2, y+(b.h-1)/2];
  const g = makeBuilding(t);
  // Standarte in der Banner-Farbe des Fürsten als Feindmarkierung
  const mk = new THREE.Group(); mk.name = 'aimark';
  const y2 = (PENNANT_Y[t]||2.2) + 0.5;
  mk.add(cyl(0.025,0.025,0.8, M.timber, -0.5, y2-0.8, -0.5, 5));
  const fl = mesh(new THREE.PlaneGeometry(0.5,0.28),
    std(lordCfg(ai).col,{side:THREE.DoubleSide}), false, false);
  fl.position.set(-0.5+0.26, y2-0.16, -0.5);
  mk.add(fl);
  g.add(mk);
  g.position.set(wx(cx), Math.max(hAt(cx,cy),0.02), wz(cy));
  aiGroup.add(g);
  bd.mesh = g;
  if (!noAnim){ bd.anim2 = 0; g.scale.setScalar(0.5); }
  return bd;
}
function aiBuildingCenter(bd){ const b = BT[bd.t]; return [bd.x+(b.w-1)/2, bd.y+(b.h-1)/2]; }
// Freien Platz nahe der KI-Basis suchen (Spirale)
function findAiSpot(ai,t){
  for (let r=1;r<=8;r++){
    for (let dy=-r;dy<=r;dy++) for (let dx=-r;dx<=r;dx++){
      if (Math.max(Math.abs(dx),Math.abs(dy)) !== r) continue;
      const x = Math.round(ai.x+dx), y = Math.round(ai.y+dy);
      if (canPlaceAi(t,x,y)) return [x,y];
    }
  }
  return null;
}
// Basis für EINEN Fürsten suchen: bevorzugt auf einer mittleren Insel, nie auf der
// Heimatinsel und nie auf einer Insel, die schon ein anderer Fürst belegt.
function createLord(cfg, taken){
  let best = null, bestScore = -1;
  const pi = playerIsle();
  for (let pass=0; pass<2 && !best; pass++){
    for (let y=4;y<MAP-4;y+=2) for (let x=4;x<MAP-4;x+=2){
      if (!canPlaceAi('rathaus',x-1,y-1)) continue;
      const d = dist(x,y,SX,SY);
      if (d < 16) continue;
      const id = isleOf(x,y), par = isleParent[id]||0;
      if (taken && taken.includes(par)) continue;     // eine Insel je Fürst
      if (pass===0 && id === pi) continue;
      let free = 0;
      for (let dy=-4;dy<=4;dy++) for (let dx=-4;dx<=4;dx++)
        if (inMap(x+dx,y+dy) && tiles[idx(x+dx,y+dy)]===2 && !treeMap[idx(x+dx,y+dy)] && !rockMap[idx(x+dx,y+dy)]) free++;
      let score = free + d*0.5;
      const P = ISLES[par];
      if (P && P.cls==='mittel') score += 120;   // mittlere Inseln klar bevorzugt
      if (id !== pi) score += 80;
      if (score > bestScore){ bestScore = score; best = [x,y]; }
    }
  }
  if (!best) return null;                // keine Fläche gefunden – Fürst entfällt hier
  const ai = { id:cfg.id, x:best[0], y:best[1], buildings:[], nextBuild:0, army:0, age:0,
    bt:20, tt:35, rt:0, gt:10, defeated:false, rebuilt:0, peak:0, fallen:false, colony:null };
  state.ais.push(ai);
  addAiBuilding(ai, 'rathaus', best[0]-1, best[1]-1, undefined, true);
  return ai;
}
// Alle Fürsten für ein frisches Spiel platzieren (gestaffelte Schonfristen via cfg)
function createAllLords(){
  if (!state.ais) state.ais = [];
  const taken = [];
  for (const cfg of LORDS){
    const ai = createLord(cfg, taken);
    if (ai) taken.push(lordIsle(ai));
  }
  if (state.ais.length)
    toast('⚠️ ' + state.ais.map(a=>lordCfg(a).icon+' '+lordCfg(a).name).join(', ') +
      ' herrschen über die Nachbarinseln – reiße ihre Reiche nieder!', 6000);
}
// Ein Fürst zieht später ein (Alt-Spielstände, 26a-Migration)
function addLateLord(cfg){
  const taken = lords().map(lordIsle);
  const ai = createLord(cfg, taken);
  if (!ai) return null;
  chronicleAdd('kampf', cfg.icon+' '+cfg.name+' ist auf einer Nachbarinsel gelandet.');
  toast(cfg.icon+' '+cfg.name+' hat sich auf einer Nachbarinsel niedergelassen!', 6000);
  snd(120,0.4,'sawtooth',0.05);
  return ai;
}
function destroyAiBuilding(bd){
  const ai = bd.ai || lords().find(a=>a.buildings.includes(bd));
  if (!ai) return;
  const i = ai.buildings.indexOf(bd);
  if (i<0) return;
  ai.buildings.splice(i,1);
  if (bd.mesh){ aiGroup.remove(bd.mesh); disposeGroup(bd.mesh); }
  rebuildAiOcc();
  const [cx,cy] = aiBuildingCenter(bd);
  spawnBurst(wx(cx), hAt(cx,cy)+0.6, wz(cy), 12, 0xff8a5a);
  snd(90,0.35,'sawtooth',0.06);
  if (attackOrder===bd) attackOrder = null;
  const cfg = lordCfg(ai);
  // Plündern: ~40 % der Baukosten (das Rathaus hat keine Kosten → Fixbeute)
  const loot = {};
  for (const k in (BT[bd.t].cost||{})) loot[k] = Math.max(1, Math.round(BT[bd.t].cost[k]*0.4));
  if (bd.t==='rathaus') loot.gold = (loot.gold||0) + 120;
  addLoot(loot);
  if (bd.t==='rathaus'){
    // 26a: Der Rathaus-Fall ist der WENDEPUNKT, nicht der Sieg. Der Fürst stellt
    // Bauen, Nachschub und Überfälle ein – seine Wachen kämpfen weiter.
    ai.fallen = true;
    chronicleAdd('kampf', '💥 '+cfg.name+'s Rathaus liegt in Trümmern – sein Reich zerfällt.');
    toast('💥 '+cfg.icon+' '+cfg.name+'s Rathaus liegt in Trümmern – sein Reich zerfällt! '+
      'Noch '+ai.buildings.length+' Gebäude, dann ist er besiegt.', 6000);
  } else toast('💥 Gebäude von '+cfg.name+' zerstört und geplündert – noch '+
    ai.buildings.length+' übrig.');
  if (!ai.buildings.length) lordDefeated(ai);
}
// Teil-Sieg: ALLE Gebäude eines Fürsten sind zerstört
function lordDefeated(ai){
  if (ai.defeated) return;
  ai.defeated = true;
  ai.buildings = [];
  rebuildAiOcc();
  for (const g of aiGuards.filter(g=>g.ai===ai)) removeUnit(g);
  aiGuards = aiGuards.filter(g=>g.ai!==ai);
  if (attackOrder && attackOrder.ai===ai) attackOrder = null;
  const cfg = lordCfg(ai);
  // Belohnung: 600 Gold + 150 der höchsten freigeschalteten Epochen-Ressource
  state.res.gold += 600;
  const L = rathausLvl();
  const bonusRes = L>=26 ? 'lithium' : L>=16 ? 'oel' : L>=11 ? 'stahl' : 'eisen';
  state.res[bonusRes] = (state.res[bonusRes]||0) + 150;
  chronicleAdd('sieg', '🏆 '+cfg.name+' ist besiegt – kein Stein seines Reiches steht mehr.');
  toast('🏆 '+cfg.icon+' '+cfg.name+' ist besiegt! +600 🪙 +150 '+COSTICON[bonusRes], 6000);
  snd(523,0.2,'triangle',0.06); snd(659,0.2,'triangle',0.06); snd(784,0.3,'triangle',0.06);
  checkAllLordsDefeated();
  save();
}
// Gesamtsieg (26a-Fassung: Chronik + Toast; das große Overlay folgt in 26c)
function checkAllLordsDefeated(){
  const all = lords();
  if (!all.length || all.some(a=>!a.defeated)) return;
  if (state.lordsWon) return;
  state.lordsWon = 1;
  if (egoMode) exitEgo();
  chronicleAdd('sieg', '🏆 Alle Fürsten sind geschlagen – das Reich ist unangefochten.');
  toast('🏆 Alle Fürsten sind geschlagen! Die Inselwelt gehört dir.', 7000);
  snd(523,0.25,'triangle',0.07); snd(659,0.25,'triangle',0.07); snd(880,0.4,'triangle',0.07);
}
// Epochen-Skalierung der KI-Kämpfer (die Fürsten sollen bis Stufe 35 relevant bleiben)
function aiEraIdx(){
  const L = rathausLvl();
  let n = 0; for (let i=0;i<ERAS.length;i++) if (L>=ERAS[i].min) n = i;
  return n;
}
function spawnAiGuard(ai){
  const cfg = lordCfg(ai), ei = aiEraIdx();
  const a = Math.random()*Math.PI*2, hp = Math.round(85*(1+0.30*ei));
  const g = { x: clamp(ai.x+Math.cos(a)*2.5,1,MAP-2), y: clamp(ai.y+Math.sin(a)*2.5,1,MAP-2),
    hp, maxhp:hp, cd:0, ph:Math.random()*7, dir:0, moving:false, hostile:true, ai,
    dmg: Math.round(10*(1+0.20*ei)), col:cfg.col,
    mesh: makePerson('aisoldier') };
  if (!walkable(g.x,g.y,true)){ g.x = ai.x; g.y = ai.y+2; }
  aiGuards.push(g);
}
function spawnAiRaid(ai,n){
  if (typeof ai === 'number'){ n = ai; ai = null; }   // Kurzform spawnAiRaid(n) aus Tests
  ai = ai || liveLords()[0] || lords()[0];
  if (!ai) return;
  const cfg = lordCfg(ai), ei = aiEraIdx();
  const crossSea = isleOf(ai.x,ai.y) !== playerIsle();
  for (let i=0;i<n;i++){
    const hp = Math.round(85*(1+0.30*ei)), e = {
      x: clamp(ai.x+(Math.random()-0.5)*4,1,MAP-2),
      y: clamp(ai.y+(Math.random()-0.5)*4,1,MAP-2),
      hp, maxhp:hp, cd:0, ph:Math.random()*7, dir:0, moving:true, kind:'ai', hostile:true, ai,
      dmg: Math.round(11*(1+0.20*ei)), speed: 1.35, col:cfg.col, mesh: makePerson('aisoldier') };
    if (!walkable(e.x,e.y,true)){ e.x = ai.x; e.y = ai.y; }
    enemies.push(e);
    if (crossSea){
      // Landung nahe der Spielerbasis (mit Streuung)
      const a = Math.random()*Math.PI*2;
      startSail(e, SX+Math.cos(a)*7, SY+Math.sin(a)*7);
    }
  }
  toast(crossSea
    ? '⛵ ' + cfg.icon+' '+cfg.name + ' schickt ' + n + ' Krieger per Schiff gegen dein Dorf!'
    : '🔥 ' + cfg.icon+' '+cfg.name + ' schickt ' + n + ' Krieger gegen dein Dorf!', 4000);
  snd(120,0.5,'sawtooth',0.06);
}
// Todeskampf: Rathaus gefallen ODER weniger als 20 % des Rekordbestands übrig →
// kein Wiederaufbau, keine Truppen, keine Überfälle mehr. Das Ende bleibt knackig.
function lordBroken(ai){
  return ai.fallen || ai.buildings.length < (ai.peak||0)*0.2;
}
function updateLord(ai, dt){
  if (ai.defeated) return;
  const cfg = lordCfg(ai);
  ai.age += dt;
  const broken = lordBroken(ai);
  // Bauen (Wiederaufbau nur mit Rathaus und nur bis zum Budget von 8 Gebäuden)
  ai.bt -= dt;
  if (ai.bt <= 0){
    ai.bt = cfg.bt[0] + Math.random()*cfg.bt[1];
    if (!broken && ai.buildings.length < cfg.maxB){
      const rebuild = ai.buildings.length < (ai.peak||0);
      if (!rebuild || (ai.rebuilt||0) < 8){
        const t = cfg.order[ai.nextBuild % cfg.order.length];
        const spot = findAiSpot(ai,t);
        if (spot){
          addAiBuilding(ai, t, spot[0], spot[1]);
          if (rebuild) ai.rebuilt = (ai.rebuilt||0) + 1;
        }
        ai.nextBuild++;
      }
    }
  }
  // Truppen ansammeln
  ai.tt -= dt;
  if (ai.tt <= 0){
    ai.tt = 30;
    const kasernen = ai.buildings.filter(b=>b.t==='kaserne').length;
    if (!broken && ai.army < cfg.armyBase + kasernen*cfg.armyPer) ai.army++;
  }
  // Wachen nachrücken
  ai.gt -= dt;
  if (ai.gt <= 0){
    ai.gt = 40;
    const cap = cfg.guardBase + ai.buildings.filter(b=>b.t==='turm').length;
    if (ai.buildings.length && aiGuards.filter(g=>g.ai===ai).length < cap) spawnAiGuard(ai);
  }
  // Überfälle (erst nach Schonfrist, nie im Todeskampf)
  ai.rt -= dt;
  if (!broken && ai.age > cfg.raidAge && ai.rt <= 0){
    ai.rt = cfg.rt[0] + Math.random()*cfg.rt[1];
    const n = Math.min(ai.army, 2 + Math.floor(ai.buildings.length/cfg.raidN));
    if (n >= 2){ ai.army -= n; spawnAiRaid(ai, n); }
  }
  // Gebäude-Popanimation
  for (const bd of ai.buildings){
    if (bd.anim2 !== undefined){
      bd.anim2 = Math.min(1, bd.anim2 + dt*2.6);
      const s = bd.anim2<1 ? 0.5 + 0.5*(1-Math.pow(1-bd.anim2,3)) : 1;
      bd.mesh.scale.setScalar(s);
      if (bd.anim2>=1) delete bd.anim2;
    }
  }
}
function updateAI(dt){
  for (const ai of lords()) updateLord(ai, dt);
  // Nachzügler-Fürsten aus Alt-Spielständen ziehen nach und nach ein
  if (state.newLordT > 0){
    state.newLordT -= dt;
    if (state.newLordT <= 0){
      const fehlt = LORDS.find(c=>!lords().some(a=>a.id===c.id));
      if (fehlt){
        addLateLord(fehlt);
        state.newLordT = LORDS.some(c=>!lords().some(a=>a.id===c.id)) ? 600 : 0;
      } else state.newLordT = 0;
      save();
    }
  }
  // Rivalität: reines Flavor mit kleinem echten Effekt (Raid verspätet sich)
  rivalT -= dt;
  if (rivalT <= 0){
    rivalT = 150 + Math.random()*120;
    const live = liveLords().filter(a=>!lordBroken(a));
    if (live.length >= 2 && Math.random() < 0.25){
      const a = live[(Math.random()*live.length)|0];
      let b = live[(Math.random()*live.length)|0];
      if (b === a) b = live[(live.indexOf(a)+1) % live.length];
      a.rt += 60;
      toast(lordCfg(a).icon+' '+lordCfg(a).name+' und '+lordCfg(b).icon+' '+lordCfg(b).name+
        ' liegen im Streit – der nächste Überfall verspätet sich.', 4200);
    }
  }
}
function updateAiGuards(dt){
  for (const g of aiGuards){
    const ai = g.ai || lords()[0];
    if (!ai) continue;
    if (g.staggerT > 0){ g.staggerT -= dt; g.moving = false; continue; }   // 24f: Stagger
    g.cd = Math.max(0, g.cd-dt);
    let best = null, bd2 = 1e9, isUnit = true;
    for (const s of soldiers){ const d = dist(g.x,g.y,s.x,s.y); if (d<bd2){bd2=d;best=s;} }
    if (heroAlive() && !hero.sail && !dungeon){   // im Dungeon ist der Held „nicht da“
      const d = dist(g.x,g.y,hero.x,hero.y);
      if (d<bd2){ bd2=d; best=hero; }
    }
    // 26a §8.2: Belagerungs-Bauten im eigenen Revier werden aktiv niedergerissen –
    // Spieler-Einheiten haben Vorrang, Bauten sind das Ziel danach.
    if (!best){
      for (const bd of state.buildings){
        if (bd.ruin || !isSiegeBuilding(bd)) continue;
        const c = buildingCenter(bd);
        const d = dist(g.x,g.y,c[0],c[1]);
        if (d<bd2){ bd2=d; best=bd; isUnit=false; }
      }
    }
    const baseD = dist(g.x,g.y,ai.x,ai.y);
    if (best && bd2 < (isUnit ? 7 : 9) && baseD < 13){
      const tc = isUnit ? [best.x,best.y] : buildingCenter(best);
      const reach = isUnit ? 0.75 : (BT[best.t].w-1)*0.7 + 0.95;
      if (bd2 > reach){ g.moving = true; steer(g, tc[0], tc[1], 1.5, dt); }
      else { g.moving = false;
        if (g.cd<=0){ g.cd = 0.9; best.hp -= (g.dmg||10);
          spawnBurst(wx(tc[0]), hAt(tc[0],tc[1])+0.5, wz(tc[1]), 3, 0xffd27a);
          if (!isUnit && best.hp<=0) destroyBuilding(best); } }
    } else if (baseD > 3.5){ g.moving = true; steer(g, ai.x, ai.y, 1.2, dt); }
    else g.moving = false;
  }
  aiGuards = aiGuards.filter(g=>{
    if (g.hp<=0){ killLoot({kind:'ai', heroKill:g.heroKill});
      spawnBurst(wx(g.x), hAt(g.x,g.y)+0.4, wz(g.y), 6, 0xff8a5a);
      removeUnit(g); return false; }
    return true;
  });
}
function showAiInfo(bd){
  const ai = bd.ai || lords()[0], cfg = lordCfg(ai);
  const rest = ai ? ai.buildings.length : 1;
  $('ipName').textContent = cfg.icon + ' ' + BT[bd.t].name + ' – ' + cfg.name;
  $('ipDesc').textContent = (bd.t==='rathaus'
    ? 'Das Hauptquartier von '+cfg.name+' – fällt es, zerfällt sein Reich (baut und '+
      'überfällt nicht mehr). Besiegt ist er aber erst ohne jedes Gebäude. '
    : 'Feindliches Gebäude von ' + cfg.name + '. ') +
    'Noch ' + rest + ' Gebäude, dann ist ' + cfg.name + ' besiegt.';
  $('ipStats').textContent = '❤️ ' + Math.ceil(bd.hp) + '/' + BT[bd.t].hp;
  const btns = $('ipBtns'); btns.innerHTML = '';
  const ab = document.createElement('button');
  if (attackOrder === bd){
    ab.className = 'btn-blue'; ab.textContent = '🏠 Armee zurückziehen';
    ab.addEventListener('click', ()=>{ attackOrder = null; toast('Armee kehrt heim.'); hideInfo(); });
  } else {
    ab.className = 'btn-red'; ab.textContent = '⚔️ Armee: Angriff! (' + state.soldiersOwned + ' Einheiten)';
    ab.addEventListener('click', ()=>{
      if (!soldiers.length){ toast('Du hast keine Armee – bilde Soldaten in der Kaserne aus!'); return; }
      attackOrder = bd;
      toast('⚔️ Deine Armee marschiert auf ' + cfg.name + '!');
      snd(200,0.2,'square',0.05); hideInfo();
    });
  }
  btns.appendChild(ab);
  ui.info.style.display = 'block';
}

// ============================== WELLEN & KAMPF ==============================
let spawnEdge = null;
function pickSpawn(){
  // Räuber erscheinen am Rand der SPIELER-Insel
  const I = ISLES[0], pi = playerIsle();
  for (let tries=0;tries<300;tries++){
    const a = Math.random()*Math.PI*2;
    const r = I.r*(0.6+Math.random()*0.4);
    const x = Math.round(I.x + Math.cos(a)*r), y = Math.round(I.y + Math.sin(a)*r);
    if (inMap(x,y) && tiles[idx(x,y)]>0 && isleId[idx(x,y)]===pi) return [x,y];
  }
  return [SX+7, SY];
}
let waveAge = 0;
function waveSystem(dt){
  if (state.waveActive){
    waveAge += dt;
    // Failsafe: Welle läuft viel zu lange (z. B. festhängende Räuber) → Rückzug
    if (waveAge > 240 && enemies.length){
      for (const e of enemies) removeUnit(e);
      enemies = [];
      toast('🏳️ Die Räuber geben auf und ziehen sich zurück!');
    }
    if (enemies.length===0){
      state.waveActive = false;
      const bonus = 18 + state.wave*6;
      state.res.gold += bonus;
      toast('🎉 Welle ' + state.wave + ' abgewehrt! +' + bonus + ' 🪙');
      // Chronik: jede 5. Welle oder eine deutlich stärkere als alle bisherigen
      const strength = waveSpawnN * (1 + 0.12*(state.wave-1));
      if (state.wave % 5 === 0 || strength > chronWaveRecord*1.5)
        chronicleAdd('welle', '🛡️ Welle '+state.wave+' abgewehrt ('+waveSpawnN+' Räuber).', { w: state.wave });
      if (strength > chronWaveRecord) chronWaveRecord = strength;
      snd(520,0.15,'triangle',0.05); snd(660,0.2,'triangle',0.05);
      state.wave++; state.waveTimer = 190; spawnEdge = null; save();
    }
    return;
  }
  state.waveTimer -= dt;
  if (state.waveTimer <= 16 && !spawnEdge){
    spawnEdge = pickSpawn();
    toast('⚠️ Späher melden: Räuber nähern sich!', 3200);
    snd(140,0.4,'sawtooth',0.05);
  }
  if (state.waveTimer <= 0){
    const n = 2 + Math.floor(state.wave*1.0);
    const [sx,sy] = spawnEdge || pickSpawn();
    for (let i=0;i<n;i++)
      spawnEnemy(clamp(sx+(Math.random()-0.5)*3,1,MAP-2), clamp(sy+(Math.random()-0.5)*3,1,MAP-2));
    waveSpawnN = n;
    state.waveActive = true; spawnEdge = null; waveAge = 0;
    toast('🗡️ Welle ' + state.wave + ': ' + n + ' Räuber greifen an!', 3000);
    snd(110,0.5,'sawtooth',0.06);
  }
}
function spawnEnemy(x,y){
  // Sicherstellen, dass der Spawn auf begehbarem Land liegt (nie im Wasser!)
  if (!walkable(x,y,true)){
    const cx = Math.round(x), cy = Math.round(y);
    let found = false;
    for (let r=1; r<=5 && !found; r++)
      for (let dy=-r; dy<=r && !found; dy++)
        for (let dx=-r; dx<=r && !found; dx++)
          if (inMap(cx+dx,cy+dy) && walkable(cx+dx,cy+dy,true)){ x = cx+dx; y = cy+dy; found = true; }
    if (!found){ const p = pickSpawn(); x = p[0]; y = p[1]; }
  }
  const hp = 42 * (1 + 0.12*(state.wave-1));
  enemies.push({ x, y, hp, maxhp:hp, cd:0, ph:Math.random()*7, dir:0, moving:true, hostile:true,
    dmg: 6 + state.wave, speed: 1.05 + state.wave*0.03, mesh: makePerson('enemy') });
}
function updateEnemies(dt){
  for (const e of enemies){
    if (e.sail) continue;                            // segelt noch zur Insel
    // 24f: Stagger – kurz benommen (keine Bewegung, kein Angriff, CD friert)
    if (e.staggerT > 0){
      e.staggerT -= dt; e.moving = false; e.px = e.x; e.py = e.y;
      continue;
    }
    e.cd = Math.max(0,e.cd-dt);
    let target = null, tIsUnit = false, bd2 = 1e9;
    for (const s of soldiers){ const d = dist(e.x,e.y,s.x,s.y); if (d<4 && d<bd2){bd2=d;target=s;tIsUnit=true;} }
    // Held wird erst fokussiert, wenn er angreift (aggroT) oder sehr nah steht
    if (heroAlive() && !hero.sail && !dungeon){   // Dungeon-Held existiert für Wellen nicht
      const d = dist(e.x,e.y,hero.x,hero.y);
      if (d < (hero.aggroT>0 ? 4 : 2) && d < bd2){ bd2 = d; target = hero; tIsUnit = true; }
    }
    if (!target){
      for (const bd of state.buildings){
        if (BT[bd.t].wall || bd.ruin) continue;      // Mauern/Ruinen sind kein primäres Ziel
        const c = buildingCenter(bd);
        const d = dist(e.x,e.y,c[0],c[1]) - (BT[bd.t].w-1)*0.5;
        if (d<bd2){ bd2=d; target=bd; }
      }
    }
    // Fortschritt überwachen: blockiert → Mauer angreifen; dauerhaft fest → neu ansetzen
    if (e.wallTarget && !state.buildings.includes(e.wallTarget)) e.wallTarget = null;
    if (e.moving){
      const moved = dist(e.x, e.y, e.px!==undefined?e.px:e.x, e.py!==undefined?e.py:e.y);
      if (moved < e.speed*dt*0.3){ e.stuckT = (e.stuckT||0) + dt; e.noProg = (e.noProg||0) + dt; }
      else { e.stuckT = 0; e.noProg = 0; }
      if (!e.wallTarget && e.stuckT > 1.2){
        let wbest = null, wd = 2.6;
        for (const bd of state.buildings){
          if (bd.ruin || !(BT[bd.t].wall || BT[bd.t].tower)) continue;
          const d = dist(e.x, e.y, bd.x, bd.y);
          if (d < wd){ wd = d; wbest = bd; }
        }
        if (wbest){ e.wallTarget = wbest; }
        e.stuckT = 0;
      }
      // 8 s ohne Fortschritt und keine Mauer schuld → an neuem Landepunkt ansetzen
      if ((e.noProg||0) > 8 && !e.wallTarget){
        const p = pickSpawn();
        e.x = p[0]; e.y = p[1]; e.noProg = 0; e.stuckT = 0;
      }
    }
    e.px = e.x; e.py = e.y;
    if (e.wallTarget && !tIsUnit){ target = e.wallTarget; }
    if (!target) continue;
    const tc = tIsUnit ? [target.x,target.y] : buildingCenter(target);
    const reach = tIsUnit ? 0.75 : (BT[target.t].w-1)*0.7 + 0.95;
    const d = dist(e.x,e.y,tc[0],tc[1]);
    if (d > reach){ e.moving = true; steer(e, tc[0], tc[1], e.speed, dt); }
    else {
      e.moving = false;
      if (e.cd<=0){
        e.cd = 1.0; target.hp -= e.dmg;
        spawnBurst(wx(tc[0]), hAt(tc[0],tc[1])+0.7, wz(tc[1]), 3, 0xffd27a);
        if (!tIsUnit && target.hp<=0){
          if (e.wallTarget===target) e.wallTarget = null;
          destroyBuilding(target);
        }
      }
    }
  }
  const killed = enemies.filter(e=>e.hp<=0);
  if (killed.length){
    for (const e of killed){
      killLoot(e);
      spawnBurst(wx(e.x), hAt(e.x,e.y)+0.4, wz(e.y), 7, 0xff8a5a);
      removeUnit(e);
    }
    enemies = enemies.filter(e=>e.hp>0);
  }
}
// Trümmer-Modell für zerstörte Gebäude
function makeRuin(w,h){
  const g = new THREE.Group();
  const sw = w*1.6, sh = h*1.6;
  const rnd = mulberry32(99);
  g.add(bx(sw,0.22,sh, M.stoneDark, 0,-0.35,0));
  for (let i=0;i<4+w*h*3;i++){
    const m = mesh(new THREE.IcosahedronGeometry(0.2+rnd()*0.26,0),
      rnd()<0.5 ? M.stoneDark : std(0x3a3a40));
    m.position.set((rnd()-0.5)*sw*0.8, 0.02+rnd()*0.18, (rnd()-0.5)*sh*0.8);
    m.scale.y = 0.55; g.add(m);
  }
  for (let i=0;i<3;i++){
    const b2 = bx(0.09,0.6+rnd()*0.6,0.09, std(0x26221e),
      (rnd()-0.5)*sw*0.6, 0, (rnd()-0.5)*sh*0.6);
    b2.rotation.z = (rnd()-0.5)*1.0; b2.rotation.x = (rnd()-0.5)*0.6;
    g.add(b2);
  }
  g.traverse(o=>{ if (o.isMesh) o.castShadow = true; });
  return pruneSmallShadowCasters(g);
}
function applyRuinVisual(bd){
  const b = BT[bd.t];
  if (bd.mesh){ bldGroup.remove(bd.mesh); disposeGroup(bd.mesh); }
  const g = makeRuin(b.w, b.h);
  const [cx,cy] = buildingCenter(bd);
  g.position.set(wx(cx), Math.max(hAt(cx,cy),0.02), wz(cy));
  bldGroup.add(g);
  bd.mesh = g;
  cacheAnimParts(bd);
}
function repairCost(bd){
  const base = Object.keys(BT[bd.t].cost).length ? BT[bd.t].cost
    : (UPG[bd.t] ? UPG[bd.t][0] : {holz:50});
  return scaleCost(base, 0.6*Math.min(8, lvlOf(bd)));
}
function repairBuilding(bd){
  const c = repairCost(bd);
  if (!canAfford(c)){ toast('Nicht genug Rohstoffe für die Reparatur.'); return; }
  pay(c);
  bd.ruin = false;
  bd.hp = Math.round(maxHp(bd)*0.6);
  if (bd.mesh){ bldGroup.remove(bd.mesh); disposeGroup(bd.mesh); }
  const b = BT[bd.t];
  const [cx,cy] = buildingCenter(bd);
  const g = makeBuilding(bd.t);
  g.position.set(wx(cx), Math.max(hAt(cx,cy),0.02), wz(cy));
  bldGroup.add(g);
  bd.mesh = g;
  cacheAnimParts(bd);
  bd.anim = 0;
  applyLevelVisual(bd); recalcEff(bd); updateWalls();
  toast('🔨 ' + b.name + ' repariert und wieder in Betrieb!');
  snd(340,0.12,'triangle',0.05); snd(480,0.14,'triangle',0.05);
  showBuildingInfo(bd); save();
}
function destroyBuilding(bd){
  const name = BT[bd.t].name;
  snd(90,0.4,'sawtooth',0.07);
  if (bd.t==='rathaus'){
    if (egoMode) exitEgo();              // Game Over erzwingt die Stadtansicht
    removeBuilding(bd);
    toast('💥 ' + name + ' wurde zerstört!');
    if (selected && selected.kind==='building' && selected.bd===bd){ hideInfo(); selected=null; }
    gameOver = true;
    $('overTxt').textContent = 'Dein Rathaus fiel in Welle ' + state.wave +
      ' – Bevölkerung: ' + state.pop + '.';
    $('overOv').style.display = 'flex';
    try{ localStorage.removeItem(SAVEKEY); }catch(_){}
    return;
  }
  // Wird zur reparierbaren Ruine (behält Platz und Siedlungsgebiet!)
  bd.ruin = true;
  bd.hp = 0;
  if (bd.workers){ for (const w of bd.workers){ releaseClaims(w); removeUnit(w); } bd.workers = null; }
  applyRuinVisual(bd);
  updateWalls();
  const [cx,cy] = buildingCenter(bd);
  spawnBurst(wx(cx), hAt(cx,cy)+0.6, wz(cy), 12, 0xff8a5a);
  toast('💥 ' + name + ' liegt in Trümmern – antippen zum Reparieren!', 3600);
  if (selected && selected.kind==='building' && selected.bd===bd) showBuildingInfo(bd);
}
const arrowGeo = new THREE.BoxGeometry(0.035,0.035,0.55);
arrowGeo.userData.shared = true;
function updateTowers(dt){
  for (const bd of state.buildings){
    if (!BT[bd.t].tower || bd.ruin) continue;
    const ts = towerStats(bd);
    bd.cd = Math.max(0,(bd.cd||0)-dt);
    if (bd.cd>0) continue;
    const c = buildingCenter(bd);
    let best=null, bdd=1e9;
    for (const e of enemies){ if (e.sail) continue;
      const d = dist(c[0],c[1],e.x,e.y); if (d<=ts.range && d<bdd){bdd=d;best=e;} }
    if (best){
      bd.cd = ts.cd;
      const am = mesh(arrowGeo, M.woodLight, false, false);
      fxGroup.add(am);
      arrows.push({ x0:wx(c[0]), y0:hAt(c[0],c[1])+2.6, z0:wz(c[1]),
        e:best, t:0, dur: bdd/9, dmg:ts.dmg, mesh:am });
      snd(700,0.05,'square',0.02);
    }
  }
}
const _v1 = new THREE.Vector3();
function updateArrows(dt){
  for (const a of arrows){
    a.t += dt/a.dur;
    if (a.t>=1){
      a.dead = true; fxGroup.remove(a.mesh);
      if (a.e.hp>0){ a.e.hp -= a.dmg;
        spawnBurst(wx(a.e.x), hAt(a.e.x,a.e.y)+0.5, wz(a.e.y), 3, 0xffd27a); }
      continue;
    }
    const tx = wx(a.e.x), ty = hAt(a.e.x,a.e.y)+0.5, tz = wz(a.e.y);
    const x = lerp(a.x0,tx,a.t), z = lerp(a.z0,tz,a.t);
    const y = lerp(a.y0,ty,a.t) + Math.sin(a.t*Math.PI)*1.6;
    const nt = Math.min(1,a.t+0.05);
    _v1.set(lerp(a.x0,tx,nt), lerp(a.y0,ty,nt)+Math.sin(nt*Math.PI)*1.6, lerp(a.z0,tz,nt));
    a.mesh.position.set(x,y,z);
    a.mesh.lookAt(_v1);
  }
  arrows = arrows.filter(a=>{
    if (a.dead) return false;
    if (a.e.hp<=0){ fxGroup.remove(a.mesh); return false; }
    return true;
  });
}

// ============================== PARTIKEL ==============================
function softTex(){
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32,32,2,32,32,30);
  gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}
const puffTex = softTex();
const particles = [];
function spawnSmoke(x,y,z){
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map:puffTex, color:0xd8d8dc,
    transparent:true, opacity:0.4, depthWrite:false }));
  m.position.set(x+(Math.random()-0.5)*0.2, y, z+(Math.random()-0.5)*0.2);
  m.scale.setScalar(0.25+Math.random()*0.15);
  fxGroup.add(m);
  particles.push({ mesh:m, vx:(Math.random()-0.5)*0.1+0.12, vy:0.5+Math.random()*0.2,
    vz:(Math.random()-0.5)*0.1, life:0, max:2.4+Math.random(), grow:0.32, kind:'smoke' });
}
function spawnBurst(x,y,z,n,color){
  for (let i=0;i<n;i++){
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map:puffTex, color,
      transparent:true, opacity:0.95, depthWrite:false }));
    m.position.set(x,y,z);
    m.scale.setScalar(0.16+Math.random()*0.12);
    fxGroup.add(m);
    const a = Math.random()*Math.PI*2, sp = 0.8+Math.random()*1.6;
    particles.push({ mesh:m, vx:Math.cos(a)*sp, vy:1+Math.random()*1.6, vz:Math.sin(a)*sp,
      life:0, max:0.55, grow:0, kind:'hit' });
  }
}
function updateParticles(dt){
  for (let i=particles.length-1;i>=0;i--){
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.max){ fxGroup.remove(p.mesh); p.mesh.material.dispose(); particles.splice(i,1); continue; }
    const m = p.mesh;
    m.position.x += p.vx*dt; m.position.y += p.vy*dt; m.position.z += p.vz*dt;
    if (p.kind==='hit') p.vy -= 5*dt;
    if (p.grow) m.scale.addScalar(p.grow*dt);
    m.material.opacity = (1-p.life/p.max) * (p.kind==='smoke'?0.4:0.95);
  }
  if (particles.length > 240){
    for (let i=0;i<particles.length-240;i++){ fxGroup.remove(particles[i].mesh); particles[i].mesh.material.dispose(); }
    particles.splice(0, particles.length-240);
  }
}
let smokeTimer = 0;
const SMOKE_OFF = { haus:[-0.5,1.85,0.28], holzfaeller:[0,1.5,0], schmiede:[0.45,1.75,-0.3],
  fabrik:[-1.4,1.85,-1.2], taverne:[0.45,2.15,-0.35] };
function emitSmoke(dt){
  smokeTimer -= dt;
  if (smokeTimer>0) return;
  smokeTimer = 0.5;
  for (const bd of state.buildings){
    if (bd.ruin){                                    // Ruinen qualmen
      if (Math.random()<0.5){
        const [cx,cy] = buildingCenter(bd);
        spawnSmoke(wx(cx)+(Math.random()-0.5), Math.max(hAt(cx,cy),0)+0.4, wz(cy)+(Math.random()-0.5));
      }
      continue;
    }
    const off = SMOKE_OFF[bd.t];
    if (!off || Math.random()>=0.65) continue;
    const [cx,cy] = buildingCenter(bd);
    spawnSmoke(wx(cx)+off[0], Math.max(hAt(cx,cy),0)+off[1], wz(cy)+off[2]);
  }
}

// ============================== AUREN: LAZARETT & VERTEIDIGUNGS-HQ ==============================
// Kreuz- und Hammer-Sprites (Texturen geteilt; Sprite-Materialien wie bei den
// übrigen Partikeln pro Teilchen erzeugt und in updateParticles disposed)
function shapeTex(draw){
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; draw(g);
  return new THREE.CanvasTexture(c);
}
const crossTex = shapeTex(g=>{ g.fillRect(26,10,12,44); g.fillRect(10,26,44,12); });
const hammerTex = shapeTex(g=>{
  g.translate(32,32); g.rotate(-0.7);
  g.fillRect(-4,-6,8,32);            // Stiel
  g.fillRect(-15,-24,30,16);         // Kopf
});
function spawnRise(x,y,z,tex,color){
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, color,
    transparent:true, opacity:0.9, depthWrite:false }));
  m.position.set(x+(Math.random()-0.5)*0.5, y, z+(Math.random()-0.5)*0.5);
  m.scale.setScalar(0.24+Math.random()*0.1);
  fxGroup.add(m);
  particles.push({ mesh:m, vx:0, vy:0.8, vz:0, life:0, max:0.9, grow:0, kind:'rise' });
}
// Gegner in Reichweite? (Räuber + Ragnars Wachen – segelnde zählen nicht)
function enemyNear(x,y,r){
  for (const e of enemies) if (!e.sail && dist(x,y,e.x,e.y) <= r) return true;
  for (const g of aiGuards) if (dist(x,y,g.x,g.y) <= r) return true;
  return false;
}
let auraFxT = 0;
function updateAuras(dt){
  auraFxT -= dt;
  const fx = auraFxT <= 0;             // Partikel gedrosselt (~1,4/s je Ziel)
  if (fx) auraFxT = 0.7;
  // Lazarett: heilt eigene Einheiten (Infanterie + Fahrzeuge) außer Gefecht
  const laz = [];
  for (const bd of state.buildings){
    if (bd.t!=='lazarett' || bd.ruin) continue;
    const c = buildingCenter(bd);
    laz.push({ x:c[0], y:c[1], isle:isleOf(c[0],c[1]),
      rate:(2+(lvlOf(bd)-1)) * (biomeOfBuilding(bd)==='schnee' ? 1.25 : 1) });
  }
  const healUnits = (heroAlive() && !dungeon) ? soldiers.concat([hero]) : soldiers;   // Lazarett heilt auch den Helden
  if (laz.length) for (const s of healUnits){
    if (s.sail || s.hp >= s.maxhp) continue;
    let best = null, bd2 = 8.01;       // nur das nächste Lazarett zählt
    for (const L of laz){
      if (L.isle !== isleOf(s.x,s.y)) continue;   // keine Heilung auf fremden Inseln
      const d = dist(s.x,s.y,L.x,L.y);
      if (d <= bd2){ bd2 = d; best = L; }
    }
    if (!best || enemyNear(s.x,s.y,4)) continue;  // im Kampf wird nicht geheilt
    s.hp = Math.min(s.maxhp, s.hp + best.rate*dt);
    if (fx) spawnRise(wx(s.x), hAt(s.x,s.y)+1.1, wz(s.y), crossTex, 0x4ade6a);
  }
  // Verteidigungs-HQ: flickt Mauern/Tore/Türme im R7, solange kein Feind ansteht
  const hq = state.buildings.find(b=>b.t==='hq' && !b.ruin);
  if (hq){
    const c = buildingCenter(hq), rate = 1.5*lvlOf(hq);
    for (const bd of state.buildings){
      if (bd.ruin || !(BT[bd.t].wall || BT[bd.t].tower)) continue;
      if (isSiegeBuilding(bd)) continue;      // 26a §8.2: Belagerung bleibt Risiko
      const mh = maxHp(bd);
      if (bd.hp >= mh) continue;
      const bc = buildingCenter(bd);
      if (dist(bc[0],bc[1],c[0],c[1]) > 7.01 || enemyNear(bc[0],bc[1],6)) continue;
      bd.hp = Math.min(mh, bd.hp + rate*dt);
      if (fx) spawnRise(wx(bc[0]), hAt(bc[0],bc[1])+1.6, wz(bc[1]), hammerTex, 0xe8b04a);
    }
  }
}

// ============================== WIRTSCHAFT ==============================
function popCap(){ let c=0; for (const bd of state.buildings) c += bCap(bd); return c; }
function workRatio(){
  let need = 0;
  for (const bd of state.buildings) if (BT[bd.t].prod) need += 2;
  return need===0 ? 1 : clamp(state.pop/need, 0.25, 1);
}
function economy(dt){
  const wr = workRatio();
  const zuf = satisfaction().total;
  const starving = state.res.nahrung <= 0.01;
  for (const bd of state.buildings){
    if (bd.ruin) continue;                                          // Ruinen produzieren nichts
    const b = BT[bd.t];
    if (b.prod){
      const k = Object.keys(b.prod)[0];
      let rate = prodRate(bd)*bd.eff*wr;
      if (starving && k!=='nahrung') rate *= 0.5;
      state.res[k] += rate*dt;
    }
    if (b.gold) state.res.gold += goldRate(bd)*(0.4+0.6*zuf)*dt;   // Steuern hängen an Zufriedenheit
    if (b.smelt){
      const r = smeltRate(bd)*dt;
      if (bd.t==='stahlwerk'){                                      // Eisen + Holz(kohle) → Stahl
        const eisenN = r*1.1, holzN = r*1.5;
        if (state.res.eisen >= eisenN && state.res.holz >= holzN){
          state.res.eisen -= eisenN; state.res.holz -= holzN; state.res.stahl += r;
        }
      } else {                                                      // Schmiede: Erz + Holz → Eisen
        const erzN = r*1.2, holzN = r*0.8;
        if (state.res.erz >= erzN && state.res.holz >= holzN){
          state.res.erz -= erzN; state.res.holz -= holzN; state.res.eisen += r;
        }
      }
    }
    // Tiefe Minen fördern im Digitalzeitalter auch Lithium
    if (bd.t==='mine' && lvlOf(bd) >= 21) state.res.lithium += prodRate(bd)*0.12*dt;
  }
  // Planeten-Kolonien liefern Ressourcen
  for (const p of state.planets) state.res[p.res] += p.rate*dt;
  state.res.nahrung = Math.max(0, state.res.nahrung - state.pop*0.045*dt);
  state.popTick += dt;
  if (state.popTick > 4){
    state.popTick = 0;
    const cap = popCap();
    if (state.res.nahrung > 8 && state.pop < cap && zuf >= 0.6) state.pop++;
    else if (starving && state.pop > 2 && Math.random()<0.35){ state.pop--; toast('😟 Hunger! Ein Bewohner ist fortgezogen.'); }
  }
}

// ============================== EINGABE ==============================
const pointers = new Map();
let tapInfo = null, twoInfo = null;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pickGround(sx,sy){
  ndc.set((sx/window.innerWidth)*2-1, -(sy/window.innerHeight)*2+1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(terrainMesh, false);
  if (!hits.length) return null;
  const p = hits[0].point;
  return [Math.round(p.x/TL + C), Math.round(p.z/TL + C), p];
}
cv.addEventListener('pointerdown', (e)=>{
  if (egoMode){ egoPointerDown(e); return; }   // Ego: Joystick/Blick statt Orbit
  cancelEraFlight();                 // Eingabe bricht die Epochen-Kamerafahrt sofort ab
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY, sx:e.clientX, sy:e.clientY, moved:false});
  if (pointers.size===2){
    const [p1,p2] = [...pointers.values()];
    twoInfo = { d: dist(p1.x,p1.y,p2.x,p2.y), a: Math.atan2(p2.y-p1.y,p2.x-p1.x), dist: cam.dist, az: cam.az };
  }
  tapInfo = { t: performance.now() };
});
cv.addEventListener('pointermove', (e)=>{
  if (egoMode){ egoPointerMove(e); return; }
  const p = pointers.get(e.pointerId); if (!p) return;
  const dx = e.clientX-p.x, dy = e.clientY-p.y;
  if (Math.abs(e.clientX-p.sx)+Math.abs(e.clientY-p.sy) > 9) p.moved = true;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size===1 && p.moved){
    // Schwenken in Kameraebene
    const k = cam.dist*0.0011;
    const fx = Math.cos(cam.az), fz = Math.sin(cam.az);      // Richtung Kamera→Ziel (auf Boden projiziert)
    cam.tx += (-fx*dy - fz*dx)*k;
    cam.tz += (-fz*dy + fx*dx)*k;
    clampCam();
  } else if (pointers.size===2 && twoInfo){
    const [p1,p2] = [...pointers.values()];
    const d = dist(p1.x,p1.y,p2.x,p2.y);
    const a = Math.atan2(p2.y-p1.y,p2.x-p1.x);
    cam.dist = clamp(twoInfo.dist * twoInfo.d/Math.max(d,1), 9, 62);
    cam.az = twoInfo.az - (a - twoInfo.a);
  }
});
function endPointer(e){
  if (egoMode){ egoPointerUp(e); return; }
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (pointers.size<2) twoInfo = null;
  if (p && !p.moved && tapInfo && performance.now()-tapInfo.t < 500 && pointers.size===0)
    handleTap(e.clientX, e.clientY);
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', (e)=>{
  if (egoMode){ egoPointerUp(e); return; }
  pointers.delete(e.pointerId); if (pointers.size<2) twoInfo=null; });
cv.addEventListener('wheel', (e)=>{
  e.preventDefault();
  if (egoMode) return;
  cancelEraFlight();
  cam.dist = clamp(cam.dist * (e.deltaY<0?0.9:1.12), 9, 62);
},{passive:false});
window.addEventListener('keydown', (e)=>{
  if (e.key==='q' || e.key==='e') cancelEraFlight();
  if (e.key==='q') cam.az -= 0.12;
  if (e.key==='e') cam.az += 0.12;
});
function clampCam(){
  cam.tx = clamp(cam.tx, -MAP*TL*0.55, MAP*TL*0.55);
  cam.tz = clamp(cam.tz, -MAP*TL*0.55, MAP*TL*0.55);
}

// ============================== UI ==============================
let placing = null, selected = null;
const ui = {
  holz:$('rHolz').lastElementChild, stein:$('rStein').lastElementChild,
  erz:$('rErz').lastElementChild, eisen:$('rEisen').lastElementChild,
  nahrung:$('rNahrung').lastElementChild, gold:$('rGold').lastElementChild,
  pop:$('rPop').lastElementChild, armee:$('rArmee').lastElementChild,
  zuf:$('rZuf').lastElementChild,
  wave:$('waveTxt'), wavebar:$('wavebar'), hint:$('hint'), placebar:$('placebar'),
  info:$('infopanel'),
};
$('rZuf').addEventListener('click', ()=>{
  if (!state) return;
  const s = satisfaction();
  let msg = '😊 Zufriedenheit ' + Math.round(s.total*100) + '% — 🌾 Nahrung ' + Math.round(s.food*100) +
    '% · 🛡️ Sicherheit ' + Math.round(s.safety*100) + '% · 🏠 Wohnraum ' + Math.round(s.housing*100) + '%';
  // 4. Zeile Kultur nur ab Renaissance (satisfaction liefert sie dann mit)
  if (s.kultur !== undefined)
    msg += ' · 🎭 Kultur ' + Math.round(s.kultur*100) + '% (Tipp: Tavernen & Theater bauen)';
  toast(msg, 5000);
});
let iconRenderer = null;
function makeIcon(type, canvasEl){
  iconRenderer = iconRenderer || new THREE.WebGLRenderer({ alpha:true, antialias:true });
  const s = new THREE.Scene();
  const g = makeBuilding(type); s.add(g);
  s.add(new THREE.HemisphereLight(0xffffff, 0x777766, 1.5));
  const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(3,5,2); s.add(d);
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const pc = new THREE.PerspectiveCamera(34, canvasEl.width/canvasEl.height, 0.1, 100);
  const rmax = Math.max(size.x, size.y, size.z);
  pc.position.set(c.x+rmax*1.35, c.y+rmax*1.0, c.z+rmax*1.35);
  pc.lookAt(c);
  iconRenderer.setSize(canvasEl.width, canvasEl.height, false);
  iconRenderer.render(s, pc);
  const g2 = canvasEl.getContext('2d');
  g2.clearRect(0,0,canvasEl.width,canvasEl.height);
  g2.drawImage(iconRenderer.domElement, 0,0, canvasEl.width, canvasEl.height);
  disposeGroup(s);                       // Vorschau-Modell wieder freigeben
}
// GL-Kontext des Icon-Renderers freigeben (bei erneutem Bedarf lazy neu erzeugt)
function releaseIconRenderer(){
  if (!iconRenderer) return;
  iconRenderer.dispose();
  iconRenderer.forceContextLoss();
  iconRenderer = null;
}
function buildMenu(){
  const grid = $('bmGrid');
  for (const t of BUILDABLE){
    const b = BT[t];
    const card = document.createElement('div');
    card.className = 'bcard'; card.dataset.type = t;
    const ic = document.createElement('canvas'); ic.width = 104; ic.height = 88;
    card.appendChild(ic);
    const n = document.createElement('div'); n.className='bn'; n.textContent = b.name;
    card.appendChild(n);
    const cst = document.createElement('div'); cst.className='bc';
    cst.textContent = Object.entries(b.cost).map(([k,v])=>COSTICON[k]+v).join(' ');
    card.appendChild(cst);
    card.addEventListener('click', ()=>{
      if (!canAfford(b.cost)){ toast('Nicht genug Rohstoffe für '+b.name+'!'); snd(160,0.15,'sawtooth',0.03); return; }
      closeBuildSheet();
      startPlacing(t);
    });
    grid.appendChild(card);
    makeIcon(t, ic);
  }
  ui.buildbar = grid;
  releaseIconRenderer();                 // alle Icons gerendert – Kontext abgeben
}
let bmCat = 'eco';                       // aktive Kategorie im Baumenü
function refreshMenu(){
  if (!ui.buildbar) return;
  let vis = 0;
  for (const card of ui.buildbar.children){
    const b = BT[card.dataset.type];
    const locked = b.req && rathausLvl() < b.req;   // Gesperrtes komplett ausblenden
    const show = !locked && (b.cat||'eco')===bmCat;
    card.style.display = show ? '' : 'none';
    if (show) vis++;
    card.classList.toggle('off', !canAfford(b.cost));
    card.classList.toggle('sel', !!placing && placing.type===card.dataset.type);
  }
  $('bmEmpty').style.display = vis ? 'none' : 'block';
}
// --- Baumenü-Sheet: 🔨 öffnet, Auswahl/✕/Wisch/Hintergrund schließt ---
function unseenUnlocks(){
  if (!state) return [];
  return BUILDABLE.filter(t => (!BT[t].req || BT[t].req<=rathausLvl()) &&
    !(state.seenUnlocks||[]).includes(t));
}
function updateBuildBadge(){
  $('btnBuild').classList.toggle('alert', unseenUnlocks().length>0);
}
function openBuildSheet(){
  hideInfo(); selected = null;
  cancelPlacing();
  refreshMenu();
  const fresh = unseenUnlocks();
  if (fresh.length){                     // Badge erlischt nach dem ersten Öffnen
    state.seenUnlocks = (state.seenUnlocks||[]).concat(fresh);
    save();
  }
  updateBuildBadge();
  $('bmBack').style.display = 'block';
  $('bmSheet').classList.add('open');
}
function closeBuildSheet(){
  $('bmBack').style.display = 'none';
  $('bmSheet').classList.remove('open');
}
$('btnBuild').addEventListener('click', ()=>{
  if ($('bmSheet').classList.contains('open')) closeBuildSheet();
  else openBuildSheet();
});
$('bmClose').addEventListener('click', closeBuildSheet);
$('bmBack').addEventListener('click', closeBuildSheet);
for (const tb of document.querySelectorAll('.bmtab'))
  tb.addEventListener('click', ()=>{
    bmCat = tb.dataset.cat;
    document.querySelectorAll('.bmtab').forEach(x=>x.classList.toggle('sel', x===tb));
    refreshMenu();
  });
{ // Wisch-nach-unten am Griff schließt das Sheet
  let swipeY = null;
  const grip = $('bmGrip');
  grip.addEventListener('pointerdown', (e)=>{
    swipeY = e.clientY;
    try{ grip.setPointerCapture(e.pointerId); }catch(_){}
  });
  grip.addEventListener('pointermove', (e)=>{
    if (swipeY!==null && e.clientY-swipeY > 48){ swipeY = null; closeBuildSheet(); }
  });
  grip.addEventListener('pointerup', ()=>{ swipeY = null; });
}
function startPlacing(t){
  if (BT[t].req && rathausLvl() < BT[t].req){
    toast('🔒 ' + BT[t].name + ' benötigt Rathaus Stufe ' + BT[t].req + '.');
    snd(160,0.15,'sawtooth',0.03);
    return;
  }
  hideInfo(); selected = null;
  cancelPlacing();
  const b = BT[t];
  placing = { type:t,
    x: clamp(Math.round(cam.tx/TL + C) - Math.floor((b.w-1)/2), 0, MAP-b.w),
    y: clamp(Math.round(cam.tz/TL + C) - Math.floor((b.h-1)/2), 0, MAP-b.h) };
  ghost = makeGhost(t);
  fxGroup.add(ghost);
  gridLines.visible = true;
  ui.placebar.style.display = 'flex';
  refreshMenu(); syncPlacing();
  toast('Tippe auf die Karte, um den Bauplatz zu wählen', 2200);
}
function cancelPlacing(){
  placing = null;
  if (ghost){ fxGroup.remove(ghost); disposeGroup(ghost); ghost = null; }
  gridLines.visible = false;
  rangeRing.visible = false;
  for (const q of tileQuads) q.visible = false;
  ui.placebar.style.display = 'none';
  refreshMenu();
}
let placeHintT = -1e9;
function placingHint(t,x,y){
  // Grund für ungültigen Bauplatz ermitteln (nur fürs Feedback)
  const b = BT[t];
  if (b.terra || b.vorp) return null;
  if (b.hq && state.buildings.some(x=>x.t==='hq'))
    return '🎖️ Es kann nur ein Verteidigungs-HQ geben.';
  let tilesFree = true, settle = true, siegeZone = false, tooClose = false;
  for (let j=0;j<b.h;j++) for (let i=0;i<b.w;i++){
    const px=x+i, py=y+j;
    if (!inMap(px,py)){ tilesFree = false; continue; }
    const k = idx(px,py);
    if (tiles[k]!==2 || occ[k] || aiOcc[k] || treeMap[k] || rockMap[k]) tilesFree = false;
    if (!inSettlement(px,py)) settle = false;
    if (siegeLordOn(isleParent[isleOf(px,py)]||0)){
      siegeZone = true;
      if (!siegeAllowed(t,px,py)) tooClose = true;
    }
  }
  // 26a §8.2: Feindgebiet erklärt sich selbst – Belagerungs-Bau oder Abstandsregel
  if (tilesFree && !settle && siegeZone){
    if (!(b.wall || b.tower))
      return '⚔️ Feindgebiet: Hier sind nur Belagerungs-Bauten erlaubt (Turm, Mauer, Tor).';
    if (tooClose)
      return '⚔️ Zu nah am Feindlager – halte '+SIEGE_MIN_D+' Kacheln Abstand zu seinen Gebäuden.';
  }
  if (tilesFree && !settle)
    return '🏘️ Außerhalb deines Siedlungsgebiets – näher an Rathaus oder Vorposten bauen!';
  if (tilesFree && settle && b.harbor)
    return '⚓ Der Hafen braucht eine Kachel direkt am Wasser!';
  if (tilesFree && settle && b.coast)
    return '🗼 Der Leuchtturm braucht eine Uferkachel direkt am Wasser!';
  return null;
}
function syncPlacing(){
  if (!placing) return;
  const b = BT[placing.type], ok = canPlace(placing.type, placing.x, placing.y);
  $('pbOk').disabled = !ok;
  if (!ok){
    const now = performance.now();
    if (now - placeHintT > 3000){
      const hint = placingHint(placing.type, placing.x, placing.y);
      if (hint){ toast(hint, 2800); placeHintT = now; }
    }
  }
  const cx = placing.x+(b.w-1)/2, cy = placing.y+(b.h-1)/2;
  const gy = Math.max(hAt(cx,cy),0.02);
  ghost.position.set(wx(cx), gy, wz(cy));
  ghost.traverse(o=>{ if (o.isMesh && o.material.emissive)
    o.material.emissive.set(ok?0x1a5c2a:0x6e1a14); });
  let qi = 0;
  for (let j=0;j<b.h;j++) for (let i=0;i<b.w;i++){
    const q = tileQuads[qi++];
    q.visible = true;
    q.material = ok ? quadOk : quadBad;
    q.position.set(wx(placing.x+i), Math.max(hAt(placing.x+i,placing.y+j),0)+0.06, wz(placing.y+j));
  }
  for (;qi<4;qi++) tileQuads[qi].visible = false;
  gridLines.position.set(wx(placing.x), gy+0.04, wz(placing.y));
  if ((b.radius && !b.isleWide) || b.tower){   // Holzfäller: ganze Insel, kein irreführender Ring
    const r = (b.tower?b.tower.range:b.radius)*TL;
    rangeRing.visible = true;
    rangeRing.scale.set(r,r,1);
    rangeRing.position.set(wx(cx), gy+0.1, wz(cy));
  } else rangeRing.visible = false;
}
$('pbNo').addEventListener('click', cancelPlacing);
$('pbOk').addEventListener('click', ()=>{
  if (!placing) return;
  const t = placing.type;
  if (!canPlace(t, placing.x, placing.y)) return;
  const cost = BT[t].vorp ? vorpCost() : BT[t].cost;   // Leuchtturm: Expeditionen −25 %
  if (!canAfford(cost)){ toast('Nicht genug Rohstoffe!'); return; }
  pay(cost);
  if (BT[t].terra){
    applyTerraform(BT[t].terra, placing.x, placing.y);
    snd(300,0.18,'triangle',0.05);
  } else if (BT[t].vorp){
    // Expedition: Schiff vom nächstgelegenen Hafen zum Zielort
    let haf = null, hd = 1e9;
    for (const bd of state.buildings){
      if (bd.t!=='hafen') continue;
      const c = buildingCenter(bd);
      const d = dist(c[0],c[1],placing.x,placing.y);
      if (d<hd){ hd=d; haf=bd; }
    }
    if (haf) startExpedition(haf, placing.x, placing.y, cost);
    save();
  } else {
    const nb = addBuilding(t, placing.x, placing.y);
    if (CHRON_FIRSTS[t] && !chronicleHas('first_'+t))
      chronicleAdd('first_'+t, CHRON_FIRSTS[t]);
    snd(340,0.12,'triangle',0.05); snd(480,0.14,'triangle',0.04);
    save();
    // Heldenhalle: Panel öffnet sich sofort – der erste Held ist gratis
    if (t==='heldenhalle' && !state.hero){
      selected = { kind:'building', bd: nb };
      showBuildingInfo(nb); showSelQuads(nb);
    }
  }
  cancelPlacing();
});

function handleTap(sx,sy){
  if (!gameStarted || gameOver) return;
  const hit = pickGround(sx,sy);
  if (!hit) return;
  const [tx,ty] = hit;
  if (placing){
    const b = BT[placing.type];
    placing.x = clamp(tx-Math.floor((b.w-1)/2), 0, MAP-b.w);
    placing.y = clamp(ty-Math.floor((b.h-1)/2), 0, MAP-b.h);
    syncPlacing();
    return;
  }
  if (!inMap(tx,ty)){ hideInfo(); selected=null; hideSelQuads(); return; }
  // Held hat Tap-Priorität vor Gebäuden
  if (heroAlive() && !hero.sail && dist(tx,ty,hero.x,hero.y) < 1.3){
    selected = { kind:'hero' };
    showHeroInfo(); hideSelQuads(); snd(560,0.06,'sine',0.03);
    return;
  }
  // ❗-Bürger (24d): gleiche Tap-Priorität wie der Held – vor Gebäuden
  const fq = folk.find(f=>(f.qmark || f.questId) && dist(tx,ty,f.x,f.y) < 1.3);
  if (fq){
    selected = null; hideSelQuads();
    openCitizenDialog(fq);
    snd(560,0.06,'sine',0.03);
    return;
  }
  const k = idx(tx,ty);
  if (occ[k]){
    selected = { kind:'building', bd: state.buildings[occ[k]-1] };
    showBuildingInfo(selected.bd); showSelQuads(selected.bd); snd(520,0.06,'sine',0.03);
  } else if (aiOcc[k] && aiFlat[aiOcc[k]-1]){
    selected = { kind:'ai', bd: aiFlat[aiOcc[k]-1] };
    showAiInfo(selected.bd); hideSelQuads(); snd(380,0.06,'sine',0.03);
  } else if (treeMap[k]){
    selected = { kind:'tree', x:tx, y:ty };
    showTreeInfo(tx,ty); hideSelQuads(); snd(440,0.06,'sine',0.03);
  } else { hideInfo(); selected = null; hideSelQuads(); }
}
function showSelQuads(bd){
  const b = BT[bd.t];
  let qi = 0;
  for (let j=0;j<b.h;j++) for (let i=0;i<b.w;i++){
    const q = tileQuads[qi++];
    q.visible = true; q.material = quadSel;
    q.position.set(wx(bd.x+i), Math.max(hAt(bd.x+i,bd.y+j),0)+0.06, wz(bd.y+j));
  }
  for (;qi<4;qi++) tileQuads[qi].visible = false;
}
function hideSelQuads(){ if (!placing) for (const q of tileQuads) q.visible = false; }

function showBuildingInfo(bd){
  const b = BT[bd.t];
  if (bd.ruin){
    $('ipName').textContent = '🔥 Ruine: ' + b.name + (UPG[bd.t] ? ' (Stufe ' + lvlOf(bd) + ')' : '');
    $('ipDesc').textContent = 'Zerstört – repariere das Gebäude, um es wieder in Betrieb zu nehmen. Die Ruine hält das Siedlungsgebiet.';
    $('ipStats').textContent = '';
    const btns0 = $('ipBtns'); btns0.innerHTML = '';
    const rc = repairCost(bd);
    const rb = document.createElement('button');
    rb.className = 'btn-green';
    rb.textContent = '🔨 Reparieren (' + Object.entries(rc).map(([k,v])=>COSTICON[k]+fmt(v)).join(' ') + ')';
    rb.addEventListener('click', ()=>repairBuilding(bd));
    btns0.appendChild(rb);
    const db0 = document.createElement('button');
    db0.className = 'btn-red'; db0.textContent = '🧹 Trümmer räumen';
    db0.addEventListener('click', ()=>{
      removeBuilding(bd); hideInfo(); selected=null; hideSelQuads(); save();
      snd(200,0.15,'sawtooth',0.04);
    });
    btns0.appendChild(db0);
    ui.info.style.display = 'block';
    return;
  }
  $('ipName').textContent = b.name + (UPG[bd.t] ? ' · Stufe ' + lvlOf(bd) : '');
  $('ipDesc').textContent = b.desc;
  let stats = '❤️ ' + Math.ceil(bd.hp) + '/' + maxHp(bd);
  if (b.prod){
    const k = Object.keys(b.prod)[0];
    const rate = prodRate(bd);
    stats += ' · ' + COSTICON[k] + ' +' + (rate*bd.eff*workRatio()).toFixed(1) + '/s';
  }
  if (b.gather){
    const n = bd.workers ? bd.workers.length : 0;
    stats += ' · 👷 ' + n + '/' + gatherWorkers(bd);
    if (bd.t==='holzfaeller'){
      const c0 = buildingCenter(bd);
      const cnt = treesOnIsle(isleOf(c0[0],c0[1])).length;
      stats += ' · 🌳 ' + cnt + ' auf der Insel · Einzugsgebiet: ganze Insel' +
        (cnt===0 ? ' · ⚠️ Kein Baum mehr auf dieser Insel — der Wald wächst nach' : '');
    } else {
      const cnt = bd.t==='fischer' ? countWater(bd)
        : countNear(rockMap, bd.x, bd.y, b.w, b.h, gatherRadius(bd));
      const icon = bd.t==='fischer' ? '🌊 ' : '🪨 ';
      stats += ' · ' + icon + cnt + ' im Gebiet (R' + gatherRadius(bd) + ')' + (cnt===0?' ⚠️':'');
    }
    stats += ' · ' + COSTICON[b.gather.res] + gatherAmount(bd) + '/Fuhre';
  }
  if (b.cap) stats += ' · 👥 +' + bCap(bd);
  if (b.tower){ const ts = towerStats(bd); stats += ' · 🏹 Reichweite ' + ts.range + ' · 💥 ' + ts.dmg; }
  if (b.trains) stats += ' · ⚔️ Armee-Limit +' + (4+2*lvlOf(bd));
  if (b.vehicles){
    stats += ' · ⚔️ Armee-Limit +' + (2+lvlOf(bd)) + ' · 🏭 +' + Math.round(6*(lvlOf(bd)-1)) + '% Fahrzeugstärke';
    if (b.vehicles==='flieger') stats += ' · 🛡️ Luftpatrouille · ✈️ Tempo +' + (0.2*lvlOf(bd)).toFixed(1);
  }
  if (b.academy) stats += ' · 🔬 Forschungszeit −' + Math.min(40, 4*(lvlOf(bd)-1)) + '%';
  if (b.depot) stats += ' · 📦 Sammler im R6: +' + Math.round(depotAura(bd)*100) + '% je Fuhre';
  if (b.kultur){
    const kp = Math.round((b.kultur[0] + b.kultur[1]*(lvlOf(bd)-1)) *
      (biomeOfBuilding(bd)==='wiese' ? 1.15 : 1));
    stats += ' · 🎭 +' + kp + ' Kulturpunkte' + (rathausLvl() < 6 ? ' (wirkt ab der Renaissance)' : '');
  }
  if (b.coast) stats += ' · 🚢 Schiffe +' +
    Math.round(Math.min(60, 40+5*(lvlOf(bd)-1))) + '% Tempo · Expeditionen −25%';
  if (b.heal) stats += ' · ⛑️ +' +
    (+((2+(lvlOf(bd)-1)) * (biomeOfBuilding(bd)==='schnee'?1.25:1)).toFixed(1)) +
    ' HP/s im R8 (nur außer Gefecht)';
  if (b.hq) stats += ' · 🎖️ Armee-Deckel ' + Math.min(75, 60+3*lvlOf(bd)) +
    ' · 🔧 Befestigungen +' + (1.5*lvlOf(bd)).toFixed(1) + ' HP/s im R7';
  if (b.smelt) stats += ' · ⚙️ +' + smeltRate(bd).toFixed(2) + '/s (aus ⛏️ Erz + 🪵 Holz)';
  if (b.market) stats += ' · 💱 Kurse verbessern sich je Stufe';
  if (bd.t==='rathaus' && state.doctrine)
    stats += ' · ' + (state.doctrine==='mil' ? '⚔️ Militär-Doktrin' : '🏛️ Wirtschafts-Doktrin');
  {
    // Aktive Biom-Boni dieses Betriebs anzeigen
    const bio = biomeOfBuilding(bd), m = BIOME_MULT[bio] || {};
    const parts = [];
    if (b.gather && m[b.gather.res]) parts.push('+'+Math.round((m[b.gather.res]-1)*100)+'% '+COSTICON[b.gather.res]);
    if (b.prod){ const k2 = Object.keys(b.prod)[0]; if (m[k2]) parts.push('+'+Math.round((m[k2]-1)*100)+'% '+COSTICON[k2]); }
    if (b.gold && m.gold) parts.push('+'+Math.round((m.gold-1)*100)+'% 🪙');
    if (b.kultur && bio==='wiese') parts.push('+15% 🎭');
    if (b.heal && bio==='schnee') parts.push('+25% ⛑️');
    if (parts.length) stats += ' · 🏝️ Biom-Bonus '+BIOME_NAME[bio]+': '+parts.join(' ');
  }
  $('ipStats').textContent = stats;
  const btns = $('ipBtns'); btns.innerHTML = '';
  // Ausbildungs-Button mit effektiven Werten (Gebäude-Stufe × Forschung × Doktrin)
  const addTrainBtn = (kind, cost, label)=>{
    const es = effUnitStats(kind, bd);
    const c = trainCostOf(bd, kind, cost);
    const tb = document.createElement('button');
    tb.className = 'btn-green';
    tb.textContent = label + ' (💥' + es.dmg + ' · ❤️' + es.hp + ') – ' +
      Object.entries(c).map(([k,v])=>COSTICON[k]+v).join(' ');
    tb.addEventListener('click', ()=>trainUnit(bd, kind, cost, label));
    btns.appendChild(tb);
  };
  if (b.trains){
    addTrainBtn('soldier', SOLDIER_COST, '⚔️ Soldat');
    if (lvlOf(bd) >= 3)  addTrainBtn('ritter', RITTER_COST, '🛡️ Ritter');
    if (lvlOf(bd) >= 31) addTrainBtn('laser', LASER_COST, '⚡ Laser-Trooper');
    // Panzer/Flieger wurden in Fabrik und Flugfeld ausgelagert (Etappe 21)
    if (rathausLvl() >= 16){
      const note = document.createElement('div');
      note.style.cssText = 'font-size:12px;color:#9fb4d8;margin-top:6px';
      note.textContent = '🏭 Panzer & ✈️ Flieger: siehe Fahrzeugfabrik / Flugfeld.';
      btns.appendChild(note);
    }
  }
  // Fahrzeugfabrik / Flugfeld: bauen ihre Fahrzeuge selbst
  if (b.vehicles){
    if (b.vehicles==='panzer') addTrainBtn('panzer', PANZER_COST, '🛡️ Panzer');
    else addTrainBtn('flieger', FLIEGER_COST, '✈️ Flugzeug');
    if (biomeOfBuilding(bd)==='vulkan'){
      const note = document.createElement('div');
      note.style.cssText = 'font-size:12px;color:#9fb4d8;margin-top:4px';
      note.textContent = '🌋 Vulkanland: Fahrzeug-Ausbildung 10% günstiger.';
      btns.appendChild(note);
    }
  }
  if (b.academy) buildAcademyPanel(btns, bd);
  // Doktrin (am Rathaus ab Stufe 2)
  if (bd.t==='rathaus' && lvlOf(bd) >= 2){
    if (!state.doctrine){
      for (const [key,label] of [['mil','⚔️ Doktrin: Militär'],['eco','🏛️ Doktrin: Wirtschaft']]){
        const db2 = document.createElement('button');
        db2.className = key==='mil' ? 'btn-red' : 'btn-green';
        db2.textContent = label;
        db2.addEventListener('click', ()=>{
          state.doctrine = key;
          toast(key==='mil'
            ? '⚔️ Militär-Doktrin: +25% Truppenstärke, +20% Turmschaden, Ausbildung 20% billiger!'
            : '🏛️ Wirtschafts-Doktrin: +20% Produktion, +25% Steuern!', 4200);
          snd(392,0.12,'triangle',0.05); snd(523,0.16,'triangle',0.05);
          showBuildingInfo(bd); save();
        });
        btns.appendChild(db2);
      }
    } else {
      const sw = document.createElement('button');
      sw.className = 'btn-blue';
      sw.textContent = (state.doctrine==='mil'?'⚔️ Militär':'🏛️ Wirtschaft') + ' → wechseln (🪙200)';
      sw.addEventListener('click', ()=>{
        if (state.res.gold < 200){ toast('Nicht genug Gold für den Doktrinwechsel.'); return; }
        state.res.gold -= 200;
        state.doctrine = state.doctrine==='mil' ? 'eco' : 'mil';
        toast('Doktrin gewechselt zu ' + (state.doctrine==='mil'?'⚔️ Militär':'🏛️ Wirtschaft') +
          ' (neue Truppen erhalten die neuen Boni).', 3800);
        showBuildingInfo(bd); save();
      });
      btns.appendChild(sw);
    }
  }
  // 📜 Anschlagtafel (24d): Aufträge ab Heldenhalle + Held
  if (bd.t==='rathaus' && questsUnlocked()){
    ensureOffers();
    const qb = document.createElement('button');
    qb.className = 'btn-blue';
    qb.textContent = '📜 Aufträge (' + state.quests.offers.length + ')';
    qb.addEventListener('click', ()=>openQuestSheet());
    btns.appendChild(qb);
  }
  // Raumhafen: Planeten-Expeditionen
  if (b.space){
    const list = document.createElement('div');
    list.style.cssText = 'font-size:12px;margin-top:5px;line-height:1.5;color:#cfe0f0';
    list.innerHTML = state.planets.length
      ? '🪐 Kolonien:<br>' + state.planets.map(p=>'&nbsp;&nbsp;'+p.name+' ('+p.typ+'): '+COSTICON[p.res]+' +'+p.rate.toFixed(2)+'/s').join('<br>')
      : 'Noch keine Kolonien – starte ein Raumschiff!';
    btns.appendChild(list);
    const c = spaceCost();
    const sb = document.createElement('button');
    sb.className = 'btn-blue';
    sb.textContent = '🚀 Raumschiff starten (' +
      Object.entries(c).map(([k,v])=>COSTICON[k]+fmt(v)).join(' ') + ')';
    sb.addEventListener('click', ()=>launchSpace(bd));
    btns.appendChild(sb);
  }
  // Hafen: Expedition starten (Leuchtturm senkt die Kosten um 25 %)
  if (b.harbor){
    const eb = document.createElement('button');
    eb.className = 'btn-blue';
    eb.textContent = '🚢 Expedition: Vorposten gründen (' +
      Object.entries(vorpCost()).map(([k,v])=>COSTICON[k]+v).join(' ') + ')' +
      (lighthouseLvl() ? ' 🗼−25%' : '');
    eb.addEventListener('click', ()=>{
      if (!canAfford(vorpCost())){ toast('Nicht genug Vorräte für eine Expedition.'); return; }
      hideInfo(); selected = null; hideSelQuads();
      startPlacing('__vorp');
      toast('Tippe das Ziel auf einer anderen Insel an!', 3200);
    });
    btns.appendChild(eb);
  }
  // Handel (am Markt): Tabs Waren | Ausrüstung (25a)
  if (b.market){
    buildMarketTabs(btns, ()=>showBuildingInfo(bd));
    if (marktTab === 'gear'){
      buildGearShop(btns, ()=>showBuildingInfo(bd));
    } else {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-top:6px';
    for (const k of ['holz','stein','nahrung','erz','eisen']){
      const s = document.createElement('button');
      s.className = 'btn-blue';
      s.style.cssText = 'padding:6px 8px;font-size:12px;margin:0';
      s.textContent = COSTICON[k]+'50 → 🪙'+Math.round(50*sellRate(bd,k));
      s.addEventListener('click', ()=>{
        if (state.res[k] < 50){ toast('Nicht genug '+COSTICON[k]+' zum Verkaufen.'); return; }
        state.res[k] -= 50;
        state.res.gold += Math.round(50*sellRate(bd,k));
        snd(600,0.08,'triangle',0.04); showBuildingInfo(bd); save();
      });
      const bb = document.createElement('button');
      bb.className = 'btn-green';
      bb.style.cssText = 'padding:6px 8px;font-size:12px;margin:0';
      bb.textContent = '🪙'+Math.ceil(50*buyRate(bd,k))+' → '+COSTICON[k]+'50';
      bb.addEventListener('click', ()=>{
        const cost = Math.ceil(50*buyRate(bd,k));
        if (state.res.gold < cost){ toast('Nicht genug Gold zum Einkaufen.'); return; }
        state.res.gold -= cost;
        state.res[k] += 50;
        snd(700,0.08,'triangle',0.04); showBuildingInfo(bd); save();
      });
      wrap.appendChild(s); wrap.appendChild(bb);
    }
    btns.appendChild(wrap);
    }
  }
  // Heldenhalle: Rekrutierung (1. Held gratis, Name per 🎲) bzw. Helden-Übersicht
  if (bd.t==='heldenhalle'){
    if (!state.hero){
      if (!pendingHeroName) rollHeroName();
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:6px';
      const nm = document.createElement('div');
      nm.style.cssText = 'flex:1;font-size:13.5px;font-weight:600;color:#ffe9b0';
      nm.textContent = '⚔️ ' + pendingHeroName;
      row.appendChild(nm);
      const dice = document.createElement('button');
      dice.className = 'btn-blue';
      dice.style.cssText = 'margin:0;flex-shrink:0;padding:8px 12px';
      dice.textContent = '🎲';
      dice.title = 'Neuen Namen würfeln';
      dice.addEventListener('click', ()=>{ rollHeroName(); showBuildingInfo(bd); snd(500,0.05,'sine',0.03); });
      row.appendChild(dice);
      btns.appendChild(row);
      const rb2 = document.createElement('button');
      rb2.className = 'btn-green';
      rb2.textContent = '⚔️ Held rekrutieren (gratis)';
      rb2.addEventListener('click', ()=>{ if (recruitHero()) showBuildingInfo(bd); });
      btns.appendChild(rb2);
    } else {
      const inf = document.createElement('div');
      inf.style.cssText = 'font-size:12.5px;margin-top:5px;color:#cfe0f0';
      inf.textContent = '⚔️ ' + state.hero.name + ' · Heldenstufe ' + heroLevel() +
        ' · ❤️ ' + Math.ceil(hero?hero.hp:state.hero.hp) + '/' + heroMaxHp() +
        (state.hero.respawn>0 ? ' · 🛌 kehrt in ' + Math.ceil(state.hero.respawn) + ' s zurück' : '');
      btns.appendChild(inf);
      const cb2 = document.createElement('button');
      cb2.className = 'btn-green';
      cb2.textContent = '🎮 Held steuern';
      cb2.addEventListener('click', ()=>{ hideInfo(); selected = null; hideSelQuads(); enterEgo(); });
      btns.appendChild(cb2);
      if (questsUnlocked()){
        ensureOffers();
        const qb2 = document.createElement('button');
        qb2.className = 'btn-blue';
        qb2.textContent = '📜 Aufträge (' + state.quests.offers.length + ')';
        qb2.addEventListener('click', ()=>openQuestSheet());
        btns.appendChild(qb2);
      }
    }
  }
  // 🎒 Beutel leeren (Abgabepunkte): Held muss in der Nähe stehen
  if ((bd.t==='markt' || bd.t==='rathaus' || bd.t==='heldenhalle') && state.hero && bagCount() > 0){
    const eb2 = document.createElement('button');
    eb2.className = 'btn-blue';
    eb2.textContent = '🎒 Beutel leeren (+' + Math.round(bagValue()) + ' 🪙)';
    eb2.addEventListener('click', ()=>{
      const c2 = buildingCenter(bd);
      if (!heroAlive() || dist(hero.x,hero.y,c2[0],c2[1]) - (BT[bd.t].w-1)*0.7 > 3.01){
        toast('🎒 Der Held ist zu weit entfernt – er trägt den Beutel.');
        return;
      }
      emptyBag(); showBuildingInfo(bd);
    });
    btns.appendChild(eb2);
  }
  const uc = upgradeCost(bd);
  if (uc){
    const ub = document.createElement('button');
    ub.className = 'btn-blue';
    ub.textContent = '⬆️ Ausbauen: Stufe ' + (lvlOf(bd)+1) + ' (' +
      Object.entries(uc).map(([k,v])=>COSTICON[k]+v).join(' ') + ')';
    ub.addEventListener('click', ()=>{ if (tryUpgrade(bd)) showBuildingInfo(bd); });
    btns.appendChild(ub);
  }
  if (bd.t !== 'rathaus'){
    const db = document.createElement('button');
    db.className = 'btn-red'; db.textContent = '🧨 Abreißen (50% zurück)';
    db.addEventListener('click', ()=>{
      for (const k2 in b.cost) state.res[k2] += Math.floor(b.cost[k2]/2);
      removeBuilding(bd); hideInfo(); selected=null; hideSelQuads(); save();
      snd(200,0.2,'sawtooth',0.04);
    });
    btns.appendChild(db);
  }
  ui.info.style.display = 'block';
}
function showTreeInfo(x,y){
  $('ipName').textContent = '🌳 Baum';
  $('ipDesc').textContent = 'Kann gefällt werden für sofortiges Holz.';
  $('ipStats').textContent = '';
  const btns = $('ipBtns'); btns.innerHTML = '';
  const cb = document.createElement('button');
  cb.className = 'btn-blue'; cb.textContent = '🪓 Fällen (+6 🪵)';
  cb.addEventListener('click', ()=>{
    const t = treeList.find(q=>q.x===x && q.y===y);
    if (!t) return;
    fellTree(t);
    state.res.holz += 6;
    hideInfo(); selected=null; save(); snd(300,0.1,'square',0.04);
  });
  btns.appendChild(cb);
  ui.info.style.display = 'block';
}
function hideInfo(){ ui.info.style.display='none'; }
function rebuildScatterOnly(){
  // Failsafe-Vollaufbau der Streuobjekte (nur wenn die Instanz-Slots nicht reichen);
  // Terrain/Wasser bleiben, geteilte Geometrien werden NICHT disposed
  const keep = [terrainMesh, waterMesh, seabed];
  for (let i=worldGroup.children.length-1;i>=0;i--){
    const ch = worldGroup.children[i];
    if (!keep.includes(ch)){ worldGroup.remove(ch); disposeGroup(ch); }
  }
  buildScatter(mulberry32(state.seed ^ 0x77aa11));
}
function trainUnit(bd, kind, cost, label){
  if (state.soldiersOwned >= armyCap()){ toast('Maximale Armeegröße erreicht ('+armyCap()+') – Militärgebäude ausbauen!'); return; }
  const c = trainCostOf(bd, kind, cost);
  if (!canAfford(c)){ toast('Nicht genug Ressourcen für '+label+'!'); return; }
  pay(c);
  state.soldiersOwned++;
  spawnSoldier(bd, kind);
  toast(label + ' einsatzbereit!');
  snd(240,0.12,'square',0.05); snd(400,0.16,'square',0.05);
  showBuildingInfo(bd); save();
}
// --- Akademie-Panel: Fortschrittsbalken + je Einheit 3 Forschungszeilen ---
let acadProg = null;                 // laufende Anzeige {txt,fill,nl} fürs HUD-Update
function buildAcademyPanel(btns, bd){
  const wrap = document.createElement('div');
  wrap.style.cssText = 'max-height:36vh;overflow-y:auto;margin-top:4px;padding-right:2px';
  const j = state.researchJob;
  acadProg = null;
  if (j){
    const nl = researchLvl(j.unit, j.branch)+1;
    const head = document.createElement('div');
    head.style.cssText = 'margin:4px 0 3px;font-size:12.5px;color:#cfe0f0';
    const barBg = document.createElement('div');
    barBg.style.cssText = 'height:8px;border-radius:4px;background:rgba(255,255,255,.15);overflow:hidden;margin-bottom:4px';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;background:#3fae5c;transition:width .25s linear';
    barBg.appendChild(fill);
    wrap.appendChild(head); wrap.appendChild(barBg);
    acadProg = { txt:head, fill, nl };
    updateAcademyProg();
  }
  for (const unit of RESEARCH_UNITS){
    if (!unitUnlocked(unit)) continue;               // Nicht Freigeschaltetes bleibt unsichtbar
    const blk = document.createElement('div');
    blk.style.cssText = 'margin-top:6px;padding-top:4px;border-top:1px solid rgba(255,255,255,.12)';
    const ttl = document.createElement('div');
    ttl.style.cssText = 'font-weight:600;font-size:13px';
    ttl.textContent = UNIT_NAME[unit];
    blk.appendChild(ttl);
    for (const br of ['w','p','a']){
      const lvl = researchLvl(unit, br);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:2px';
      const lab = document.createElement('div');
      lab.style.cssText = 'flex:1;font-size:12px;color:#cfe0f0';
      lab.textContent = RESEARCH_ICON[br]+' '+RESEARCH_NAME[br]+' '+
        '●'.repeat(lvl)+'○'.repeat(3-lvl)+' · +'+Math.round(RESEARCH_EFF[br]*100)+'% '+RESEARCH_WORD[br];
      row.appendChild(lab);
      if (lvl < 3){
        const bt = document.createElement('button');
        bt.className = 'btn-green';
        bt.style.cssText = 'margin:0;flex-shrink:0';
        bt.dataset.research = unit+'_'+br;
        const c = researchCost(unit, br);
        bt.textContent = 'Erforschen (' + Object.entries(c).map(([k,v])=>COSTICON[k]+v).join(' ') +
          ' · ' + Math.round(researchTime(lvl+1)) + ' s)';
        if (state.researchJob){
          bt.disabled = true;
          bt.style.opacity = '0.45';
          bt.title = 'Akademie forscht bereits';
        } else bt.addEventListener('click', ()=>startResearch(unit, br));
        row.appendChild(bt);
      } else {
        const done = document.createElement('div');
        done.style.cssText = 'font-size:12px;color:#9fd8a8;flex-shrink:0';
        done.textContent = '✔ Max';
        row.appendChild(done);
      }
      blk.appendChild(row);
    }
    wrap.appendChild(blk);
  }
  if (state.researchJob){
    const note = document.createElement('div');
    note.style.cssText = 'font-size:11.5px;color:#9aa7bb;margin-top:5px';
    note.textContent = '⏳ Akademie forscht bereits – weitere Aufträge erst danach.';
    wrap.appendChild(note);
  }
  btns.appendChild(wrap);
}
function updateAcademyProg(){
  const j = state && state.researchJob;
  if (!acadProg || !j || ui.info.style.display !== 'block') return;
  acadProg.txt.textContent = '🔬 '+UNIT_NAME[j.unit]+' – '+RESEARCH_ICON[j.branch]+' '+
    RESEARCH_NAME[j.branch]+' '+ROMAN3[acadProg.nl-1]+' … '+Math.ceil(j.rest)+' s';
  acadProg.fill.style.width = Math.round(clamp(1 - j.rest/(j.dur||1), 0, 1)*100) + '%';
}

// Richtungspfeil zum nächsten Gegner (wenn außerhalb des Bildes)
const arrowEl = document.createElement('div');
arrowEl.textContent = '➤';
arrowEl.style.cssText = 'position:fixed;z-index:9;display:none;pointer-events:none;' +
  'font-size:30px;color:#ff5a4e;text-shadow:0 0 8px rgba(255,60,40,.8),0 2px 4px rgba(0,0,0,.6);';
document.body.appendChild(arrowEl);
const _pv = new THREE.Vector3();
function updateEnemyArrow(){
  if (egoMode || !state.waveActive || !enemies.length || !gameStarted){ arrowEl.style.display = 'none'; return; }
  const ctx0 = cam.tx/TL + C, cty0 = cam.tz/TL + C;
  let best = null, bd = 1e9;
  for (const e of enemies){ const d = dist(e.x,e.y,ctx0,cty0); if (d<bd){bd=d;best=e;} }
  _pv.set(wx(best.x), 0.5, wz(best.y)).project(camera);
  let nx = _pv.x, ny = _pv.y;
  if (_pv.z > 1){ nx = -nx; ny = -ny; }          // hinter der Kamera → spiegeln
  if (_pv.z < 1 && Math.abs(nx) < 0.9 && Math.abs(ny) < 0.82){ arrowEl.style.display = 'none'; return; }
  const W = window.innerWidth, H = window.innerHeight, m = 46;
  const sx = clamp((nx*0.5+0.5)*W, m, W-m);
  const sy = clamp((1-(ny*0.5+0.5))*H, 120, H-150);
  const ang = Math.atan2(sy - H/2, sx - W/2);
  // 26a: Der Pfeil trägt die Banner-Farbe des angreifenden Fürsten
  const cs = best.ai ? lordCfg(best.ai).css : '#ff5a4e';
  arrowEl.style.color = cs;
  arrowEl.style.textShadow = '0 0 8px '+cs+'cc,0 2px 4px rgba(0,0,0,.6)';
  arrowEl.style.display = 'block';
  arrowEl.style.left = sx+'px'; arrowEl.style.top = sy+'px';
  arrowEl.style.transform = 'translate(-50%,-50%) rotate('+ang+'rad)';
}

// HUD & Hinweise
let hudTimer = 0;
function updateHUD(dt){
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.25;
  ui.holz.textContent = fmt(state.res.holz);
  ui.stein.textContent = fmt(state.res.stein);
  ui.nahrung.textContent = fmt(state.res.nahrung);
  ui.gold.textContent = fmt(state.res.gold);
  // Epochen-Ressourcen erst zeigen, wenn ihre Kette freigeschaltet ist
  const chips = [
    ['rErz','erz', state.res.erz>=0.5 || state.buildings.some(b=>b.t==='mine')],
    ['rEisen','eisen', state.res.eisen>=0.5 || state.buildings.some(b=>b.t==='schmiede')],
    ['rStahl','stahl', state.res.stahl>=0.5 || state.buildings.some(b=>b.t==='stahlwerk')],
    ['rOel','oel', state.res.oel>=0.5 || state.buildings.some(b=>b.t==='bohrturm')],
    ['rLithium','lithium', state.res.lithium>=0.5 || state.planets.length>0],
  ];
  for (const [id,k,show] of chips){
    $(id).style.display = show ? 'flex' : 'none';
    if (show) $(id).lastElementChild.textContent = fmt(state.res[k]);
  }
  const era = eraOf(rathausLvl());
  $('rEra').firstChild.textContent = era.icon + ' ';
  $('rEra').lastElementChild.textContent = era.name;
  ui.pop.textContent = state.pop + '/' + popCap();
  ui.armee.textContent = state.soldiersOwned + '/' + armyCap();
  const zuf = satisfaction();
  ui.zuf.textContent = Math.round(zuf.total*100) + '%';
  $('rZuf').classList.toggle('warn', zuf.total < 0.6);
  // 😊+ „Dankbare Bürger“ (24d): Chip leuchtet grün, solange der Bonus läuft
  $('rZuf').classList.toggle('happy', !!(state.quests && state.quests.gratitude > 0));
  $('rNahrung').classList.toggle('warn', state.res.nahrung < 10);
  if (state.waveActive) ui.wave.textContent = 'Welle ' + state.wave + ' – ' + enemies.length + ' Feinde!';
  else {
    const t = Math.max(0, Math.ceil(state.waveTimer));
    ui.wave.textContent = 'Welle ' + state.wave + ' in ' + Math.floor(t/60) + ':' + String(t%60).padStart(2,'0');
  }
  ui.wavebar.classList.toggle('alert', state.waveActive || state.waveTimer<16);
  $('btnMap').classList.toggle('alert', !!state.waveActive);   // roter Punkt: Angriff läuft
  // --- Ego-HUD: Mini-Ressourcen, HP-Balken, Fadenkreuz, Aktionsbutton, Angriffs-Banner ---
  if (egoMode && hero){
    const extra = chips.filter(c=>c[2]).slice(-2)
      .map(([,k])=>COSTICON[k]+' '+fmt(state.res[k])).join(' · ');
    $('egoRes').textContent = '🪙 ' + fmt(state.res.gold) + (extra ? ' · ' + extra : '');
    $('egoHpFill').style.width = Math.round(100*clamp(hero.hp/(hero.maxhp||1),0,1)) + '%';
    // Primär-Button + Fadenkreuz folgen dem Kontext: rot = Angriff, gold = Interaktion
    const ctx2 = egoContext();
    $('egoCross').style.background = ctx2
      ? (ctx2.act==='attack' || ctx2.act==='hunt' ? '#ff5a4e' : '#ffd75a') : '#fff';
    const actBtn = $('egoAct');
    actBtn.style.display = ctx2 ? 'flex' : 'none';
    if (ctx2) actBtn.textContent = ctx2.icon;
    // 24f: Kontext ohne Voraussetzung (z. B. Schürfen ohne Pfanne) → ausgegraut, Tap erklärt
    actBtn.style.opacity = ctx2 && ctx2.disabled ? '0.45' : '';
    actBtn.style.filter = ctx2 && ctx2.disabled ? 'grayscale(1)' : '';
    const a2 = $('egoAct2');
    a2.style.display = hero.sail ? 'none' : 'flex';
    // 25d: offenes Sheet → 🎒 rutscht über das Panel; das ✕ oben rechts wird frei
    if (ui.info.style.display === 'block' && !hero.sail){
      const rTop = ui.info.getBoundingClientRect().top;
      a2.style.bottom = Math.min(window.innerHeight - 66, window.innerHeight - rTop + 10) + 'px';
    } else a2.style.bottom = '';
    const nAtk = enemies.filter(e=>!e.sail).length;
    const bn = $('egoBanner');
    if (nAtk > 0){
      bn.style.display = 'block';
      bn.textContent = dungeon ? '⚠️ Angriff auf die Stadt! 🏙️ Verlassen'
        : '⚠️ ' + nAtk + ' Angreifer! 🏙️ Zur Stadt';
    } else bn.style.display = 'none';
  }
  updateQuestTrack();                    // 24d: Tracking-Zeile (Ego + Orbit)
  refreshMenu();
  updateAcademyProg();
  updateHint();
}
const HINTS = [
  { txt:'🪓 Tippe unten rechts auf 🔨 und baue einen Holzfäller neben Bäumen!', done:()=>state.buildings.some(b=>b.t==='holzfaeller') },
  { txt:'🌾 Baue über 🔨 einen Bauernhof – dein Volk braucht Nahrung.', done:()=>state.buildings.some(b=>b.t==='farm') },
  { txt:'🏠 Baue Wohnhäuser für mehr Bevölkerung (= mehr Arbeiter).', done:()=>state.buildings.some(b=>b.t==='haus') },
  { txt:'🪨 Ein Steinbruch neben Felsen liefert Stein für Türme.', done:()=>state.buildings.some(b=>b.t==='steinbruch') },
  { txt:'🛡️ Bau Wachturm & Kaserne (🔨 → ⚔️ Militär), bevor die Räuber kommen!', done:()=>state.buildings.some(b=>b.t==='turm')||state.buildings.some(b=>b.t==='kaserne') },
  { txt:'⚔️ Tippe die Kaserne an und bilde Soldaten aus!', done:()=>state.soldiersOwned>0 || !state.buildings.some(b=>b.t==='kaserne') },
];
function updateHint(){
  if (egoMode){ ui.hint.style.display = 'none'; return; }
  const h = HINTS.find(h=>!h.done());
  if (h && !state.waveActive){ ui.hint.textContent = h.txt; ui.hint.style.opacity = '1'; ui.hint.style.display='block'; }
  else ui.hint.style.opacity = '0';
}
let speed = 1;
$('btnSpeed').addEventListener('click', ()=>{
  speed = speed===1 ? 2 : (speed===2 ? 0 : 1);
  $('btnSpeed').textContent = speed===0 ? '⏸' : (speed===1?'▶':'⏩');
  toast(speed===0?'Pause':'Geschwindigkeit '+speed+'×', 1200);
});
$('btnSound').addEventListener('click', ()=>{
  state.muted = !state.muted;
  $('btnSound').textContent = state.muted ? '🔇' : '🔊';
  save();
});
// --- Chronik-Overlay (pausiert das Spiel nicht, blockiert nur Karten-Eingaben) ---
function fmtPlayTime(sec){
  const m = Math.floor(sec/60), h = Math.floor(m/60);
  return h>0 ? h+' h '+(m%60)+' min' : (m>0 ? m+' min' : '< 1 min');
}
function openChronicle(){
  const list = $('chronList');
  list.innerHTML = '';
  const arr = (state && state.chronicle) || [];
  if (!arr.length){
    const d = document.createElement('div');
    d.className = 'chron-empty';
    d.textContent = 'Noch keine Einträge – deine Geschichte beginnt gerade erst.';
    list.appendChild(d);
  }
  for (let i=arr.length-1; i>=0; i--){          // neueste zuerst
    const e = arr[i];
    const row = document.createElement('div'); row.className = 'chron-entry';
    if (e.thumb){
      const im = document.createElement('img');
      im.src = e.thumb; im.alt = '';
      row.appendChild(im);
    }
    const tx = document.createElement('div'); tx.className = 'ct';
    const tm = document.createElement('div'); tm.className = 'ctime';
    tm.textContent = '🕐 Spielzeit ' + fmtPlayTime(e.t||0);
    const bd = document.createElement('div'); bd.textContent = e.text;
    tx.appendChild(tm); tx.appendChild(bd);
    row.appendChild(tx);
    list.appendChild(row);
  }
  $('importBox').style.display = 'none';
  $('chronOv').style.display = 'flex';
}
$('btnChron').addEventListener('click', openChronicle);
$('chronClose').addEventListener('click', ()=>{ $('chronOv').style.display = 'none'; });

// ============================== ADMIN-KONSOLE (Etappe 25c, nur privater Build) ==============================
// Cheats fürs Endgame-Testen. Die Funktionen stecken immer im Bundle (Einzelspieler,
// kein Sicherheitsthema) – das UI (🛠️-Knopf + Sheet) entsteht aber NUR bei IS_ADMIN
// (artifact.html); die öffentliche index.html enthält keinerlei Admin-DOM.
// Transiente Cheats (Gottmodus, Zufriedenheits-Fix, Zeitraffer) werden nie gespeichert.
const ADMIN_RES = ['holz','stein','nahrung','gold','erz','eisen','stahl','oel','lithium'];
function adminGiveRes(k, n){
  if (!state) return;
  state.res[k] = (state.res[k]||0) + n;
  toast('🛠️ +'+fmt(n)+' '+COSTICON[k]); save();
}
function adminAllRes(n, set){
  if (!state) return;
  for (const k of ADMIN_RES) state.res[k] = set ? n : (state.res[k]||0) + n;
  toast(set ? '🛠️ Alle Rohstoffe auf '+fmt(n)+' gesetzt.' : '🛠️ Alle Rohstoffe +'+fmt(n)+'.');
  save();
}
// Rathaus-Stufe direkt setzen – repliziert den Endzustand des echten Upgrade-Pfads
// (tryUpgrade): Stufe/HP/Visual, Epochen-Hooks (Held-Look, Kultur-Flag, Chronik),
// Freischalt-Badge. Kamerafahrt und Einzelstufen-Toasts bewusst unterdrückt.
function adminSetRathaus(L){
  if (!state) return false;
  const rat = state.buildings.find(b=>b.t==='rathaus');
  if (!rat){ toast('🛠️ Kein Rathaus vorhanden.'); return false; }
  if (rat.ruin){ toast('🛠️ Rathaus ist eine Ruine – erst reparieren.'); return false; }
  const before = lvlOf(rat);
  if (L === before){ toast('🛠️ Rathaus ist bereits Stufe '+L+'.'); return false; }
  const wasEra = eraOf(before);
  rat.lvl = L; rat.hp = maxHp(rat);
  applyLevelVisual(rat); recalcEff(rat);
  const nowEra = eraOf(L);
  if (nowEra !== wasEra){
    chronicleAdd('era', '🎇 Neues Zeitalter: '+nowEra.icon+' '+nowEra.name+' (Rathaus Stufe '+L+').');
    if (state.hero && hero) refreshHeroLook(true);         // Rüstungs-Look folgt der Epoche
    if (L >= 6) state.kulturHint = 1;    // Kultur-Ersthinweis nicht nachträglich feuern
  }
  updateBuildBadge(); refreshMenu();
  toast('🛠️ Rathaus auf Stufe '+L+' – '+nowEra.icon+' '+nowEra.name+'.');
  save();
  return true;
}
function adminSeenAll(){
  if (!state) return;
  state.seenUnlocks = BUILDABLE.slice();
  updateBuildBadge(); refreshMenu();
  toast('🛠️ Alle Gebäude als gesehen markiert (Freischalt-Badge aus).'); save();
}
function adminSpeed(v){
  speed = v;                             // Ego-Klemme in loop() drückt v>1 auf 1× zurück
  $('btnSpeed').textContent = v===0 ? '⏸' : (v===1 ? '▶' : '⏩');
  toast('🛠️ Zeitraffer '+v+'×'+(egoMode && v>1 ? ' (im Ego bleibt 1×)' : '')+' – transient.', 1800);
}
function adminWaveNow(){
  if (!state) return;
  if (state.waveActive){ toast('🛠️ Es läuft bereits eine Welle.'); return; }
  state.waveTimer = 0;
  toast('🛠️ Welle '+state.wave+' startet sofort.');
}
function adminWaveEnd(){
  if (!state) return;
  for (const e of enemies) removeUnit(e);
  enemies = [];
  spawnEdge = null;
  if (state.waveActive){ state.waveActive = false; waveAge = 0; state.wave++; }
  state.waveTimer = 190;
  toast('🛠️ Welle beendet – Gegner geräumt, Timer zurückgesetzt.');
  save();
}
// 26a: Ein bestimmter Fürst (Index) bzw. ohne Argument der erste noch lebende.
// Läuft über den regulären Sieg-Pfad (Chronik, Belohnung, Aufräumen, Gesamtsieg).
function adminDefeatRagnar(i){
  const all = lords();
  if (!all.length){ toast('🛠️ Keine Fürsten auf dieser Karte.'); return; }
  const ai = (i===undefined) ? all.find(a=>!a.defeated) : all[i];
  if (!ai){ toast('🛠️ Dieser Fürst existiert nicht.'); return; }
  if (ai.defeated){ toast('🛠️ '+lordCfg(ai).name+' ist bereits besiegt.'); return; }
  for (const bd of [...ai.buildings]){
    if (bd.mesh){ aiGroup.remove(bd.mesh); disposeGroup(bd.mesh); }
    const [cx,cy] = aiBuildingCenter(bd);
    spawnBurst(wx(cx), hAt(cx,cy)+0.6, wz(cy), 8, 0xff8a5a);
  }
  ai.buildings = [];
  lordDefeated(ai);
}
function adminDefeatAllLords(){ for (let i=0;i<lords().length;i++) adminDefeatRagnar(i); }
// Entscheidung (dokumentiert): max = 10 UNABHÄNGIG vom Epochen-Deckel (heroSkillCap),
// damit Endgame-Tests ohne vorherigen Rathaus-Ausbau möglich sind.
function adminSkillsMax(){
  const h = state && state.hero;
  if (!h){ toast('🛠️ Kein Held rekrutiert.'); return; }
  for (const k of ['k','h','s','c']){ h.skills[k] = 10; h.exp[k] = 0; }
  if (hero){ hero.maxhp = heroMaxHp(); hero.hp = hero.maxhp; }
  toast('🛠️ Alle Fertigkeiten auf 10 (Heldenstufe '+heroLevel()+').');
  save();
}
function adminSkillExp(){
  if (!state || !state.hero){ toast('🛠️ Kein Held rekrutiert.'); return; }
  for (const k of ['k','h','s','c']) giveHeroExp(k, 500);
  toast('🛠️ +500 EXP je Fertigkeit (Epochen-Deckel '+heroSkillCap()+' greift).');
  save();
}
function adminGiveItem(id){
  if (!state || !state.hero){ toast('🛠️ Kein Held rekrutiert.'); return; }
  const it = HERO_ITEMS[id];
  if (!it) return;
  if (id==='pfanne'){
    state.hero.pfanne = 1;
    toast('🛠️ 🥄 Goldpfanne erhalten – Schürfen freigeschaltet.'); save(); return;
  }
  if (it.slot==='t'){                    // Amulett: Rezept gleich mitschenken
    state.hero.rezepte = state.hero.rezepte || {};
    state.hero.rezepte[id] = 1;
  }
  equipHero(it.slot, id);                // echter Pfad: Optik, HP-Anpassung, Save
  toast('🛠️ '+it.name+' gratis angelegt.');
}
function adminFillBag(){
  const h = state && state.hero;
  if (!h){ toast('🛠️ Kein Held rekrutiert.'); return; }
  const gems = bagAdd('gem', Math.max(1, Math.floor((heroCapacity()-bagCount())/2)));
  const nug = bagAdd('nugget', heroCapacity());
  toast('🛠️ Beutel gefüllt: 💎×'+gems+' ✨×'+nug+' ('+bagCount()+'/'+heroCapacity()+').');
  save();
}
function adminTeleport(i){
  if (!state || !ISLES[i]) return;
  const I = ISLES[i];
  if (dungeon) exitDungeon();
  const spot = nearestTile(I.x, I.y,
    (px,py)=>walkable(px,py) && isleParent[isleOf(px,py)]===i, Math.ceil(I.r)+8)
    || findLanding(I.x, I.y);
  if (hero && state.hero){
    cancelSail(hero);
    mining = null;
    hero.x = spot[0]; hero.y = spot[1];
    hero.moving = false; hero.patrol = null;
    state.hero.x = spot[0]; state.hero.y = spot[1];
    tpSnap = true;
  }
  cam.tx = wx(spot[0]); cam.tz = wz(spot[1]); clampCam();
  toast('🛠️ Teleport: Insel '+(i+1)+' – '+(BIOME_NAME[I.biome]||I.biome)+'.');
  save();
}
function adminDungeonsClear(){
  if (!state) return;
  if (!state.dungeons) state.dungeons = { cleared:{} };
  let n = 0;
  for (const p of dngPortals)
    if (!(state.dungeons.cleared[p.isle] > 0)){ state.dungeons.cleared[p.isle] = 1; n++; }
  toast('🛠️ Dungeon-Bosse als besiegt markiert ('+n+' neu) – Wiederhol-Loot testbar.');
  save();
}
function adminDungeonsReset(){
  if (!state) return;
  if (dungeon) exitDungeon();
  state.dungeons = { cleared:{} };
  for (const k in dungeonRuns) delete dungeonRuns[k];
  toast('🛠️ Dungeons zurückgesetzt – alle Erst-Runs wieder offen.');
  save();
}
function adminCompleteQuest(){
  if (!state || !state.quests || !state.quests.active.length){
    toast('🛠️ Kein aktiver Auftrag.'); return;
  }
  const q = state.quests.active.find(a=>a.tracked) || state.quests.active[0];
  completeQuest(q, true);                // echter Abschluss-Pfad inkl. Belohnung
}
function adminRerollOffers(){
  if (!state || !state.quests){ toast('🛠️ Questsystem noch nicht bereit.'); return; }
  state.quests.offers = [];
  ensureOffers();
  toast('🛠️ Tafel neu gewürfelt ('+state.quests.offers.length+' Angebote).');
  save();
}
// --- Admin-UI: wird NUR bei IS_ADMIN erzeugt (kein totes DOM im öffentlichen Build) ---
function openAdminSheet(){
  if (!IS_ADMIN) return false;
  buildAdminList();
  $('adminOv').style.display = 'flex';
  return true;
}
function closeAdminSheet(){
  const ov = document.getElementById('adminOv');
  if (ov) ov.style.display = 'none';
}
function buildAdminList(){
  const list = $('adminList');
  list.innerHTML = '';
  const head = (t2)=>{ const h = document.createElement('div'); h.className = 'adm-h';
    h.textContent = t2; list.appendChild(h); };
  const grid = ()=>{ const g2 = document.createElement('div'); g2.className = 'adm-grid';
    list.appendChild(g2); return g2; };
  const btn = (g2, label, fn, on)=>{
    const x = document.createElement('button');
    x.className = 'adm-btn' + (on ? ' on' : '');
    x.textContent = label;
    x.addEventListener('click', fn);
    g2.appendChild(x); return x;
  };
  head('💰 Ressourcen');
  let g = grid();
  for (const k of ADMIN_RES) btn(g, COSTICON[k]+' +10k', ()=>adminGiveRes(k, 10000));
  btn(g, '💰 Alles +100k', ()=>adminAllRes(100000, false));
  btn(g, '💰 Alles auf 999k', ()=>adminAllRes(999000, true));
  head('🏛️ Progression');
  g = grid();
  for (const L of [5,11,16,21,26,31,35])
    btn(g, '🏛️ Stufe '+L+' '+eraOf(L).icon, ()=>adminSetRathaus(L));
  btn(g, '🔨 Gebäude-Badge leeren', adminSeenAll);
  const hap = btn(g, '😊 Zufriedenheit 100 %: '+(ADMIN.happy?'AN':'aus'), ()=>{
    ADMIN.happy = !ADMIN.happy;
    hap.classList.toggle('on', ADMIN.happy);
    hap.textContent = '😊 Zufriedenheit 100 %: '+(ADMIN.happy?'AN':'aus');
    toast('🛠️ Zufriedenheits-Fix '+(ADMIN.happy?'AN':'aus')+' – transient, nicht gespeichert.');
  }, ADMIN.happy);
  for (const v of [1,4,8]) btn(g, '⏩ Zeitraffer '+v+'×', ()=>adminSpeed(v), speed===v);
  head('⚔️ Kampf & KI');
  g = grid();
  btn(g, '🗡️ Welle jetzt', adminWaveNow);
  btn(g, '🏳️ Welle beenden', adminWaveEnd);
  // 26a: je Fürst ein Knopf + Sammelknopf für den Gesamtsieg-Test
  for (let i=0;i<lords().length;i++){
    const ai = lords()[i], cfg = lordCfg(ai);
    btn(g, (ai.defeated ? '✓ ' : '🏆 ') + cfg.name + ' besiegen',
      ()=>{ adminDefeatRagnar(i); openAdminSheet(); }, ai.defeated);
  }
  btn(g, '🏁 Alle Fürsten besiegen', ()=>{ adminDefeatAllLords(); openAdminSheet(); });
  btn(g, '💥 Fürsten-Rathäuser sprengen', ()=>{
    for (const ai of lords()){
      const hq2 = ai.buildings.find(b=>b.t==='rathaus');
      if (hq2) destroyAiBuilding(hq2);
    }
    openAdminSheet();
  });
  const god = btn(g, '🛡️ Gottmodus Held: '+(ADMIN.god?'AN':'aus'), ()=>{
    ADMIN.god = !ADMIN.god;
    god.classList.toggle('on', ADMIN.god);
    god.textContent = '🛡️ Gottmodus Held: '+(ADMIN.god?'AN':'aus');
    toast('🛠️ Gottmodus '+(ADMIN.god?'AN':'aus')+' – transient, nicht gespeichert.');
  }, ADMIN.god);
  head('🛡️ Held');
  g = grid();
  btn(g, '✨ Skills max (alle 10)', adminSkillsMax);
  btn(g, '✨ EXP +500 je Skill', adminSkillExp);
  btn(g, '🎒 Beutel füllen', adminFillBag);
  btn(g, '🥄 Goldpfanne geben', ()=>adminGiveItem('pfanne'));
  head('🎁 Ausrüstung (gratis anlegen)');
  g = grid();
  for (const id of CRAFT_ORDER)
    if (id !== 'pfanne') btn(g, HERO_ITEMS[id].name, ()=>adminGiveItem(id));
  head('🌍 Welt');
  g = grid();
  ISLES.forEach((I,i)=>btn(g, '🧭 Insel '+(i+1)+' · '+(BIOME_NAME[I.biome]||'?')+
    (i===0?' (Heimat)':''), ()=>adminTeleport(i)));
  btn(g, '🏆 Dungeon-Bosse besiegt', adminDungeonsClear);
  btn(g, '♻️ Dungeon-Reset', adminDungeonsReset);
  btn(g, '✅ Aktive Quest abschließen', adminCompleteQuest);
  btn(g, '🎲 Quest-Angebote neu würfeln', adminRerollOffers);
}
function initAdminConsole(){
  const st = document.createElement('style');
  st.textContent =
    '#btnAdmin{border-color:#ff9d2e;box-shadow:0 0 9px rgba(255,157,46,.55);}'+
    '.adminbox{max-width:560px;}'+
    '.adm-sub{font-size:11.5px;color:#ffce8a;text-align:center;margin-top:2px;}'+
    '#adminList{flex:1;overflow-y:auto;margin-top:8px;padding-right:2px;}'+
    '.adm-h{font-size:13px;font-weight:700;color:#ffd28a;margin:12px 2px 6px;}'+
    '.adm-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;}'+
    '.adm-btn{min-height:44px;border:none;border-radius:10px;background:#3d5a8a;'+
      'color:#fff;font-size:12.5px;font-weight:600;cursor:pointer;padding:8px 6px;}'+
    '.adm-btn:active{background:#4c6ea8;}'+
    '.adm-btn.on{background:#3fae5c;}';
  document.head.appendChild(st);
  const b = document.createElement('button');
  b.className = 'sbtn'; b.id = 'btnAdmin';
  b.title = 'Admin-Konsole (nur privater Build)';
  b.textContent = '🛠️';
  $('sysbtns').appendChild(b);
  const ov = document.createElement('div');
  ov.className = 'overlay'; ov.id = 'adminOv'; ov.style.display = 'none';
  ov.innerHTML =
    '<div class="obox panel chronbox adminbox">'+
    '<button class="sbtn" id="adminClose" title="Schließen">✕</button>'+
    '<h1 class="chron-title">🛠️ Admin-Konsole</h1>'+
    '<div class="adm-sub">Nur im privaten Build · transiente Cheats enden mit dem Reload</div>'+
    '<div id="adminList"></div></div>';
  document.body.appendChild(ov);
  b.addEventListener('click', openAdminSheet);
  ov.querySelector('#adminClose').addEventListener('click', closeAdminSheet);
}
if (IS_ADMIN) initAdminConsole();

// --- Minimap-Overlay: Biom-Karte, Marker, Tap-to-Jump ---
const BIOME_MAP_COL = { wiese:[78,143,61], wald:[42,105,46], schnee:[205,216,226],
  vulkan:[64,56,61], wueste:[214,181,104] };
function drawMinimap(){
  const cvm = $('mapCv');
  const S = cvm.width / MAP;                 // 512 / 128 = 4 px je Kachel
  const g = cvm.getContext('2d');
  // Basiskarte in Kachelauflösung, dann pixelig hochskaliert
  const off = document.createElement('canvas');
  off.width = off.height = MAP;
  const og = off.getContext('2d');
  const img = og.createImageData(MAP, MAP);
  for (let k=0;k<MAP*MAP;k++){
    const o = k*4;
    let c;
    if (tiles[k]===0) c = [13,42,74];                                    // Wasser
    else {
      c = BIOME_MAP_COL[isleBiome[isleId[k]]||'wiese'] || BIOME_MAP_COL.wiese;
      if (tiles[k]===1) c = [(c[0]+232)>>1, (c[1]+216)>>1, (c[2]+170)>>1];  // Sandrand heller
    }
    img.data[o] = c[0]; img.data[o+1] = c[1]; img.data[o+2] = c[2]; img.data[o+3] = 255;
  }
  og.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, cvm.width, cvm.height);
  g.drawImage(off, 0, 0, cvm.width, cvm.height);
  // Marker (Stand beim Öffnen)
  const dot = (x,y,col,s)=>{ g.fillStyle = col; g.fillRect((x+0.5)*S-s/2, (y+0.5)*S-s/2, s, s); };
  for (const ai of lords()){
    if (ai.defeated) continue;
    const cs = lordCfg(ai).css;
    for (const bd of ai.buildings){
      const c2 = aiBuildingCenter(bd);
      dot(c2[0], c2[1], cs, bd.t==='rathaus' ? 9 : 5);
    }
  }
  for (const bd of state.buildings){
    const c2 = buildingCenter(bd);
    dot(c2[0], c2[1], bd.t==='rathaus' ? '#ffce3a' : (bd.t==='vorposten' ? '#4ade6a' : '#f2f5fa'),
      bd.t==='rathaus' ? 9 : (bd.t==='vorposten' ? 7 : 4));
  }
  for (const e of enemies) if (!e.sail) dot(e.x, e.y, '#ff9d2e', 6);
  // entdeckte Schürf-Spots (gelb, ab Entdeckung durch den Helden)
  for (const s of (state.mineSpots||[])) if (s.found && s.left > 0) dot(s.x, s.y, '#ffd736', 5);
  // Dungeon-Eingänge (24c): violettes 🕳️-Symbol, ab Spielstart sichtbar
  g.font = '12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const p of dngPortals){
    dot(p.x, p.y, '#a05ae8', 8);
    g.fillText('🕳️', (p.x+0.5)*S, (p.y+0.5)*S);
  }
  // Quest-Marker (24d): goldenes ❗ am Ziel der VERFOLGTEN Quest (kein Marker-Wald)
  const trkQ = state.quests && state.quests.active.find(q=>q.tracked);
  if (trkQ){
    const t2 = questTargetPos(trkQ);
    if (t2){
      g.fillStyle = '#ffd736';
      g.font = 'bold 16px sans-serif';
      g.fillText('❗', (t2[0]+0.5)*S, (t2[1]+0.5)*S);
      g.font = '12px sans-serif';
    }
  }
  // Held (gold) – im Dungeon zählt die Oberwelt-Position (Eingang)
  if (state.hero && hero) dot(dungeon ? state.hero.x : hero.x, dungeon ? state.hero.y : hero.y, '#ffe9a0', 6);
  // aktueller Kamera-Ausschnitt
  const ctx0 = cam.tx/TL + C, cty0 = cam.tz/TL + C, half = (cam.dist*0.85)/TL;
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2;
  g.strokeRect((ctx0-half)*S, (cty0-half)*S, half*2*S, half*2*S);
}
// 26a: Fortschritt je Fürst unter der Karte – Rest/Rekord, Tippen springt zur Basis
function drawLordList(){
  const box = $('lordList');
  if (!box) return;
  box.innerHTML = '';
  const all = lords();
  if (!all.length) return;
  for (let i=0;i<all.length;i++){
    const ai = all[i], cfg = lordCfg(ai);
    const row = document.createElement('div');
    row.className = 'lord-row' + (ai.defeated ? ' done' : '');
    const dot = document.createElement('span');
    dot.className = 'lord-dot';
    dot.style.background = ai.defeated ? '#5c6a80' : cfg.css;
    row.appendChild(dot);
    const nm = document.createElement('span');
    nm.textContent = cfg.icon + ' ' + cfg.name;
    row.appendChild(nm);
    if (ai.defeated){
      const d = document.createElement('span');
      d.className = 'lord-n'; d.textContent = '✓ besiegt';
      row.appendChild(d);
    } else {
      const peak = Math.max(1, ai.peak||ai.buildings.length);
      const bar = document.createElement('span');
      bar.className = 'lord-bar';
      const fill = document.createElement('i');
      fill.style.width = Math.round(ai.buildings.length/peak*100) + '%';
      fill.style.background = cfg.css;
      bar.appendChild(fill);
      row.appendChild(bar);
      const n = document.createElement('span');
      n.className = 'lord-n';
      n.textContent = ai.buildings.length + '/' + peak + (ai.fallen ? ' 💥' : '');
      row.appendChild(n);
      row.addEventListener('click', ()=>{
        cam.tx = wx(ai.x); cam.tz = wz(ai.y); clampCam();
        $('mapOv').style.display = 'none';
        snd(520,0.06,'sine',0.03);
      });
    }
    box.appendChild(row);
  }
}
function openMap(){
  if (!state || !tiles) return;
  drawMinimap();
  drawLordList();
  $('mapOv').style.display = 'flex';
}
$('btnMap').addEventListener('click', openMap);
$('mapClose').addEventListener('click', ()=>{ sailPick = null; $('mapOv').style.display = 'none'; });
$('mapCv').addEventListener('click', (e)=>{
  const r = e.currentTarget.getBoundingClientRect();
  const tx2 = (e.clientX - r.left)/r.width*MAP, ty2 = (e.clientY - r.top)/r.height*MAP;
  // ⛵ Ziel-Insel-Wahl fürs Hafen-Übersetzen (Ego)
  if (sailPick && egoMode){
    if (egoSailTo(tx2, ty2)){ sailPick = null; $('mapOv').style.display = 'none'; }
    return;
  }
  // Tap-to-Jump: Kamera zum angetippten Punkt, Overlay schließt
  cam.tx = wx(tx2); cam.tz = wz(ty2); clampCam();
  $('mapOv').style.display = 'none';
  snd(520,0.06,'sine',0.03);
});

// --- Spielstand-Export/-Import (nur Zwischenablage – keine Download-Links) ---
const SAVE_PREFIX = 'K3D1:';
$('btnExport').addEventListener('click', ()=>{
  save();                                        // aktuellen Stand sichern
  const raw = localStorage.getItem(SAVEKEY);
  if (!raw){ toast('Noch kein Spielstand zum Kopieren.'); return; }
  const s = SAVE_PREFIX + raw;
  const okMsg = ()=>toast('💾 Spielstand in die Zwischenablage kopiert!');
  const fallback = ()=>{
    try{
      const ta = document.createElement('textarea');
      ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      ok ? okMsg() : toast('Kopieren fehlgeschlagen.');
    }catch(_){ toast('Kopieren fehlgeschlagen.'); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(s).then(okMsg, fallback);
  else fallback();
});
$('btnImport').addEventListener('click', ()=>{
  const b = $('importBox');
  b.style.display = b.style.display==='none' ? 'block' : 'none';
});
$('btnImportGo').addEventListener('click', ()=>{
  const s = ($('importTxt').value||'').trim();
  try{
    if (s.slice(0, SAVE_PREFIX.length) !== SAVE_PREFIX) throw 0;
    const d = JSON.parse(s.slice(SAVE_PREFIX.length));
    if (!d || !d.seed || !d.res || !Array.isArray(d.buildings)) throw 0;
    localStorage.setItem(SAVEKEY, JSON.stringify(d));
    location.reload();
  }catch(_){
    // Bei Fehler: alter Spielstand bleibt unangetastet
    toast('❌ Ungültiger Spielstand – nichts geändert.');
  }
});

let resetArmed = -1e9;
$('btnMenu').addEventListener('click', ()=>{
  const now = performance.now();
  if (now - resetArmed < 4000) restart();
  else { resetArmed = now; toast('⚠️ Neues Spiel starten? Erneut ☰ tippen zum Bestätigen.', 3500); }
});
$('btnRestart').addEventListener('click', ()=>restart());
$('ipClose').addEventListener('click', (ev)=>{ ev.stopPropagation(); hideInfo(); selected = null; hideSelQuads(); });

// ============================== TAG/NACHT ==============================
const skyDay = new THREE.Color(0x8ac6ec), skyDusk = new THREE.Color(0xf29155),
      skyNight = new THREE.Color(0x2c3d6e);              // sichtbares Nachtblau statt Fast-Schwarz
const _sky = new THREE.Color(), _sunCol = new THREE.Color(), _hemiCol = new THREE.Color();
const sunColHigh = new THREE.Color(0xffeccb), sunColLow = new THREE.Color(0xff7e33),
      moonCol = new THREE.Color(0xc3d2ff);               // kräftiges, bläulich-weißes Mondlicht
const hemiDay = new THREE.Color(0xd9ecff), hemiDusk = new THREE.Color(0xffd2a8),
      hemiNight = new THREE.Color(0x7789bd);             // helles Nacht-Fülllicht (Spielbarkeit!)
function updateDayNight(){
  const p = (state.time/150)%1;
  const elev = Math.sin(p*Math.PI*2);
  const az = p*Math.PI*2 - Math.PI/2;
  const day = clamp(elev*1.8, 0, 1);
  if (elev > -0.06){
    const e = Math.max(elev, 0.06);
    sun.position.set(cam.tx + Math.cos(az)*45*Math.cos(e*1.2), 8+Math.sin(e*1.35)*44, cam.tz + Math.sin(az)*45*Math.cos(e*1.2));
    _sunCol.lerpColors(sunColLow, sunColHigh, clamp(elev*2.2,0,1));
    sun.color.copy(_sunCol);
    sun.intensity = 0.55 + 1.5*clamp(elev*1.6,0,1);
  } else {
    // Helle Mondnacht: weich von der Dämmerung einblenden, damit nichts springt
    sun.position.set(cam.tx + 20, 34, cam.tz - 24);
    sun.color.copy(moonCol);
    sun.intensity = 0.55 + 0.75*clamp((-elev-0.06)*6, 0, 1);
  }
  sun.target.position.set(cam.tx, 0, cam.tz);
  // Fülllicht: tagsüber kühl-blau, in der Dämmerung warm glühend, nachts hell-bläulich –
  // Nacht-Untergrenze deutlich angehoben (Handy-Spielbarkeit), Tageswert unverändert
  const duskAmt = clamp(1-Math.abs(elev)/0.35, 0, 1);
  if (elev >= 0) _hemiCol.lerpColors(hemiDay, hemiDusk, duskAmt);
  else _hemiCol.lerpColors(hemiNight, hemiDusk, duskAmt);
  hemi.color.copy(_hemiCol);
  hemi.intensity = 1.0 + 0.06*day + 0.15*duskAmt;
  if (elev > 0.32) _sky.copy(skyDay);
  else if (elev > -0.12) _sky.lerpColors(skyDusk, skyDay, clamp((elev+0.02)/0.34,0,1));
  else _sky.lerpColors(skyNight, skyDusk, clamp((elev+0.42)/0.3,0,1));
  scene.background.copy(_sky);
  scene.fog.color.copy(_sky);
  M.window.emissiveIntensity = clamp((0.25-elev)*2.4, 0, 2.1);   // Fenster bleiben Blickfang
  stars.material.opacity = clamp((-elev+0.08)*2.2, 0, 0.95);
  // Unterwelt-Override (24c): Sonne/Fülllicht stark gedimmt, dunkler Tier-Fog –
  // near/far setzt enter/exitDungeon, die Farben hier (laufen sonst mit dem Tag mit)
  if (dungeon){
    sun.intensity = 0.05;
    hemi.intensity = 0.32;
    scene.background.setHex(0x07070b);
    scene.fog.color.setHex(DNG_FOG_COL[dungeon.tier]);
  }
}

// ============================== SPEICHERN / LADEN ==============================
function save(){
  if (!gameStarted || gameOver) return;
  try{
    localStorage.setItem(SAVEKEY, JSON.stringify({
      v: 3, seed: state.seed, res: state.res, pop: state.pop,
      startX: state.startX, startY: state.startY,
      buildings: state.buildings.map(b=>({t:b.t,x:b.x,y:b.y,hp:b.hp,l:lvlOf(b),r:b.ruin?1:0})),
      chopped: state.chopped, regrown: state.regrown, terra: state.terra, wave: state.wave,
      waveTimer: Math.max(30, Math.round(state.waveTimer)),
      soldiers: state.soldiersOwned,
      units: soldiers.map(s=>s.kind||'soldier'),
      spaceN: spaceMissions.length,
      doctrine: state.doctrine, muted: state.muted, time: state.time,
      // 26a: Die drei Fürsten (Feld `ai` wird nicht mehr geschrieben, aber gelesen)
      ais: lords().map(a=>({ id:a.id, x:a.x, y:a.y, nextBuild:a.nextBuild,
        army:a.army, age:Math.round(a.age), defeated:a.defeated, fallen:!!a.fallen,
        rebuilt:a.rebuilt||0, peak:a.peak||a.buildings.length, colony:a.colony||null,
        buildings: a.buildings.map(b=>({t:b.t,x:b.x,y:b.y,hp:b.hp})) })),
      newLordT: state.newLordT||0, lordsWon: state.lordsWon||0,
      exped: expeditions.map(e=>({x:e.destX, y:e.destY})),
      planets: state.planets,
      chronicle: state.chronicle||[],
      seenUnlocks: state.seenUnlocks||[],
      research: state.research||{},
      researchJob: state.researchJob||null,
      fabHint: state.fabHint||0,
      kulturHint: state.kulturHint||0,
      hero: state.hero||null,
      mineSpots: state.mineSpots||null,
      mineCtr: state.mineCtr||null,
      // 24c: NUR der Abschlusszähler – der laufende Dungeon-Run wird bewusst nicht gespeichert
      dungeons: state.dungeons||{ cleared:{} },
      // 24d: Angebote werden MITgespeichert (kein Reroll-Farming); Lager als {x,y,left}
      quests: state.quests||{ offers:[], active:[], done:0, seedCtr:0, gratitude:0, camp:null },
    }));
  }catch(_){}
}
// Chronik aus einem alten v2-Spielstand (wird in freshGame ins neue Spiel übernommen)
let legacyChronicle = null;
// Hinweise aus load(), die erst nach dem Start-Overlay gezeigt werden sollen
let pendingToasts = [];
function harvestLegacy(raw){
  try{
    const d = JSON.parse(raw);
    if (d && Array.isArray(d.chronicle) && d.chronicle.length && !legacyChronicle)
      legacyChronicle = d.chronicle;
  }catch(_){}
}
function load(){
  try{
    const raw = localStorage.getItem(SAVEKEY);
    let d = null;
    try{ d = raw ? JSON.parse(raw) : null; }catch(_){ d = null; }
    if (!d || !d.seed || d.v !== 3){
      // v3-Key mit altem Inhalt (z. B. importierter v2-Stand): Karte inkompatibel →
      // Chronik retten, Rest verwerfen (Neustart in der neuen Welt)
      if (d){ harvestLegacy(raw); try{ localStorage.removeItem(SAVEKEY); }catch(_){} }
      // v2-Spielstand: gleiches Prinzip, v2-Key danach löschen
      const raw2 = localStorage.getItem(SAVEKEY_V2);
      if (raw2){ harvestLegacy(raw2); try{ localStorage.removeItem(SAVEKEY_V2); }catch(_){} }
      return false;
    }
    try{ localStorage.removeItem(SAVEKEY_V2); }catch(_){}
    state = newState(d.seed);
    state.res = Object.assign({holz:0,stein:0,nahrung:0,gold:0,erz:0,eisen:0,stahl:0,oel:0,lithium:0}, d.res);
    state.planets = d.planets||[];
    state.pop = d.pop; state.chopped = d.chopped||[];
    state.regrown = d.regrown||[]; state.terra = d.terra||[];
    state.wave = d.wave; state.waveTimer = d.waveTimer; state.muted = !!d.muted;
    state.doctrine = d.doctrine||null;
    state.time = d.time||26;
    state.chronicle = Array.isArray(d.chronicle) ? d.chronicle : [];   // Alt-Saves: leer
    state.research = d.research || {};          // fehlend ⇒ alles Stufe 0
    state.researchJob = d.researchJob || null;  // fehlend ⇒ keine laufende Forschung
    state.fabHint = d.fabHint || 0;
    state.kulturHint = d.kulturHint || 0;
    // Held (Etappe 24a/24b): Alt-Saves ohne Feld laden ohne Helden; Start immer im Auto-Modus
    state.hero = d.hero ? Object.assign(
      { name:'Held', x:SX, y:SY, hp:100, skills:{k:1,h:1,s:1,c:1}, exp:{k:0,h:0,s:0,c:0},
        equip:{w:'holzknueppel',a:null,t:null}, bag:[], auto:1, respawn:0, pfanne:0,
        view:'tp' }, d.hero) : null;
    if (state.hero){
      state.hero.auto = 1;
      // 24e: Sicht-Präferenz validieren (Alt-Saves ohne Feld → Third-Person)
      if (state.hero.view !== 'ego') state.hero.view = 'tp';
      // 24a-Saves: fehlende 24b-Felder nachrüsten, Beutel-Stapel validieren
      if (!Array.isArray(state.hero.bag)) state.hero.bag = [];
      state.hero.bag = state.hero.bag.filter(s=>s && BAG_ITEMS[s.t] && s.n > 0);
    }
    // Schürf-Spots (24b): fehlen sie im Save, würfelt initMineSpots() sie seed-deterministisch
    state.mineSpots = Array.isArray(d.mineSpots) ? d.mineSpots : null;
    state.mineCtr = d.mineCtr || null;
    // Dungeons (24c): Alt-Saves ohne Feld → leerer Zähler; Runs sind nie Teil des Saves
    state.dungeons = (d.dungeons && d.dungeons.cleared) ? { cleared: d.dungeons.cleared } : { cleared:{} };
    // Quests (24d): Alt-Saves ohne Feld → Standardobjekt; Angebote werden NICHT neu gewürfelt
    state.quests = Object.assign({ offers:[], active:[], done:0, seedCtr:0, gratitude:0, camp:null },
      d.quests || {});
    if (!Array.isArray(state.quests.offers)) state.quests.offers = [];
    if (!Array.isArray(state.quests.active)) state.quests.active = [];
    // Bürger-Questgeber sind flüchtig (folk unsaved) → Abgabe wandert zur Tafel,
    // der „Dankbare Bürger“-Bonus bleibt über das buerger-Flag erhalten
    for (const q of state.quests.active)
      if (q.giver==='buerger'){
        q.giver = 'tafel';
        pendingToasts.push('📜 '+q.title+': Melde dich am Rathaus.');
      }
    chronWaveRecord = state.wave>1 ? waveStrength(state.wave-1) : 0;   // Rekord neu seeden
    genMap(); buildWorld();
    for (const b of d.buildings){
      if (!BT[b.t]) continue;                   // unbekannter Typ (Downgrade): überspringen
      const nb = addBuilding(b.t, b.x, b.y, b.hp, true);
      if (b.l > 1){ nb.lvl = b.l; applyLevelVisual(nb); recalcEff(nb); }
      if (b.r){ nb.ruin = true; nb.hp = 0; applyRuinVisual(nb); }
    }
    updateWalls();
    initMineSpots();
    if (state.hero) spawnHeroUnit();     // Position wird auf findLanding korrigiert
    // Eindringlings-Lager (24d) aus {x,y,left} rekonstruieren – nur solange die Quest läuft
    if (state.quests.camp && state.quests.camp.left > 0 &&
        state.quests.active.some(q=>q.typ==='camp'))
      spawnIntruderCamp(state.quests.camp.x, state.quests.camp.y);
    else if (state.quests.camp && !state.quests.active.some(q=>q.typ==='camp'))
      state.quests.camp = null;
    // 24f: Wildtiere sind flüchtig – laufende Jagd-Quests sofort wieder erfüllbar machen
    for (const q of state.quests.active) ensureQuestWild(q);
    // Migration Etappe 21: Panzer/Flieger kommen jetzt aus Fabrik & Flugfeld (einmaliger Hinweis)
    if (!state.fabHint && state.buildings.some(b=>b.t==='kaserne' && lvlOf(b)>=16) &&
        !state.buildings.some(b=>b.t==='fabrik')){
      state.fabHint = 1;
      pendingToasts.push('🏭 Neu: Panzer werden jetzt in der Fahrzeugfabrik gebaut!');
    }
    // Etappe 21b: Kultur-Bedürfnis – Alt-Saves ab Renaissance einmalig informieren
    if (!state.kulturHint && rathausLvl() >= 6){
      state.kulturHint = 1;
      if (!state.buildings.some(b=>BT[b.t].kultur))
        pendingToasts.push('🎭 Neu: Dein Volk wünscht sich Unterhaltung – baue eine Taverne!');
    }
    // Alt-v3-Saves ohne Feld: alles aktuell Verfügbare gilt als gesehen (kein falsches Badge)
    state.seenUnlocks = Array.isArray(d.seenUnlocks) ? d.seenUnlocks
      : BUILDABLE.filter(t=>!BT[t].req || BT[t].req<=rathausLvl());
    state.soldiersOwned = 0;
    const kas = state.buildings.find(b=>b.t==='kaserne');
    const fab = state.buildings.find(b=>b.t==='fabrik');
    const flug = state.buildings.find(b=>b.t==='flugfeld');
    const kinds = d.units || [];
    for (let i=0;i<(d.soldiers||0);i++){
      state.soldiersOwned++;
      const kind = kinds[i] || (i<(d.ritter||0) ? 'ritter' : undefined);
      // Fahrzeuge kehren an ihr Produktionsgebäude zurück (Alt-Saves: Kaserne als Failsafe)
      const home = kind==='panzer' ? (fab||kas) : kind==='flieger' ? (flug||kas) : kas;
      spawnSoldier(home||state.buildings[0], kind);
    }
    // Laufende Raumfahrt-Missionen sofort abschließen
    for (let i=0;i<(d.spaceN||0);i++) state.planets.push(genPlanet());
    // Unterwegs gewesene Expeditionen sofort abschließen
    for (const ex of (d.exped||[])){
      const free = (px,py)=>inMap(px,py) && tiles[idx(px,py)]===2 &&
        !occ[idx(px,py)] && !treeMap[idx(px,py)] && !rockMap[idx(px,py)];
      const spot = free(ex.x,ex.y) ? [ex.x,ex.y] : nearestTile(ex.x,ex.y,free,4);
      if (spot) addBuilding('vorposten', spot[0], spot[1], undefined, true);
    }
    // KI wiederherstellen
    // 26a: `ais` ist das neue Format; ein Alt-Stand mit einzelnem `ai` wird zu Ragnar.
    const roh = d.ais || (d.ai ? [Object.assign({ id:'ragnar' }, d.ai)] : []);
    state.ais = [];
    for (const a of roh){
      if (!LORDS.some(c=>c.id===a.id)) continue;
      const ai = { id:a.id, x:a.x, y:a.y, buildings:[], nextBuild:a.nextBuild||0,
        army:a.army||0, age:a.age||0, bt:24, tt:30, rt:60, gt:15,
        defeated:!!a.defeated, fallen:!!a.fallen, rebuilt:a.rebuilt||0,
        peak:a.peak||(a.buildings||[]).length, colony:a.colony||null };
      state.ais.push(ai);
      for (const b of (a.buildings||[])) addAiBuilding(ai, b.t, b.x, b.y, b.hp, true);
      if (!a.fallen && !ai.buildings.some(b=>b.t==='rathaus') && ai.buildings.length)
        ai.fallen = true;                 // Alt-Stand ohne Rathaus: Reich zerfällt bereits
    }
    // Fehlende Fürsten ziehen nach dem Laden nach (Alt-Stände bekommen ihr Endgame)
    state.newLordT = d.newLordT !== undefined ? d.newLordT
      : (LORDS.some(c=>!state.ais.some(a=>a.id===c.id)) ? 180 : 0);
    state.lordsWon = d.lordsWon||0;
    return true;
  }catch(_){ return false; }
}
setInterval(save, 12000);

// ============================== START / NEUSTART ==============================
function freshGame(){
  state = newState((Math.random()*1e9)|0);
  genMap(); buildWorld();
  initMineSpots();
  addBuilding('rathaus', SX-1, SY-1, undefined, true);
  createAllLords();
  chronWaveRecord = 0;
  if (legacyChronicle){
    // Umzug aus der alten 64er-Welt: Chronik reist mit ins neue Reich
    state.chronicle = legacyChronicle.slice(-100);
    legacyChronicle = null;
    chronicleAdd('umzug', '🌅 Aufbruch in eine neue Welt – die alte Heimat bleibt in Erinnerung.');
    toast('🌅 Neue, größere Inselwelt! Deine alte Chronik reist mit.', 6000);
  }
  chronicleAdd('start', '📜 Die Chronik von '+genReichName()+' beginnt.');
}
function clearEntities(){
  for (const u of folk) removeUnit(u);
  for (const u of soldiers) removeUnit(u);
  for (const u of enemies) removeUnit(u);
  for (const g of aiGuards) removeUnit(g);
  for (const a of arrows) fxGroup.remove(a.mesh);      // Pfeil: geteilte Geometrie/Material
  for (const p of particles){ fxGroup.remove(p.mesh); p.mesh.material.dispose(); }
  for (const f of fallingTrees){ fxGroup.remove(f.grp); disposeGroup(f.grp); }
  if (state) for (const bd of state.buildings)
    if (bd.workers){ bd.workers.forEach(removeUnit); bd.workers = null; }
  for (const ex of expeditions){ fxGroup.remove(ex.boat); disposeGroup(ex.boat); }
  for (const u of soldiers) cancelSail(u);           // 25d: Boote segelnder Einheiten
  for (const u of enemies) cancelSail(u);
  for (const b of sinkingBoats){ fxGroup.remove(b.boat); disposeGroup(b.boat); }
  sinkingBoats.length = 0;
  if (hero){
    cancelSail(hero);
    removeUnit(hero); hero = null;
  }
  for (const a of wildlife) removeUnit(a);
  wildlife = []; wildSpawnT = 10; mining = null; sailPick = null;
  removeCamp(); campOrphanT = 0; campRetryT = 0; citizenT = 300;   // Quest-Laufzeit (24d)
  folk = []; soldiers = []; enemies = []; arrows = []; aiGuards = []; expeditions = [];
  spaceMissions = [];
  particles.length = 0; fallingTrees.length = 0;
  disposeGroup(aiGroup);
  attackOrder = null;
}
function restart(){
  try{ localStorage.removeItem(SAVEKEY); }catch(_){}
  if (egoMode) exitEgo();
  if (dungeon) exitDungeon();    // Failsafe (exitEgo erledigt es normalerweise schon)
  for (const k in dungeonRuns) delete dungeonRuns[k];
  clearEntities();
  disposeGroup(bldGroup);
  cancelPlacing(); hideInfo(); closeBuildSheet();
  selected = null; spawnEdge = null; gameOver = false;
  freshGame();
  initDungeonPortals();
  updateBuildBadge();
  refreshPlanetSky();
  cam.tx = wx(SX-0.5); cam.tz = wz(SY-0.5); cam.dist = 23; cam.az = Math.PI*0.75;
  $('overOv').style.display = 'none';
  toast('🏰 Neues Reich gegründet!');
}
function init(){
  if (!load()) freshGame();
  if (!state.ais) state.ais = [];
  if (!state.ais.length) createAllLords();   // Fürsten in bestehenden Ständen nachrüsten
  initDungeonPortals();          // nach Gebäuden/KI, damit occ/aiOcc respektiert werden
  refreshPlanetSky();
  buildMenu();
  updateBuildBadge();
  $('btnSound').textContent = state.muted ? '🔇' : '🔊';
  cam.tx = wx(SX-0.5); cam.tz = wz(SY-0.5);
}
$('btnStart').addEventListener('click', ()=>{
  $('startOv').style.display = 'none';
  gameStarted = true;
  for (const m of pendingToasts) toast(m, 5500);
  pendingToasts = [];
  snd(392,0.12,'triangle',0.05); snd(523,0.18,'triangle',0.05);
});

// ============================== HAUPTSCHLEIFE ==============================
let last = performance.now();
function loop(now){
  requestAnimationFrame(loop);
  let dt = Math.min(0.1, (now-last)/1000); last = now;
  // Ego-Failsafes: ohne lebenden Helden oder nach Game Over sofort zurück zur Stadt
  if (egoMode && (gameOver || !hero || !state.hero)) exitEgo();
  if (egoMode && speed > 1){ speed = 1; $('btnSpeed').textContent = '▶'; }
  if (gameStarted && !gameOver && speed>0){
    const sdt = dt*(egoMode ? Math.min(speed,1) : speed);   // Ego: Simulation fest auf 1×
    state.time += sdt;
    economy(sdt);
    updateResearch(sdt);
    updateFolk(sdt);
    manageWorkers(sdt);
    regrow(sdt);
    waveSystem(sdt);
    updateAI(sdt);
    updateAiGuards(sdt);
    updateAllSails(sdt);
    updateExpeditions(sdt);
    updateSpace(sdt);
    updateEnemies(sdt);
    updateSoldiers(sdt);
    updateHero(sdt);
    updateDungeon(sdt);
    updateWildlife(sdt);
    updateQuests(sdt);
    updateMining(sdt);
    updateAuras(sdt);
    updateTowers(sdt);
    updateArrows(sdt);
    emitSmoke(sdt);
    updateParticles(sdt);
    flushLoot(sdt);
    // Gottmodus (Admin-Konsole): erlittener Schaden wird pro Tick zurückgesetzt
    if (ADMIN.god && hero && state.hero && !(state.hero.respawn>0)){
      hero.maxhp = heroMaxHp();
      if (hero.hp < hero.maxhp){ hero.hp = hero.maxhp; hero.prevHp = hero.hp; }
    }
    updateHUD(dt);
  } else if (!gameStarted){
    state.time += dt*0.2;
    updateParticles(dt);
  } else {
    updateParticles(dt);
  }
  // Visuelle Synchronisation
  const t = state.time;
  updateFallingTrees(dt*Math.max(speed,0.001));
  for (const f of folk) syncUnit(f, f.moving, t, dt);
  for (const s of soldiers) syncUnit(s, s.moving, t, dt);
  for (const e of enemies) syncUnit(e, e.moving, t, dt);
  for (const g of aiGuards) syncUnit(g, g.moving, t, dt);
  for (const a of wildlife) syncUnit(a, a.moving, t, dt);
  for (const e of campEnemies) syncUnit(e, e.moving, t, dt);
  for (const e of dungeonEnemies) syncDngUnit(e, t, dt);
  if (heroAlive() && !dungeon){
    syncUnit(hero, hero.moving, t, dt);
    // Hock-Animation beim Schürfen (im Ego ist die Figur ohnehin unsichtbar)
    const hock = mining ? 0.72 : 1;
    hero.mesh.scale.y += (hock - hero.mesh.scale.y)*Math.min(1, dt*6);
  } else if (heroAlive() && dungeon){
    // 24e: Figur läuft in Third-Person durch die Unterwelt mit (fxGroup = Weltkoordinaten)
    syncDngUnit(hero, t, dt);
    hero.mesh.position.y += DNG_Y;
  }
  if (heroAlive() && hero.mesh.visible) animHeroCape(t);   // 25b: Umhang weht im Wind
  // Glitzer-Partikel der Schürf-Spots pulsieren
  for (const g of mineGlitter){
    g.spr.material.opacity = 0.45 + 0.4*Math.sin(t*3 + g.ph);
    g.spr.scale.setScalar(0.38 + 0.16*Math.sin(t*2.2 + g.ph));
  }
  for (const bd of state.buildings){
    if (!bd.workers) continue;
    for (const w of bd.workers){
      syncUnit(w, w.moving, t, dt);
      if (w.carryMesh) w.carryMesh.visible = !!w.carry;
    }
  }
  for (const bd of state.buildings){
    if (bd.anim !== undefined){
      bd.anim = Math.min(1, bd.anim + dt*2.6);
      const tgt = bd.baseScale||1;
      const s = bd.anim<1 ? 0.5 + 0.5*(1-Math.pow(1-bd.anim,3)) + Math.sin(bd.anim*Math.PI)*0.08 : 1;
      bd.mesh.scale.setScalar(s*tgt);
      if (bd.anim>=1) delete bd.anim;
    }
    const ap = bd.animParts || cacheAnimParts(bd);
    const flag = ap.flag;
    if (flag) flag.rotation.y = Math.sin(t*3.2)*0.35;
    const fire = ap.fire;
    if (fire){ const fs = 1+Math.sin(t*11+bd.x)*0.15; fire.scale.set(fs,1+Math.sin(t*9)*0.2,fs); }
    if (ap.boot){    // vertäutes Ruderboot schaukelt sacht in der Dünung
      const by = ap.boot.userData.baseY !== undefined ? ap.boot.userData.baseY : -0.16;
      ap.boot.position.y = by + Math.sin(t*1.6+bd.x)*0.03;
      ap.boot.rotation.z = Math.sin(t*1.4+bd.y)*0.05;
    }
    if (bd.t==='gehege' && ap.deers){
      const show = Math.min(4, 1+lvlOf(bd));          // 2/3/4 Rentiere je Stufe
      for (let i=0;i<4;i++){
        const dm = ap.deers[i];
        if (!dm) continue;
        dm.visible = i < show;
        if (!dm.visible) continue;
        const ph = i*1.9 + bd.x*0.7;
        const ang = t*0.22 + ph;
        dm.position.x = Math.cos(ang)*(0.65+0.35*Math.sin(ph*2.3));
        dm.position.z = Math.sin(ang*0.8+ph)*0.95;
        dm.position.y = 0.05 + Math.abs(Math.sin(t*3.2+ph))*0.03;
        dm.rotation.y = -(ang + Math.PI/2);
      }
    }
  }
  if (spawnEdge){
    spawnQuad.visible = true;
    spawnQuad.material.opacity = 0.3+0.3*Math.sin(t*6);
    spawnQuad.position.set(wx(spawnEdge[0]), Math.max(hAt(spawnEdge[0],spawnEdge[1]),0)+0.08, wz(spawnEdge[1]));
  } else spawnQuad.visible = false;
  for (const c of clouds){
    c.position.x += c.userData.v*dt;
    if (c.position.x > 170) c.position.x = -170;
  }
  waterTime.value = t;
  updateDayNight();
  updateEraFlight(dt);
  updateCamCombined(dt);
  updateEnemyArrow();
  renderer.render(scene, camera);
  captureChronThumbs();      // muss direkt nach render() passieren (WebGL-Puffer)
}

// Initialisierung nach erstem Paint
setTimeout(()=>{
  init();
  $('btnStart').disabled = false;
  $('btnStart').textContent = 'Spielen';
  last = performance.now();
  requestAnimationFrame(loop);
  if (location.search.indexOf('dbg') >= 0)   // Test-Hook (nur mit ?dbg aktiv)
    window.DBG = { get state(){return state}, cam, addBuilding, spawnSoldier, spawnEnemy,
      fellTree, tryUpgrade, satisfaction, applyTerraform, spawnAiRaid,
      destroyBuilding, repairBuilding, walkable, upgradeCost,
      aiStep(n){ for (let i=0;i<(n||1);i++) for (const a of lords())
        if (!a.defeated){ a.bt = 0; a.tt = 0; updateLord(a, 0.01); } },
      aiStepFor(i,n){ const a = lords()[i]; if (!a) return;
        for (let k=0;k<(n||1);k++){ if (a.defeated) return; a.bt = 0; updateLord(a, 0.01); } },
      setAttack(bd){ attackOrder = bd; },
      get aiGuards(){return aiGuards}, get soldiers(){return soldiers},
      startExpedition, isleOf, get expeditions(){return expeditions},
      get treeList(){return treeList}, get enemies(){return enemies},
      renderer, scene, get info(){return renderer.info}, destroyAiBuilding,
      get treeIM(){return treeIM}, regrowNow(){ regrowT = 0; regrow(0.01); },
      startEraFlight, cancelEraFlight, get eraFlight(){return eraFlight},
      chronicleAdd, get chronicle(){return state.chronicle},
      captureChronThumbs, openChronicle, save,
      // Etappe 19: Inselwelt, Biome, Minimap
      get isles(){return ISLES}, get isleBiome(){return isleBiome},
      get isleId(){return isleId}, get isleParent(){return isleParent},
      get start(){return [SX,SY]}, get MAP(){return MAP},
      playerIsle, biomeOfBuilding, biomeBonus, gatherAmount, prodRate,
      showBuildingInfo, openMap, drawMinimap,
      // Etappe 20: Baumenü-Sheet + Freischaltungs-Badge
      openBuildSheet, closeBuildSheet, unseenUnlocks, updateBuildBadge, refreshMenu,
      startPlacing, get placing(){return placing},
      // Etappe 21a: Forschung + Fahrzeugfabrik/Flugfeld
      startResearch, researchCost, researchMult, researchTime, effUnitStats,
      armyCap, trainUnit, unitUnlocked, fliegerSpeedBonus, trainCostOf,
      get research(){return state.research}, get researchJob(){return state.researchJob},
      finishResearch(){ if (state.researchJob) finishResearchJob(); },
      // Etappe 21b: Speicherhaus, Kultur, Leuchtturm, Lazarett, Verteidigungs-HQ
      depotBonus, depotAura, kulturPoints, shipSpeedFactor, vorpCost, lighthouseLvl,
      hqLvl, updateAuras, enemyNear, canPlace, placingHint, maxHp, lvlOf,
      get particles(){return particles},
      // Etappe 24a: Held, Ego-Modus, Auto-Modus
      get hero(){return state.hero}, get heroUnit(){return hero},
      recruitHero, enterEgo, exitEgo, get egoMode(){return egoMode},
      get egoYaw(){return egoYaw}, set egoYaw(v){egoYaw=v},
      get egoPitch(){return egoPitch}, get egoBlend(){return egoBlend},
      egoInput(mx,my,dx,dy){
        egoStick.x = mx||0; egoStick.y = my||0;
        if (dx) egoYaw += dx*0.22*Math.PI/180;
        if (dy) egoPitch = clamp(egoPitch - dy*0.18*Math.PI/180, -Math.PI/3, Math.PI/3);
      },
      egoAction(){ return egoAction(); },
      get egoStick(){return egoStick},
      giveHeroExp, heroKill(){ heroDie(); },
      heroMaxHp, heroDmg, heroLevel, heroSkillCap, heroHome, egoTargetEnemy,
      showHeroInfo, camera, heightAt:(x,y)=>hAt(x,y),
      get speed(){return speed}, set speed(v){speed=v},
      // Etappe 24b: Schürfen, Crafting/Ausrüstung, Beutel, Handel, Hafen, Wildtiere
      get mineSpots(){return state.mineSpots},
      mineOnce(){
        if (!state.hero || !state.hero.pfanne) return false;
        let sp = mining ? mining.spot : null;
        if (!sp){ let bd2 = 1e9;
          for (const s of (state.mineSpots||[])){ if (s.left<=0) continue;
            const d = hero ? dist(hero.x,hero.y,s.x,s.y) : 0;
            if (d < bd2){ bd2 = d; sp = s; } } }
        return sp ? mineRound(sp, false) : false;
      },
      advanceMining(sec){ updateMining(sec||1); },
      get mining(){return mining}, mineDur, exhaustSpot, initMineSpots,
      craftHero, craftGate, craftCost, craftDiscount, equipHero, itemValue,
      HERO_ITEMS, BAG_ITEMS, bestSmithLvl,
      get heroBag(){return state.hero ? state.hero.bag : null},
      bagAdd, bagCount, bagValue, heroCapacity, emptyBag, nearDeliverBuilding,
      heroSellRate, heroBuyRate, heroTradeBonus, openHeroTrade, openCraftSheet, showBagSheet,
      // Etappe 25a: Ausrüstungs-Händler am Markt
      buyHeroItem, heroShopPrice, heroShopList, heroShopGate, heroShopMarkup,
      get marktTab(){return marktTab}, set marktTab(v){marktTab=v},
      heroSail(x,y){ return egoSailTo(x,y); }, openSailPick, get sailPick(){return sailPick},
      egoContext, egoTargetWild, applyHeroEquipVisual, heroArmorHp, heroWeaponDmg,
      // Etappe 25b: Held 2.0 – Epochen-Look
      refreshHeroLook, heroLookTier, updateEgoHandLook,
      get wildlife(){return wildlife},
      spawnWildlife(art,x,y){ return spawnWild(art,x,y); },
      clearWildlife(){ for (const a of wildlife) removeUnit(a); wildlife = []; },
      wildTick(sec){ updateWildlife(sec||1); }, wildCapOf, WILD_ARTS, killWild,
      get egoHands(){return egoHands},
      // Etappe 24e: Third-Person-Sicht
      get heroView(){ return heroView(); },
      setHeroView(v){
        if (!state.hero) return false;
        state.hero.view = v==='ego' ? 'ego' : 'tp';
        tpSnap = true; applyEgoViewVis();
        return true;
      },
      toggleView(){ $('egoView').click(); return heroView(); },
      get heroMeshVisible(){ return hero ? hero.mesh.visible : null; },
      get heroMeshPos(){ return hero ? hero.mesh.position.toArray() : null; },
      camForward(){ const v = new THREE.Vector3(); camera.getWorldDirection(v); return v.toArray(); },
      heroHeadPos(){
        if (!hero) return null;
        return dungeon ? [dlx(hero.x), DNG_Y+0.62, dlz(hero.y)]
          : [wx(hero.x), Math.max(hAt(hero.x,hero.y),0)+0.62, wz(hero.y)];
      },
      camHeroDist(){
        if (!hero) return -1;
        const h = dungeon ? [dlx(hero.x), DNG_Y+0.62, dlz(hero.y)]
          : [wx(hero.x), Math.max(hAt(hero.x,hero.y),0)+0.62, wz(hero.y)];
        return Math.hypot(camera.position.x-h[0], camera.position.y-h[1], camera.position.z-h[2]);
      },
      camGridPos(){
        return dungeon ? [camera.position.x/TL+11.5, camera.position.z/TL+11.5]
          : [camera.position.x/TL+C, camera.position.z/TL+C];
      },
      tpSnapNow(){ tpSnap = true; },
      // Etappe 24c: Dungeons
      enterDungeon, exitDungeon,
      get dungeon(){
        if (!dungeon) return null;
        const r = dngRoom();
        return { tier:dungeon.tier, isle:dungeon.isle, room:dungeon.room,
          rooms:dungeon.run.rooms.map(r2=>r2.tpl),
          cleared:dungeon.run.rooms.map(r2=>!!r2.cleared),
          enemies:dungeonEnemies, open:!!(r && r.open),
          chestOpen:!!(r && r.chestOpen), entry:dungeon.entry, seed:dungeon.run.seed };
      },
      killDungeonEnemies(){
        // bis zu 3 Durchläufe: Boss-Adds (T1) spawnen beim ersten Todestick nach
        for (let k = 0; k < 3 && dungeonEnemies.length; k++){
          for (const e of dungeonEnemies) e.hp = 0;
          updateDungeon(0.01);
        }
        return !dungeonEnemies.length;
      },
      dungeonGoto(i){ if (dungeon) loadRoom(i, 'bottom'); },
      dungeonTick(sec){ updateDungeon(sec||1); },
      get dngPortals(){return dngPortals}, rollDungeonRooms,
      dungeonRunFor(isle,ctr){ return buildRun(isle, ctr); },
      openDungeonChest, pullLever, grantEquipDrop,
      get dngLights(){return dngLights}, get dngTele(){return dngTele},
      get dngGroup(){return dngGroup},
      countPointLights(){ let n = 0; scene.traverse(o=>{ if (o.isPointLight) n++; }); return n; },
      dWalkable, get dngHeroPos(){ return hero ? [hero.x, hero.y] : null },
      setHeroPos(x,y){ if (hero){ hero.x = x; hero.y = y; } },
      get fog(){ return { near:scene.fog.near, far:scene.fog.far, color:scene.fog.color.getHex() }; },
      // Etappe 24d: Quest-System
      get quests(){ return state.quests; },
      questsUnlocked, ensureOffers, rollQuestOffer, tafelOk,
      genQuestOffer(slot){
        const o = rollQuestOffer('tafel');
        if (!o) return null;
        if (slot !== undefined && state.quests.offers[slot]) state.quests.offers[slot] = o;
        else state.quests.offers.push(o);
        return o;
      },
      rerollOffers(){ state.quests.offers = []; ensureOffers(); return state.quests.offers; },
      acceptQuest, abandonQuest, declineOffer, trackQuest, questReady,
      questProgress(id, n){
        const q = state.quests.active.find(a=>a.id===id || a===id);
        if (!q) return false;
        q.have += (n===undefined ? 1 : n);
        if (q.have >= q.need && q.typ!=='lieferung'){
          q.have = q.need;
          if (q.typ==='schuerfen' || q.typ==='umsatz') completeQuest(q, true);
          else q.phase = 'abgeben';
        }
        return true;
      },
      completeQuest(id){
        const q = typeof id==='object' ? id : state.quests.active.find(a=>a.id===id);
        return q ? completeQuest(q, true) : false;
      },
      questNotify, questTargetPos, lieferPayout, openQuestSheet, openCitizenDialog,
      markCitizen, unmarkCitizen,
      get citizen(){ return folk.find(f=>f.qmark || f.questId) || null; },
      get folk(){ return folk; },
      spawnIntruderCamp, removeCamp,
      get camp(){ return state.quests ? state.quests.camp : null; },
      get campEnemies(){ return campEnemies; },
      get campOrphanT(){ return campOrphanT; },
      questTick(sec){ updateQuests(sec||1); },
      setGratitude(v){ state.quests.gratitude = v; },
      setCitizenTimer(v){ citizenT = v; },
      // Etappe 24f: Schürf-Kontext, Helden-Kampfgefühl, Jagd-Quest-Garantien
      heroAtkCd, applyStagger, heroAttack(){ return heroAttack(); },
      egoMineTarget, ensureQuestWild, findQuestWildTile, findWildTile,
      questPreferredArt, enemyTick(sec){ updateEnemies(sec||0.1); },
      get wildSpawnT(){ return wildSpawnT; }, set wildSpawnT(v){ wildSpawnT = v; },
      get PFANNE_HINT(){ return PFANNE_HINT; },
      // Etappe 24g: Holz-Ökonomie (inselweiter Holzfäller, Fuhren-Werte)
      treesOnIsle, invalidateTreeCache, CHOPS_PER_TREE, gatherRadius,
      workerTick(sec){ manageWorkers(sec||0.1); },
      // Etappe 25c: Admin-Konsole (UI nur im privaten Build; Funktionen testbar)
      get IS_ADMIN(){ return IS_ADMIN; }, get adminCheats(){ return ADMIN; },
      adminGiveRes, adminAllRes, adminSetRathaus, adminSeenAll, adminSpeed,
      adminWaveNow, adminWaveEnd, adminDefeatRagnar, adminDefeatAllLords,
      adminSkillsMax, adminSkillExp,
      adminGiveItem, adminFillBag, adminTeleport, adminDungeonsClear,
      adminDungeonsReset, adminCompleteQuest, adminRerollOffers, openAdminSheet,
      // Etappe 26a: die drei Fürsten, neue Siegbedingung, Belagerungs-Bau
      get ais(){ return lords(); }, get aiFlat(){ return aiFlat; },
      LORDS, lordCfg, lordProgress, lordBroken, lordIsle, siegeLordOn, siegeAllowed,
      isSiegeBuilding, createAllLords, addLateLord, lordDefeated, aiEraIdx,
      drawLordList, refreshSiegeFlags, spawnAiGuard, inMapT: inMap, inSettlement,
      guardTick(sec){ updateAiGuards(sec||0.1); },
      destroyAllOf(i){ const a = lords()[i]; if (!a) return false;
        for (const bd of [...a.buildings]) destroyAiBuilding(bd); return true; },
      get lordsWon(){ return state.lordsWon||0; },
      // Etappe 25d: Boots-Anlegen, Helden-Kollision, Craft-Freischaltung
      craftUnlockLvl, heroManualWalkable, startSail, cancelSail,
      get sinkingBoats(){ return sinkingBoats; },
      sailTick(sec){ updateAllSails(sec||0.1); },
      get tiles(){ return tiles; }, idx };
}, 40);
