import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FINAL_SOURCE_SHA256 } from './source/index.generated';

describe('frozen legal source provenance', () => {
  it('records the same frozen input that the extractor accepts', () => {
    const extractor = readFileSync(
      new URL('../../scripts/extract-final-revision.ts', import.meta.url),
      'utf8'
    );
    const acceptedHash = extractor.match(
      /const FINAL_SHA256 =\s*'([a-f0-9]{64})'/u
    )?.[1];
    expect(acceptedHash).toBeDefined();
    expect(FINAL_SOURCE_SHA256).toBe(acceptedHash);
  });

  it('rejects an unapproved input before creating or changing output', () => {
    const directory = mkdtempSync(join(tmpdir(), 'legal-source-'));
    try {
      const input = join(directory, 'unapproved.md');
      const output = join(directory, 'generated');
      writeFileSync(input, 'Synthetic, unapproved legal input.\n');
      const result = spawnSync(
        'bun',
        [
          fileURLToPath(
            new URL('../../scripts/extract-final-revision.ts', import.meta.url)
          ),
          input,
          '--output-dir',
          output,
        ],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('FINAL sha256 mismatch');
      expect(existsSync(output)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
