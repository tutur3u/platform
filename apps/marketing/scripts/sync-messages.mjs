#!/usr/bin/env node
// Derives apps/marketing/messages/{en,vi}.json from the web app's catalog so
// translations have one source of truth. A web namespace is carried over when
// the marketing source names it (`getTranslations('ns')`, `namespace: 'ns.key'`,
// `t('ns.key')`), plus the shell namespaces below. Run `bun messages:sync`
// after adding pages.
//
//   node scripts/sync-messages.mjs           write the derived files
//   node scripts/sync-messages.mjs --check   fail when they are stale

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webMessages = path.join(root, '..', 'web', 'messages');
const outDir = path.join(root, 'messages');

export const SHELL_NAMESPACES = [
  // Shell: navbar, footer, language and theme controls.
  'common',
  'marketing-nav',
  'desktop_download',
  'privacy-consent',
];

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    // client-messages.ts only lists which namespaces reach the client.
    return /\.(ts|tsx)$/u.test(entry.name) &&
      !/\.test\./u.test(entry.name) &&
      entry.name !== 'client-messages.ts'
      ? [full]
      : [];
  });
}

const source = sourceFiles(path.join(root, 'src'))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
const quoted = (namespace) =>
  new RegExp(
    `['"\`]${namespace.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}[.'"\`]`,
    'u'
  );

// Namespaces read as properties of the imported catalog (`en.legalRedesign`).
const propertyNamespaces = new Set(
  [...source.matchAll(/\b(?:en|vi|messages)\.([A-Za-z_][\w-]*)/gu)].map(
    (m) => m[1]
  )
);

const check = process.argv.includes('--check');
let stale = false;

for (const locale of ['en', 'vi']) {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(webMessages, `${locale}.json`), 'utf8')
  );
  const derived = {};
  for (const namespace of Object.keys(catalog).sort())
    if (
      SHELL_NAMESPACES.includes(namespace) ||
      propertyNamespaces.has(namespace) ||
      quoted(namespace).test(source)
    )
      derived[namespace] = catalog[namespace];
  for (const namespace of SHELL_NAMESPACES)
    if (!(namespace in derived))
      throw new Error(`${locale}: namespace "${namespace}" is not in web`);
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
