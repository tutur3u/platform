import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  externalPath,
  loadDataset,
  manifestSchema,
  reportDirectory,
} from './dataset';

const temporary: string[] = [];
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'meet-stt-eval-test-'));
  temporary.push(path);
  return path;
}
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});

describe('private evaluation inputs', () => {
  it('requires affirmative consent, reference paths, bounded clip counts and a known version', () => {
    expect(
      manifestSchema.safeParse({ version: 1, consented: false, clips: [] })
        .success
    ).toBe(false);
    expect(
      manifestSchema.safeParse({
        version: 1,
        consented: true,
        clips: [{ audio: 'a', reference: 'b', mediaType: 'audio/wav' }],
      }).success
    ).toBe(true);
    expect(
      manifestSchema.safeParse({ version: 2, consented: true, clips: [] })
        .success
    ).toBe(false);
  });
  it('loads external references relative to the manifest and rejects a symlink into git', async () => {
    const root = await directory();
    await writeFile(join(root, 'sample.wav'), new Uint8Array([0]));
    await writeFile(join(root, 'reference.txt'), 'Synthetic text');
    const manifest = {
      version: 1,
      consented: true,
      clips: [
        {
          audio: 'sample.wav',
          reference: 'reference.txt',
          mediaType: 'audio/wav',
        },
      ],
    };
    await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
    expect(
      (await loadDataset(join(root, 'manifest.json'))).clips[0]?.reference
    ).toBe('Synthetic text');
    const repo = join(root, 'repo');
    await mkdir(repo);
    await writeFile(join(repo, '.git'), 'gitdir: fixture');
    await writeFile(join(repo, 'private.txt'), 'Synthetic text');
    await symlink(join(repo, 'private.txt'), join(root, 'linked.txt'));
    await expect(externalPath(join(root, 'linked.txt'))).rejects.toThrow(
      'outside git'
    );
    manifest.clips[0] = {
      audio: 'sample.wav',
      reference: 'linked.txt',
      mediaType: 'audio/wav',
    };
    await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
    await expect(loadDataset(join(root, 'manifest.json'))).rejects.toThrow(
      'outside git'
    );
    await expect(reportDirectory(repo)).rejects.toThrow('outside git');
  });
  it('rejects oversized input before provider use and requires an external report directory', async () => {
    const root = await directory();
    await writeFile(join(root, 'large.txt'), 'x'.repeat(40_001));
    await writeFile(join(root, 'sample.wav'), new Uint8Array([0]));
    await writeFile(
      join(root, 'manifest.json'),
      JSON.stringify({
        version: 1,
        consented: true,
        clips: [
          {
            audio: 'sample.wav',
            reference: 'large.txt',
            mediaType: 'audio/wav',
          },
        ],
      })
    );
    await expect(loadDataset(join(root, 'manifest.json'))).rejects.toThrow(
      'input size'
    );
    await expect(reportDirectory('relative')).rejects.toThrow(
      'report directory'
    );
    await expect(loadDataset('relative')).rejects.toThrow('manifest path');
    expect(await reportDirectory(root)).toBeTruthy();
  });
});
