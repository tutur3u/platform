import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  PLAYGROUND_EXPORT_BYTES,
  PLAYGROUND_EXPORT_SCRIPT,
} from './devbox-playground-files';

it.each(['\u0080'.repeat(131072), '\u0001'.repeat(262144)])(
  'exports a valid two MiB project within the transport bound',
  async (content) => {
    const directory = await mkdtemp(join(tmpdir(), 'ttr-playground-export-'));
    try {
      for (let index = 0; index < 8; index++) {
        await writeFile(join(directory, `${index}.txt`), content);
      }
      // Only synthetic files are used. Replace the container path for this isolated
      // Python contract test; production still resolves paths exclusively inside Docker.
      const script = PLAYGROUND_EXPORT_SCRIPT.replaceAll(
        "'/project'",
        JSON.stringify(directory)
      );
      const exported = spawnSync('python3', ['-I', '-S', '-B', '-c', script], {
        encoding: 'utf8',
        maxBuffer: PLAYGROUND_EXPORT_BYTES,
        timeout: 5000,
      });
      expect(exported.error).toBeUndefined();
      expect(exported.status).toBe(0);
      expect(Buffer.byteLength(exported.stdout)).toBeLessThan(
        PLAYGROUND_EXPORT_BYTES
      );
      const files = JSON.parse(exported.stdout) as {
        path: string;
        content: string;
      }[];
      expect(files).toHaveLength(8);
      expect(files.every((file) => file.content === content)).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);

it.each(['my file.txt', 'large.log'])(
  'identifies unsupported export file %s',
  async (name) => {
    const directory = await mkdtemp(join(tmpdir(), 'ttr-playground-export-'));
    try {
      await writeFile(
        join(directory, name),
        name === 'large.log' ? 'x'.repeat(262145) : 'x'
      );
      const script = PLAYGROUND_EXPORT_SCRIPT.replaceAll(
        "'/project'",
        JSON.stringify(directory)
      );
      const exported = spawnSync('python3', ['-I', '-S', '-B', '-c', script], {
        encoding: 'utf8',
        timeout: 5000,
      });
      expect(exported.status).not.toBe(0);
      expect(exported.stderr).toContain(name);
      expect(exported.stderr).toContain(
        name === 'large.log'
          ? 'File exceeds Drive save limit'
          : 'Unsupported Drive file path'
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);
