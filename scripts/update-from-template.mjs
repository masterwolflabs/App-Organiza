#!/usr/bin/env node
/**
 * Trae a ESTA app las mejoras de la Plantilla Master Wolf.
 *
 *   npm run update:template            → revisa qué cambiaría
 *   npm run update:template -- --apply → copia los archivos y guarda el punto
 *
 * Lee la plantilla desde GitHub (git fetch, sin crear ramas ni tocar el
 * historial de la app). Nunca pisa lo que es propio de cada app (su
 * configuración, sus vistas, sus textos y su CLAUDE.md); si a la app le falta
 * uno de esos archivos porque la plantilla lo agregó después, lo crea. En package.json
 * conserva nombre y versión, y suma dependencias y scripts nuevos.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.env.TEMPLATE_REPO || 'https://github.com/masterwolflabs/master-wolf-app-template.git';
const STATE = join(ROOT, 'scripts', 'template-sync.json');
const APPLY = process.argv.includes('--apply');

/** Propio de cada app: la plantilla nunca lo pisa. */
const OWN = [
  /^app\.config\.ts$/,
  /^README\.md$/,
  /^CLAUDE\.md$/,
  /^components\/views\//,
  /^public\//,
  /^\.env/,
  /^package-lock\.json$/,
];

/** Solo de la plantilla: nunca llega a las apps. */
const NEVER = [/^scripts\/(finance-sync|template-sync)\.json$/, /^scripts\/sync-from-finance\.mjs$/];

const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

git('fetch', '--quiet', REPO, 'main');
const head = git('rev-parse', 'FETCH_HEAD').trim();
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
console.log(`Plantilla en ${head.slice(0, 7)} · esta app la trajo por última vez en: ${state.templateCommit ? state.templateCommit.slice(0, 7) : 'nunca (se creó desde ella)'}\n`);

const files = git('ls-tree', '-r', '--name-only', head).trim().split('\n');
const changes = [];
for (const f of files) {
  if (NEVER.some((re) => re.test(f))) continue;
  // Lo propio de la app no se pisa nunca; solo se CREA si a la app le falta (archivo nuevo de la plantilla).
  if (OWN.some((re) => re.test(f)) && existsSync(join(ROOT, f))) continue;
  const next = git('show', `${head}:${f}`);
  const dest = join(ROOT, f);
  let out = next;
  if (f === 'package.json' && existsSync(dest)) {
    const mine = JSON.parse(readFileSync(dest, 'utf8'));
    const tpl = JSON.parse(next);
    const merged = {
      ...mine,
      scripts: { ...mine.scripts, ...tpl.scripts },
      dependencies: { ...mine.dependencies, ...tpl.dependencies },
      devDependencies: { ...mine.devDependencies, ...tpl.devDependencies },
    };
    delete merged.scripts['sync:finance'];
    out = JSON.stringify(merged, null, 2) + '\n';
  }
  const cur = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
  if (cur !== out) changes.push({ f, out, isNew: cur === null });
}

if (!changes.length) {
  console.log('Esta app ya tiene todo lo de la plantilla.');
} else {
  console.log(`Cambios de la plantilla (${changes.length}):`);
  for (const c of changes) console.log(`  ${c.isNew ? '+' : '•'} ${c.f}`);
}
if (!APPLY) {
  console.log('\nSolo revisión. Para aplicarlos: npm run update:template -- --apply');
  console.log('Si esta app modificó alguno de esos archivos, revisa con git diff después de aplicar.');
  process.exit(0);
}
for (const c of changes) {
  mkdirSync(dirname(join(ROOT, c.f)), { recursive: true });
  writeFileSync(join(ROOT, c.f), c.out);
}
writeFileSync(STATE, JSON.stringify({ templateCommit: head, updatedAt: new Date().toISOString() }, null, 2) + '\n');
console.log(`\n✓ Aplicados ${changes.length} cambios. Ahora: npm install, npm run build, revisar git diff y commit.`);
