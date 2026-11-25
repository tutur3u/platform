import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  PLAYGROUND_EXPORT_BYTES,
  PLAYGROUND_EXPORT_SCRIPT,
} from './devbox-playground-files';

function exportProject(directory: string) {
  // Use an isolated fixture in place of the container's project directory.
  const script = PLAYGROUND_EXPORT_SCRIPT.replaceAll(
    "'/project'",
    JSON.stringify(directory)
  );
  return spawnSync('python3', ['-I', '-S', '-B', '-c', script], {
    encoding: 'utf8',
    maxBuffer: PLAYGROUND_EXPORT_BYTES,
    timeout: 5000,
  });
}

it.each(['\u0080'.repeat(131072), '\u0001'.repeat(262144)])(
  'exports a valid two MiB project within the transport bound',
  async (content) => {
    const directory = await mkdtemp(join(tmpdir(), 'ttr-playground-export-'));
    try {
      for (let index = 0; index < 8; index++) {
        await writeFile(join(directory, `${index}.txt`), content);
      }
      const exported = exportProject(directory);
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

it('exports Java source alongside ignored binary class files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ttr-playground-export-'));
  const content = 'class Main { static class Inner {} }\n';
  try {
    await writeFile(join(directory, 'Main.java'), content);
    await writeFile(
      join(directory, 'Main$Inner.class'),
      Buffer.from([0xca, 0xfe, 0xba, 0xbe])
    );
    await writeFile(join(directory, 'Main$Other.class'), Buffer.from([0, 1]));

    const exported = exportProject(directory);
    expect(exported.error).toBeUndefined();
    expect(exported.status).toBe(0);
    expect(JSON.parse(exported.stdout)).toEqual([{ path: 'Main.java', content }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it.each(['my file.txt', 'Main$Inner.class', 'large.log'])(
  'identifies unsupported export file %s',
  async (name) => {
    const directory = await mkdtemp(join(tmpdir(), 'ttr-playground-export-'));
    try {
      await writeFile(
        join(directory, name),
        name === 'large.log' ? 'x'.repeat(262145) : 'x'
      );
      const exported = exportProject(directory);
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
