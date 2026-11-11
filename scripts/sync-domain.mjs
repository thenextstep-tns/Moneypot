#!/usr/bin/env node
// The money logic is shared by the web app (src/) and the Android app (MoneypotMobile/src/domain/).
// src/ is the source of truth: this script copies the shared files into the mobile app.
//   node scripts/sync-domain.mjs          copy
//   node scripts/sync-domain.mjs --check  fail if the mobile copies are out of date (used by CI / tests)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['types.ts', 'schedule.ts', 'balances.ts', 'cashflow.ts', 'sharing.ts', 'sharedSync.ts', 'defaults.ts'];
const header = f => `// GENERATED from src/${f} by scripts/sync-domain.mjs — do not edit here, edit src/${f} and re-run.\n`;

const check = process.argv.includes('--check');
let stale = [];
for (const f of FILES) {
  const src = readFileSync(join(root, 'src', f), 'utf8');
  const out = header(f) + src;
  const dest = join(root, 'MoneypotMobile', 'src', 'domain', f);
  const current = existsSync(dest) ? readFileSync(dest, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current === out.replace(/\r\n/g, '\n')) continue;
  if (check) stale.push(f);
  else {
    writeFileSync(dest, out);
    console.log(`synced ${f}`);
  }
}
if (check && stale.length) {
  console.error(`Mobile domain files are out of date: ${stale.join(', ')}\nRun: node scripts/sync-domain.mjs`);
  process.exit(1);
}
if (check) console.log('Mobile domain files are in sync.');
