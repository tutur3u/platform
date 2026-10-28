import { readFileSync, writeFileSync } from 'node:fs';

// Void detects frameworks from its working directory's package.json. Mirror
// the package-manager-owned Web manifest into this isolated build root so its
// environment-file conventions cannot interfere with the canonical Next app.
const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);
writeFileSync(
  new URL('./package.json', import.meta.url),
  `${JSON.stringify({ ...manifest, type: 'module' }, null, 2)}\n`
);
