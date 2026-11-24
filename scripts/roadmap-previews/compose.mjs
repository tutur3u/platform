#!/usr/bin/env node
// Frames raw captures and exports AVIF + WebP previews with a manifest.
//
//   node scripts/roadmap-previews/compose.mjs --raw <dir> [--out <dir>]
//
// Reads `<raw>/<feature>/<device>-<theme>-<locale>.png`; writes
// `<out>/<feature>/<device>-<theme>-<locale>.{avif,webp}` and `manifest.json`
// (default out: packages/roadmap-core/src/assets/previews/web).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DEVICES } from './devices.mjs';
import { exportImage } from './encode.mjs';
import { composeFrame } from './frames.mjs';
import { log, REPO_ROOT } from './lib.mjs';
import { SCENES } from './scenes.mjs';

const APP_FOR_FEATURE = Object.fromEntries(
  SCENES.map((scene) => [scene.id, scene.app])
);

const { values } = parseArgs({
  options: { raw: { type: 'string' }, out: { type: 'string' } },
});
const out =
  values.out ??
  path.join(REPO_ROOT, 'packages/roadmap-core/src/assets/previews/web');
const items = [];
for (const feature of fs.readdirSync(values.raw).sort()) {
  const dir = path.join(values.raw, feature);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir).sort()) {
    const match = /^(.+)-(light|dark)-(en|vi)\.png$/.exec(file);
    if (!match) continue;
    const [, device, theme, locale] = match;
    const spec = { ...DEVICES[device], name: device };
    const framed = await composeFrame(
      fs.readFileSync(path.join(dir, file)),
      spec,
      theme === 'dark'
    );
    const base = path.join(out, feature, `${device}-${theme}-${locale}`);
    const info = await exportImage(framed, spec.maxEdge, base);
    const rel = (ext) => path.relative(REPO_ROOT, `${base}.${ext}`);
    items.push({
      screen: feature,
      app: APP_FOR_FEATURE[feature] ?? 'web',
      device,
      theme,
      locale,
      width: info.width,
      height: info.height,
      avif: rel('avif'),
      webp: rel('webp'),
      avifBytes: info.avifBytes,
      webpBytes: info.webpBytes,
    });
    log(
      'exported',
      feature,
      device,
      theme,
      locale,
      info.avifBytes,
      info.webpBytes
    );
  }
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, 'manifest.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2)}\n`
);
const total = items.reduce((n, i) => n + i.avifBytes + i.webpBytes, 0);
log(`${items.length} previews, ${(total / 1048576).toFixed(1)} MB`);
