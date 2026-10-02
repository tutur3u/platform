import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { PLAYGROUND_EXPORT_SCRIPT } from './devbox-playground-files';

it('exports a valid two MiB Unicode project within the Docker response bound', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ttr-playground-export-'));
  const content = '\u0080'.repeat(131072);
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
      maxBuffer: 4 * 1024 * 1024,
      timeout: 5000,
    });
    expect(exported.error).toBeUndefined();
    expect(exported.status).toBe(0);
    expect(Buffer.byteLength(exported.stdout)).toBeLessThan(4 * 1024 * 1024);
    const files = JSON.parse(exported.stdout) as {
      path: string;
      content: string;
    }[];
    expect(files).toHaveLength(8);
    expect(files.every((file) => file.content === content)).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
