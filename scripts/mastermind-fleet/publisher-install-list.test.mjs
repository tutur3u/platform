import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const docs = path.join(
  dir,
  '../../apps/docs/platform/features/mobile-mastermind.mdx'
);

/** Static imports and re-exports (`from './y.mjs'`), side-effect imports and `import('./y.mjs')`. */
const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*['"]\.\/([^'"]+)['"]/g;

/** Every relative module `publish.mjs` loads at startup, transitively. */
function importedModules(entry) {
  const found = new Set();
  const pending = [entry];
  while (pending.length) {
    const file = pending.pop();
    if (found.has(file)) continue;
    found.add(file);
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const match of source.matchAll(RELATIVE_IMPORT))
      pending.push(match[1]);
  }
  return [...found].sort();
}

/** The publisher files the runbook tells an operator to install. */
function documentedModules() {
  const text = fs.readFileSync(docs, 'utf8');
  const start = text.indexOf(
    'installed copy in `~/.local/share/fleet-sync/bin/`'
  );
  const end = text.indexOf('SOURCE_SHA', start);
  assert.ok(start > 0 && end > start, 'runbook install list not found');
  return new Set(
    [...text.slice(start, end).matchAll(/`([a-z0-9-]+\.mjs)`/g)].map(
      (match) => match[1]
    )
  );
}

test('the runbook install list covers every module publish.mjs imports', () => {
  const documented = documentedModules();
  const missing = importedModules('publish.mjs').filter(
    (file) => !documented.has(file)
  );
  assert.deepEqual(missing, []);
});

test('the import scan covers every relative import form the publisher uses', () => {
  const forms = [
    "import x from './a.mjs';",
    "import { b } from './b.mjs';",
    "import './c.mjs';",
    "export * from './d.mjs';",
    "export { e } from './e.mjs';",
    "const f = await import('./f.mjs');",
    "await import(\n  './g.mjs'\n);",
    "import {\n  h,\n} from './h.mjs';",
  ];
  const found = [...forms.join('\n').matchAll(RELATIVE_IMPORT)].map(
    (match) => match[1]
  );
  assert.deepEqual(found, [
    'a.mjs',
    'b.mjs',
    'c.mjs',
    'd.mjs',
    'e.mjs',
    'f.mjs',
    'g.mjs',
    'h.mjs',
  ]);
});
