import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

const ignoreBytes = Buffer.from('wrangler.json\n.dev.vars\n');
const hiddenFiles = new Set([
  'client/.assetsignore',
  'server/.vite/manifest.json',
]);
const recordKeys = new Set([
  'file',
  'src',
  'name',
  'isEntry',
  'isDynamicEntry',
  'imports',
  'dynamicImports',
  'css',
  'assets',
]);
const text = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  [...value].every((character) => character.charCodeAt(0) >= 32);
function emittedPath(value) {
  assert.ok(
    text(value) && !isAbsolute(value) && !value.includes('\\'),
    'Invalid Vite emitted path'
  );
  assert.ok(
    value
      .split('/')
      .every((part) => part && part !== '..' && !part.startsWith('.')),
    'Invalid Vite emitted path'
  );
}
function validateVite(bytes, files) {
  const manifest = JSON.parse(bytes.toString('utf8'));
  assert.ok(
    manifest && !Array.isArray(manifest) && typeof manifest === 'object',
    'Invalid Vite manifest'
  );
  assert.ok(Object.keys(manifest).length > 0, 'Empty Vite manifest');
  for (const [key, record] of Object.entries(manifest)) {
    assert.ok(
      text(key) &&
        record &&
        !Array.isArray(record) &&
        typeof record === 'object',
      'Invalid Vite record'
    );
    for (const field of Object.keys(record))
      assert.ok(recordKeys.has(field), 'Unknown Vite metadata field');
    emittedPath(record.file);
    assert.ok(
      Object.hasOwn(files, `server/${record.file}`),
      'Missing Vite emitted file'
    );
    for (const field of ['src', 'name'])
      if (Object.hasOwn(record, field))
        assert.ok(text(record[field]), 'Invalid Vite metadata string');
    for (const field of ['isEntry', 'isDynamicEntry'])
      if (Object.hasOwn(record, field))
        assert.equal(
          typeof record[field],
          'boolean',
          'Invalid Vite metadata boolean'
        );
    for (const field of ['imports', 'dynamicImports', 'css', 'assets']) {
      if (!Object.hasOwn(record, field)) continue;
      assert.ok(Array.isArray(record[field]), 'Invalid Vite metadata array');
      for (const item of record[field]) {
        assert.ok(text(item), 'Invalid Vite metadata reference');
        if (field === 'imports' || field === 'dynamicImports')
          assert.ok(
            Object.hasOwn(manifest, item),
            'Missing Vite metadata reference'
          );
        else {
          emittedPath(item);
          assert.ok(
            Object.hasOwn(files, `server/${item}`),
            'Missing Vite emitted asset'
          );
        }
      }
    }
  }
}

// Source identifiers in Vite metadata are data, never paths to open.
// Finalization excludes only the SDK-owned state directory, matching the generic gate.
export function sealCalendarArtifact(root, finalizing = false) {
  assert.equal(realpathSync(root), root, 'Calendar root must be canonical');
  assert.ok(lstatSync(root).isDirectory(), 'Calendar root must be a directory');
  const entries = [];
  let vite;
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name)
    )) {
      const path = join(directory, entry.name);
      const name = relative(root, path);
      assert.ok(
        !entry.isSymbolicLink(),
        'Calendar artifact symlinks forbidden'
      );
      if (name.startsWith('server/.vite/'))
        assert.equal(
          name,
          'server/.vite/manifest.json',
          'Hidden Calendar metadata entry unsupported'
        );
      if (finalizing && name === 'server/.wrangler') {
        assert.ok(
          entry.isDirectory(),
          'Calendar SDK state must be a directory'
        );
        continue;
      }
      if (entry.name.startsWith('.'))
        assert.ok(
          (hiddenFiles.has(name) && entry.isFile()) ||
            (name === 'server/.vite' && entry.isDirectory()),
          'Hidden Calendar artifact entry unsupported'
        );
      if (entry.isDirectory()) {
        entries.push([`${name}/`, null]);
        visit(path);
      } else {
        assert.ok(
          entry.isFile(),
          'Only regular Calendar artifact files supported'
        );
        const bytes = readFileSync(path);
        if (name === 'client/.assetsignore')
          assert.deepEqual(
            bytes,
            ignoreBytes,
            'Calendar asset ignore bytes changed'
          );
        if (name === 'server/.vite/manifest.json') vite = bytes;
        entries.push([name, createHash('sha256').update(bytes).digest('hex')]);
      }
    }
  }
  visit(root);
  const files = Object.fromEntries(entries);
  if (Object.hasOwn(files, 'server/.vite/')) {
    assert.ok(vite, 'Missing Vite manifest');
    validateVite(vite, files);
  }
  return files;
}
