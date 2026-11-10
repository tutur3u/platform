import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format } from 'oxfmt';
import { describe, expect, it } from 'vitest';
import { emitRevisionSources } from './output';

const sources = new Map([
  ['en.generated.ts', 'export const text = "Synthetic example";\n'],
  ['vi.generated.ts', 'export const text = "Ví dụ giả lập";\n'],
]);
const formatSource = (name: string, source: string) =>
  format(name, source, { singleQuote: true, trailingComma: 'es5' });

describe('canonical revision output', () => {
  it('emits byte-identical files from the same input in independent directories', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'legal-output-'));
    try {
      const firstDirectory = pathToFileURL(`${join(scratch, 'first')}/`);
      const directories = [
        firstDirectory,
        pathToFileURL(`${join(scratch, 'second')}/`),
      ];
      for (const directory of directories)
        await emitRevisionSources({
          sources,
          directory,
          check: false,
          formatSource,
        });
      const outputs = directories.map((directory) =>
        [...sources.keys()].map((name) =>
          readFileSync(new URL(name, directory))
        )
      );
      expect(outputs[0]).toEqual(outputs[1]);
      for (const output of outputs)
        expect(output.map((bytes) => bytes.toString('utf8'))).toEqual([
          "export const text = 'Synthetic example';\n",
          "export const text = 'Ví dụ giả lập';\n",
        ]);
      const hashes = outputs.map((files) =>
        createHash('sha256').update(Buffer.concat(files)).digest('hex')
      );
      expect(hashes[0]).toBe(hashes[1]);
      await emitRevisionSources({
        sources,
        directory: firstDirectory,
        check: true,
        formatSource,
      });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('rejects stale output without repairing it or changing other files', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'legal-output-'));
    const directory = pathToFileURL(`${scratch}/`);
    try {
      await emitRevisionSources({
        sources,
        directory,
        check: false,
        formatSource,
      });
      const first = new URL('en.generated.ts', directory);
      const stale = new URL('vi.generated.ts', directory);
      const before = readFileSync(first);
      writeFileSync(stale, 'Synthetic stale output\n');
      await expect(
        emitRevisionSources({ sources, directory, check: true, formatSource })
      ).rejects.toThrow('Generated legal source is stale: vi.generated.ts');
      expect(readFileSync(first)).toEqual(before);
      expect(readFileSync(stale, 'utf8')).toBe('Synthetic stale output\n');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('writes nothing if formatting any module fails', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'legal-output-'));
    const directory = pathToFileURL(`${join(scratch, 'generated')}/`);
    try {
      const invalid = new Map([
        ...sources,
        ['invalid.generated.ts', 'export const = ;'],
      ]);
      await expect(
        emitRevisionSources({
          sources: invalid,
          directory,
          check: false,
          formatSource,
        })
      ).rejects.toThrow('Cannot format invalid.generated.ts');
      expect(existsSync(directory)).toBe(false);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
