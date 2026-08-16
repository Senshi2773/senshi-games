// Bündelt src/main.js (inkl. three.js) und bettet es in template.html ein.
// Erzeugt: index.html (eigenständig) und artifact.html (ohne Dokument-Gerüst,
// für das Artifact-Deployment auf claude.ai).
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';

const r = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  logLevel: 'warning',
});
const js = r.outputFiles[0].text;
const tpl = readFileSync('template.html', 'utf8');

const full = tpl.replace('/*__BUNDLE__*/', () => js);
writeFileSync('index.html', full);

// Artifact-Variante: nur <title> + <style> + Body-Inhalt.
// Admin-Konsole (Etappe 25c): NUR der private artifact-Build erhält das Flag –
// es steht VOR dem Bundle-Script; index.html (öffentlich) bekommt es nie.
const style = full.match(/<style>[\s\S]*?<\/style>/)[0];
const body = full.match(/<body>\n([\s\S]*)\n<\/body>/)[1];
writeFileSync('artifact.html', '<title>Königreich 3D</title>\n' + style +
  '\n<script>window.__ADMIN__=true;</script>\n' + body + '\n');

console.log('index.html:', (full.length/1024).toFixed(0)+'kB');
