#!/usr/bin/env node
// Derives apps/marketing/messages/{en,vi}.json from the web app's catalog so
// translations have one source of truth. Only the namespaces the marketing
// pages render are carried over; add a namespace here when a page group needs
// it, then run `bun messages:sync`.
//
//   node scripts/sync-messages.mjs           write the derived files
//   node scripts/sync-messages.mjs --check   fail when they are stale

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webMessages = path.join(root, '..', 'web', 'messages');
const outDir = path.join(root, 'messages');

export const NAMESPACES = [
  // Shell: navbar, footer, language and theme controls.
  'common',
  'marketing-nav',
  'desktop_download',
  'privacy-consent',
];

const check = process.argv.includes('--check');
let stale = false;

for (const locale of ['en', 'vi']) {
  const source = JSON.parse(
    fs.readFileSync(path.join(webMessages, `${locale}.json`), 'utf8')
  );
  const derived = {};
  for (const namespace of [...new Set(NAMESPACES)].sort()) {
    if (!(namespace in source))
      throw new Error(`${locale}: namespace "${namespace}" is not in web`);
    derived[namespace] = source[namespace];
  }
  const content = `${JSON.stringify(derived, null, 2)}\n`;
  const target = path.join(outDir, `${locale}.json`);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current === content) continue;
  if (check) {
    stale = true;
    console.error(`${path.relative(root, target)} is stale`);
  } else {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(target, content);
  }
}

if (stale) {
  console.error('Run: bun --cwd apps/marketing messages:sync');
  process.exit(1);
}
