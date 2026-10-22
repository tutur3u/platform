import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const appRoot = resolve(__dirname, '../..');
const require = createRequire(join(appRoot, 'package.json'));

function scannerBinding(source: string) {
  const bindings: { specifier: string; exportName: string }[] = [];
  for (const statement of source.matchAll(
    /^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?$/gmu
  )) {
    const specifier = statement[2];
    if (!specifier) continue;
    for (const binding of (statement[1] ?? '').split(',')) {
      const exportName = binding
        .trim()
        .match(/^([\w$]+)\s+as\s+findLegacyEnvFiles$/u)?.[1];
      if (exportName) bindings.push({ specifier, exportName });
    }
  }
  const [binding] = bindings;
  if (bindings.length !== 1 || !binding || !binding.specifier.startsWith('./'))
    throw new Error('Installed Void scanner import binding changed');
  return binding;
}
async function installedLegacyScanner() {
  const entry = require.resolve('void');
  const binding = scannerBinding(readFileSync(entry, 'utf8'));
  const modulePath = createRequire(entry).resolve(binding.specifier);
  const supplier: unknown = await import(pathToFileURL(modulePath).href);
  if (typeof supplier !== 'object' || supplier === null)
    throw new Error('Installed Void scanner module changed');
  const scan: unknown = Reflect.get(supplier, binding.exportName);
  if (typeof scan !== 'function')
    throw new Error('Installed Void scanner export changed');
  return (root: string) => z.array(z.string()).parse(scan(root));
}

describe('Calendar template follows the actual installed Void filename policy', () => {
  it('keeps the tracked sample outside the legacy dotenv filenames', () => {
    expect(existsSync(join(appRoot, 'env.example'))).toBe(true);
    expect(existsSync(join(appRoot, '.env.example'))).toBe(false);
  });
  it('resolves the exact scanner symbol through the owning entry import graph', () => {
    const entry = require.resolve('void');
    const binding = scannerBinding(readFileSync(entry, 'utf8'));
    expect(dirname(createRequire(entry).resolve(binding.specifier))).toBe(
      dirname(entry)
    );
    expect(() => scannerBinding('export {};')).toThrow(
      'scanner import binding changed'
    );
    expect(() =>
      scannerBinding(
        'import { r as findLegacyEnvFiles } from "./a.mjs";\nimport { s as findLegacyEnvFiles } from "./b.mjs";'
      )
    ).toThrow('scanner import binding changed');
  });
  it('uses the installed scanner to distinguish env.example from .env.example', async () => {
    const scan = await installedLegacyScanner();
    const root = mkdtempSync(join(tmpdir(), 'calendar-void-env-policy-'));
    try {
      writeFileSync(join(root, 'env.example'), 'EXAMPLE=value\n');
      writeFileSync(join(root, '.env'), 'EXAMPLE=local\n');
      expect(scan(root)).toEqual([]);
      writeFileSync(join(root, '.env.example'), 'EXAMPLE=value\n');
      expect(scan(root)).toEqual(['.env.example']);
      writeFileSync(join(root, '.env.production'), 'EXAMPLE=value\n');
      expect(scan(root)).toEqual(['.env.example', '.env.production']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
