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
                gather:{res:'holz', amount:8}, needs:'tree', radius:5,
                desc:'Arbeiter fällen automatisch Bäume im Einzugsgebiet.' },
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
  __see:      { name:'See ausheben', cat:'infra', w:1, h:1, hp:1, cost:{gold:25}, terra:'see',
                desc:'Hebt einen kleinen See aus – Grundlage für Fischerei.' },
  __wiese:    { name:'Land aufschütten', cat:'infra', w:1, h:1, hp:1, cost:{stein:30,holz:15}, terra:'wiese',
                desc:'Schüttet Wasser zu neuem Bauland auf.' },
};
const BUILDABLE = ['haus','holzfaeller','farm','fischer','gehege','steinbruch','mine','schmiede','speicher','markt','hafen','taverne','akademie','leuchtturm','theater','turm','mauer','tor','kaserne','lazarett','hq','fabrik','flugfeld','stahlwerk','bohrturm','raumhafen','__see','__wiese'];
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
  return Math.round((BT[bd.t].gather.amount + (lvlOf(bd)-1)*3) * (isEco()?1.2:1)
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
  const food = clamp(state.res.nahrung / (state.pop*2+8), 0, 1);
  const towers = state.buildings.reduce((n,b)=>n+(b.t==='turm'?1:0), 0);
  // Luftpatrouille: jedes intakte Flugfeld zählt wie 3 Wachtürme
  const airf = state.buildings.reduce((n,b)=>n+(b.t==='flugfeld' && !b.ruin ?1:0), 0);
  const safety = clamp((state.soldiersOwned + towers*2 + airf*6) / (2+Math.min(state.wave,40)*1.1), 0, 1);
  const housing = cap<=0 ? 0.5 : clamp(1.6 - state.pop/cap, 0.55, 1);
  // Kultur wird erst ab Rathaus 6 zum Bedürfnis – Alt-Stände bleiben davor unverändert;
  // Sockel 0,3 („Feste auf dem Marktplatz“) verhindert den Deadlock ohne Kultur-Gebäude
  if (rathausLvl() >= 6){
    const kultur = clamp(0.3 + kulturPoints()/Math.max(1, state.pop), 0, 1);
    const total = clamp(food*0.40 + safety*0.25 + housing*0.20 + kultur*0.15, 0, 1);
    return { food, safety, housing, kultur, total };
  }
  const total = clamp(food*0.45 + safety*0.3 + housing*0.25, 0, 1);
  return { food, safety, housing, total };
}

let state = null, gameStarted = false, gameOver = false;
function newState(seed){
  return { seed, time:26,
    res:{ holz:90, stein:40, nahrung:70, gold:25, erz:0, eisen:0, stahl:0, oel:0, lithium:0 },
    pop:4, buildings:[], chopped:[], regrown:[], terra:[], wave:1, waveTimer:330,
    waveActive:false, soldiersOwned:0, popTick:0, muted:false, doctrine:null, ai:null,
    planets:[], chronicle:[], research:{}, researchJob:null,
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
}
// Insel-Zugehörigkeit jeder Landkachel (Flutfüllung) + Biom je Landmasse
let isleId = null, isleBiome = null, isleParent = null;
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
  for (let id=1; id<=next; id++){
    const mx = sumX[id]/cnt[id], my = sumY[id]/cnt[id];
    let bi = 0, bs = -1e9;
    ISLES.forEach((I,i)=>{ const f = 1 - dist(mx,my,I.x,I.y)/I.r; if (f > bs){ bs = f; bi = i; } });
    isleParent[id] = bi;
    isleBiome[id] = ISLES[bi] ? ISLES[bi].biome : 'wiese';
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
// bevorzugt in den Einzugsgebieten der Holzfäller
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
      const src = treeList[Math.floor(Math.random()*treeList.length)];
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
  const list = bd.t==='holzfaeller' ? treeList : rockList;
  let best = null, bestD = 1e9;
  for (const o of list){
    if (o.claim && o.claim !== w) continue;
    if (dist(o.x,o.y,cx0,cy0) > gatherRadius(bd)+0.01) continue;
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
      w.timer -= dt;
      if (w.timer <= 0){
        w.timer = 0.9;
        const tgt = findGatherTarget(bd, w);
        if (tgt){ w.target = tgt; w.state = 'go'; }
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
          if (t.chops >= 3) fellTree(t, Math.atan2(bcy-t.y, bcx-t.x));
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
    // normale Gebäude nur im Siedlungsgebiet (Expeditionen gründen neue)
    if (!b.vorp && !inSettlement(px,py)) return false;
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
  buildWorld();
  // Gebäude auf neue Geländehöhe setzen
  for (const bd of state.buildings){
    if (!bd.mesh) continue;
    const [cx,cy] = buildingCenter(bd);
    bd.mesh.position.y = Math.max(hAt(cx,cy), 0.02);
    orientHarbor(bd);        // neues Ufer: Steg-Richtung/-Höhe nachführen
  }
  if (state.ai) for (const bd of state.ai.buildings){
    if (!bd.mesh) continue;
    const [cx,cy] = aiBuildingCenter(bd);
    bd.mesh.position.y = Math.max(hAt(cx,cy), 0.02);
  }
  state.buildings.forEach(recalcEff);
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
  speicher:2.0, taverne:2.2, leuchtturm:3.9, lazarett:1.9, theater:2.8, hq:1.4 };
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
};
for (const k in PM) PM[k].userData.shared = true;
for (const m of SKIN_MATS) m.userData.shared = true;
function makePerson(kind, matIdx){
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';              // erst Blickrichtung, dann Vorlehnen beim Laufen
  const bodyMat = kind==='soldier' ? M.soldierBody :
    (kind==='aisoldier' ? PM.aiBody :
    (kind==='laser' ? PM.laserBody :
    (kind==='ritter' ? M.steel : (kind==='enemy' ? M.enemyBody : FOLK_MATS[matIdx%FOLK_MATS.length]))));
  const skin = SKIN_MATS[(Math.random()*SKIN_MATS.length)|0];   // bunt gemischte Hauttöne
  const legMat = kind==='ritter' ? M.steel :
    (kind==='laser' ? PM.laserDark : (kind==='enemy'||kind==='aisoldier' ? PM.pantsDark : PM.pants));
  // Rumpf (konisch, Schultern eingebacken) + Gürtel
  const body = mesh(torsoGeo, bodyMat); body.position.y = 0.38; g.add(body);
  const belt = mesh(beltGeo, M.timber, false); belt.position.y = 0.27; g.add(belt);
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
  if (u.sail) return;                    // Einheit ist an Bord eines Schiffs
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
  while (folk.length > want) removeUnit(folk.pop());
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
  if (attackOrder && (!state.ai || state.ai.defeated || !state.ai.buildings.includes(attackOrder)))
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
function updateSail(u, dt){
  const s = u.sail;
  s.t += dt/s.dur;
  const p = Math.min(s.t, 1);
  const bx2 = lerp(s.x0,s.x1,p), by2 = lerp(s.y0,s.y1,p);
  s.boat.position.set(wx(bx2), -0.02+Math.sin(state.time*2.2+s.ph)*0.06, wz(by2));
  s.boat.rotation.y = -Math.atan2(s.y1-s.y0, s.x1-s.x0);
  s.boat.rotation.z = Math.sin(state.time*1.8+s.ph)*0.04;
  if (Math.random() < dt*2) spawnBurst(wx(bx2)-Math.cos(s.boat.rotation.y)*0.6, 0.05, wz(by2), 1, 0xdff2ff);
  if (s.t >= 1){
    const land = findLanding(s.destX, s.destY);
    u.x = land[0]; u.y = land[1];
    u.mesh.visible = true;
    fxGroup.remove(s.boat); disposeGroup(s.boat);
    u.sail = null;
  }
}
function updateAllSails(dt){
  for (const s of soldiers) if (s.sail) updateSail(s, dt);
  for (const e of enemies) if (e.sail) updateSail(e, dt);
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
      fxGroup.remove(s.boat); disposeGroup(s.boat);
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

// ============================== KI-GEGNER: FÜRST RAGNAR ==============================
const AI_NAME = 'Fürst Ragnar';
const AI_BUILD_ORDER = ['haus','holzfaeller','farm','haus','kaserne','turm','haus','farm','turm','haus','kaserne','haus','turm','farm','haus'];
const aiGroup = new THREE.Group(); scene.add(aiGroup);
let aiGuards = [];
let attackOrder = null;                 // KI-Gebäude, das die Spieler-Armee angreifen soll

function rebuildAiOcc(){
  aiOcc.fill(0);
  if (!state.ai) return;
  state.ai.buildings.forEach((bd,n)=>{
    const b = BT[bd.t];
    for (let j=0;j<b.h;j++) for (let i=0;i<b.w;i++)
      if (inMap(bd.x+i,bd.y+j)) aiOcc[idx(bd.x+i,bd.y+j)] = n+1;
  });
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
function addAiBuilding(t,x,y,hp,noAnim){
  const bd = { t, x, y, hp: hp!==undefined?hp:BT[t].hp };
  state.ai.buildings.push(bd);
  rebuildAiOcc();
  const b = BT[t];
  const [cx,cy] = [x+(b.w-1)/2, y+(b.h-1)/2];
  const g = makeBuilding(t);
  // rote Standarte als Feindmarkierung
  const mk = new THREE.Group(); mk.name = 'aimark';
  const y2 = (PENNANT_Y[t]||2.2) + 0.5;
  mk.add(cyl(0.025,0.025,0.8, M.timber, -0.5, y2-0.8, -0.5, 5));
  const fl = mesh(new THREE.PlaneGeometry(0.5,0.28), std(0xc22a2a,{side:THREE.DoubleSide}), false, false);
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
function findAiSpot(t){
  const ai = state.ai;
  for (let r=1;r<=8;r++){
    for (let dy=-r;dy<=r;dy++) for (let dx=-r;dx<=r;dx++){
      if (Math.max(Math.abs(dx),Math.abs(dy)) !== r) continue;
      const x = Math.round(ai.x+dx), y = Math.round(ai.y+dy);
      if (canPlaceAi(t,x,y)) return [x,y];
    }
  }
  return null;
}
function createAi(){
  // Basis suchen: bevorzugt auf einer MITTLEREN Insel, nie auf der Heimatinsel
  // (Failsafe 2. Durchlauf: falls anderswo kein Platz ist, doch die Heimatinsel)
  let best = null, bestScore = -1;
  const pi = playerIsle();
  for (let pass=0; pass<2 && !best; pass++){
    for (let y=4;y<MAP-4;y+=2) for (let x=4;x<MAP-4;x+=2){
      if (!canPlaceAi('rathaus',x-1,y-1)) continue;
      const d = dist(x,y,SX,SY);
      if (d < 16) continue;
      const id = isleOf(x,y);
      if (pass===0 && id === pi) continue;
      let free = 0;
      for (let dy=-4;dy<=4;dy++) for (let dx=-4;dx<=4;dx++)
        if (inMap(x+dx,y+dy) && tiles[idx(x+dx,y+dy)]===2 && !treeMap[idx(x+dx,y+dy)] && !rockMap[idx(x+dx,y+dy)]) free++;
      let score = free + d*0.5;
      const P = ISLES[isleParent[id]];
      if (P && P.cls==='mittel') score += 120;   // mittlere Inseln klar bevorzugt
      if (id !== pi) score += 80;
      if (score > bestScore){ bestScore = score; best = [x,y]; }
    }
  }
  if (!best) return;                     // keine Fläche gefunden – KI entfällt auf dieser Karte
  state.ai = { x:best[0], y:best[1], buildings:[], nextBuild:0, army:0, age:0,
    bt:20, tt:35, rt:0, gt:10, defeated:false };
  addAiBuilding('rathaus', best[0]-1, best[1]-1, undefined, true);
  toast('⚠️ ' + AI_NAME + ' hat sich auf der Insel niedergelassen – vernichte sein rotes Rathaus!', 5000);
}
function destroyAiBuilding(bd){
  const ai = state.ai;
  const i = ai.buildings.indexOf(bd);
  if (i<0) return;
  ai.buildings.splice(i,1);
  if (bd.mesh){ aiGroup.remove(bd.mesh); disposeGroup(bd.mesh); }
  rebuildAiOcc();
  const [cx,cy] = aiBuildingCenter(bd);
  spawnBurst(wx(cx), hAt(cx,cy)+0.6, wz(cy), 12, 0xff8a5a);
  snd(90,0.35,'sawtooth',0.06);
  if (attackOrder===bd) attackOrder = null;
  if (bd.t==='rathaus') aiDefeated();
  else {
    // Plündern: ~40% der Baukosten als Beute
    const loot = {};
    for (const k in BT[bd.t].cost) loot[k] = Math.max(1, Math.round(BT[bd.t].cost[k]*0.4));
    addLoot(loot);
    toast('💥 Feindliches Gebäude zerstört und geplündert!');
  }
}
function aiDefeated(){
  const ai = state.ai;
  ai.defeated = true;
  for (const bd of [...ai.buildings]) {
    if (bd.mesh){ aiGroup.remove(bd.mesh); disposeGroup(bd.mesh); }
    const [cx,cy] = aiBuildingCenter(bd);
    spawnBurst(wx(cx), hAt(cx,cy)+0.6, wz(cy), 8, 0xff8a5a);
  }
  ai.buildings = [];
  rebuildAiOcc();
  for (const g of aiGuards) removeUnit(g);
  aiGuards = [];
  attackOrder = null;
  state.res.gold += 400;
  chronicleAdd('sieg', '🏆 '+AI_NAME+' wurde vernichtend geschlagen – das Reich ist unangefochten.');
  toast('🏆 SIEG! Du hast ' + AI_NAME + ' vernichtet! +400 🪙', 6000);
  snd(523,0.2,'triangle',0.06); snd(659,0.2,'triangle',0.06); snd(784,0.3,'triangle',0.06);
  save();
}
function spawnAiGuard(){
  const ai = state.ai;
  const a = Math.random()*Math.PI*2;
  const g = { x: clamp(ai.x+Math.cos(a)*2.5,1,MAP-2), y: clamp(ai.y+Math.sin(a)*2.5,1,MAP-2),
    hp:80, maxhp:80, cd:0, ph:Math.random()*7, dir:0, moving:false, hostile:true,
    mesh: makePerson('aisoldier') };
  if (!walkable(g.x,g.y,true)){ g.x = ai.x; g.y = ai.y+2; }
  aiGuards.push(g);
}
function spawnAiRaid(n){
  const ai = state.ai;
  const crossSea = isleOf(ai.x,ai.y) !== playerIsle();
  for (let i=0;i<n;i++){
    const hp = 85, e = {
      x: clamp(ai.x+(Math.random()-0.5)*4,1,MAP-2),
      y: clamp(ai.y+(Math.random()-0.5)*4,1,MAP-2),
      hp, maxhp:hp, cd:0, ph:Math.random()*7, dir:0, moving:true, kind:'ai', hostile:true,
      dmg: 11, speed: 1.35, mesh: makePerson('aisoldier') };
    if (!walkable(e.x,e.y,true)){ e.x = ai.x; e.y = ai.y; }
    enemies.push(e);
    if (crossSea){
      // Landung nahe der Spielerbasis (mit Streuung)
      const a = Math.random()*Math.PI*2;
      startSail(e, SX+Math.cos(a)*7, SY+Math.sin(a)*7);
    }
  }
  toast(crossSea
    ? '⛵ ' + AI_NAME + ' schickt ' + n + ' Krieger per Schiff gegen dein Dorf!'
    : '🔥 ' + AI_NAME + ' schickt ' + n + ' Krieger gegen dein Dorf!', 4000);
  snd(120,0.5,'sawtooth',0.06);
}
function updateAI(dt){
  const ai = state.ai;
  if (!ai || ai.defeated) return;
  ai.age += dt;
  // Bauen
  ai.bt -= dt;
  if (ai.bt <= 0){
    ai.bt = 24 + Math.random()*10;
    const t = AI_BUILD_ORDER[ai.nextBuild % AI_BUILD_ORDER.length];
    const spot = findAiSpot(t);
    if (spot) addAiBuilding(t, spot[0], spot[1]);
    ai.nextBuild++;
  }
  // Truppen ansammeln
  ai.tt -= dt;
  if (ai.tt <= 0){
    ai.tt = 30;
    const kasernen = ai.buildings.filter(b=>b.t==='kaserne').length;
    if (ai.army < 4 + kasernen*4) ai.army++;
  }
  // Wachen nachrücken
  ai.gt -= dt;
  if (ai.gt <= 0){
    ai.gt = 40;
    const cap = 2 + ai.buildings.filter(b=>b.t==='turm').length;
    if (aiGuards.length < cap) spawnAiGuard();
  }
  // Überfälle (erst nach Schonfrist)
  ai.rt -= dt;
  if (ai.age > 380 && ai.rt <= 0){
    ai.rt = 210 + Math.random()*60;
    const n = Math.min(ai.army, 3 + Math.floor(ai.buildings.length/4));
    if (n >= 2){ ai.army -= n; spawnAiRaid(n); }
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
function updateAiGuards(dt){
  const ai = state.ai;
  if (!ai) return;
  for (const g of aiGuards){
    g.cd = Math.max(0, g.cd-dt);
    let best = null, bd2 = 1e9;
    for (const s of soldiers){ const d = dist(g.x,g.y,s.x,s.y); if (d<bd2){bd2=d;best=s;} }
    const baseD = dist(g.x,g.y,ai.x,ai.y);
    if (best && bd2 < 7 && baseD < 11){
      if (bd2 > 0.75){ g.moving = true; steer(g, best.x, best.y, 1.5, dt); }
      else { g.moving = false;
        if (g.cd<=0){ g.cd = 0.9; best.hp -= 10;
          spawnBurst(wx(best.x), hAt(best.x,best.y)+0.5, wz(best.y), 3, 0xffd27a); } }
    } else if (baseD > 3.5){ g.moving = true; steer(g, ai.x, ai.y, 1.2, dt); }
    else g.moving = false;
  }
  aiGuards = aiGuards.filter(g=>{
    if (g.hp<=0){ killLoot({kind:'ai'});
      spawnBurst(wx(g.x), hAt(g.x,g.y)+0.4, wz(g.y), 6, 0xff8a5a);
      removeUnit(g); return false; }
    return true;
  });
}
function showAiInfo(bd){
  $('ipName').textContent = '🔴 ' + BT[bd.t].name + ' – ' + AI_NAME;
  $('ipDesc').textContent = bd.t==='rathaus'
    ? 'Das feindliche Hauptquartier – zerstöre es, um zu siegen!'
    : 'Feindliches Gebäude von ' + AI_NAME + '.';
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
      toast('⚔️ Deine Armee marschiert auf ' + AI_NAME + '!');
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
    e.cd = Math.max(0,e.cd-dt);
    let target = null, tIsUnit = false, bd2 = 1e9;
    for (const s of soldiers){ const d = dist(e.x,e.y,s.x,s.y); if (d<4 && d<bd2){bd2=d;target=s;tIsUnit=true;} }
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
  if (laz.length) for (const s of soldiers){
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
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (pointers.size<2) twoInfo = null;
  if (p && !p.moved && tapInfo && performance.now()-tapInfo.t < 500 && pointers.size===0)
    handleTap(e.clientX, e.clientY);
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', (e)=>{ pointers.delete(e.pointerId); if (pointers.size<2) twoInfo=null; });
cv.addEventListener('wheel', (e)=>{
  e.preventDefault();
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
  let tilesFree = true, settle = true;
  for (let j=0;j<b.h;j++) for (let i=0;i<b.w;i++){
    const px=x+i, py=y+j;
    if (!inMap(px,py)){ tilesFree = false; continue; }
    const k = idx(px,py);
    if (tiles[k]!==2 || occ[k] || aiOcc[k] || treeMap[k] || rockMap[k]) tilesFree = false;
    if (!inSettlement(px,py)) settle = false;
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
  if (b.radius || b.tower){
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
    addBuilding(t, placing.x, placing.y);
    if (CHRON_FIRSTS[t] && !chronicleHas('first_'+t))
      chronicleAdd('first_'+t, CHRON_FIRSTS[t]);
    snd(340,0.12,'triangle',0.05); snd(480,0.14,'triangle',0.04);
    save();
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
  const k = idx(tx,ty);
  if (occ[k]){
    selected = { kind:'building', bd: state.buildings[occ[k]-1] };
    showBuildingInfo(selected.bd); showSelQuads(selected.bd); snd(520,0.06,'sine',0.03);
  } else if (aiOcc[k] && state.ai){
    selected = { kind:'ai', bd: state.ai.buildings[aiOcc[k]-1] };
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
    const cnt = bd.t==='fischer' ? countWater(bd)
      : countNear(bd.t==='holzfaeller'?treeMap:rockMap, bd.x, bd.y, b.w, b.h, gatherRadius(bd));
    const icon = bd.t==='fischer' ? '🌊 ' : (bd.t==='holzfaeller' ? '🌳 ' : '🪨 ');
    stats += ' · 👷 ' + n + '/' + gatherWorkers(bd) + ' · ' + icon + cnt +
      ' im Gebiet (R' + gatherRadius(bd) + ')' + (cnt===0?' ⚠️':'') +
      ' · ' + COSTICON[b.gather.res] + gatherAmount(bd) + '/Fuhre';
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
  // Handel (am Markt)
  if (b.market){
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
  if (!state.waveActive || !enemies.length || !gameStarted){ arrowEl.style.display = 'none'; return; }
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
  $('rNahrung').classList.toggle('warn', state.res.nahrung < 10);
  if (state.waveActive) ui.wave.textContent = 'Welle ' + state.wave + ' – ' + enemies.length + ' Feinde!';
  else {
    const t = Math.max(0, Math.ceil(state.waveTimer));
    ui.wave.textContent = 'Welle ' + state.wave + ' in ' + Math.floor(t/60) + ':' + String(t%60).padStart(2,'0');
  }
  ui.wavebar.classList.toggle('alert', state.waveActive || state.waveTimer<16);
  $('btnMap').classList.toggle('alert', !!state.waveActive);   // roter Punkt: Angriff läuft
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
  if (state.ai && !state.ai.defeated)
    for (const bd of state.ai.buildings){
      const c2 = aiBuildingCenter(bd);
      dot(c2[0], c2[1], '#ff4438', bd.t==='rathaus' ? 9 : 5);
    }
  for (const bd of state.buildings){
    const c2 = buildingCenter(bd);
    dot(c2[0], c2[1], bd.t==='rathaus' ? '#ffce3a' : (bd.t==='vorposten' ? '#4ade6a' : '#f2f5fa'),
      bd.t==='rathaus' ? 9 : (bd.t==='vorposten' ? 7 : 4));
  }
  for (const e of enemies) if (!e.sail) dot(e.x, e.y, '#ff9d2e', 6);
  // aktueller Kamera-Ausschnitt
  const ctx0 = cam.tx/TL + C, cty0 = cam.tz/TL + C, half = (cam.dist*0.85)/TL;
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2;
  g.strokeRect((ctx0-half)*S, (cty0-half)*S, half*2*S, half*2*S);
}
function openMap(){
  if (!state || !tiles) return;
  drawMinimap();
  $('mapOv').style.display = 'flex';
}
$('btnMap').addEventListener('click', openMap);
$('mapClose').addEventListener('click', ()=>{ $('mapOv').style.display = 'none'; });
$('mapCv').addEventListener('click', (e)=>{
  // Tap-to-Jump: Kamera zum angetippten Punkt, Overlay schließt
  const r = e.currentTarget.getBoundingClientRect();
  const tx2 = (e.clientX - r.left)/r.width*MAP, ty2 = (e.clientY - r.top)/r.height*MAP;
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
      ai: state.ai ? { x:state.ai.x, y:state.ai.y, nextBuild:state.ai.nextBuild,
        army:state.ai.army, age:Math.round(state.ai.age), defeated:state.ai.defeated,
        buildings: state.ai.buildings.map(b=>({t:b.t,x:b.x,y:b.y,hp:b.hp})) } : null,
      exped: expeditions.map(e=>({x:e.destX, y:e.destY})),
      planets: state.planets,
      chronicle: state.chronicle||[],
      seenUnlocks: state.seenUnlocks||[],
      research: state.research||{},
      researchJob: state.researchJob||null,
      fabHint: state.fabHint||0,
      kulturHint: state.kulturHint||0,
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
    chronWaveRecord = state.wave>1 ? waveStrength(state.wave-1) : 0;   // Rekord neu seeden
    genMap(); buildWorld();
    for (const b of d.buildings){
      if (!BT[b.t]) continue;                   // unbekannter Typ (Downgrade): überspringen
      const nb = addBuilding(b.t, b.x, b.y, b.hp, true);
      if (b.l > 1){ nb.lvl = b.l; applyLevelVisual(nb); recalcEff(nb); }
      if (b.r){ nb.ruin = true; nb.hp = 0; applyRuinVisual(nb); }
    }
    updateWalls();
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
    if (d.ai){
      state.ai = { x:d.ai.x, y:d.ai.y, buildings:[], nextBuild:d.ai.nextBuild||0,
        army:d.ai.army||0, age:d.ai.age||0, bt:24, tt:30, rt:60, gt:15,
        defeated:!!d.ai.defeated };
      for (const b of (d.ai.buildings||[])) addAiBuilding(b.t, b.x, b.y, b.hp, true);
    }
    return true;
  }catch(_){ return false; }
}
setInterval(save, 12000);

// ============================== START / NEUSTART ==============================
function freshGame(){
  state = newState((Math.random()*1e9)|0);
  genMap(); buildWorld();
  addBuilding('rathaus', SX-1, SY-1, undefined, true);
  createAi();
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
  folk = []; soldiers = []; enemies = []; arrows = []; aiGuards = []; expeditions = [];
  spaceMissions = [];
  particles.length = 0; fallingTrees.length = 0;
  disposeGroup(aiGroup);
  attackOrder = null;
}
function restart(){
  try{ localStorage.removeItem(SAVEKEY); }catch(_){}
  clearEntities();
  disposeGroup(bldGroup);
  cancelPlacing(); hideInfo(); closeBuildSheet();
  selected = null; spawnEdge = null; gameOver = false;
  freshGame();
  updateBuildBadge();
  refreshPlanetSky();
  cam.tx = wx(SX-0.5); cam.tz = wz(SY-0.5); cam.dist = 23; cam.az = Math.PI*0.75;
  $('overOv').style.display = 'none';
  toast('🏰 Neues Reich gegründet!');
}
function init(){
  if (!load()) freshGame();
  if (!state.ai) createAi();     // KI in bestehenden Spielständen nachrüsten
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
  if (gameStarted && !gameOver && speed>0){
    const sdt = dt*speed;
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
    updateAuras(sdt);
    updateTowers(sdt);
    updateArrows(sdt);
    emitSmoke(sdt);
    updateParticles(sdt);
    flushLoot(sdt);
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
  updateCam();
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
      aiStep(n){ for (let i=0;i<(n||1);i++){ if (state.ai && !state.ai.defeated){ state.ai.bt = 0; state.ai.tt = 0; updateAI(0.01); } } },
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
      get particles(){return particles} };
}, 40);
