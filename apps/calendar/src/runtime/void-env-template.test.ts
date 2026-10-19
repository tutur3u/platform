import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

async function installedLegacyScanner() {
  const require = createRequire(import.meta.url);
  const dist = dirname(require.resolve('void'));
  const chunks = readdirSync(dist).filter((name) =>
    /^env-[A-Za-z0-9_-]+\.mjs$/u.test(name)
  );
  if (chunks.length !== 1 || !chunks[0])
    throw new Error('Ambiguous installed Void environment supplier');
  const supplier: unknown = await import(
    pathToFileURL(join(dist, chunks[0])).href
  );
  if (
    typeof supplier !== 'object' ||
    supplier === null ||
    !('r' in supplier) ||
    typeof supplier.r !== 'function'
  )
    throw new Error('Installed Void1.1.12 environment scanner export changed');
  const scan = supplier.r;
  return (root: string) => z.array(z.string()).parse(scan(root));
}

describe('Calendar template follows the actual installed Void filename policy', () => {
  it('keeps the tracked sample outside the legacy dotenv filenames', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    expect(existsSync(join(root, 'env.example'))).toBe(true);
    expect(existsSync(join(root, '.env.example'))).toBe(false);
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
