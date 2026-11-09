#!/usr/bin/env node
// Copies the public files the marketing source references (`/media/...`,
// favicons) from apps/web/public so the Worker serves its own assets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webPublic = path.join(root, '..', 'web', 'public');
const outDir = path.join(root, 'public');
const ALWAYS = [
  'favicon.ico',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'android-chrome-192x192.png',
  'android-chrome-512x512.png',
  'logo.svg',
  'media/logos/transparent.png',
  'media/logos/og-image.jpg',
];

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return /\.(ts|tsx|css)$/u.test(entry.name) ? [full] : [];
  });
}

const source = sourceFiles(path.join(root, 'src'))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
const referenced = new Set(ALWAYS);
for (const match of source.matchAll(/['"`(](\/media\/[^'"`)\s?#]+)/gu))
  referenced.add(match[1].slice(1));

const missing = [];
for (const relative of [...referenced].sort()) {
  const from = path.join(webPublic, relative);
  if (!fs.existsSync(from) || !fs.statSync(from).isFile()) {
    missing.push(relative);
    continue;
  }
  const to = path.join(outDir, relative);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
if (missing.length) console.error(`not in web/public: ${missing.join(', ')}`);
